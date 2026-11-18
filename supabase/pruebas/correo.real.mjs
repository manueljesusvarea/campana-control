// Prueba REAL del correo de confirmación (proyecto Supabase de PRUEBAS, «Confirm email» activado y SMTP propio).
// Paso a paso: cada orden hace una acción contra el servidor real y comprueba su respuesta. Los códigos de 6 cifras
// se leen del buzón real (Gmail de la app) y se pasan a mano: nada se simula.
//
// Cuentas: alias «+» del buzón de la app (p. ej. app+trab@gmail.com), todas ficticias y autorizadas por el dueño.
// Estado (contraseñas aleatorias, códigos de invitación de prueba): .correo-real.json, ignorado por git.
//
// Uso:
//   node correo.real.mjs preparar <buzon@gmail.com>   campaña de prueba e invitaciones (trab, bloq, cad, extra)
//   node correo.real.mjs alta <clave>                  crea la cuenta con su invitación → debe llegar un correo
//   node correo.real.mjs sinconfirmar <clave>          sin confirmar: no entra y su perfil está inactivo
//   node correo.real.mjs incorrecto <clave>            3 códigos incorrectos → rechazados por el servidor
//   node correo.real.mjs reenviar <clave>              pide otro código (el servidor exige 60 s entre envíos)
//   node correo.real.mjs bloquear <clave>              el superadministrador bloquea la cuenta (antes de confirmar)
//   node correo.real.mjs verificar <clave> <código> [--debe-fallar]
//   node correo.real.mjs limite <clave>                códigos incorrectos hasta que el servidor corte (429)
//   node correo.real.mjs recuperar <clave>             «he olvidado mi contraseña» → correo con código
//   node correo.real.mjs nuevaclave <clave> <código>   código de recuperación → contraseña nueva → entrar
//   node correo.real.mjs estado
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.dirname(fileURLToPath(import.meta.url));
const env = {};
for (const l of readFileSync(path.join(dir, ".env.pruebas"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] = m[2]; }
if (/sb_secret|service_role/i.test(env.SUPABASE_PUBLISHABLE_KEY)) { console.error("Clave secreta: no se usa."); process.exit(2); }
const nuevo = () => createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const FEST = path.join(dir, ".correo-real.json");
const E = existsSync(FEST) ? JSON.parse(readFileSync(FEST, "utf8")) : { cuentas: {} };
const guardar = () => writeFileSync(FEST, JSON.stringify(E, null, 2), { mode: 0o600 });
const fijas = JSON.parse(readFileSync(path.join(dir, ".cuentas-pruebas.json"), "utf8"));
const entrarFija = async n => { const c = nuevo(); const { data, error } = await c.auth.signInWithPassword({ email: fijas[n].email, password: fijas[n].password }); if (error) throw new Error(n + ": " + error.message); c.id = data.user.id; return c; };
const ok = (c, m) => { if (!c) { console.log("FALLA  " + m); process.exitCode = 1; } else console.log("OK     " + m); };
const nq = async p => { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; };
const [orden, clave, extra] = process.argv.slice(2);
const cta = () => { const c = E.cuentas[clave]; if (!c) { console.error("No existe la cuenta «" + clave + "». Claves: " + Object.keys(E.cuentas).join(", ")); process.exit(2); } return c; };
const perfil = async id => { const sa = await entrarFija("superadmin"); return nq(sa.from("perfiles").select("activo, correo_confirmado, bloqueado").eq("id", id).single()); };

if (orden === "preparar") {
  const buzon = clave; if (!/^[^@+\s]+@gmail\.com$/i.test(buzon || "")) { console.error("Indica el buzón de Gmail de la app (sin «+»)."); process.exit(2); }
  const cr = await entrarFija("creadorA"), run = Date.now().toString(36);
  const c = await nq(cr.rpc("crear_campana", { p_nombre: "Campaña correo real " + run, p_anio: 2026, p_inicio: "2026-11-01", p_horas_dia: 8, p_precio_trab_cent: 1000, p_precio_dueno_cent: 1200, p_iva: 0 }));
  const t1 = (await nq(cr.from("trabajadores").insert({ campana_id: c, nombre: "Trabajador Correo" }).select().single())).id;
  const t2 = (await nq(cr.from("trabajadores").insert({ campana_id: c, nombre: "Trabajador Bloqueado" }).select().single())).id;
  const d = (await nq(cr.from("duenos").insert({ campana_id: c, nombre: "Dueño Correo" }).select().single())).id;
  await nq(cr.rpc("guardar_parte", { p_campana: c, p_dueno: d, p_fecha: "2026-11-18", p_version: null, p_kilos: 1000, p_notas: null, p_filas: [{ trabajador_id: t1, tipo: "normal" }, { trabajador_id: t2, tipo: "normal" }], p_maquinas: [] }));
  const [u, dom] = buzon.split("@"), alias = k => `${u}+${k}${run.slice(-4)}@${dom}`;
  E.campana = c; E.buzon = buzon; E.cuentas = {};
  for (const [k, rol, t] of [["trab", "trabajador", t1], ["bloq", "trabajador", t2], ["cad", "admin"], ["extra", "admin"]])
    E.cuentas[k] = { email: alias(k), password: crypto.randomBytes(15).toString("base64url"), rol, codigo: await nq(cr.rpc("crear_invitacion", { p_campana: c, p_rol: rol, p_trabajador: t || null, p_dueno: null, p_dias: 2 })) };
  guardar();
  console.log("Campaña de prueba creada con 2 trabajadores, 1 parte (8 h cada uno) e invitaciones para:");
  for (const [k, v] of Object.entries(E.cuentas)) console.log(`  ${k.padEnd(6)} ${v.email}  (${v.rol})`);
}
else if (orden === "alta") {
  const c = cta(), cli = nuevo();
  const { data, error } = await cli.auth.signUp({ email: c.email, password: c.password, options: { data: { nombre: "Prueba correo " + clave, codigo_invitacion: c.codigo } } });
  ok(!error, "alta aceptada por el servidor" + (error ? ": " + error.message : ""));
  ok(!data?.session, "sin sesión hasta confirmar el correo (Confirm email activo)");
  ok((data?.user?.identities || []).length === 1, "cuenta nueva (no repetida)");
  if (data?.user) { c.id = data.user.id; c.enviado = new Date().toISOString(); guardar(); }
  console.log("→ Debe llegar un correo a " + c.email);
}
else if (orden === "sinconfirmar") {
  const c = cta(), cli = nuevo();
  const { data, error } = await cli.auth.signInWithPassword({ email: c.email, password: c.password });
  ok(error && !data?.session && (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)), "el servidor no deja entrar sin confirmar: " + (error?.code || error?.message || "¡entró!"));
  const p = await perfil(c.id);
  ok(!p.activo && !p.correo_confirmado, "perfil inactivo y sin confirmar en la base de datos: " + JSON.stringify(p));
}
else if (orden === "incorrecto") {
  const c = cta();
  for (let i = 0; i < 3; i++) {
    const { data, error } = await nuevo().auth.verifyOtp({ email: c.email, token: String(100000 + crypto.randomInt(899999)), type: "email" });
    ok(error && !data?.session, `código incorrecto ${i + 1} rechazado por el servidor: ${error?.code || error?.message}`);
  }
}
else if (orden === "reenviar") {
  const c = cta();
  const { error } = await nuevo().auth.resend({ type: "signup", email: c.email });
  if (error) console.log("Servidor: " + (error.code || "") + " · " + error.message);
  else { c.enviado = new Date().toISOString(); guardar(); }
  ok(true, error ? "reenvío rechazado por el servidor (ver mensaje)" : "reenvío aceptado → debe llegar otro correo");
}
else if (orden === "bloquear") {
  const c = cta(), sa = await entrarFija("superadmin");
  await nq(sa.from("perfiles").update({ bloqueado: true }).eq("id", c.id));
  const p = await perfil(c.id);
  ok(p.bloqueado && !p.activo, "bloqueada por el superadministrador antes de confirmar: " + JSON.stringify(p));
}
else if (orden === "verificar") {
  const c = cta(), debeFallar = process.argv.includes("--debe-fallar"), cli = nuevo();
  const { data, error } = await cli.auth.verifyOtp({ email: c.email, token: String(extra || "").replace(/\D/g, ""), type: "email" });
  if (debeFallar) { ok(error && !data?.session, "código rechazado por el servidor como se esperaba: " + (error?.code || error?.message || "¡aceptado!")); }
  else {
    ok(!error && data?.session, "código real del correo aceptado por el servidor" + (error ? ": " + (error.code || error.message) : ""));
    if (!error) {
      const p = await perfil(c.id); console.log("       perfil: " + JSON.stringify(p));
      const camp = await cli.rpc("mis_campanas"), trab = await cli.from("trabajadores").select("id, nombre"), filas = await cli.from("partes_filas").select("trabajador_id");
      if (clave === "bloq") {
        ok(p.correo_confirmado && p.bloqueado && !p.activo, "confirmado pero sigue bloqueado");
        ok(!camp.data?.length && !trab.data?.length && !filas.data?.length, "bloqueado: no ve campañas, fichas ni jornadas");
      } else {
        ok(p.correo_confirmado && p.activo, "confirmado y activo");
        ok(camp.data?.length === 1 && camp.data[0].campana_id === E.campana && camp.data[0].roles.join() === c.rol, "entra en su campaña con su rol: " + JSON.stringify(camp.data?.map(x => x.roles)));
        if (c.rol === "trabajador") {
          const r = await nq(cli.rpc("resumen_trabajador", { p_campana: E.campana }));
          ok(+r.horas === 8 && +r.importe_cent === 8000 && trab.data.length === 1, `ve solo lo suyo: ${r.horas} h · ${r.importe_cent / 100} € · ${trab.data.length} ficha`);
          const otro = await cli.from("partes_filas").select("*").neq("trabajador_id", trab.data[0].id);
          ok(!otro.data?.length, "no ve las jornadas del otro trabajador");
        }
        const escribe = await cli.from("partes").update({ kilos: 1 }).eq("campana_id", E.campana).select();
        ok(escribe.error || !escribe.data?.length, "no puede modificar partes");
      }
    }
  }
}
else if (orden === "limite") {
  const c = cta(); let n = 0, ultimo = "";
  for (; n < 60; n++) {
    const { error } = await nuevo().auth.verifyOtp({ email: c.email, token: String(100000 + crypto.randomInt(899999)), type: "email" });
    ultimo = (error?.status || "") + " " + (error?.code || "") + " " + (error?.message || "");
    if (!error) { ok(false, "¡un código aleatorio fue aceptado!"); break; }
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) break;
  }
  ok(/429|rate|too many/i.test(ultimo), `el servidor corta tras ${n} intentos fallidos: ${ultimo.trim()}`);
}
else if (orden === "recuperar") {
  const c = cta(); const { error } = await nuevo().auth.resetPasswordForEmail(c.email);
  ok(!error, "petición de recuperación aceptada → debe llegar un correo" + (error ? ": " + error.message : ""));
}
else if (orden === "nuevaclave") {
  const c = cta(), cli = nuevo();
  const { data, error } = await cli.auth.verifyOtp({ email: c.email, token: String(extra || "").replace(/\D/g, ""), type: "recovery" });
  ok(!error && data?.session, "código de recuperación real aceptado" + (error ? ": " + (error.code || error.message) : ""));
  if (!error) {
    const vieja = c.password, nueva = crypto.randomBytes(15).toString("base64url");
    ok(!(await cli.auth.updateUser({ password: nueva })).error, "contraseña cambiada");
    c.password = nueva; guardar();
    ok((await nuevo().auth.signInWithPassword({ email: c.email, password: vieja })).error, "la contraseña antigua ya no sirve");
    ok(!(await nuevo().auth.signInWithPassword({ email: c.email, password: nueva })).error, "entra con la nueva");
  }
}
else if (orden === "estado") { for (const [k, v] of Object.entries(E.cuentas)) console.log(k.padEnd(6), v.email, v.rol, v.id || "(sin alta)", v.enviado || ""); }
else { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter(l => l.startsWith("//")).join("\n")); }
