-- ⚠️ SOLO PARA EL PROYECTO «campana-control-pruebas». NUNCA EN PRODUCCIÓN (campana-control).
-- Se ejecuta en el editor SQL del panel de Supabase (como propietario del proyecto).
--
-- 1. Quita la preparación antigua (hasta el 18-11-2026): un disparador daba superadministrador o permiso de crear
--    campañas según el correo («superadmin…@pruebas.example.com»). Cualquiera que leyera este repositorio
--    público podía registrarse con ese correo, así que se elimina. Ningún permiso depende ya del correo.
-- 2. diagnostico_esquema(): informe interno de tablas, RLS, políticas y claves foráneas (solo superadministrador).
-- 3. Designación de las cuentas fijas de prueba POR SU IDENTIFICADOR (uuid), igual que en producción:
--    `node real.test.mjs --preparar` crea las cuentas y escribe, FUERA del repositorio, el SQL con sus uuid
--    (CAMPAÑA CONTROL/supabase-sql/03-designar-cuentas-prueba.sql). Este archivo solo trae la plantilla.

-- 1 · Preparación antigua por correo: fuera
drop trigger if exists zz_preparar_prueba on auth.users;
drop trigger if exists preparar_prueba on auth.users;
drop function if exists cc_priv.preparar_cuenta_prueba();

-- 2 · Diagnóstico interno
create or replace function public.diagnostico_esquema() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador' using errcode = '42501'; end if;
  return (select jsonb_agg(jsonb_build_object(
      'tabla', c.relname,
      'rls', c.relrowsecurity,
      'rls_forzado', c.relforcerowsecurity,
      'politicas', (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname),
      'claves_foraneas', (select count(*) from pg_constraint k where k.conrelid = c.oid and k.contype = 'f'),
      'restricciones_check', (select count(*) from pg_constraint k where k.conrelid = c.oid and k.contype = 'c'),
      'anon_puede_leer', has_table_privilege('anon', c.oid, 'select'),
      'authenticated_puede_borrar', has_table_privilege('authenticated', c.oid, 'delete')) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r');
end $$;
revoke all on function public.diagnostico_esquema() from public, anon;
grant execute on function public.diagnostico_esquema() to authenticated;

-- 3 · Plantilla (la versión con los uuid reales la genera `node real.test.mjs --preparar`):
--   update public.perfiles set puede_crear_campanas = (id in ('<uuid creadorA>', '<uuid creadorB>'));
--   insert into public.superadmin (user_id) values ('<uuid superadmin>')
--     on conflict (unico) do update set user_id = excluded.user_id;
