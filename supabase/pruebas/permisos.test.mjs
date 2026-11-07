// Pruebas de permisos del esquema 3.0 sobre un PostgreSQL real (PGlite, en memoria).
// Cada «sesión» es una transacción con el rol authenticated y el JWT del usuario, como hace Supabase:
// así se comprueban las políticas RLS igual que con peticiones directas a la API (sin pasar por la interfaz).
// Solo datos ficticios. Uso: node permisos.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
const resultados = [];
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ---------- Preparación ---------- */
await db.exec(readFileSync(path.join(dir, "stub_supabase.sql"), "utf8"));
for (const f of readdirSync(path.join(dir, "..", "migrations")).filter(f => f.endsWith(".sql") && !f.includes("almacenamiento")).sort())
  await db.exec(readFileSync(path.join(dir, "..", "migrations", f), "utf8"));

const U = {};
for (const n of ["super", "creadorA", "creadorB", "adminA", "jefe1", "jefe2", "trab1", "trab2", "dueno1", "dueno2", "intruso"]) {
  U[n] = crypto.randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [U[n], n + "@ficticio.test"]);   // crea el perfil por disparador
}
// Backend (propietario): superadministrador y permiso para crear campañas. No hay forma de hacerlo desde la app.
await db.query("insert into public.superadmin (user_id) values ($1)", [U.super]);
await db.query("update public.perfiles set puede_crear_campanas = true where id = any($1)", [[U.creadorA, U.creadorB]]);

// Ejecuta fn como el usuario indicado (o anónimo si u es null), en su propia transacción
async function como(u, fn) {
  return db.transaction(async tx => {
    await tx.exec(u ? "set local role authenticated" : "set local role anon");
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(u ? { sub: u, role: "authenticated" } : { role: "anon" })]);
    return fn({ q: (s, p) => tx.query(s, p).then(r => r.rows), uno: (s, p) => tx.query(s, p).then(r => r.rows[0]) });
  });
}
// Espera que la operación falle (error de permisos, RLS, conflicto…) y devuelve el mensaje
async function falla(u, fn) {
  try { await como(u, fn); } catch (e) { return e.message; }
  throw new Error("se esperaba un error y la operación se permitió");
}
async function prueba(nombre, fn) {
  try { const d = await fn(); resultados.push({ nombre, ok: true }); console.log("OK     " + nombre + (d ? "  → " + d : "")); }
  catch (e) { resultados.push({ nombre, ok: false, error: e.message }); console.log("FALLA  " + nombre + "\n       → " + e.message); }
}

/* ---------- Datos ficticios de la campaña A (como creadorA) y B (como creadorB) ---------- */
const A = {}, B = {};
await como(U.creadorA, async ({ uno }) => {
  A.c = (await uno("select public.crear_campana('Campaña A', 2026, '2026-11-01', 7.5, 1000, 1200, 0) as id")).id;
  A.t1 = (await uno("insert into trabajadores (campana_id, nombre) values ($1, 'Trabajador Uno') returning id", [A.c])).id;
  A.t2 = (await uno("insert into trabajadores (campana_id, nombre) values ($1, 'Trabajador Dos') returning id", [A.c])).id;
  await uno("insert into trabajadores_privado (trabajador_id, campana_id, nif) values ($1, $2, '00000000T')", [A.t1, A.c]);
  A.d1 = (await uno("insert into duenos (campana_id, nombre, finca) values ($1, 'Dueño Uno', 'Finca Uno') returning id", [A.c])).id;
  A.d2 = (await uno("insert into duenos (campana_id, nombre, finca) values ($1, 'Dueño Dos', 'Finca Dos') returning id", [A.c])).id;
  A.mq = (await uno("insert into maquinas (campana_id, nombre, precio_cent) values ($1, 'Tractor', 4000) returning id", [A.c])).id;
  // Caso de control de la 2.3.0: 7,5 h el 15 y 6 h el 16 (dueño 1); además una fila del trabajador 2 para el dueño 2
  A.p15 = (await uno("select (public.guardar_parte($1, $2, '2026-11-15', null, 2350, null, $3, '[]')).id as id", [A.c, A.d1, JSON.stringify([{ trabajador_id: A.t1, tipo: "normal" }])])).id;
  await uno("select public.guardar_parte($1, $2, '2026-11-16', null, null, null, $3, $4)", [A.c, A.d1, JSON.stringify([{ trabajador_id: A.t1, tipo: "especial", horas: 6 }]), JSON.stringify([{ maquina_id: A.mq, cantidad: 1 }])]);
  A.p2 = (await uno("select (public.guardar_parte($1, $2, '2026-11-15', null, null, null, $3, '[]')).id as id", [A.c, A.d2, JSON.stringify([{ trabajador_id: A.t2, tipo: "normal" }])])).id;
  await uno("insert into pagos (campana_id, tipo, trabajador_id, importe_cent, fecha) values ($1, 'trabajador', $2, 2000, '2026-11-15')", [A.c, A.t1]);
  await uno("insert into pagos (campana_id, tipo, dueno_id, importe_cent, fecha) values ($1, 'dueno', $2, 3000, '2026-11-15')", [A.c, A.d1]);
  await uno("insert into pagos (campana_id, tipo, dueno_id, importe_cent, fecha) values ($1, 'dueno', $2, 5000, '2026-11-15')", [A.c, A.d2]);
  await uno("insert into asignaciones_equipo (campana_id, jefe_user_id, trabajador_id, desde) values ($1, $2, $3, '2026-11-01')", [A.c, U.jefe1, A.t1]);
  await uno("insert into asignaciones_equipo (campana_id, jefe_user_id, trabajador_id, desde) values ($1, $2, $3, '2026-11-01')", [A.c, U.jefe2, A.t2]);
  for (const [k, rol, t, d] of [["admin", "admin"], ["jefe1", "jefe"], ["jefe2", "jefe"], ["trab1", "trabajador", A.t1], ["trab2", "trabajador", A.t2], ["dueno1", "dueno", null, A.d1], ["dueno2", "dueno", null, A.d2]])
    A["inv_" + k] = (await uno("select public.crear_invitacion($1, $2::rol_campana, $3, $4, 7) as c", [A.c, rol, t || null, d || null])).c;
});
await como(U.creadorB, async ({ uno }) => {
  B.c = (await uno("select public.crear_campana('Campaña B', 2026) as id")).id;
  B.d = (await uno("insert into duenos (campana_id, nombre) values ($1, 'Dueño de B') returning id", [B.c])).id;
});
// Cada persona canjea su invitación desde su cuenta
for (const [k, u] of [["admin", U.adminA], ["jefe1", U.jefe1], ["jefe2", U.jefe2], ["trab1", U.trab1], ["trab2", U.trab2], ["dueno1", U.dueno1], ["dueno2", U.dueno2]])
  await como(u, ({ uno }) => uno("select public.canjear_invitacion($1)", [A["inv_" + k]]));

/* ---------- Pruebas ---------- */
await prueba("Anónimo (sin sesión) no lee ninguna tabla ni puede llamar a las funciones", async () => {
  for (const t of ["campanas", "partes", "partes_filas", "pagos", "perfiles", "trabajadores"]) await falla(null, ({ q }) => q(`select * from ${t}`));
  await falla(null, ({ q }) => q("select public.mis_campanas()"));
});

await prueba("Invitaciones: código de un solo uso, caducidad y huella (el código no se guarda)", async () => {
  const otra = await falla(U.intruso, ({ uno }) => uno("select public.canjear_invitacion($1)", [A.inv_trab1]));
  ok(/no es válido|ya se usó/.test(otra), "un código ya usado se pudo canjear otra vez");
  await falla(U.intruso, ({ uno }) => uno("select public.canjear_invitacion('AAAA-BBBB-CCCC-DDDD')"));
  for (const k of ["admin", "trab1", "dueno2"]) {
    const r = (await db.query("select count(*) filter (where codigo_hash = sha256(convert_to($1::text, 'UTF8')))::int huella, count(*) filter (where codigo_hash = convert_to($1::text, 'UTF8'))::int claro from invitaciones", [A["inv_" + k]])).rows[0];
    ok(r.huella === 1 && r.claro === 0, "el código " + k + " no se guarda solo como huella");
  }
  const cad = await como(U.creadorA, ({ uno }) => uno("select public.crear_invitacion($1, 'admin', null, null, 1) as c", [A.c]));
  await db.query("update invitaciones set caduca_en = now() - interval '1 minute' where usada_por is null and rol = 'admin'");
  await falla(U.intruso, ({ uno }) => uno("select public.canjear_invitacion($1)", [cad.c]));
  return "7 cuentas vinculadas con su código";
});

await prueba("Un creador no puede convertirse en superadministrador ni darse permisos", async () => {
  await falla(U.creadorA, ({ q }) => q("insert into superadmin (user_id) values ($1)", [U.creadorA]));
  await falla(U.creadorA, ({ q }) => q("update superadmin set user_id = $1", [U.creadorA]).then(r => { if (!r.length) throw new Error("0 filas"); }));
  await falla(U.creadorA, ({ q }) => q("update perfiles set activo = true, puede_crear_campanas = true where id = $1 returning id", [U.trab1]).then(r => { if (!r.length) throw new Error("0 filas"); }));
  await falla(U.trab1, ({ q }) => q("update perfiles set puede_crear_campanas = true where id = $1", [U.trab1]));
  await falla(U.creadorA, ({ q }) => q("insert into miembros (campana_id, user_id, rol) values ($1, $2, 'creador')", [A.c, U.trab1]));
  await falla(U.creadorA, ({ uno }) => uno("select public.crear_invitacion($1, 'creador', null, null, 7)", [A.c]));
  const s = await como(U.creadorA, ({ q }) => q("select public.mis_campanas()"));
  ok(s.every(r => !r.mis_campanas.includes(",t)")), "mis_campanas dice que el creador es superadministrador");
});

await prueba("Un usuario sin autorización no puede crear campañas", async () => {
  await falla(U.trab1, ({ uno }) => uno("select public.crear_campana('Mía')"));
  await falla(U.trab1, ({ q }) => q("insert into campanas (nombre) values ('Directa')"));
});

await prueba("Trabajador: ve solo sus jornadas y entregas; no puede cambiar horas ni pagos", async () => {
  const filas = await como(U.trab1, ({ q }) => q("select trabajador_id, fecha from partes_filas"));
  ok(filas.length === 2 && filas.every(f => f.trabajador_id === A.t1), "ve filas que no son suyas: " + filas.length);
  const pagos = await como(U.trab1, ({ q }) => q("select tipo, importe_cent from pagos"));
  ok(pagos.length === 1 && pagos[0].tipo === "trabajador", "ve pagos ajenos o de dueños");
  ok((await como(U.trab1, ({ q }) => q("select * from trabajadores"))).length === 1, "ve fichas de otros trabajadores");
  ok((await como(U.trab1, ({ q }) => q("select * from duenos"))).length === 0, "ve fichas de dueños");
  ok((await como(U.trab1, ({ q }) => q("select * from campanas_economia"))).length === 0, "ve la economía de la campaña");
  const cambiadas = await como(U.trab1, ({ q }) => q("update partes_filas set horas = 12, tipo = 'mas' returning id"));
  ok(cambiadas.length === 0, "el trabajador ha podido cambiar sus horas");
  await falla(U.trab1, ({ q }) => q("insert into partes_filas (parte_id, campana_id, fecha, trabajador_id, horas) values ($1, $2, '2026-11-15', $3, 9)", [A.p2, A.c, A.t1]));
  ok((await como(U.trab1, ({ q }) => q("update pagos set importe_cent = 1 returning id"))).length === 0, "el trabajador ha podido cambiar un pago");
  ok((await como(U.trab1, ({ q }) => q("delete from pagos returning id"))).length === 0, "el trabajador ha podido borrar un pago");
  await falla(U.trab1, ({ uno }) => uno("select public.guardar_parte($1, $2, '2026-11-15', 1, null, null, '[]', '[]')", [A.c, A.d1]));
});

await prueba("Trabajador: resumen con las cuentas exactas de la 2.3.0 (13,5 h · 135 € · entregado 20 € · le queda 115 €)", async () => {
  const r = (await como(U.trab1, ({ uno }) => uno("select public.resumen_trabajador($1) as r", [A.c]))).r;
  ok(+r.horas === 13.5 && +r.importe_cent === 13500 && +r.entregado_cent === 2000 && +r.pendiente_cent === 11500 && r.dias === 2, JSON.stringify(r));
  const q1 = (await como(U.trab1, ({ uno }) => uno("select public.resumen_trabajador($1, '2026-11-01', '2026-11-15') as r", [A.c]))).r;
  ok(+q1.importe_cent === 7500 && +q1.pendiente_cent === 5500, "1.ª quincena: " + JSON.stringify(q1));
  await falla(U.trab2, ({ uno }) => uno("select public.resumen_trabajador($1)", [B.c]));
  return "13,5 h · 135,00 € · 115,00 €";
});

await prueba("Jefe: ve solo a su equipo en sus fechas; no ve otros equipos ni puede modificar", async () => {
  const j1 = await como(U.jefe1, ({ q }) => q("select trabajador_id from partes_filas"));
  ok(j1.length === 2 && j1.every(f => f.trabajador_id === A.t1), "el jefe 1 ve filas que no son de su equipo");
  const j2 = await como(U.jefe2, ({ q }) => q("select trabajador_id from partes_filas"));
  ok(j2.length === 1 && j2[0].trabajador_id === A.t2, "el jefe 2 ve el registro del equipo del jefe 1");
  ok((await como(U.jefe1, ({ q }) => q("select * from pagos"))).length === 0, "el jefe ve pagos");
  ok((await como(U.jefe1, ({ q }) => q("select * from trabajadores_privado"))).length === 0, "el jefe ve datos personales (DNI)");
  ok((await como(U.jefe1, ({ q }) => q("update partes_filas set horas = 1 returning id"))).length === 0, "el jefe ha podido modificar horas");
  ok((await como(U.jefe1, ({ q }) => q("update partes set fecha = '2026-11-20' returning id"))).length === 0, "el jefe ha podido modificar días");
  await falla(U.jefe1, ({ q }) => q("insert into trabajadores (campana_id, nombre) values ($1, 'Nuevo')", [A.c]));
  ok((await como(U.jefe1, ({ q }) => q("delete from trabajadores returning id"))).length === 0, "el jefe ha borrado trabajadores");
  ok((await como(U.jefe1, ({ q }) => q("update maquinas set precio_cent = 1 returning id"))).length === 0, "el jefe ha cambiado maquinaria");
  const panel = (await como(U.jefe1, ({ uno }) => uno("select public.jornadas_equipo($1) as r", [A.c]))).r;
  ok(panel.length === 2 && panel.every(x => x.trabajador === "Trabajador Uno") && !("importe_cent" in panel[0]), "panel del jefe: " + JSON.stringify(panel));
  return "jefe 1 → 2 jornadas de su equipo; jefe 2 → 1";
});

await prueba("Jefe: el historial de asignaciones limita lo que ve por fechas", async () => {
  await como(U.creadorA, ({ q }) => q("update asignaciones_equipo set hasta = '2026-11-15' where jefe_user_id = $1", [U.jefe1]));
  const j1 = await como(U.jefe1, ({ q }) => q("select fecha::text from partes_filas order by fecha"));
  ok(j1.length === 1 && j1[0].fecha === "2026-11-15", "tras cerrar la asignación el 15 sigue viendo el 16: " + JSON.stringify(j1));
  await como(U.creadorA, ({ q }) => q("update asignaciones_equipo set hasta = null where jefe_user_id = $1", [U.jefe1]));
});

await prueba("Dueño: ve solo sus partes, pagos y cuenta (no los de otros dueños) y no modifica nada", async () => {
  const ps = await como(U.dueno1, ({ q }) => q("select dueno_id from partes"));
  ok(ps.length === 2 && ps.every(p => p.dueno_id === A.d1), "ve partes de otro dueño");
  const pg = await como(U.dueno1, ({ q }) => q("select dueno_id from pagos"));
  ok(pg.length === 1 && pg[0].dueno_id === A.d1, "ve pagos de otro dueño");
  ok((await como(U.dueno1, ({ q }) => q("select * from trabajadores_privado"))).length === 0, "ve DNI de trabajadores");
  await falla(U.dueno1, ({ uno }) => uno("select public.cuenta_dueno($1, $2)", [A.c, A.d2]));
  ok((await como(U.dueno1, ({ q }) => q("update partes set kilos = 1 returning id"))).length === 0, "el dueño ha cambiado kilos");
  ok((await como(U.dueno1, ({ q }) => q("delete from pagos returning id"))).length === 0, "el dueño ha borrado pagos");
  const k = (await como(U.dueno1, ({ uno }) => uno("select public.cuenta_dueno($1) as r", [A.c]))).r;
  // 13,5 h × 12 € = 162 € + tractor 40 € = 202 €; pagado 30 € → pendiente 172 €; kilos 2350
  ok(+k.mano_cent === 16200 && +k.maquinaria_cent === 4000 && +k.total_cent === 20200 && +k.pendiente_cent === 17200 && +k.kilos === 2350, JSON.stringify(k));
  return "cuenta 202,00 € · pagado 30,00 € · pendiente 172,00 €";
});

await prueba("Administrador de campaña: lee toda su campaña, no modifica nada y no entra en campañas ajenas", async () => {
  ok((await como(U.adminA, ({ q }) => q("select * from partes_filas"))).length === 3, "no ve todas las jornadas");
  ok((await como(U.adminA, ({ q }) => q("select * from pagos"))).length === 3, "no ve todos los pagos");
  ok((await como(U.adminA, ({ q }) => q("select * from campanas_economia"))).length === 1, "no ve la economía");
  ok((await como(U.adminA, ({ q }) => q("select * from auditoria"))).length > 0, "no ve la auditoría de su campaña");
  ok((await como(U.adminA, ({ q }) => q("update partes_filas set horas = 1 returning id"))).length === 0, "el administrador ha cambiado horas");
  ok((await como(U.adminA, ({ q }) => q("update campanas_economia set iva = 21, version = version + 1 returning campana_id"))).length === 0, "el administrador ha cambiado la economía");
  await falla(U.adminA, ({ q }) => q("insert into pagos (campana_id, tipo, trabajador_id, importe_cent, fecha) values ($1, 'trabajador', $2, 100, '2026-11-20')", [A.c, A.t1]));
  await falla(U.adminA, ({ uno }) => uno("select public.crear_invitacion($1, 'admin')", [A.c]));
  ok((await como(U.adminA, ({ q }) => q("select * from campanas where id = $1", [B.c]))).length === 0, "el administrador de A ve la campaña B");
  ok((await como(U.adminA, ({ q }) => q("select * from duenos where campana_id = $1", [B.c]))).length === 0, "el administrador de A ve dueños de B");
  const k = (await como(U.adminA, ({ uno }) => uno("select public.cuenta_dueno($1, $2) as r", [A.c, A.d2]))).r;
  ok(+k.pagado_cent === 5000, "el administrador no puede consultar la cuenta de un dueño de su campaña");
});

await prueba("Creador: no accede a campañas ajenas ni puede enlazar datos de otra campaña", async () => {
  ok((await como(U.creadorB, ({ q }) => q("select * from partes"))).every(p => p.campana_id === B.c), "el creador B ve partes de A");
  await falla(U.creadorB, ({ q }) => q("insert into partes (campana_id, dueno_id, fecha) values ($1, $2, '2026-11-20')", [A.c, A.d1]));
  // Intento de colar un dueño de A en la campaña B: la clave foránea compuesta lo impide
  await falla(U.creadorB, ({ q }) => q("insert into partes (campana_id, dueno_id, fecha) values ($1, $2, '2026-11-20')", [B.c, A.d1]));
  ok((await como(U.creadorB, ({ q }) => q("update partes set kilos = 1 where campana_id = $1 returning id", [A.c]))).length === 0, "B ha cambiado un parte de A");
  await falla(U.creadorB, ({ uno }) => uno("select public.cuenta_dueno($1, $2)", [A.c, A.d1]));
});

await prueba("Superadministrador: ve y modifica todas las campañas y usuarios; panel global", async () => {
  ok((await como(U.super, ({ q }) => q("select id from campanas"))).length === 2, "no ve todas las campañas");
  const us = await como(U.super, ({ q }) => q("select * from public.admin_usuarios()"));
  ok(us.length === Object.keys(U).length, "no ve todos los usuarios");
  await falla(U.creadorA, ({ q }) => q("select * from public.admin_usuarios()"));
  const st = (await como(U.super, ({ uno }) => uno("select public.admin_estadisticas() as e"))).e;
  ok(st.campanas === 2 && st.usuarios === Object.keys(U).length, JSON.stringify(st));
  await como(U.super, ({ q }) => q("update perfiles set puede_crear_campanas = true where id = $1", [U.adminA]));
  ok((await db.query("select puede_crear_campanas from perfiles where id = $1", [U.adminA])).rows[0].puede_crear_campanas, "el superadministrador no pudo autorizar a crear campañas");
  await como(U.super, ({ q }) => q("update perfiles set puede_crear_campanas = false where id = $1", [U.adminA]));
  return `${us.length} usuarios · ${st.campanas} campañas`;
});

await prueba("Cuenta bloqueada por el superadministrador: pierde todo el acceso al momento", async () => {
  await como(U.super, ({ q }) => q("update perfiles set activo = false where id = $1", [U.trab2]));
  ok((await como(U.trab2, ({ q }) => q("select * from partes_filas"))).length === 0, "una cuenta bloqueada sigue viendo jornadas");
  await falla(U.trab2, ({ uno }) => uno("select public.resumen_trabajador($1)", [A.c]));
  await como(U.super, ({ q }) => q("update perfiles set activo = true where id = $1", [U.trab2]));
});

await prueba("Cambios simultáneos: una edición antigua no pisa la más reciente (control de versión)", async () => {
  const v = (await como(U.creadorA, ({ uno }) => uno("select version from partes where id = $1", [A.p15]))).version;
  // Dos dispositivos abrieron la misma versión; el primero guarda…
  await como(U.creadorA, ({ uno }) => uno("select public.guardar_parte($1, $2, '2026-11-15', $3, 2400, 'móvil', $4, '[]')", [A.c, A.d1, v, JSON.stringify([{ trabajador_id: A.t1, tipo: "normal" }])]));
  // …y el segundo, con la versión ya vieja, es rechazado
  const e = await falla(U.super, ({ uno }) => uno("select public.guardar_parte($1, $2, '2026-11-15', $3, 9999, 'ordenador', $4, '[]')", [A.c, A.d1, v, JSON.stringify([{ trabajador_id: A.t1, tipo: "mas", horas: 9 }])]));
  ok(/CONFLICTO/.test(e), "el error no es de conflicto: " + e);
  const p = await db.query("select kilos::float, notas, version from partes where id = $1", [A.p15]);
  ok(p.rows[0].kilos === 2400 && p.rows[0].notas === "móvil", "se perdió el cambio del primer dispositivo");
  await falla(U.creadorA, ({ q }) => q("update pagos set importe_cent = 2100 where tipo = 'trabajador' and campana_id = $1", [A.c]));   // sin subir versión
  return "versión " + p.rows[0].version + ", gana el primero y el segundo recibe CONFLICTO";
});

await prueba("Auditoría: quién cambió horas y pagos queda registrado; nadie puede borrarla ni falsearla", async () => {
  const a = await db.query("select user_id, tabla, accion from auditoria where tabla in ('partes', 'partes_filas', 'pagos') and campana_id = $1", [A.c]);
  ok(a.rows.some(r => r.user_id === U.creadorA && r.tabla === "partes_filas"), "no consta quién registró horas");
  await falla(U.creadorA, ({ q }) => q("delete from auditoria"));
  await falla(U.creadorA, ({ q }) => q("insert into auditoria (tabla, accion) values ('x', 'falsa')"));
  ok((await como(U.trab1, ({ q }) => q("select * from auditoria"))).length === 0, "un trabajador lee la auditoría");
  return a.rows.length + " registros de auditoría";
});

await prueba("Una ficha solo se vincula a una cuenta (sin duplicados)", async () => {
  const c = (await como(U.creadorA, ({ uno }) => uno("select public.crear_invitacion($1, 'trabajador', $2, null, 7) as c", [A.c, A.t1]))).c;
  await falla(U.intruso, ({ uno }) => uno("select public.canjear_invitacion($1)", [c]));
});

/* ---------- Resumen ---------- */
const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos} correctas, ${fallos} con fallos`);
process.exit(fallos ? 1 : 0);
