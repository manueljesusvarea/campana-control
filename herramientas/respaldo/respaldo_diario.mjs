// CAMPAÑA CONTROL 3.0 · Copia diaria de todas las campañas, FUERA de Supabase (gratis).
//
// Qué hace, en cada ejecución:
//   1. Entra con la cuenta técnica de copias «respaldo.copias» (solo lectura, migración 000015; la contraseña NO está en ningún archivo del proyecto:
//      la pasa respaldo_diario.ps1, que la guarda cifrada con DPAPI de Windows solo para tu usuario).
//   2. Para cada campaña pide su huella de cambios. Si no ha cambiado desde la última copia, no hace nada (copias
//      «cuando hay actividad»).
//   3. Si cambió: copia sellada por el servidor (copia_campana: datos + sello HMAC + cuentas autorizadas, sin
//      contraseñas) y sus fotos, con la huella SHA-256 de cada una.
//   4. Comprueba la copia antes de darla por buena: huella de los datos, huella de cada foto y sello (en el servidor).
//   5. La guarda CIFRADA (AES-256-GCM, clave derivada de tu frase de paso con scrypt) en la carpeta de destino, que
//      debe estar fuera del ordenador o sincronizada fuera (memoria USB, OneDrive/Google Drive personal…).
//   6. Rotación: guarda las copias de los últimos 30 días y una por mes de los últimos 12 meses.
// Nunca guarda contraseñas, sesiones ni claves en las copias. Nunca escribe en la base de datos.
//
// Variables (las pone respaldo_diario.ps1; para probar se pueden poner a mano en la misma sesión):
//   CC_URL, CC_CLAVE_PUBLICA   URL y clave PÚBLICA (sb_publishable_…) del proyecto
//   CC_RESPALDO_USUARIO, CC_RESPALDO_CLAVE   cuenta de respaldo (superadministrador)
//   CC_RESPALDO_FRASE          frase de paso para cifrar (mínimo 12 caracteres; sin ella no se descifra nada)
//   CC_RESPALDO_DESTINO        carpeta donde se guardan las copias
// Uso: node respaldo_diario.mjs            (copia)
//      node respaldo_diario.mjs descifrar <archivo.ccr> <salida.json>   (recuperar una copia)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DOMINIO = "@usuarios.campana-control.invalid";
const env = process.env;
const falta = n => { console.error("Falta la variable " + n); process.exit(2); };
const frase = env.CC_RESPALDO_FRASE || falta("CC_RESPALDO_FRASE");
if (frase.length < 12) { console.error("La frase de paso debe tener al menos 12 caracteres"); process.exit(2); }

// Formato del archivo cifrado (.ccr): "CCR1" + sal(16) + iv(12) + etiqueta(16) + datos cifrados
function cifrar(texto) {
  const sal = crypto.randomBytes(16), iv = crypto.randomBytes(12), clave = crypto.scryptSync(frase, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = crypto.createCipheriv("aes-256-gcm", clave, iv), cuerpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from("CCR1"), sal, iv, c.getAuthTag(), cuerpo]);
}
function descifrar(buf) {
  if (buf.subarray(0, 4).toString() !== "CCR1") throw new Error("No es una copia cifrada de Campaña Control");
  const sal = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), cuerpo = buf.subarray(48);
  const clave = crypto.scryptSync(frase, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = crypto.createDecipheriv("aes-256-gcm", clave, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(cuerpo), d.final()]).toString("utf8");   // si la frase no es la buena o el archivo se tocó, falla
}

if (process.argv[2] === "descifrar") {
  const [, , , ent, sal] = process.argv; if (!ent || !sal) { console.error("Uso: node respaldo_diario.mjs descifrar <archivo.ccr> <salida.json>"); process.exit(2); }
  writeFileSync(sal, descifrar(readFileSync(ent))); console.log("Descifrada en " + sal + ". Impórtala desde la app: Copias e importación.");
  process.exit(0);
}

const URL_ = env.CC_URL || falta("CC_URL"), KEY = env.CC_CLAVE_PUBLICA || falta("CC_CLAVE_PUBLICA");
if (/sb_secret|service_role/i.test(KEY)) { console.error("Solo la clave PÚBLICA (sb_publishable_…): nunca una secreta"); process.exit(2); }
const destino = env.CC_RESPALDO_DESTINO || falta("CC_RESPALDO_DESTINO");
mkdirSync(destino, { recursive: true });
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const hoy = new Date().toISOString().slice(0, 10);
const estadoF = path.join(destino, "estado.json");
const estado = existsSync(estadoF) ? JSON.parse(readFileSync(estadoF, "utf8")) : { huellas: {} };
const log = [];
const anota = t => { const l = new Date().toISOString() + " " + t; log.push(l); console.log(l); };

const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const e = await sb.auth.signInWithPassword({ email: (env.CC_RESPALDO_USUARIO || falta("CC_RESPALDO_USUARIO")).toLowerCase() + DOMINIO, password: env.CC_RESPALDO_CLAVE || falta("CC_RESPALDO_CLAVE") });
if (e.error) { console.error("No se pudo entrar con la cuenta de respaldo: " + e.error.message); process.exit(3); }
const nq = async p => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };
let hechas = 0, iguales = 0, fallos = 0;
try {
  // Cuenta técnica de copias (solo lectura, 000015): respaldo_campanas/respaldo_huella. Otra cuenta: mis_campanas/huella_campana
  const tecnica = !(await sb.rpc("respaldo_campanas")).error;
  const campanas = await nq(sb.rpc(tecnica ? "respaldo_campanas" : "mis_campanas"));
  for (const c of campanas) {
    try {
      const h = await nq(sb.rpc(tecnica ? "respaldo_huella" : "huella_campana", { p_campana: c.campana_id }));
      if (estado.huellas[c.campana_id] === h) { iguales++; continue; }   // sin cambios desde la última copia
      const s = await nq(sb.rpc("copia_campana", { p_campana: c.campana_id }));
      const fotos = [];
      for (const f of s.datos.fotos || []) {
        const r = await sb.storage.from("fotos").download(f.ruta); if (r.error) throw new Error("foto " + f.ruta + ": " + r.error.message);
        const b = Buffer.from(await r.data.arrayBuffer()); if (sha(b) !== f.sha256) throw new Error("foto con huella distinta: " + f.ruta);
        fotos.push({ documento: f.documento, sha256: f.sha256, data: "data:image/jpeg;base64," + b.toString("base64") });
      }
      const cuerpo = JSON.stringify(s.datos);
      const copia = { app: "campana-control", tipo: "copia-campana-3", version: "respaldo-diario", fecha: new Date().toISOString(), campana: c.nombre, sello: s.sello, emisor: s.emisor,
        integridad: { sha256: sha(cuerpo), fotos: (s.datos.fotos || []).length, recuentos: Object.fromEntries(["trabajadores", "duenos", "maquinas", "partes", "pagos", "plantillas", "documentos", "miembros"].map(k => [k, (s.datos[k] || []).length])) },
        datos: s.datos, fotos };
      // Comprobación antes de guardar: el sello lo confirma el servidor
      if (!(await nq(sb.rpc("verificar_sello", { p_datos: JSON.parse(cuerpo), p_sello: s.sello })))) throw new Error("el sello no se pudo comprobar");
      const texto = JSON.stringify(copia), cif = cifrar(texto);
      if (descifrar(cif) !== texto) throw new Error("el archivo cifrado no se pudo volver a leer");
      const nombre = `${hoy}_${c.campana_id.slice(0, 8)}_${c.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").slice(0, 40)}.ccr`;
      const tmp = path.join(destino, nombre + ".tmp"); writeFileSync(tmp, cif); renameSync(tmp, path.join(destino, nombre));   // nunca un archivo a medias
      estado.huellas[c.campana_id] = h; hechas++;
      anota(`OK ${c.nombre}: ${copia.integridad.recuentos.partes} partes, ${copia.integridad.recuentos.pagos} pagos, ${fotos.length} fotos → ${nombre}`);
    } catch (x) { fallos++; anota(`FALLO ${c.nombre}: ${x.message}`); }
  }
  // Rotación: últimos 30 días + la primera copia de cada mes de los últimos 12 meses
  const archivos = readdirSync(destino).filter(f => /^\d{4}-\d{2}-\d{2}_.*\.ccr$/.test(f));
  const limite30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), limite12 = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const conservar = new Set(); const vistos = new Set();
  for (const f of archivos.sort()) { const k = f.slice(0, 7) + "|" + f.slice(11, 19); if (!vistos.has(k)) { vistos.add(k); if (f.slice(0, 10) >= limite12) conservar.add(f); } }
  for (const f of archivos) if (f.slice(0, 10) < limite30 && !conservar.has(f)) { unlinkSync(path.join(destino, f)); anota("Rotación: borrada " + f); }
} finally {
  await sb.auth.signOut();
  estado.ultima = new Date().toISOString(); writeFileSync(estadoF, JSON.stringify(estado, null, 1));
  writeFileSync(path.join(destino, "registro.txt"), log.join("\n") + "\n", { flag: "a" });
}
console.log(`Copias nuevas: ${hechas} · sin cambios: ${iguales} · con fallo: ${fallos}`);
process.exit(fallos ? 1 : 0);
