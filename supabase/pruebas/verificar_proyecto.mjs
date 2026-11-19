// Verificación NO destructiva de un proyecto Supabase de Campaña Control (pensada para el de PRODUCCIÓN recién
// instalado; también sirve para el de pruebas). No crea, cambia ni borra nada.
// Comprueba: las 24 tablas cerradas al anónimo, registro público rechazado, funciones administrativas rechazadas sin
// sesión, Edge Function «gestion-usuarios» desplegada y exigiendo sesión, bucket de fotos privado y, si se dan las
// credenciales del superadministrador, que entra, que es superadministrador y que el sello de las copias funciona.
// Uso (en la misma sesión de la terminal, sin guardar nada en archivos del proyecto):
//   CC_URL=https://….supabase.co CC_CLAVE_PUBLICA=sb_publishable_… node verificar_proyecto.mjs
//   (opcional) CC_SUPER_USUARIO=… CC_SUPER_CLAVE=…
import { createClient } from "@supabase/supabase-js";
const env = process.env, URL_ = env.CC_URL, KEY = env.CC_CLAVE_PUBLICA;
if (!URL_ || !KEY) { console.error("Faltan CC_URL y CC_CLAVE_PUBLICA"); process.exit(2); }
if (/sb_secret|service_role/i.test(KEY)) { console.error("Usa la clave PÚBLICA (sb_publishable_…), nunca una secreta"); process.exit(2); }
const TABLAS = ["perfiles", "superadmin", "campanas", "campanas_economia", "trabajadores", "trabajadores_privado", "duenos", "duenos_privado", "duenos_trabajadores",
  "miembros", "asignaciones_equipo", "maquinas", "partes", "partes_filas", "partes_maquinas", "pagos", "plantillas", "documentos", "fotos", "invitaciones", "auditoria",
  "importaciones", "autorizaciones_creador", "altas_pendientes"];
const nuevo = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let fallos = 0; const r = (bien, txt) => { console.log((bien ? "OK     " : "FALLA  ") + txt); if (!bien) fallos++; };
const anon = nuevo();
const legibles = []; for (const t of TABLAS) { const { data, error } = await anon.from(t).select("*").limit(1); if (!error && data?.length) legibles.push(t); }
r(!legibles.length, `Anónimo: ${TABLAS.length - legibles.length}/${TABLAS.length} tablas sin datos legibles${legibles.length ? " · LEE: " + legibles.join(", ") : ""}`);
// Registro público: con el identificador técnico y una contraseña aleatoria (si se aceptara, el hook lo rechaza igualmente)
const reg = await anon.auth.signUp({ email: "comprobacion." + Date.now().toString(36) + "@usuarios.campana-control.invalid", password: crypto.randomUUID() });
r(!!reg.error && !reg.data?.user?.id, "Registro público rechazado" + (reg.error ? ` (${reg.error.status || ""} ${reg.error.message.slice(0, 60)})` : ""));
for (const [f, a] of [["crear_campana", { p_nombre: "x" }], ["preparar_alta", { p_usuario: "colado", p_nombre: "x", p_tipo: "creador" }], ["copia_campana", { p_campana: crypto.randomUUID() }],
  ["importar_campana", { p_campana: crypto.randomUUID(), p_huella: "a".repeat(64), p_datos: {} }], ["restaurar_miembros", { p_campana: crypto.randomUUID(), p_miembros: [] }], ["usuarios_gestionados", {}]]) {
  const { error } = await anon.rpc(f, a); r(!!error, `Sin sesión, ${f}() rechazada`);
}
const fn = await fetch(URL_ + "/functions/v1/gestion-usuarios", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" });
r(fn.status === 401, `Edge Function gestion-usuarios desplegada y exige sesión (HTTP ${fn.status})`);
const pub = await fetch(URL_ + "/storage/v1/object/public/fotos/comprobacion.jpg");
r(pub.status >= 400, `Bucket «fotos» privado: la dirección pública no sirve (HTTP ${pub.status})`);
if (env.CC_SUPER_USUARIO && env.CC_SUPER_CLAVE) {
  const sa = nuevo(), e = await sa.auth.signInWithPassword({ email: env.CC_SUPER_USUARIO.toLowerCase() + "@usuarios.campana-control.invalid", password: env.CC_SUPER_CLAVE });
  r(!e.error, "El superadministrador entra" + (e.error ? ": " + e.error.message : ""));
  if (!e.error) {
    const yo = e.data.user.id, s = await sa.from("superadmin").select("user_id").eq("user_id", yo);
    r((s.data || []).length === 1, "Es superadministrador (por su identificador en la base de datos)");
    const v = await sa.rpc("verificar_sello", { p_datos: { prueba: 1 }, p_sello: "0".repeat(64) });
    r(!v.error && v.data === false, "Sello de copias operativo (rechaza un sello falso)");
    await sa.auth.signOut();
  }
}
console.log(`\n${fallos ? fallos + " comprobación(es) con FALLO" : "Todo correcto"} · ${URL_.replace(/^https:\/\/(\w{4})\w+/, "https://$1…")}`);
process.exit(fallos ? 1 : 0);
