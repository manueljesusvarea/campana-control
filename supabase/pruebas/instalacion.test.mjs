// Instalación LIMPIA (como el futuro proyecto de producción): un PostgreSQL vacío + todas las migraciones en orden,
// sin ningún dato de prueba. Comprueba que se aplican sin errores, que no queda ningún dato, que todas las tablas
// tienen RLS forzada, que el anónimo no lee nada y que las funciones administrativas rechazan a quien no debe.
// También genera supabase/produccion/instalacion_completa.sql (todas las migraciones en una transacción) y su huella.
// Uso: node instalacion.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url)), mig = path.join(dir, "..", "migrations");
const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto");
const db = new PGlite({ extensions: { pgcrypto } });
const ok = (c, m) => { if (!c) { console.log("FALLA  " + m); process.exit(1); } };
await db.exec(readFileSync(path.join(dir, "stub_supabase.sql"), "utf8"));
const todas = readdirSync(mig).filter(f => f.endsWith(".sql")).sort();
for (const f of todas.filter(f => !f.includes("almacenamiento"))) await db.exec(readFileSync(path.join(mig, f), "utf8"));

const filas = (await db.query(`select string_agg(c.relname || '=' || (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || quote_ident(c.relname), false, true, '')))[1]::text, ',') as r
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`)).rows[0].r;
const conDatos = filas.split(",").filter(x => !x.endsWith("=0"));
ok(!conDatos.length, "la instalación limpia trae datos: " + conDatos.join(", "));
const sinRls = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)`)).rows;
ok(!sinRls.length, "tablas sin RLS forzada: " + sinRls.map(x => x.relname).join(", "));
const nTablas = (await db.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`)).rows[0].n;
const clave = (await db.query("select count(*)::int as n from cc_priv.sello")).rows[0].n;
ok(clave === 1, "no se creó la clave del sello de las copias");
// Anónimo y usuario sin cuentas: nada legible y funciones administrativas rechazadas
const como = async (u, sql, p) => db.transaction(async tx => { await tx.exec(u ? "set local role authenticated" : "set local role anon");
  await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(u ? { sub: u, role: "authenticated" } : { role: "anon" })]); return (await tx.query(sql, p)).rows; });
const rechaza = async (u, sql, p) => { try { await como(u, sql, p); return false; } catch (e) { return true; } };
const tablas = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`)).rows.map(x => x.relname);
for (const t of tablas) { let r = []; try { r = await como(null, `select * from public.${t} limit 1`); } catch (e) { } ok(!r.length, "el anónimo lee " + t); }
const intruso = "00000000-0000-4000-8000-000000000001";
for (const [sql, p] of [["select public.crear_campana('x', 2026)", []], ["select public.preparar_alta('colado', 'x', 'creador')", []], ["select public.copia_campana(gen_random_uuid())", []],
  ["select public.restaurar_miembros(gen_random_uuid(), '[]')", []], ["select public.importar_campana(gen_random_uuid(), repeat('a', 64), '{}')", []], ["select cc_priv.autorizar_alta_propietario('x', 'x')", []]])
  ok(await rechaza(intruso, sql, p) && await rechaza(null, sql, p), "se permitió: " + sql);

// Archivo único para producción (transacción: o se aplica todo o nada) y su huella
const sql = "-- CAMPAÑA CONTROL 3.0 · Instalación completa para un proyecto Supabase NUEVO y vacío (producción).\n" +
  "-- Generado por supabase/pruebas/instalacion.test.mjs a partir de supabase/migrations/ (" + todas.length + " migraciones). No editar a mano.\n" +
  "-- Contiene solo el esquema, permisos y funciones: ningún dato, cuenta ni contraseña.\nbegin;\n\n" +
  todas.map(f => `-- ===== ${f} =====\n` + readFileSync(path.join(mig, f), "utf8").replace(/\r/g, "")).join("\n\n") + "\ncommit;\n";
mkdirSync(path.join(dir, "..", "produccion"), { recursive: true });
writeFileSync(path.join(dir, "..", "produccion", "instalacion_completa.sql"), sql);
const h = createHash("sha256").update(sql).digest("hex");
writeFileSync(path.join(dir, "..", "produccion", "instalacion_completa.sha256"), h + "  instalacion_completa.sql\n");
console.log(`OK     Instalación limpia: ${todas.length} migraciones, ${nTablas} tablas vacías con RLS forzada, clave de sello creada, anónimo sin lectura, 6 funciones administrativas rechazadas`);
console.log(`       supabase/produccion/instalacion_completa.sql · SHA-256 ${h.slice(0, 12)}…`);
