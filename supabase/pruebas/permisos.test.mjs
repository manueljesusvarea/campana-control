// Pruebas de permisos del esquema 3.0 sobre un PostgreSQL real (PGlite, en memoria).
// Cada «sesión» es una transacción con el rol authenticated y el JWT del usuario, como hace Supabase:
// así se comprueban las políticas RLS igual que con peticiones directas a la API (sin pasar por la interfaz).
// Solo datos ficticios. Uso: node permisos.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
const db = new PGlite({ extensions: { pgcrypto } });   // pgcrypto: como en Supabase (esquema «extensions»)
const resultados = [];
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ---------- Preparación ---------- */
await db.exec(readFileSync(path.join(dir, "stub_supabase.sql"), "utf8"));
const MIGRACIONES = readdirSync(path.join(dir, "..", "migrations")).filter(f => f.endsWith(".sql") && !f.includes("almacenamiento")).sort();
const aplicar = async filtro => { for (const f of MIGRACIONES.filter(filtro)) await db.exec(readFileSync(path.join(dir, "..", "migrations", f), "utf8")); };
// Las cuentas de partida existen ANTES del alta controlada (000004), como en el proyecto real; después,
// toda cuenta nueva necesita un código.
await aplicar(f => f < "20261118000004");

const U = {};
for (const n of ["super", "creadorA", "creadorB", "adminA", "jefe1", "jefe2", "trab1", "trab2", "dueno1", "dueno2", "intruso"]) {
  U[n] = crypto.randomUUID();
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [U[n], n + "@ficticio.test"]);   // crea el perfil por disparador
}
// Backend (propietario): superadministrador y permiso para crear campañas. No hay forma de hacerlo desde la app.
await db.query("insert into public.superadmin (user_id) values ($1)", [U.super]);
await db.query("update public.perfiles set puede_crear_campanas = true where id = any($1)", [[U.creadorA, U.creadorB]]);
await aplicar(f => f >= "20261118000004" && f < "20261118000006");

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
// Cuentas privadas (000006): desde aquí no hay invitaciones ni registro; las cuentas las crea «Gestión de usuarios»
await aplicar(f => f >= "20261118000006");

/* ---------- Pruebas ---------- */
await prueba("Anónimo (sin sesión) no lee ninguna tabla ni puede llamar a las funciones", async () => {
  for (const t of ["campanas", "partes", "partes_filas", "pagos", "perfiles", "trabajadores"]) await falla(null, ({ q }) => q(`select * from ${t}`));
  await falla(null, ({ q }) => q("select public.mis_campanas()"));
});

await prueba("Invitaciones y códigos antiguos desactivados: nadie los crea ni los canjea; sus datos se conservan", async () => {
  for (const u of [U.creadorA, U.super]) await falla(u, ({ uno }) => uno("select public.crear_invitacion($1, 'admin', null, null, 1) as c", [A.c]));
  await falla(U.intruso, ({ uno }) => uno("select public.canjear_invitacion('AAAA-BBBB-CCCC-DDDD')"));
  await falla(U.super, ({ uno }) => uno("select public.crear_autorizacion_creador(3)"));
  const n = (await db.query("select count(*)::int n from invitaciones")).rows[0].n;
  ok(n >= 7, "se perdieron invitaciones antiguas: " + n);
  return n + " invitaciones antiguas conservadas · creación y canje desactivados";
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

/* ---------- Cuentas privadas (migración 000006) ---------- */
// Lo que hace la Edge Function «gestion-usuarios»: 1) preparar_alta con la sesión de quien crea (permisos);
// 2) crear la identidad en Supabase Auth con la clave secreta (aquí: INSERT en auth.users, como hace Auth).
async function crearAuth(email) {
  const id = crypto.randomUUID();
  try { await db.transaction(tx => tx.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email])); }
  catch (e) { return { error: e.message, existe: (await db.query("select (select count(*) from auth.users where id = $1) + (select count(*) from public.perfiles where id = $1) n", [id])).rows[0].n }; }
  return { id };
}
const preparar = (u, args) => como(u, ({ uno }) => uno("select public.preparar_alta($1, $2, $3, $4, $5::rol_campana, $6, $7, $8) as e",
  [args.usuario, args.nombre || args.usuario, args.tipo || "miembro", args.campana || null, args.rol || null, args.trabajador || null, args.dueno || null, !!args.editor])).then(r => r.e);
const crearCuenta = async (u, args) => { const e = await preparar(u, args); const r = await crearAuth(e); if (r.error) throw new Error(r.error); return r.id; };
const claveCambiada = id => db.query("select public.clave_cambiada_servidor($1)", [id]);   // la Edge Function, con la clave secreta
const perfilDe = async id => (await db.query("select activo, bloqueado, debe_cambiar_clave, puede_crear_campanas, usuario from public.perfiles where id = $1", [id])).rows[0];
const N = {};

await prueba("Sin alta autorizada no se crea ninguna cuenta (registro público, panel o inserción directa)", async () => {
  for (const email of ["colado.publico@ficticio.test", "nadie@usuarios.campana-control.invalid"]) {
    const r = await crearAuth(email); ok(r.error && /ALTA/.test(r.error) && r.existe == 0, "se creó una cuenta sin alta: " + JSON.stringify(r));
  }
  const e = await preparar(U.creadorA, { usuario: "caducada.prueba", campana: A.c, rol: "admin" });
  await db.query("update public.altas_pendientes set caduca_en = now() - interval '1 second' where usuario = 'caducada.prueba'");
  ok((await crearAuth(e)).existe == 0, "un alta caducada creó la cuenta");
  // Las altas pendientes no las ve ni toca nadie desde la API
  for (const u of [U.creadorA, U.super]) await falla(u, ({ q }) => q("select * from public.altas_pendientes"));   // sin permiso de lectura
  await falla(U.creadorA, ({ q }) => q("insert into public.altas_pendientes (usuario, nombre, tipo) values ('colado', 'Colado', 'superadmin')"));
  await falla(U.creadorA, ({ q }) => q("select cc_priv.autorizar_alta_propietario('colado', 'Colado')"));
  return "3 intentos rechazados · altas pendientes inaccesibles";
});

await prueba("El superadministrador crea un creador; con la contraseña temporal no hay acceso hasta cambiarla; después crea su campaña", async () => {
  for (const u of [U.creadorA, U.adminA, U.trab1, U.intruso]) await falla(u, ({ q }) => q("select public.preparar_alta('otro.creador', 'Otro', 'creador')"));
  N.creador = await crearCuenta(U.super, { usuario: "gestor.nuevo", nombre: "Gestor Nuevo", tipo: "creador" });
  const p0 = await perfilDe(N.creador);
  ok(p0.usuario === "gestor.nuevo" && p0.puede_crear_campanas && p0.debe_cambiar_clave && !p0.activo, "perfil nuevo: " + JSON.stringify(p0));
  await falla(N.creador, ({ q }) => q("select public.crear_campana('Antes de cambiar la clave', 2026)"));
  await falla(N.creador, ({ q }) => q("update public.perfiles set debe_cambiar_clave = false where id = $1", [N.creador]));
  await falla(N.creador, ({ q }) => q("select public.clave_cambiada_servidor($1)", [N.creador]));
  await claveCambiada(N.creador);
  ok((await perfilDe(N.creador)).activo, "no se habilitó tras cambiar la contraseña");
  N.c = (await como(N.creador, ({ uno }) => uno("select public.crear_campana('Campaña del gestor', 2026, '2026-11-01', 8, 1000, 1200, 0) as id"))).id;
  ok(N.c, "no creó su campaña");
  await falla(N.creador, ({ q }) => q("select public.preparar_alta('gestor.dos', 'Dos', 'creador')"));
  return "solo el superadministrador crea creadores · sin acceso con la temporal · campaña creada";
});

await prueba("El creador crea administradores (lector y editor), jefe, trabajadores y dueño solo en sus campañas", async () => {
  const k = N.c;
  [N.t1, N.t2] = (await como(N.creador, ({ q }) => q("insert into trabajadores (campana_id, nombre) values ($1, 'Trab Gestor 1'), ($1, 'Trab Gestor 2') returning id", [k]))).map(r => r.id);
  N.d1 = (await como(N.creador, ({ uno }) => uno("insert into duenos (campana_id, nombre) values ($1, 'Dueño Gestor') returning id", [k]))).id;
  N.lector = await crearCuenta(N.creador, { usuario: "admin.lector", campana: k, rol: "admin" });
  N.editor = await crearCuenta(N.creador, { usuario: "admin.editor", campana: k, rol: "admin", editor: true });
  N.jefe = await crearCuenta(N.creador, { usuario: "jefe.gestor", campana: k, rol: "jefe" });
  N.w1 = await crearCuenta(N.creador, { usuario: "trab.gestor1", campana: k, rol: "trabajador", trabajador: N.t1 });
  N.w2 = await crearCuenta(N.creador, { usuario: "trab.gestor2", campana: k, rol: "trabajador", trabajador: N.t2 });
  N.du = await crearCuenta(N.creador, { usuario: "dueno.gestor", campana: k, rol: "dueno", dueno: N.d1 });
  for (const id of [N.lector, N.editor, N.jefe, N.w1, N.w2, N.du]) await claveCambiada(id);
  const m = (await db.query("select rol::text, puede_editar from miembros where campana_id = $1 and user_id = any($2) order by rol, puede_editar", [k, [N.lector, N.editor, N.jefe, N.w1, N.w2, N.du]])).rows;
  ok(m.length === 6 && m.filter(x => x.rol === "admin" && x.puede_editar).length === 1, "pertenencias: " + JSON.stringify(m));
  // Lo que no se puede
  const mal = [
    [N.creador, { usuario: "en.campana.a", campana: A.c, rol: "admin" }],                       // campaña de otro creador
    [U.creadorA, { usuario: "en.campana.gestor", campana: k, rol: "admin" }],                    // otro creador en esta
    [N.editor, { usuario: "por.editor", campana: k, rol: "trabajador", trabajador: N.t2 }],     // un administrador (editor) no crea cuentas
    [N.creador, { usuario: "co.creador", campana: k, rol: "creador" }],                         // creador no crea creadores
    [N.creador, { usuario: "jefe.editor", campana: k, rol: "jefe", editor: true }],             // edición solo para administradores
    [N.creador, { usuario: "ficha.ajena", campana: k, rol: "trabajador", trabajador: A.t1 }],   // ficha de otra campaña
    [N.creador, { usuario: "ficha.repetida", campana: k, rol: "trabajador", trabajador: N.t1 }], // ficha que ya tiene cuenta
    [N.creador, { usuario: "admin.lector", campana: k, rol: "admin" }],                          // usuario repetido
    [N.creador, { usuario: "Mal Usuario!", campana: k, rol: "admin" }],                          // formato
    [N.creador, { usuario: "sin.ficha", campana: k, rol: "trabajador" }]];
  for (const [u, a] of mal) await falla(u, ({ uno }) => uno("select public.preparar_alta($1, $2, $3, $4, $5::rol_campana, $6, $7, $8)",
    [a.usuario, "X", "miembro", a.campana, a.rol, a.trabajador || null, a.dueno || null, !!a.editor]));
  return "6 cuentas con su rol · " + mal.length + " altas indebidas rechazadas";
});

await prueba("Administrador editor cambia jornadas y pagos; el lector solo consulta; ninguno gestiona usuarios, fichas ni permisos", async () => {
  const k = N.c, filas = JSON.stringify([{ trabajador_id: N.t1, tipo: "normal" }, { trabajador_id: N.t2, tipo: "normal" }]);
  const p = await como(N.creador, ({ uno }) => uno("select * from public.guardar_parte($1, $2, '2026-11-18', null, 1000, null, $3, '[]')", [k, N.d1, filas]));
  // Editor: modifica la jornada (trabajador 2 hace 6 h) y anota un pago
  const p2 = await como(N.editor, ({ uno }) => uno("select * from public.guardar_parte($1, $2, '2026-11-18', $3, 1200, 'editado', $4, '[]')",
    [k, N.d1, p.version, JSON.stringify([{ trabajador_id: N.t1, tipo: "normal" }, { trabajador_id: N.t2, tipo: "especial", horas: 6 }])]));
  ok(p2.version === p.version + 1, "el editor no pudo cambiar la jornada");
  await como(N.editor, ({ q }) => q("insert into pagos (campana_id, tipo, trabajador_id, importe_cent, fecha) values ($1, 'trabajador', $2, 2500, '2026-11-18')", [k, N.t1]));
  // Lector: ve lo mismo, no cambia nada
  const vistas = await como(N.lector, ({ q }) => q("select horas from partes_filas where campana_id = $1 and trabajador_id = $2", [k, N.t2]));
  ok(vistas.length === 1 && +vistas[0].horas === 6, "el lector no ve la jornada editada: " + JSON.stringify(vistas));
  await falla(N.lector, ({ uno }) => uno("select * from public.guardar_parte($1, $2, '2026-11-18', $3, 1, null, '[]', '[]')", [k, N.d1, p2.version]));
  await falla(N.lector, ({ q }) => q("insert into pagos (campana_id, tipo, trabajador_id, importe_cent, fecha) values ($1, 'trabajador', $2, 1, '2026-11-18')", [k, N.t1]));
  ok((await como(N.lector, ({ q }) => q("update partes_filas set horas = 1 where campana_id = $1 returning 1", [k]))).length === 0, "el lector cambió horas");
  ok((await como(N.lector, ({ q }) => q("delete from pagos where campana_id = $1 returning 1", [k]))).length === 0, "el lector borró pagos");
  // Ninguno se da más permisos ni gestiona fichas o usuarios
  for (const u of [N.lector, N.editor]) {
    ok((await como(u, ({ q }) => q("update miembros set puede_editar = true, rol = 'creador' where user_id = $1 returning 1", [u]))).length === 0, "un administrador cambió su rol");
    await falla(u, ({ q }) => q("insert into trabajadores (campana_id, nombre) values ($1, 'No')", [k]));
    await falla(u, ({ q }) => q("select public.preparar_restablecer('trab.gestor1')"));
    await falla(u, ({ q }) => q("update perfiles set puede_crear_campanas = true where id = $1", [u]));
  }
  await falla(N.editor, ({ q }) => q("insert into maquinas (campana_id, nombre, precio_cent) values ($1, 'No', 1)", [k]));
  // El creador puede quitar o dar la edición
  ok((await como(N.creador, ({ q }) => q("update miembros set puede_editar = true where user_id = $1 and campana_id = $2 returning 1", [N.lector, k]))).length === 1, "el creador no pudo dar edición");
  await como(N.creador, ({ q }) => q("update miembros set puede_editar = false where user_id = $1 and campana_id = $2", [N.lector, k]));
  return "editor: jornada (v" + p2.version + ") y pago · lector: solo lectura · nadie se eleva";
});

await prueba("Jefe, trabajador y dueño de la campaña nueva ven solo lo suyo; nadie de otra campaña la ve", async () => {
  const k = N.c;
  await como(N.creador, ({ q }) => q("insert into asignaciones_equipo (campana_id, jefe_user_id, trabajador_id, desde) values ($1, $2, $3, '2026-11-01')", [k, N.jefe, N.t1]));
  const eq = (await como(N.jefe, ({ uno }) => uno("select public.jornadas_equipo($1) as r", [k]))).r;
  ok(eq.length === 1 && eq[0].trabajador === "Trab Gestor 1", "jefe: " + JSON.stringify(eq.map(x => x.trabajador)));
  const r = await como(N.w2, ({ uno }) => uno("select public.resumen_trabajador($1) r", [k]));
  ok(+r.r.horas === 6 && +r.r.importe_cent === 6000, "trabajador 2: " + JSON.stringify({ h: r.r.horas, i: r.r.importe_cent }));
  ok((await como(N.w2, ({ q }) => q("select * from partes_filas"))).every(f => f.trabajador_id === N.t2), "el trabajador ve jornadas ajenas");
  const cu = await como(N.du, ({ uno }) => uno("select public.cuenta_dueno($1) c", [k]));
  ok(+cu.c.horas === 14, "dueño: " + cu.c.horas);
  for (const u of [U.adminA, U.trab1, U.creadorB, U.jefe1]) for (const t of ["partes", "partes_filas", "pagos", "trabajadores", "miembros"])
    ok((await como(u, ({ q }) => q(`select * from ${t} where campana_id = $1`, [k]))).length === 0, "otra campaña ve " + t);
  for (const u of [N.lector, N.w1, N.du]) ok((await como(u, ({ q }) => q("select * from partes where campana_id = $1", [A.c]))).length === 0, "la campaña nueva ve la A");
  return "jefe 1 trabajador · trabajador 6 h · 60 € · dueño 14 h · 4 cuentas ajenas sin acceso";
});

await prueba("Restablecer contraseña: solo el superadministrador o el creador que gestiona a esa persona; sin acceso hasta poner una propia", async () => {
  for (const u of [U.creadorA, U.creadorB, N.editor, N.lector, N.w1]) await falla(u, ({ q }) => q("select public.preparar_restablecer('trab.gestor2')"));
  await falla(N.creador, ({ q }) => q("select public.preparar_restablecer('gestor.nuevo')"));   // a sí mismo no (lo hace el superadministrador)
  await como(N.creador, ({ q }) => q("select public.preparar_restablecer('trab.gestor2')"));
  ok(!(await perfilDe(N.w2)).activo, "sigue habilitada tras restablecer");
  await falla(N.w2, ({ q }) => q("select public.resumen_trabajador($1)", [N.c]));
  await claveCambiada(N.w2);
  ok((await como(N.w2, ({ uno }) => uno("select public.resumen_trabajador($1) r", [N.c]))).r, "no recuperó el acceso con su contraseña");
  // Si esa persona también trabaja en una campaña de otro creador, su creador ya no puede restablecerla
  await db.query("insert into miembros (campana_id, user_id, rol) values ($1, $2, 'jefe')", [B.c, N.w2]);
  await falla(N.creador, ({ q }) => q("select public.preparar_restablecer('trab.gestor2')"));
  await db.query("delete from miembros where campana_id = $1 and user_id = $2", [B.c, N.w2]);
  // El superadministrador sí puede con un creador; un creador no puede con otro creador ni con el superadministrador
  await falla(N.creador, ({ q }) => q("select public.preparar_restablecer('nadie.existe')"));
  await como(U.super, ({ q }) => q("select public.preparar_restablecer('gestor.nuevo')"));
  ok(!(await perfilDe(N.creador)).activo, "el creador sigue habilitado tras restablecerlo el superadministrador");
  await claveCambiada(N.creador);
  return "6 intentos sin permiso rechazados · restablecida por su creador y por el superadministrador";
});

await prueba("Bloqueo: la cuenta pierde el acceso; ni cambiar ni restablecer la contraseña se lo devuelve; solo se desbloquea desde arriba", async () => {
  await falla(N.editor, ({ q }) => q("select public.preparar_bloqueo('trab.gestor1', true)"));
  await falla(U.creadorB, ({ q }) => q("select public.preparar_bloqueo('trab.gestor1', true)"));
  await como(U.super, ({ q }) => q("select public.preparar_bloqueo('trab.gestor1', true)"));
  await falla(N.w1, ({ q }) => q("select public.resumen_trabajador($1)", [N.c]));
  ok((await como(N.w1, ({ q }) => q("select * from partes_filas"))).length === 0, "bloqueado ve jornadas");
  await claveCambiada(N.w1);
  await como(N.creador, ({ q }) => q("select public.preparar_restablecer('trab.gestor1')")); await claveCambiada(N.w1);
  ok(!(await perfilDe(N.w1)).activo, "recuperó el acceso cambiando la contraseña");
  await falla(N.w1, ({ q }) => q("update perfiles set bloqueado = false, activo = true where id = $1", [N.w1]));
  await falla(U.super, ({ q }) => q("update perfiles set bloqueado = true where id = $1", [U.super]));   // nadie se bloquea a sí mismo
  await como(N.creador, ({ q }) => q("select public.preparar_bloqueo('trab.gestor1', false)"));
  ok((await perfilDe(N.w1)).activo, "no se desbloqueó");
  return "bloqueada por el superadministrador · sigue bloqueada tras cambiar y restablecer · desbloqueada por su creador";
});

await prueba("Gestión de usuarios: cada uno ve solo las cuentas que gestiona; el superadministrador, todas", async () => {
  const lista = async u => (await como(u, ({ q }) => q("select usuario, gestionable, campanas from public.usuarios_gestionados()"))).map(x => x.usuario);
  const g = await lista(N.creador), sa = await lista(U.super), b = await lista(U.creadorB);
  ok(["admin.lector", "admin.editor", "jefe.gestor", "trab.gestor1", "trab.gestor2", "dueno.gestor"].every(x => g.includes(x)), "lista del gestor: " + JSON.stringify(g));
  ok(g.length >= 6 && !b.some(x => /gestor|admin\.(lector|editor)/.test(x || "")), "B ve cuentas del gestor: " + JSON.stringify(b));
  ok(sa.includes("gestor.nuevo") && sa.length > g.length, "el superadministrador no las ve todas");
  for (const u of [N.editor, N.w1]) ok((await como(u, ({ q }) => q("select * from public.usuarios_gestionados()"))).every(x => !x.gestionable), "un administrador o trabajador gestiona cuentas");
  return `gestor ${g.length} · creador B ${b.length} · superadministrador ${sa.length}`;
});

await prueba("Hook «antes de crear usuario»: solo deja pasar altas autorizadas; solo lo ejecuta Supabase Auth", async () => {
  const hook = email => db.transaction(async tx => { await tx.exec("set local role supabase_auth_admin");
    return (await tx.query("select public.hook_alta_con_codigo($1) as r", [JSON.stringify({ user: { email } })])).rows[0].r; });
  ok((await hook("nadie@usuarios.campana-control.invalid")).error?.http_code === 403, "acepta sin alta");
  const e = await preparar(N.creador, { usuario: "para.hook", campana: N.c, rol: "admin" });
  ok(JSON.stringify(await hook(e)) === "{}", "rechaza un alta autorizada");
  for (const u of [null, U.trab1, U.super]) await falla(u, ({ q }) => q("select public.hook_alta_con_codigo('{}')"));
  return "rechaza sin alta · acepta con alta · nadie más lo ejecuta";
});

await prueba("El identificador técnico de una cuenta no se puede cambiar por el de otro usuario (000007)", async () => {
  const cambiar = (id, email) => db.transaction(tx => tx.query("update auth.users set email = $2 where id = $1", [id, email])).then(() => "cambiado", e => e.message);
  ok(/PERMISO/.test(await cambiar(N.w1, "admin.lector@usuarios.campana-control.invalid")), "una cuenta tomó el identificador de otra");
  ok(/PERMISO/.test(await cambiar(N.w1, "fuera@ficticio.test")), "una cuenta privada cambió a un correo externo");
  ok(/PERMISO/.test(await cambiar(U.trab1, "nuevo.nombre@usuarios.campana-control.invalid")), "una cuenta antigua ocupó un nombre de usuario");
  await db.query("update public.perfiles set usuario = 'trab.antiguo' where id = $1", [U.trab1]);   // el propietario le da nombre de usuario
  ok(await cambiar(U.trab1, "trab.antiguo@usuarios.campana-control.invalid") === "cambiado", "no pudo pasar al identificador de su propio usuario");
  return "3 cambios indebidos rechazados · paso al identificador propio permitido";
});

/* ---------- 000009: datos para los informes del dueño y huella de cambios ---------- */
await prueba("Informes del dueño (000009): solo sus partes, filas, maquinaria y pagos; nadie más puede pedirlos", async () => {
  const r = (await como(U.dueno1, ({ uno }) => uno("select public.datos_dueno($1) as r", [A.c]))).r;
  ok(r.dueno.id === A.d1 && r.partes.length === 2 && r.filas.length === 2 && r.filas.every(f => f.trabajador_id === A.t1), "partes o filas: " + JSON.stringify(r).slice(0, 300));
  ok(r.trabajadores.length === 1 && r.trabajadores[0].nombre === "Trabajador Uno" && !("nif" in r.trabajadores[0]), "trabajadores: " + JSON.stringify(r.trabajadores));
  ok(r.maquinas.length === 1 && r.maquinas[0].precio_cent === 4000 && r.maquinas_partes.length === 1, "maquinaria: " + JSON.stringify(r.maquinas));
  ok(r.pagos.length === 1 && +r.pagos[0].importe_cent === 3000 && r.precio_hora_cent === 1200 && +r.campana.horas_dia === 7.5, "pagos o precio: " + JSON.stringify([r.pagos, r.precio_hora_cent]));
  const r2 = (await como(U.dueno2, ({ uno }) => uno("select public.datos_dueno($1) as r", [A.c]))).r;
  ok(r2.dueno.id === A.d2 && r2.partes.length === 1 && r2.pagos.length === 1 && +r2.pagos[0].importe_cent === 5000, "el dueño 2 ve datos del 1");
  for (const u of [U.adminA, U.trab1, U.jefe1, U.creadorB, U.intruso]) await falla(u, ({ uno }) => uno("select public.datos_dueno($1)", [A.c]));
  await falla(null, ({ uno }) => uno("select public.datos_dueno($1)", [A.c]));
  await falla(U.dueno1, ({ uno }) => uno("select public.datos_dueno($1)", [B.c]));
  return "dueño 1: 2 partes, 1 trabajador, 1 máquina, 1 pago · admin, trabajador, jefe, otro creador, intruso y anónimo rechazados";
});
await prueba("Huella de cambios (000009): cambia con cada edición que el usuario puede ver, y solo con esas", async () => {
  const h = async u => (await como(u, ({ uno }) => uno("select public.huella_campana($1) as h", [A.c]))).h;
  const antes = { admin: await h(U.adminA), d1: await h(U.dueno1), d2: await h(U.dueno2), t1: await h(U.trab1), intruso: await h(U.intruso) };
  ok(new Set([antes.admin, antes.d1, antes.d2]).size === 3, "la huella no depende de lo que cada uno ve");
  // Se cambia un parte del dueño 1 (filas del trabajador 1)
  await como(U.creadorA, async ({ uno }) => { const v = (await uno("select version from partes where id = $1", [A.p15])).version;
    await uno("select public.guardar_parte($1, $2, '2026-11-15', $3, 2400, null, $4, '[]')", [A.c, A.d1, v, JSON.stringify([{ trabajador_id: A.t1, tipo: "mas", horas: 8 }])]); });
  const despues = { admin: await h(U.adminA), d1: await h(U.dueno1), d2: await h(U.dueno2), t1: await h(U.trab1), intruso: await h(U.intruso) };
  ok(despues.admin !== antes.admin && despues.d1 !== antes.d1 && despues.t1 !== antes.t1, "no cambió para quien ve el parte");
  ok(despues.d2 === antes.d2 && despues.intruso === antes.intruso, "cambió para quien no ve el parte (fuga de información)");
  await falla(null, ({ uno }) => uno("select public.huella_campana($1)", [A.c]));
  return "cambia para admin, dueño 1 y trabajador 1 · igual para dueño 2 y un intruso · anónimo rechazado";
});

/* ---------- 000010: importar y exportar campañas ---------- */
const huella = s => createHash("sha256").update(s).digest("hex");
const COPIA = {
  campana: { horas_dia: 7.5, precio_hora_trab_cent: 1000, precio_hora_dueno_cent: 1200, iva: 10 },
  empresa: { nombre: "Cuadrilla ficticia", iban: "ES00 0000" },
  trabajadores: [{ o: "t1", nombre: "Ana Copia", nif: "11111111H" }, { o: "t2", nombre: "Luis Copia", precio_hora_cent: 1100 }],
  duenos: [{ o: "d1", nombre: "Finca Copia", finca: "Olivar", num: 1, trabajadores: ["t1", "t2"] }],
  maquinas: [{ o: "m1", nombre: "Tractor copia", precio_cent: 3000, unidad: "día" }],
  partes: [{ o: "d1_2026-11-10", dueno: "d1", fecha: "2026-11-10", kilos: 1500, filas: [{ t: "t1", tipo: "normal" }, { t: "t2", tipo: "mas", horas: 9 }], maquinas: [{ m: "m1", cantidad: 1 }] },
           { o: "d1_2026-11-11", dueno: "d1", fecha: "2026-11-11", filas: [{ t: "t1", tipo: "ausente" }, { t: "t2", tipo: "menos", horas: 5 }], maquinas: [] }],
  pagos: [{ o: "g1", tipo: "trabajador", persona: "t1", importe_cent: 2000, fecha: "2026-11-10", hora: "19:00", forma: "efectivo" },
          { o: "g2", tipo: "dueno", persona: "d1", importe_cent: 10000, fecha: "2026-11-11", forma: "transferencia" }],
  plantillas: [{ o: "pl1", nombre: "Contrato copia", asesoria: "Asesoría", titulo: "T", cuerpo: "Hola {{dueno}}", campos: [] }],
  documentos: [{ o: "doc1", dueno: "d1", plantilla: "pl1", nombre: "Contrato copia", fecha: "2026-11-10", campos: {}, trabajadores: ["t1"] }]
};
const recuento = c => como(U.creadorA, ({ uno }) => uno(`select (select count(*) from trabajadores where campana_id = $1)::int as t, (select count(*) from duenos where campana_id = $1)::int as d,
  (select count(*) from partes where campana_id = $1)::int as p, (select count(*) from partes_filas where campana_id = $1)::int as f, (select count(*) from pagos where campana_id = $1)::int as g,
  (select count(*) from documentos where campana_id = $1)::int as doc, (select count(*) from maquinas where campana_id = $1)::int as m`, [c]));
await prueba("Importar una copia (000010): todo o nada, sin duplicados, simulación, solo quien gestiona y mismos importes", async () => {
  const C = (await como(U.creadorA, ({ uno }) => uno("select public.crear_campana('Campaña importada', 2026) as id"))).id;
  const s1 = JSON.stringify(COPIA), h1 = huella(s1);
  for (const u of [U.adminA, U.trab1, U.dueno1, U.creadorB, U.intruso]) await falla(u, ({ uno }) => uno("select public.importar_campana($1, $2, $3)", [C, h1, s1]));
  // Simulación: devuelve el resumen y no guarda nada
  const sim = (await como(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3, true) as r", [C, h1, s1]))).r;
  ok(sim.simulacion && sim.partes.nuevos === 2 && sim.pagos.nuevos === 2, "simulación: " + JSON.stringify(sim));
  ok(JSON.stringify(await recuento(C)) === JSON.stringify({ t: 0, d: 0, p: 0, f: 0, g: 0, doc: 0, m: 0 }), "la simulación guardó datos");
  // Copia con un error al final (fila de un trabajador que no está): no se guarda nada
  const mala = JSON.parse(s1); mala.partes[1].filas.push({ t: "t9", tipo: "normal" });
  ok(/no está en la copia/.test(await falla(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3)", [C, huella(JSON.stringify(mala)), JSON.stringify(mala)]))), "error no explicado");
  ok((await recuento(C)).t === 0, "una importación fallida dejó datos a medias");
  // Importación real
  const r = (await como(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3) as r", [C, h1, s1]))).r;
  ok(!r.simulacion && r.trabajadores.nuevos === 2 && r.partes.nuevos === 2 && r.partes.filas === 4 && r.pagos.nuevos === 2 && r.documentos.nuevos === 1 && r.documentos_ids.doc1, "importación: " + JSON.stringify(r));
  // La misma copia otra vez: rechazada; otra copia con los mismos datos: no duplica nada
  ok(/ya se importó/.test(await falla(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3)", [C, h1, s1]))), "la misma copia se importó dos veces");
  const s2 = JSON.stringify({ ...COPIA, nota: "otra exportación" });
  const r2 = (await como(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3) as r", [C, huella(s2), s2]))).r;
  ok(r2.partes.ya === 2 && r2.pagos.ya === 2 && r2.trabajadores.ya === 2 && r2.partes.nuevos === 0, "segunda copia: " + JSON.stringify(r2));
  ok(JSON.stringify(await recuento(C)) === JSON.stringify({ t: 2, d: 1, p: 2, f: 4, g: 2, doc: 1, m: 1 }), "hay duplicados: " + JSON.stringify(await recuento(C)));
  // Importes: 7,5 + 9 + 5 h = 21,5 h × 12 € = 258 € + tractor 30 € = 288 € + IVA 10 % = 316,80 €; pagado 100 € → pendiente 216,80 €
  const k = (await como(U.creadorA, ({ uno }) => uno("select public.cuenta_dueno($1, (select id from duenos where campana_id = $1)) as r", [C]))).r;
  ok(+k.total_cent === 31680 && +k.pendiente_cent === 21680 && +k.horas === 21.5, "cuenta tras importar: " + JSON.stringify([k.total_cent, k.pendiente_cent, k.horas]));
  // Precios distintos en una campaña que ya tiene partes: rechazado
  const s3 = JSON.stringify({ ...COPIA, campana: { ...COPIA.campana, precio_hora_dueno_cent: 1500 } });
  ok(/otras horas por día, precios o IVA/.test(await falla(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3)", [C, huella(s3), s3]))), "aceptó otros precios");
  A.importada = C;
  return "simulación sin cambios · error al final sin datos a medias · 2 trabajadores, 2 partes (4 filas), 2 pagos, 1 documento · repetida rechazada · sin duplicados · cuenta 316,80 €";
});
await prueba("Copia de campaña 3.0 (000010): exportar solo quien gestiona; restaurar en una campaña aislada con los mismos importes", async () => {
  for (const u of [U.adminA, U.trab1, U.dueno1, U.jefe1, U.creadorB, U.intruso]) await falla(u, ({ uno }) => uno("select public.exportar_campana($1)", [A.importada]));
  const e = (await como(U.creadorA, ({ uno }) => uno("select public.exportar_campana($1) as r", [A.importada]))).r;
  ok(e.partes.length === 2 && e.pagos.length === 2 && e.trabajadores.length === 2 && e.documentos.length === 1 && !JSON.stringify(e).includes("password"), "copia: " + JSON.stringify(e).slice(0, 200));
  const R = (await como(U.creadorA, ({ uno }) => uno("select public.crear_campana('Restauración aislada', 2026) as id"))).id;
  const s = JSON.stringify(e), r = (await como(U.creadorA, ({ uno }) => uno("select public.importar_campana($1, $2, $3) as r", [R, huella(s), s]))).r;
  ok(r.partes.nuevos === 2 && r.pagos.nuevos === 2, "restauración: " + JSON.stringify(r));
  const total = c => como(U.creadorA, ({ uno }) => uno("select (public.cuenta_dueno($1, (select id from duenos where campana_id = $1))) ->> 'total_cent' as t", [c]));
  const [a, b] = [await total(A.importada), await total(R)];
  ok(a.t === b.t && a.t === "31680", "importes distintos tras restaurar: " + JSON.stringify([a, b]));
  ok(JSON.stringify(await recuento(R)) === JSON.stringify(await recuento(A.importada)), "recuentos distintos tras restaurar");
  return "6 roles sin permiso rechazados · restaurada en otra campaña: mismos recuentos y cuenta 316,80 €";
});

/* ---------- 000013: editar pagos con historial; modelos de documento ---------- */
await prueba("Pagos (000013): se corrigen sin borrarlos, queda el historial y no se puede cambiar la persona", async () => {
  const g = await como(U.creadorA, ({ uno }) => uno("insert into pagos (campana_id, tipo, trabajador_id, importe_cent, fecha) values ($1, 'trabajador', $2, 1500, '2026-11-16') returning id, version", [A.c, A.t2]));
  await como(U.creadorA, ({ uno }) => uno("update pagos set importe_cent = 1800, forma = 'bizum', version = $2 where id = $1 returning id", [g.id, g.version + 1]));
  ok(/no se puede cambiar el tipo ni la persona/.test(await falla(U.creadorA, ({ uno }) => uno("update pagos set trabajador_id = $2, version = 3 where id = $1 returning id", [g.id, A.t1]))), "se cambió la persona");
  ok(/CONFLICTO/.test(await falla(U.creadorA, ({ uno }) => uno("update pagos set importe_cent = 1 where id = $1 returning id", [g.id]))), "una edición sin versión no dio conflicto");
  ok((await como(U.adminA, ({ q }) => q("update pagos set importe_cent = 1 where id = $1 returning id", [g.id]))).length === 0, "el administrador lector cambió un pago");
  const h = await como(U.adminA, ({ q }) => q("select accion, antes ->> 'importe_cent' as antes, despues ->> 'importe_cent' as despues, user_id from auditoria where tabla = 'pagos' and fila_id = $1 order by id", [g.id]));
  ok(h.length === 2 && h[1].accion === "update" && h[1].antes === "1500" && h[1].despues === "1800" && h[1].user_id === U.creadorA, "historial: " + JSON.stringify(h));
  ok((await como(U.trab2, ({ q }) => q("select * from auditoria"))).length === 0, "un trabajador lee la auditoría");
  return "importe 15 → 18 € con historial (quién, antes y después) · persona fija · conflicto de versión · lector sin cambios · trabajador sin auditoría";
});
await prueba("Modelos (000013): solo quien gestiona los crea, edita y borra; no se borra uno en uso; quedan en la auditoría", async () => {
  const campos = JSON.stringify([{ clave: "extra", etiqueta: "Extra", valor: "" }]);
  const m = await como(U.creadorA, ({ uno }) => uno("insert into plantillas (campana_id, nombre, asesoria, titulo, cuerpo, campos) values ($1, 'Modelo propio', 'Asesoría X', 'Título', 'Cuerpo {{dueno}} {{extra}}', $2) returning id, version", [A.c, campos]));
  await como(U.creadorA, ({ uno }) => uno("update plantillas set cuerpo = 'Cuerpo nuevo {{dueno}}', version = $2 where id = $1 returning id", [m.id, m.version + 1]));
  for (const u of [U.adminA, U.trab1, U.dueno1, U.creadorB]) {
    let n = 0; try { n = (await como(u, ({ q }) => q("update plantillas set nombre = 'x', version = 3 where id = $1 returning id", [m.id]))).length; } catch (e) { n = 0; }
    ok(n === 0, "otro rol cambió el modelo");
  }
  await falla(U.adminA, ({ uno }) => uno("insert into plantillas (campana_id, nombre) values ($1, 'del admin') returning id", [A.c]));
  await como(U.creadorA, ({ uno }) => uno("insert into documentos (campana_id, dueno_id, plantilla_ref, nombre) values ($1, $2, $3, 'Doc con modelo propio') returning id", [A.c, A.d1, m.id]));
  ok(/hay documentos que usan este modelo/.test(await falla(U.creadorA, ({ q }) => q("delete from plantillas where id = $1", [m.id]))), "se borró un modelo en uso");
  const h = await como(U.adminA, ({ q }) => q("select accion from auditoria where tabla = 'plantillas' and fila_id = $1 order by id", [m.id]));
  ok(h.map(x => x.accion).join() === "insert,update", "auditoría de modelos: " + JSON.stringify(h));
  return "creado y editado por el creador · admin, trabajador, dueño y otro creador sin cambios · en uso no se borra · auditado";
});

/* ---------- 000014: copias selladas y restauración completa con cuentas autorizadas ---------- */
await prueba("Copia sellada (000014): solo quien gestiona; el sello detecta una manipulación aunque se recalcule la huella", async () => {
  for (const u of [U.adminA, U.trab1, U.dueno1, U.creadorB, U.intruso]) await falla(u, ({ uno }) => uno("select public.copia_campana($1)", [A.c]));
  await db.query("update public.perfiles set usuario = 'admin.copia' where id = $1", [U.adminA]);
  await db.query("update public.perfiles set usuario = 'dueno.copia' where id = $1", [U.dueno1]);
  const c = (await como(U.creadorA, ({ uno }) => uno("select public.copia_campana($1) as r", [A.c]))).r;
  ok(/^[0-9a-f]{64}$/.test(c.sello) && c.datos.miembros.some(m => m.usuario === "admin.copia") && !/password|contrase|token|sb_secret|service_role|encrypted/i.test(JSON.stringify(c.datos)), "copia: " + JSON.stringify(c.datos.miembros));
  const verif = async d => (await como(U.trab1, ({ uno }) => uno("select public.verificar_sello($1, $2) as v", [JSON.stringify(d), c.sello]))).v;
  ok(await verif(JSON.parse(JSON.stringify(c.datos))) === true, "el sello no se reconoce tras leer y escribir el archivo");
  const mala = JSON.parse(JSON.stringify(c.datos)); mala.pagos[0].importe_cent += 100;
  ok(await verif(mala) === false, "el sello no detectó un importe cambiado");
  let anon = null; try { anon = (await como(null, ({ uno }) => uno("select public.verificar_sello($1, $2) as v", [JSON.stringify(c.datos), c.sello]))).v; } catch (e) { anon = "rechazado"; }
  ok(anon !== true, "un anónimo comprobó sellos");
  let clave = []; try { clave = await como(U.creadorA, ({ q }) => q("select * from cc_priv.sello")); } catch (e) { clave = []; }
  ok(clave.length === 0, "la clave del sello es legible");
  A.copiaSellada = c;
  return "5 roles sin permiso rechazados · sello válido tras leer/escribir · importe cambiado detectado · anónimo y clave rechazados · sin datos de acceso";
});
await prueba("Restauración completa aislada (000014): jornadas, pagos, documentos, cuentas autorizadas y relaciones iguales", async () => {
  const c = A.copiaSellada, R = (await como(U.super, ({ uno }) => uno("select public.crear_campana('Restauración completa', 2026) as id"))).id;
  const s = JSON.stringify(c.datos), r = (await como(U.super, ({ uno }) => uno("select public.importar_campana($1, $2, $3) as r", [R, huella(s), s]))).r;
  ok(r.partes.nuevos === c.datos.partes.length && r.pagos.nuevos === c.datos.pagos.length && r.documentos.nuevos === c.datos.documentos.length, "importación: " + JSON.stringify(r));
  await falla(U.creadorA, ({ uno }) => uno("select public.restaurar_miembros($1, $2)", [R, JSON.stringify(c.datos.miembros)]));
  const m = (await como(U.super, ({ uno }) => uno("select public.restaurar_miembros($1, $2) as r", [R, JSON.stringify(c.datos.miembros)]))).r;
  ok(m.vinculadas >= 2 && m.no_existen === 0, "cuentas: " + JSON.stringify(m));
  const k1 = (await como(U.dueno1, ({ uno }) => uno("select public.cuenta_dueno($1) as r", [A.c]))).r, k2 = (await como(U.dueno1, ({ uno }) => uno("select public.cuenta_dueno($1) as r", [R]))).r;
  ok(k1.total_cent === k2.total_cent && k1.pagado_cent === k2.pagado_cent && +k1.horas === +k2.horas, "cuenta del dueño distinta: " + JSON.stringify([k1.total_cent, k2.total_cent]));
  const cuenta = camp => como(U.adminA, ({ uno }) => uno(`select (select count(*) from partes_filas where campana_id = $1)::int as filas, (select coalesce(sum(importe_cent),0) from pagos where campana_id = $1)::text as pagos,
    (select count(*) from documentos where campana_id = $1)::int as docs, (select count(*) from partes_maquinas where campana_id = $1)::int as maq, (select coalesce(sum(kilos),0) from partes where campana_id = $1)::text as kilos`, [camp]));
  const [a, b] = [await cuenta(A.c), await cuenta(R)];
  ok(JSON.stringify(a) === JSON.stringify(b), "restauración distinta: " + JSON.stringify({ a, b }));
  return `campaña nueva: ${b.filas} jornadas, ${b.maq} maquinaria, kilos ${b.kilos}, pagos ${b.pagos} céntimos y ${b.docs} documentos iguales · ${m.vinculadas} cuentas con su rol y ficha · solo el superadministrador vincula`;
});

/* ---------- 000015: cuenta técnica de copias, solo lectura ---------- */
await prueba("Cuenta de copias (000015): lee campañas, copias selladas y fotos; no escribe nada ni puede recibir permisos", async () => {
  // Alta: solo el propietario (editor SQL) la autoriza; nadie desde la API
  for (const u of [U.super, U.creadorA, U.adminA, null]) await falla(u, ({ uno }) => uno("select cc_priv.autorizar_alta_respaldo('copias.intento')"));
  await db.query("select cc_priv.autorizar_alta_respaldo('respaldo.copias')");
  const R = crypto.randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, 'respaldo.copias@usuarios.campana-control.invalid')", [R]);
  const p = (await db.query("select activo, debe_cambiar_clave, puede_crear_campanas from public.perfiles where id = $1", [R])).rows[0];
  ok(p.activo && !p.debe_cambiar_clave && !p.puede_crear_campanas, "perfil de la cuenta de copias: " + JSON.stringify(p));
  ok((await db.query("select count(*)::int as n from public.superadmin where user_id = $1", [R])).rows[0].n === 0, "la cuenta de copias es superadministrador");
  // Lee lo necesario para las copias
  const camps = await como(R, ({ q }) => q("select * from public.respaldo_campanas()"));
  ok(camps.length >= 2 && camps.some(c => c.campana_id === A.c), "no ve las campañas: " + camps.length);
  const c = (await como(R, ({ uno }) => uno("select public.copia_campana($1) as r", [A.c]))).r;
  ok(c.datos.partes.length > 0 && /^[0-9a-f]{64}$/.test(c.sello), "no puede hacer la copia sellada");
  ok(typeof (await como(R, ({ uno }) => uno("select public.respaldo_huella($1) as h", [A.c]))).h === "string", "sin huella");
  await como(R, ({ q }) => q("select * from public.respaldo_fotos()"));
  ok((await como(R, ({ uno }) => uno("select public.verificar_sello($1, $2) as v", [JSON.stringify(c.datos), c.sello]))).v === true, "no comprueba el sello");
  // Directamente, la RLS no le deja ver nada
  for (const t of ["partes", "pagos", "trabajadores_privado", "perfiles", "miembros", "auditoria"]) {
    const n = (await como(R, ({ q }) => q(`select * from public.${t}`))).filter(x => x.id !== R).length;
    ok(n === 0, "la cuenta de copias lee directamente " + t);
  }
  // No escribe nada
  const intentos = [
    ["insert into pagos (campana_id, tipo, trabajador_id, importe_cent, fecha) values ($1, 'trabajador', $2, 100, '2026-11-20') returning id", [A.c, A.t1]],
    ["select public.guardar_parte($1, $2, '2026-11-25', null, 1, null, '[]', '[]')", [A.c, A.d1]],
    ["select public.crear_campana('de copias', 2026)", []],
    ["select public.preparar_alta('colado.copias', 'x', 'creador')", []],
    ["insert into public.superadmin (user_id) values ($1)", [R]],
    ["select public.importar_campana($1, repeat('a', 64), '{}')", [A.c]],
    ["select public.restaurar_miembros($1, '[]')", [A.c]]];
  for (const [sql, prm] of intentos) {
    let hecho = false; try { const r = await como(R, ({ q }) => q(sql, prm)); hecho = r.length > 0; } catch (e) { hecho = false; }
    ok(!hecho, "la cuenta de copias pudo: " + sql.slice(0, 50));
  }
  ok((await como(R, ({ q }) => q("update pagos set importe_cent = 1, version = version + 1 returning id"))).length === 0, "cambió pagos");
  ok((await como(R, ({ q }) => q("update partes_filas set horas = 1 returning id"))).length === 0, "cambió jornadas");
  try { await como(R, ({ q }) => q("update public.perfiles set puede_crear_campanas = true where id = $1 returning id", [R])); } catch (e) { }
  ok(!(await db.query("select puede_crear_campanas from public.perfiles where id = $1", [R])).rows[0].puede_crear_campanas, "se dio permiso de crear campañas");
  // Ni el superadministrador puede convertirla en superadministrador, miembro o creador
  await falla(U.super, ({ uno }) => uno("insert into public.superadmin (user_id) values ($1)", [R]));
  let msg0 = ""; try { await db.query("insert into public.superadmin (user_id) values ($1)", [R]); } catch (e) { msg0 = e.message; }
  ok(/solo lectura|unico|duplicate/.test(msg0) && (await db.query("select count(*)::int as n from public.superadmin where user_id = $1", [R])).rows[0].n === 0, "el propietario la hizo superadministrador: " + msg0);
  await falla(U.super, ({ uno }) => uno("insert into public.miembros (campana_id, user_id, rol) values ($1, $2, 'admin')", [A.c, R]));
  let msg = ""; try { await db.query("update public.perfiles set puede_crear_campanas = true where id = $1", [R]); } catch (e) { msg = e.message; }
  ok(/solo lectura/.test(msg), "se le dio crear campañas desde el propietario");
  // Otros usuarios no usan sus funciones
  for (const u of [U.super, U.creadorA, U.trab1]) await falla(u, ({ uno }) => uno("select * from public.respaldo_campanas()"));
  // Si se bloquea, deja de poder leer
  await db.query("update public.perfiles set bloqueado = true where id = $1", [R]);
  await falla(R, ({ uno }) => uno("select public.copia_campana($1)", [A.c]));
  await db.query("update public.perfiles set bloqueado = false where id = $1", [R]);
  return `${camps.length} campañas y copia sellada legibles · 6 tablas sin lectura directa · 9 escrituras rechazadas · no puede ser superadministrador, miembro ni creador · bloqueada pierde el acceso`;
});

/* ---------- 000017: cuentas para la copia completa, solo «respaldo_lectura» ---------- */
await prueba("Copia completa (000017): solo el usuario de base de datos de copias lee las cuentas; la app no", async () => {
  for (const u of [U.super, U.creadorA, U.trab1, null]) await falla(u, ({ q }) => q("select * from cc_priv.respaldo_cuentas()"));
  const total = (await db.query("select count(*)::int as n from auth.users")).rows[0].n;
  const filas = await db.transaction(async tx => {
    await tx.exec("set local role respaldo_lectura");
    return (await tx.query("select r from cc_priv.respaldo_cuentas() r")).rows;
  });
  ok(filas.length === total && total > 0, `devuelve ${filas.length} de ${total} cuentas`);
  ok(filas.every(f => f.r.id && "email" in f.r), "faltan columnas de la cuenta");
  let escribe = true;
  try { await db.transaction(async tx => { await tx.exec("set local role respaldo_lectura"); await tx.query("update public.pagos set importe_cent = 1"); }); } catch (e) { escribe = false; }
  ok(!escribe, "respaldo_lectura pudo escribir en pagos");
  return `${filas.length} cuentas completas legibles solo por respaldo_lectura · superadministrador, creador, trabajador y anónimo rechazados · no escribe`;
});

/* ---------- Resumen ---------- */
const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos} correctas, ${fallos} con fallos`);
process.exit(fallos ? 1 : 0);
