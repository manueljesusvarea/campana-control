// Pruebas de seguridad CONTRA EL PROYECTO SUPABASE DE PRUEBAS (no producción) · cuentas privadas (migraciones 000006-7).
// Peticiones directas a la API y a la Edge Function «gestion-usuarios», cada usuario ficticio con su propia sesión
// (como dispositivos distintos). No se usa la interfaz: así se prueban las políticas y las operaciones del servidor.
//
// Configuración (no se sube a git): .env.pruebas (URL y clave pública) y .cuentas-pruebas.json con el
// superadministrador de pruebas «propietario.pruebas» (su contraseña la guarda esta prueba al cambiar la temporal).
// Uso: node real.test.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.dirname(fileURLToPath(import.meta.url));
const env = { ...process.env };
for (const l of readFileSync(path.join(dir, ".env.pruebas"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/); if (m) env[m[1]] ??= m[2]; }
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY || /sb_secret|service_role/i.test(KEY)) { console.error("Falta la URL o la clave PÚBLICA (nunca una secreta) en .env.pruebas"); process.exit(2); }
const FCUENTAS = path.join(dir, ".cuentas-pruebas.json");
const F = existsSync(FCUENTAS) ? JSON.parse(readFileSync(FCUENTAS, "utf8")) : {};
if (!F.propietario) { console.error("Falta el superadministrador de pruebas (propietario) en .cuentas-pruebas.json"); process.exit(2); }

const DOMINIO = "@usuarios.campana-control.invalid";
const TABLAS = ["perfiles", "superadmin", "campanas", "campanas_economia", "trabajadores", "trabajadores_privado", "duenos", "duenos_privado", "duenos_trabajadores",
  "miembros", "asignaciones_equipo", "maquinas", "partes", "partes_filas", "partes_maquinas", "pagos", "plantillas", "documentos", "fotos", "invitaciones", "auditoria",
  "importaciones", "autorizaciones_creador", "altas_pendientes"];
const nuevo = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const resultados = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
async function prueba(nombre, fn) {
  try { const d = await fn(); resultados.push({ nombre, ok: true }); console.log("OK     " + nombre + (d ? "  → " + d : "")); }
  catch (e) { resultados.push({ nombre, ok: false }); console.log("FALLA  " + nombre + "\n       → " + e.message); }
}
const espera_error = async (p, txt) => { const r = await p; ok(r.error, "se permitió: " + txt); return r.error.message; };
const cero = async (p, txt) => { const r = await p; ok(r.error || !(r.data || []).length, "se modificaron filas: " + txt); };
const nq = async (p, txt = "") => { const r = await p; if (r.error) throw new Error(txt + r.error.message); return r.data; };
const run = Date.now().toString(36).slice(-5);
const S = {};   // sesiones por persona: { cli, usuario, clave, id }

// Edge Function: devuelve { estado, datos }
async function funcion(cli, cuerpo) {
  const r = await cli.functions.invoke("gestion-usuarios", { body: cuerpo });
  if (!r.error) return { estado: 200, datos: r.data };
  let datos = {}; try { datos = await r.error.context.json(); } catch (_) { }
  return { estado: r.error.context?.status || 0, datos };
}
const entrar = async (usuario, clave) => { const cli = nuevo(); const r = await cli.auth.signInWithPassword({ email: usuario + DOMINIO, password: clave }); return { cli, error: r.error, id: r.data?.user?.id }; };
const claveNueva = () => crypto.randomBytes(12).toString("base64url");
// Alta completa como en la app: quien crea → contraseña temporal → la persona entra y pone la suya
async function alta(quien, nombreClave, datos) {
  const usuario = (nombreClave + "." + run).toLowerCase();
  const r = await funcion(S[quien].cli, { accion: "crear", usuario, nombre: datos.nombre || nombreClave, ...datos });
  ok(r.estado === 200 && r.datos.clave_temporal, `alta de ${usuario}: ${r.estado} ${JSON.stringify(r.datos)}`);
  const e = await entrar(usuario, r.datos.clave_temporal); ok(!e.error, "entrar con la temporal: " + e.error?.message);
  const clave = claveNueva();
  const c = await funcion(e.cli, { accion: "cambiar_clave", actual: r.datos.clave_temporal, nueva: clave });
  ok(c.estado === 200 && c.datos.activo === true, "cambiar la temporal: " + JSON.stringify(c));
  // Al cambiar la contraseña, Supabase cierra las sesiones anteriores: se vuelve a entrar con la nueva
  const e2 = await entrar(usuario, clave); ok(!e2.error, "entrar con la nueva: " + e2.error?.message);
  S[nombreClave] = { cli: e2.cli, usuario, clave, id: e2.id };
  return S[nombreClave];
}

/* ---------- 0. Nadie entra por otra puerta ---------- */
const anon = nuevo();
await prueba(`Sin sesión: las ${TABLAS.length} tablas cerradas, registro público rechazado, Edge Function y funciones de alta rechazadas`, async () => {
  const legibles = [];
  for (const t of TABLAS) { const { data, error } = await anon.from(t).select("*").limit(1); if (!error && data?.length) legibles.push(t); }
  ok(!legibles.length, "un anónimo lee: " + legibles.join(", "));
  const reg = await anon.auth.signUp({ email: "colado." + run + DOMINIO, password: claveNueva() });
  ok(reg.error && !reg.data?.user?.id, "el registro público creó una cuenta");
  await espera_error(anon.from("altas_pendientes").insert({ usuario: "colado", nombre: "x", tipo: "superadmin" }), "anónimo inserta un alta");
  await espera_error(anon.rpc("preparar_alta", { p_usuario: "colado", p_nombre: "x", p_tipo: "creador" }), "anónimo prepara un alta");
  const f = await funcion(anon, { accion: "crear", tipo: "creador", usuario: "colado." + run, nombre: "x" });
  ok(f.estado === 401, "la Edge Function sin sesión respondió " + f.estado);
  return `0 tablas legibles · registro: ${reg.error.status} · función: 401`;
});

/* ---------- 1. Superadministrador (cuenta privada) ---------- */
await prueba("El superadministrador entra con usuario y contraseña (y pone la suya si tenía una temporal)", async () => {
  let e = await entrar(F.propietario.usuario, F.propietario.password); ok(!e.error, "entrar: " + e.error?.message);
  if (F.propietario.temporal) {
    await espera_error(e.cli.rpc("admin_estadisticas"), "panel global con la contraseña temporal");
    const nueva = claveNueva();
    const c = await funcion(e.cli, { accion: "cambiar_clave", actual: F.propietario.password, nueva });
    ok(c.estado === 200 && c.datos.activo, "cambiar la temporal: " + JSON.stringify(c));
    F.propietario.password = nueva; delete F.propietario.temporal; writeFileSync(FCUENTAS, JSON.stringify(F, null, 2), { mode: 0o600 });
    e = await entrar(F.propietario.usuario, nueva); ok(!e.error, "entrar con la nueva: " + e.error?.message);
  }
  S.super = { cli: e.cli, usuario: F.propietario.usuario, id: e.id };
  const d = await nq(e.cli.rpc("diagnostico_esquema"));
  const mal = d.filter(x => !x.rls || !x.rls_forzado || x.anon_puede_leer);
  ok(!mal.length, "tablas sin RLS forzada: " + mal.map(x => x.tabla).join(", "));
  return `${d.length} tablas con RLS forzada`;
});

/* ---------- 2-4. Creador ---------- */
await prueba("1-4 · El superadministrador crea un creador; el creador entra, cambia su contraseña temporal y crea su campaña", async () => {
  const usuario = "gestor." + run;
  const r = await funcion(S.super.cli, { accion: "crear", tipo: "creador", usuario, nombre: "Gestor " + run });
  ok(r.estado === 200 && r.datos.clave_temporal?.length === 12, "alta: " + JSON.stringify(r));
  const e = await entrar(usuario, r.datos.clave_temporal); ok(!e.error, "entrar con la temporal");
  await espera_error(e.cli.rpc("crear_campana", { p_nombre: "No" }), "crear campaña con la temporal");
  // Cambiar la contraseña solo por la vía controlada (Auth directo no habilita la cuenta)
  const directo = claveNueva(); await e.cli.auth.updateUser({ password: directo });
  await espera_error(e.cli.rpc("crear_campana", { p_nombre: "No" }), "crear campaña tras cambiar la contraseña por fuera");
  ok((await funcion(e.cli, { accion: "cambiar_clave", actual: "incorrecta", nueva: claveNueva() })).estado === 403, "aceptó una contraseña actual incorrecta");
  ok((await funcion(e.cli, { accion: "cambiar_clave", actual: directo, nueva: "corta" })).estado === 400, "aceptó una contraseña corta");
  const clave = claveNueva(); const c = await funcion(e.cli, { accion: "cambiar_clave", actual: directo, nueva: clave });
  ok(c.estado === 200 && c.datos.activo, "cambiar: " + JSON.stringify(c));
  ok((await entrar(usuario, r.datos.clave_temporal)).error, "la temporal sigue sirviendo");
  S.gestor = { cli: (await entrar(usuario, clave)).cli, usuario, clave };
  const cli = S.gestor.cli;
  S.c = await nq(cli.rpc("crear_campana", { p_nombre: "Campaña real " + run, p_anio: 2026, p_inicio: "2026-11-01", p_horas_dia: 8, p_precio_trab_cent: 1000, p_precio_dueno_cent: 1200, p_iva: 0 }));
  const ts = await nq(cli.from("trabajadores").insert([{ campana_id: S.c, nombre: "Trabajador Uno" }, { campana_id: S.c, nombre: "Trabajador Dos" }]).select("id, nombre"));
  S.t1 = ts.find(x => x.nombre === "Trabajador Uno").id; S.t2 = ts.find(x => x.nombre === "Trabajador Dos").id;
  S.d = (await nq(cli.from("duenos").insert({ campana_id: S.c, nombre: "Dueño Real" }).select().single())).id;
  return "contraseña temporal de 12 caracteres · sin acceso hasta cambiarla (también si se cambia por fuera) · campaña creada";
});

await prueba("Un segundo creador con su propia campaña (para comprobar el aislamiento)", async () => {
  const usuario = "gestor2." + run;
  const r = await funcion(S.super.cli, { accion: "crear", tipo: "creador", usuario, nombre: "Gestor dos" });
  const e = await entrar(usuario, r.datos.clave_temporal); const clave = claveNueva();
  ok((await funcion(e.cli, { accion: "cambiar_clave", actual: r.datos.clave_temporal, nueva: clave })).estado === 200, "cambiar la temporal del creador 2");
  S.gestor2 = { cli: (await entrar(usuario, clave)).cli, usuario, clave };
  S.c2 = await nq(S.gestor2.cli.rpc("crear_campana", { p_nombre: "Campaña ajena " + run }));
  S.tB = (await nq(S.gestor2.cli.from("trabajadores").insert({ campana_id: S.c2, nombre: "Trabajador de B" }).select().single())).id;
  await alta("gestor2", "trabB", { campana: S.c2, rol: "trabajador", trabajador: S.tB });
  return "creador 2 con su campaña y un trabajador";
});

/* ---------- 5, 9. Cuentas de la campaña ---------- */
await prueba("5 y 9 · El creador crea dos administradores (lector y editor), un jefe, dos trabajadores y un dueño", async () => {
  await alta("gestor", "lector", { campana: S.c, rol: "admin" });
  await alta("gestor", "editor", { campana: S.c, rol: "admin", editor: true });
  await alta("gestor", "jefe", { campana: S.c, rol: "jefe" });
  await alta("gestor", "trab1", { campana: S.c, rol: "trabajador", trabajador: S.t1 });
  await alta("gestor", "trab2", { campana: S.c, rol: "trabajador", trabajador: S.t2 });
  await alta("gestor", "dueno", { campana: S.c, rol: "dueno", dueno: S.d });
  for (const k of ["lector", "editor", "jefe", "trab1", "trab2", "dueno"]) {
    const m = await nq(S[k].cli.rpc("mis_campanas"));
    ok(m.length === 1 && m[0].campana_id === S.c, k + " no está en su campaña: " + JSON.stringify(m));
  }
  const p = await nq(S.editor.cli.rpc("mis_permisos", { p_campana: S.c })), q = await nq(S.lector.cli.rpc("mis_permisos", { p_campana: S.c }));
  ok(p.edita && !p.gestiona && !q.edita && q.consulta, "permisos: " + JSON.stringify({ editor: p, lector: q }));
  await nq(S.gestor.cli.from("asignaciones_equipo").insert({ campana_id: S.c, jefe_user_id: S.jefe.id, trabajador_id: S.t1, desde: "2026-11-01" }));
  return "6 cuentas con su rol · editor puede editar, lector solo consultar";
});

await prueba("Altas indebidas rechazadas por el servidor (Edge Function + base de datos)", async () => {
  const intentos = [
    [S.gestor, { tipo: "creador", usuario: "otro.creador." + run }, 403],
    [S.gestor, { campana: S.c2, rol: "admin", usuario: "en.ajena." + run }, 403],
    [S.gestor2, { campana: S.c, rol: "admin", usuario: "en.otra." + run }, 403],
    [S.editor, { campana: S.c, rol: "trabajador", trabajador: S.t1, usuario: "por.editor." + run }, 403],
    [S.lector, { campana: S.c, rol: "admin", usuario: "por.lector." + run }, 403],
    [S.trab1, { campana: S.c, rol: "admin", usuario: "por.trab." + run }, 403],
    [S.gestor, { campana: S.c, rol: "creador", usuario: "cocreador." + run }, 403],
    [S.gestor, { campana: S.c, rol: "jefe", editor: true, usuario: "jefe.editor." + run }, 400],
    [S.gestor, { campana: S.c, rol: "trabajador", trabajador: S.t1, usuario: "ficha.repetida." + run }, 400],
    [S.gestor, { campana: S.c, rol: "admin", usuario: S.lector.usuario }, 400],
    [S.gestor, { campana: S.c, rol: "admin", usuario: "Mal Nombre" }, 400]];
  for (const [quien, datos, esperado] of intentos) {
    const r = await funcion(quien.cli, { accion: "crear", nombre: "X", ...datos });
    ok(r.estado === esperado, `${quien.usuario} → ${JSON.stringify(datos)}: ${r.estado} ${JSON.stringify(r.datos)}`);
  }
  // Y por la API, sin pasar por la función
  await espera_error(S.gestor.cli.from("altas_pendientes").insert({ usuario: "colado." + run, nombre: "x", tipo: "creador" }), "insertar altas");
  await espera_error(S.gestor.cli.rpc("clave_cambiada_servidor", { p_user: S.trab1.id }), "habilitar una cuenta");
  await espera_error(S.gestor.cli.rpc("hook_alta_con_codigo", { event: {} }), "llamar al hook");
  for (const k of ["lector", "editor"]) await cero(S[k].cli.from("miembros").update({ puede_editar: true, rol: "creador" }).eq("user_id", S[k].id).select(), k + " cambia su rol");
  await espera_error(S.trab1.cli.from("perfiles").update({ debe_cambiar_clave: false, puede_crear_campanas: true }).eq("id", S.trab1.id), "trabajador se da permisos");
  return `${intentos.length} altas rechazadas · 5 accesos directos rechazados`;
});

/* ---------- 6-8. Edición y lectura ---------- */
await prueba("6-8 · El administrador editor modifica una jornada y anota un pago; el lector la ve pero no puede modificarla", async () => {
  const p = await nq(S.gestor.cli.rpc("guardar_parte", { p_campana: S.c, p_dueno: S.d, p_fecha: "2026-11-18", p_version: null, p_kilos: 2000, p_notas: null,
    p_filas: [{ trabajador_id: S.t1, tipo: "normal" }, { trabajador_id: S.t2, tipo: "normal" }], p_maquinas: [] }));
  const p2 = await nq(S.editor.cli.rpc("guardar_parte", { p_campana: S.c, p_dueno: S.d, p_fecha: "2026-11-18", p_version: p.version, p_kilos: 2100, p_notas: "editado por el administrador",
    p_filas: [{ trabajador_id: S.t1, tipo: "normal" }, { trabajador_id: S.t2, tipo: "especial", horas: 6 }], p_maquinas: [] }), "editor: ");
  ok(p2.version === p.version + 1, "versión " + p2.version);
  await nq(S.editor.cli.from("pagos").insert({ campana_id: S.c, tipo: "trabajador", trabajador_id: S.t1, importe_cent: 2500, fecha: "2026-11-18" }), "pago del editor: ");
  const v = await nq(S.lector.cli.from("partes_filas").select("trabajador_id, horas, tipo").eq("campana_id", S.c));
  ok(v.length === 2 && v.some(f => f.trabajador_id === S.t2 && +f.horas === 6), "el lector no ve la jornada editada: " + JSON.stringify(v));
  await espera_error(S.lector.cli.rpc("guardar_parte", { p_campana: S.c, p_dueno: S.d, p_fecha: "2026-11-18", p_version: p2.version, p_kilos: 1, p_notas: null, p_filas: [], p_maquinas: [] }), "el lector guarda el parte");
  await cero(S.lector.cli.from("partes_filas").update({ horas: 1 }).eq("campana_id", S.c).select(), "el lector cambia horas");
  await espera_error(S.lector.cli.from("pagos").insert({ campana_id: S.c, tipo: "trabajador", trabajador_id: S.t1, importe_cent: 1, fecha: "2026-11-18" }), "el lector anota un pago");
  await cero(S.lector.cli.from("pagos").delete().eq("campana_id", S.c).select(), "el lector borra pagos");
  await espera_error(S.editor.cli.from("trabajadores").insert({ campana_id: S.c, nombre: "No" }), "el editor crea trabajadores");
  await espera_error(S.editor.cli.from("maquinas").insert({ campana_id: S.c, nombre: "No", precio_cent: 1 }), "el editor crea maquinaria");
  return `editor: parte v${p2.version} y pago de 25 € · lector: lo ve, 4 cambios rechazados`;
});

/* ---------- 10-12. Lo de cada uno ---------- */
await prueba("10-12 · El jefe ve solo su equipo; cada trabajador solo sus horas y ganancias; el dueño su cuenta; nadie de otra campaña ve nada", async () => {
  const eq = await nq(S.jefe.cli.rpc("jornadas_equipo", { p_campana: S.c }));
  ok(eq.length === 1 && eq[0].trabajador === "Trabajador Uno", "jefe: " + JSON.stringify(eq.map(x => x.trabajador)));
  const r1 = await nq(S.trab1.cli.rpc("resumen_trabajador", { p_campana: S.c })), r2 = await nq(S.trab2.cli.rpc("resumen_trabajador", { p_campana: S.c }));
  ok(+r1.horas === 8 && +r1.importe_cent === 8000 && +r1.entregado_cent === 2500 && +r1.pendiente_cent === 5500, "trabajador 1: " + JSON.stringify(r1));
  ok(+r2.horas === 6 && +r2.importe_cent === 6000, "trabajador 2: " + JSON.stringify(r2));
  ok((await nq(S.trab2.cli.from("partes_filas").select("trabajador_id"))).every(f => f.trabajador_id === S.t2), "el trabajador 2 ve jornadas ajenas");
  ok((await nq(S.trab2.cli.from("pagos").select("*"))).length === 0, "el trabajador 2 ve pagos ajenos");
  const cu = await nq(S.dueno.cli.rpc("cuenta_dueno", { p_campana: S.c }));
  ok(+cu.horas === 14 && +cu.total_cent === 16800, "dueño: " + JSON.stringify({ h: cu.horas, t: cu.total_cent }));
  for (const k of ["trab1", "trab2", "jefe", "dueno"]) for (const t of ["trabajadores_privado", "miembros", "asignaciones_equipo", "auditoria"]) {
    const { data } = await S[k].cli.from(t).select("*").eq("campana_id", S.c);
    ok(!(data || []).filter(x => !(t === "miembros" && x.user_id === S[k].id) && !(t === "asignaciones_equipo" && k === "jefe")).length, `${k} ve ${t}`);
  }
  for (const k of ["gestor2", "trabB"]) for (const t of ["partes", "partes_filas", "pagos", "trabajadores", "duenos", "miembros"])
    ok(!(await S[k].cli.from(t).select("*").eq("campana_id", S.c)).data?.length, `${k} (otra campaña) ve ${t}`);
  await espera_error(S.gestor2.cli.rpc("resumen_trabajador", { p_campana: S.c }), "otro creador pide un resumen");
  await espera_error(S.trabB.cli.rpc("jornadas_equipo", { p_campana: S.c }), "otra campaña pide jornadas");
  return "jefe: 1 trabajador · trab1 8 h, 80 €, le quedan 55 € · trab2 6 h, 60 € · dueño 14 h, 168 € · otra campaña: nada";
});

/* ---------- 14. Restablecer contraseña ---------- */
await prueba("14 · Restablecer contraseña: solo quien gestiona a esa persona; la antigua deja de valer y no hay acceso hasta poner una propia", async () => {
  for (const k of ["lector", "editor", "trab1", "gestor2"]) ok((await funcion(S[k].cli, { accion: "restablecer", usuario: S.trab2.usuario })).estado === 403, k + " restablece");
  ok((await funcion(S.gestor.cli, { accion: "restablecer", usuario: S.gestor2.usuario })).estado === 403, "un creador restablece a otro creador");
  ok((await funcion(S.gestor.cli, { accion: "restablecer", usuario: F.propietario.usuario })).estado === 403, "un creador restablece al superadministrador");
  const r = await funcion(S.gestor.cli, { accion: "restablecer", usuario: S.trab2.usuario });
  ok(r.estado === 200 && r.datos.clave_temporal, "restablecer: " + JSON.stringify(r));
  ok((await entrar(S.trab2.usuario, S.trab2.clave)).error, "la contraseña antigua sigue sirviendo");
  ok(!(await S.trab2.cli.from("partes_filas").select("*")).data?.length, "la sesión antigua sigue viendo datos");
  const e = await entrar(S.trab2.usuario, r.datos.clave_temporal); ok(!e.error, "entrar con la temporal");
  await espera_error(e.cli.rpc("resumen_trabajador", { p_campana: S.c }), "datos con la temporal");
  const clave = claveNueva(); ok((await funcion(e.cli, { accion: "cambiar_clave", actual: r.datos.clave_temporal, nueva: clave })).estado === 200, "cambiar la temporal");
  const e2 = await entrar(S.trab2.usuario, clave);
  ok(+(await nq(e2.cli.rpc("resumen_trabajador", { p_campana: S.c }))).horas === 6, "no recuperó el acceso con su contraseña");
  S.trab2 = { ...S.trab2, cli: e2.cli, clave };
  return "6 intentos sin permiso rechazados · temporal nueva · antigua anulada · acceso solo tras poner la suya";
});

/* ---------- 13. Bloqueo ---------- */
await prueba("13 · El superadministrador bloquea una cuenta: pierde el acceso al momento y no lo recupera con cambios de contraseña ni de sesión", async () => {
  ok((await funcion(S.lector.cli, { accion: "bloquear", usuario: S.trab1.usuario, bloquear: true })).estado === 403, "un administrador bloquea");
  ok((await funcion(S.gestor2.cli, { accion: "bloquear", usuario: S.trab1.usuario, bloquear: true })).estado === 403, "otro creador bloquea");
  const b = await funcion(S.super.cli, { accion: "bloquear", usuario: S.trab1.usuario, bloquear: true }); ok(b.estado === 200, "bloquear: " + JSON.stringify(b));
  ok(!(await S.trab1.cli.from("partes_filas").select("*")).data?.length, "la sesión abierta sigue viendo jornadas");
  await espera_error(S.trab1.cli.rpc("resumen_trabajador", { p_campana: S.c }), "resumen con la sesión abierta");
  ok((await entrar(S.trab1.usuario, S.trab1.clave)).error, "una cuenta bloqueada inicia sesión");
  ok((await S.trab1.cli.auth.refreshSession()).error || !(await S.trab1.cli.from("partes_filas").select("*")).data?.length, "renovar la sesión devuelve el acceso");
  ok((await funcion(S.trab1.cli, { accion: "cambiar_clave", actual: S.trab1.clave, nueva: claveNueva() })).estado >= 400, "una cuenta bloqueada cambia su contraseña");
  const rr = await funcion(S.gestor.cli, { accion: "restablecer", usuario: S.trab1.usuario });
  ok(rr.estado === 200, "su creador no pudo restablecerla");
  ok((await entrar(S.trab1.usuario, rr.datos.clave_temporal)).error, "una cuenta bloqueada entra con una temporal nueva");
  const d = await funcion(S.super.cli, { accion: "bloquear", usuario: S.trab1.usuario, bloquear: false }); ok(d.estado === 200, "desbloquear");
  const e = await entrar(S.trab1.usuario, rr.datos.clave_temporal); ok(!e.error, "entrar tras desbloquear: " + e.error?.message);
  await espera_error(e.cli.rpc("resumen_trabajador", { p_campana: S.c }), "datos antes de poner su contraseña");
  const clave = claveNueva(); ok((await funcion(e.cli, { accion: "cambiar_clave", actual: rr.datos.clave_temporal, nueva: clave })).estado === 200, "cambiar la temporal");
  const e2 = await entrar(S.trab1.usuario, clave);
  ok(+(await nq(e2.cli.rpc("resumen_trabajador", { p_campana: S.c }))).horas === 8, "no recuperó el acceso");
  S.trab1 = { ...S.trab1, cli: e2.cli, clave };
  return "sin datos ni inicio de sesión mientras está bloqueada · restablecer no la desbloquea · desbloqueo + contraseña propia";
});

await prueba("Gestión de usuarios: cada uno ve solo las cuentas que gestiona", async () => {
  const lista = async k => (await nq(S[k].cli.rpc("usuarios_gestionados"))).filter(x => x.gestionable).map(x => x.usuario);
  const g = await lista("gestor"), g2 = await lista("gestor2"), sa = await lista("super");
  ok(["lector", "editor", "jefe", "trab1", "trab2", "dueno"].every(k => g.includes(S[k].usuario)) && !g.includes(S.trabB.usuario) && !g.includes(S.gestor2.usuario), "gestor: " + JSON.stringify(g));
  ok(g2.includes(S.trabB.usuario) && !g2.some(u => u.endsWith(run) && !u.startsWith("trabb")), "gestor 2: " + JSON.stringify(g2));
  ok(sa.includes(S.gestor.usuario) && sa.includes(S.trab1.usuario), "superadministrador");
  for (const k of ["lector", "editor", "trab1"]) ok(!(await lista(k)).length, k + " gestiona cuentas");
  return `gestor ${g.length} · gestor 2 ${g2.length} · superadministrador ${sa.length}`;
});

/* ---------- 15. Sincronización entre sesiones ---------- */
await prueba("15 · Sincronización: el creador cambia una jornada y el administrador (otra sesión) recibe el aviso en tiempo real", async () => {
  const recibido = new Promise((res, rej) => {
    const t0 = Date.now(), canal = S.lector.cli.channel("prueba-" + run)
      .on("postgres_changes", { event: "*", schema: "public", table: "partes_filas", filter: "campana_id=eq." + S.c }, () => res(Date.now() - t0))
      .subscribe(async estado => {
        if (estado === "SUBSCRIBED") {
          const p = (await nq(S.gestor.cli.from("partes").select("version").eq("campana_id", S.c).single()));
          await nq(S.gestor.cli.rpc("guardar_parte", { p_campana: S.c, p_dueno: S.d, p_fecha: "2026-11-18", p_version: p.version, p_kilos: 2200, p_notas: "sincronización",
            p_filas: [{ trabajador_id: S.t1, tipo: "normal" }, { trabajador_id: S.t2, tipo: "mas" , horas: 9 }], p_maquinas: [] }));
        }
      });
    setTimeout(() => { S.lector.cli.removeChannel(canal); rej(new Error("no llegó el aviso en 20 s")); }, 20000);
  });
  const ms = await recibido;
  const v = await nq(S.lector.cli.from("partes_filas").select("horas").eq("trabajador_id", S.t2).single());
  ok(+v.horas === 9, "el administrador no ve el cambio: " + v.horas);
  const ajeno = S.trabB.cli.channel("ajeno-" + run); let fuga = false;
  ajeno.on("postgres_changes", { event: "*", schema: "public", table: "partes_filas", filter: "campana_id=eq." + S.c }, () => { fuga = true; }).subscribe();
  await new Promise(r => setTimeout(r, 3000));
  const p = await nq(S.gestor.cli.from("partes").select("version").eq("campana_id", S.c).single());
  await nq(S.gestor.cli.rpc("guardar_parte", { p_campana: S.c, p_dueno: S.d, p_fecha: "2026-11-18", p_version: p.version, p_kilos: 2300, p_notas: null,
    p_filas: [{ trabajador_id: S.t1, tipo: "normal" }, { trabajador_id: S.t2, tipo: "normal" }], p_maquinas: [] }));
  await new Promise(r => setTimeout(r, 4000));
  ok(!fuga, "una cuenta de otra campaña recibió el aviso");
  for (const k of Object.keys(S)) S[k]?.cli?.removeAllChannels?.();
  return `aviso en ${ms} ms · el administrador ve 9 h · otra campaña no recibe nada`;
});

const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos} correctas, ${fallos} con fallos · proyecto ${URL_.replace(/^https:\/\/(.{4}).*/, "https://$1…supabase.co")} · ejecución ${run}`);
process.exit(fallos ? 1 : 0);
