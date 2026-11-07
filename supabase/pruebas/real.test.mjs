// Pruebas de seguridad CONTRA EL PROYECTO SUPABASE DE PRUEBAS (no producción), con peticiones directas a la API.
// Cada usuario ficticio tiene su propio cliente y su propia sesión (como dispositivos distintos).
// Configuración (no se sube a git): supabase/pruebas/.env.pruebas con
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
// Requiere haber aplicado las migraciones y solo_proyecto_pruebas.sql en ese proyecto. Uso: node real.test.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.dirname(fileURLToPath(import.meta.url));
const env = { ...process.env };
const fenv = path.join(dir, ".env.pruebas");
if (existsSync(fenv)) for (const l of readFileSync(fenv, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] ??= m[2]; }
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) { console.error("Falta SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY (supabase/pruebas/.env.pruebas)"); process.exit(2); }
if (/sb_secret|service_role/i.test(KEY)) { console.error("Esa es una clave SECRETA: no se usa en las pruebas ni en la app."); process.exit(2); }
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(URL_)) { console.error("La URL no parece de Supabase: " + URL_); process.exit(2); }

const TABLAS = ["perfiles", "superadmin", "campanas", "campanas_economia", "trabajadores", "trabajadores_privado", "duenos", "duenos_privado", "duenos_trabajadores",
  "miembros", "asignaciones_equipo", "maquinas", "partes", "partes_filas", "partes_maquinas", "pagos", "plantillas", "documentos", "fotos", "invitaciones", "auditoria", "importaciones"];
const nuevo = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const resultados = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
async function prueba(nombre, fn) {
  try { const d = await fn(); resultados.push({ nombre, ok: true }); console.log("OK     " + nombre + (d ? "  → " + d : "")); }
  catch (e) { resultados.push({ nombre, ok: false }); console.log("FALLA  " + nombre + "\n       → " + e.message); }
}
// Errores esperados: la API devuelve error (permiso, RLS, conflicto) → devuelve el mensaje
const espera_error = async (p, txt) => { const { error } = await p; ok(error, "se permitió: " + txt); return error.message; };
// Cambios sin efecto: RLS deja la operación en 0 filas
const cero_filas = async (p, txt) => { const { data, error } = await p; ok(error || (data || []).length === 0, "se modificaron filas: " + txt); };

const run = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
const C = {};   // clientes (sesiones independientes) por usuario
async function cuenta(nombre) {
  const c = nuevo(); const email = `${nombre}-${run}@pruebas.example.com`; const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { nombre: nombre + " (ficticio)" } } });
  if (error) throw new Error(`alta de ${nombre}: ${error.message}`);
  if (!data.session) throw new Error(`alta de ${nombre}: sin sesión (¿«Confirm email» sigue activo en el proyecto de pruebas?)`);
  c.id = data.user.id; C[nombre] = c; return c;
}
const rpc = (c, f, args) => c.rpc(f, args).then(r => { if (r.error) throw new Error(f + ": " + r.error.message); return r.data; });
const ins = (c, t, fila) => c.from(t).insert(fila).select().single().then(r => { if (r.error) throw new Error(t + ": " + r.error.message); return r.data; });

/* ---------- 1. Esquema visto desde fuera (anónimo) ---------- */
const anon = nuevo();
await prueba("Las 22 tablas existen y un anónimo no puede leer ninguna", async () => {
  const faltan = [], legibles = [];
  for (const t of TABLAS) {
    const { data, error } = await anon.from(t).select("*").limit(1);
    if (error && /PGRST205|does not exist|Could not find the table/i.test(error.code + error.message)) faltan.push(t);
    else if (!error && data.length) legibles.push(t);
    else if (!error) legibles.push(t + " (vacía, pero sin error de permiso)");
  }
  ok(!faltan.length, "faltan tablas: " + faltan.join(", "));
  ok(!legibles.length, "un anónimo puede consultar: " + legibles.join(", "));
  await espera_error(anon.rpc("mis_campanas"), "anónimo llamando a mis_campanas");
  return "22/22 tablas · 0 legibles sin sesión";
});

/* ---------- 2. Cuentas ficticias (cada una con su sesión) ---------- */
for (const n of ["superadmin", "creadorA", "creadorB", "admin", "jefe1", "jefe2", "trab1", "trab2", "dueno1", "dueno2", "sinCampana"]) await cuenta(n);

await prueba("Diagnóstico interno: RLS activada y forzada en las 22 tablas, con políticas y claves foráneas", async () => {
  const d = await rpc(C.superadmin, "diagnostico_esquema");
  const pub = d.filter(x => TABLAS.includes(x.tabla));
  ok(pub.length === 22, "el diagnóstico ve " + pub.length + " tablas");
  const mal = pub.filter(x => !x.rls || !x.rls_forzado || x.anon_puede_leer);
  ok(!mal.length, "tablas sin RLS forzada o legibles por anon: " + mal.map(x => x.tabla).join(", "));
  const sinPol = pub.filter(x => x.politicas === 0);
  ok(!sinPol.length, "tablas sin ninguna política: " + sinPol.map(x => x.tabla).join(", "));
  return `${pub.reduce((s, x) => s + x.politicas, 0)} políticas · ${pub.reduce((s, x) => s + x.claves_foraneas, 0)} claves foráneas · ${pub.reduce((s, x) => s + x.restricciones_check, 0)} comprobaciones`;
});
await prueba("El diagnóstico interno solo lo puede pedir el superadministrador", () => espera_error(C.creadorA.rpc("diagnostico_esquema"), "diagnóstico pedido por un creador").then(() => undefined));

/* ---------- 3. Campaña real de pruebas creada por creadorA ---------- */
const A = {};
await prueba("Creador autorizado crea una campaña, fichas, maquinaria e invitaciones", async () => {
  A.c = await rpc(C.creadorA, "crear_campana", { p_nombre: "Campaña de prueba " + run, p_anio: 2026, p_inicio: "2026-11-01", p_horas_dia: 8, p_precio_trab_cent: 1000, p_precio_dueno_cent: 1200, p_iva: 0 });
  A.t1 = (await ins(C.creadorA, "trabajadores", { campana_id: A.c, nombre: "Trabajador Uno" })).id;
  A.t2 = (await ins(C.creadorA, "trabajadores", { campana_id: A.c, nombre: "Trabajador Dos" })).id;
  await ins(C.creadorA, "trabajadores_privado", { trabajador_id: A.t1, campana_id: A.c, nif: "00000000T" });
  A.d1 = (await ins(C.creadorA, "duenos", { campana_id: A.c, nombre: "Dueño Uno" })).id;
  A.d2 = (await ins(C.creadorA, "duenos", { campana_id: A.c, nombre: "Dueño Dos" })).id;
  await ins(C.creadorA, "asignaciones_equipo", { campana_id: A.c, jefe_user_id: C.jefe1.id, trabajador_id: A.t1, desde: "2026-11-01" });
  await ins(C.creadorA, "asignaciones_equipo", { campana_id: A.c, jefe_user_id: C.jefe2.id, trabajador_id: A.t2, desde: "2026-11-01" });
  for (const [n, rol, t, d] of [["admin", "admin"], ["jefe1", "jefe"], ["jefe2", "jefe"], ["trab1", "trabajador", A.t1], ["trab2", "trabajador", A.t2], ["dueno1", "dueno", null, A.d1], ["dueno2", "dueno", null, A.d2]]) {
    const codigo = await rpc(C.creadorA, "crear_invitacion", { p_campana: A.c, p_rol: rol, p_trabajador: t || null, p_dueno: d || null, p_dias: 1 });
    await rpc(C[n], "canjear_invitacion", { p_codigo: codigo });
  }
  return "7 cuentas unidas con código de un solo uso";
});

/* ---------- 4. Requisito: creador registra 8 h en Android; administrador lo ve en Windows; trabajador en iPhone ---------- */
await prueba("Dos sesiones independientes: el creador registra 8 h y el administrador las ve al instante", async () => {
  A.p = await rpc(C.creadorA, "guardar_parte", { p_campana: A.c, p_dueno: A.d1, p_fecha: "2026-11-15", p_version: null, p_kilos: 2350, p_notas: null,
    p_filas: [{ trabajador_id: A.t1, tipo: "normal" }], p_maquinas: [] });
  const { data, error } = await C.admin.from("partes_filas").select("trabajador_id, tipo, horas, fecha").eq("campana_id", A.c);
  ok(!error && data.length === 1 && data[0].trabajador_id === A.t1 && data[0].tipo === "normal", "el administrador no ve la jornada: " + JSON.stringify(error || data));
  return "jornada visible en la sesión del administrador";
});
await prueba("El trabajador (otra sesión) ve sus 8 h y 80,00 € ganados; nada más", async () => {
  const r = await rpc(C.trab1, "resumen_trabajador", { p_campana: A.c });
  ok(+r.horas === 8 && +r.importe_cent === 8000 && +r.pendiente_cent === 8000, JSON.stringify(r));
  const { data } = await C.trab1.from("partes_filas").select("trabajador_id");
  ok(data.every(f => f.trabajador_id === A.t1), "ve jornadas ajenas");
  return "8 h · 80,00 €";
});
await prueba("Un jefe de otro equipo no ve ese registro", async () => {
  const { data } = await C.jefe2.from("partes_filas").select("*");
  ok(data.length === 0, "el jefe 2 ve " + data.length + " filas del equipo del jefe 1");
  const e = await rpc(C.jefe2, "jornadas_equipo", { p_campana: A.c });
  ok(e.length === 0, "su panel muestra jornadas ajenas");
  const j1 = await rpc(C.jefe1, "jornadas_equipo", { p_campana: A.c });
  ok(j1.length === 1 && +j1[0].horas === 8, "el jefe 1 no ve a su trabajador: " + JSON.stringify(j1));
});

/* ---------- 5. Escalada de privilegios ---------- */
await prueba("Nadie puede hacerse superadministrador, creador o administrador por su cuenta", async () => {
  for (const n of ["creadorA", "trab1", "sinCampana"]) {
    await espera_error(C[n].from("superadmin").insert({ user_id: C[n].id }), n + " → superadmin");
    await cero_filas(C[n].from("superadmin").update({ user_id: C[n].id }).neq("user_id", C[n].id).select(), n + " cambia superadmin");
    await espera_error(C[n].from("miembros").insert({ campana_id: A.c, user_id: C[n].id, rol: "creador" }), n + " → creador");
    await espera_error(C[n].from("miembros").insert({ campana_id: A.c, user_id: C[n].id, rol: "admin" }), n + " → admin");
  }
  await espera_error(C.trab1.from("perfiles").update({ puede_crear_campanas: true }).eq("id", C.trab1.id), "trabajador se da permiso de crear campañas");
  await espera_error(C.creadorA.rpc("crear_invitacion", { p_campana: A.c, p_rol: "creador" }), "creador invita a otro creador");
  await cero_filas(C.trab1.from("miembros").update({ rol: "admin" }).eq("user_id", C.trab1.id).select(), "trabajador cambia su rol");
  await espera_error(C.trab1.rpc("crear_campana", { p_nombre: "Mía" }), "trabajador crea campaña");
  await espera_error(C.sinCampana.rpc("admin_usuarios"), "panel global sin ser superadministrador");
});

await prueba("Un usuario sin campaña asignada no ve ningún dato privado", async () => {
  for (const t of TABLAS) {
    const { data } = await C.sinCampana.from(t).select("*").limit(5);
    const propias = t === "perfiles" ? (data || []).filter(p => p.id !== C.sinCampana.id) : (data || []);
    ok(!propias.length, "ve datos en " + t);
  }
  ok((await rpc(C.sinCampana, "mis_campanas")).length === 0, "le aparecen campañas");
  await espera_error(C.sinCampana.rpc("resumen_trabajador", { p_campana: A.c }), "resumen ajeno");
  await espera_error(C.sinCampana.rpc("cuenta_dueno", { p_campana: A.c, p_dueno: A.d1 }), "cuenta de dueño ajena");
});

await prueba("Jefes, trabajadores y dueños: solo lectura (no crean, cambian ni borran nada)", async () => {
  for (const n of ["jefe1", "trab1", "dueno1", "admin"]) {
    const c = C[n];
    await cero_filas(c.from("partes_filas").update({ horas: 12, tipo: "mas" }).eq("campana_id", A.c).select(), n + " cambia horas");
    await cero_filas(c.from("partes").update({ kilos: 1, fecha: "2026-11-20" }).eq("campana_id", A.c).select(), n + " cambia partes");
    await cero_filas(c.from("pagos").delete().eq("campana_id", A.c).select(), n + " borra pagos");
    await cero_filas(c.from("trabajadores").delete().eq("campana_id", A.c).select(), n + " borra trabajadores");
    await espera_error(c.from("pagos").insert({ campana_id: A.c, tipo: "trabajador", trabajador_id: A.t1, importe_cent: 100, fecha: "2026-11-15" }), n + " anota un pago");
    await espera_error(c.from("partes_filas").insert({ parte_id: A.p.id, campana_id: A.c, fecha: "2026-11-15", trabajador_id: A.t2, horas: 9 }), n + " añade jornada");
    await espera_error(c.rpc("guardar_parte", { p_campana: A.c, p_dueno: A.d1, p_fecha: "2026-11-15", p_version: A.p.version, p_kilos: 0, p_notas: "x", p_filas: [], p_maquinas: [] }), n + " guarda un parte");
  }
  const { data } = await C.admin.from("partes_filas").select("horas, tipo").eq("campana_id", A.c);
  ok(data.length === 1 && data[0].tipo === "normal", "la jornada cambió");
  return "4 roles × 7 intentos de escritura rechazados";
});

await prueba("Dueño: solo su cuenta; otro dueño no la ve", async () => {
  const k = await rpc(C.dueno1, "cuenta_dueno", { p_campana: A.c });
  ok(+k.horas === 8 && +k.total_cent === 9600, "cuenta: " + JSON.stringify(k));
  await espera_error(C.dueno2.rpc("cuenta_dueno", { p_campana: A.c, p_dueno: A.d1 }), "dueño 2 ve la cuenta del dueño 1");
  const { data } = await C.dueno2.from("partes").select("*");
  ok(data.length === 0, "el dueño 2 ve partes del dueño 1");
  return "8 h × 12 € = 96,00 €";
});

await prueba("Un creador no entra en campañas ajenas ni enlaza datos de otra campaña", async () => {
  const B = await rpc(C.creadorB, "crear_campana", { p_nombre: "Campaña B " + run });
  ok((await C.creadorB.from("partes").select("*").eq("campana_id", A.c)).data.length === 0, "B ve partes de A");
  await espera_error(C.creadorB.from("partes").insert({ campana_id: B, dueno_id: A.d1, fecha: "2026-11-20" }), "B enlaza un dueño de A");
  await espera_error(C.creadorB.rpc("cuenta_dueno", { p_campana: A.c, p_dueno: A.d1 }), "B ve cuentas de A");
  ok((await C.admin.from("campanas").select("id").eq("id", B)).data.length === 0, "el administrador de A ve la campaña B");
});

await prueba("Cambios simultáneos desde dos sesiones: la edición antigua no pisa la reciente", async () => {
  const v = A.p.version;
  await rpc(C.creadorA, "guardar_parte", { p_campana: A.c, p_dueno: A.d1, p_fecha: "2026-11-15", p_version: v, p_kilos: 2400, p_notas: "móvil", p_filas: [{ trabajador_id: A.t1, tipo: "normal" }], p_maquinas: [] });
  const e = await espera_error(C.superadmin.rpc("guardar_parte", { p_campana: A.c, p_dueno: A.d1, p_fecha: "2026-11-15", p_version: v, p_kilos: 9999, p_notas: "ordenador", p_filas: [], p_maquinas: [] }), "edición con versión vieja");
  ok(/CONFLICTO/.test(e), "error inesperado: " + e);
  const { data } = await C.admin.from("partes").select("kilos, notas, version").eq("id", A.p.id).single();
  ok(+data.kilos === 2400 && data.notas === "móvil", "se perdió el primer cambio");
  return "versión " + data.version + " · el segundo recibe CONFLICTO";
});

await prueba("Auditoría: consta quién registró la jornada; un trabajador no la lee", async () => {
  const { data } = await C.admin.from("auditoria").select("user_id, tabla, accion").eq("campana_id", A.c).eq("tabla", "partes_filas");
  ok(data.some(r => r.user_id === C.creadorA.id), "no consta el autor");
  ok((await C.trab1.from("auditoria").select("*")).data.length === 0, "el trabajador lee la auditoría");
  return data.length + " registros de jornadas";
});

for (const c of Object.values(C)) await c.auth.signOut().catch(() => {});
const f = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - f} correctas, ${f} con fallos · proyecto ${URL_.replace(/^https:\/\/([a-z0-9]{4})[a-z0-9-]*/, "https://$1…")} · ejecución ${run}`);
process.exit(f ? 1 : 0);
