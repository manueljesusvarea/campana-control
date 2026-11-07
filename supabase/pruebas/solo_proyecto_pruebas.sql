-- ⚠️ SOLO PARA EL PROYECTO «campana-control-pruebas». NUNCA EN PRODUCCIÓN (campana-control).
--
-- Prepara el proyecto de pruebas para que las pruebas automáticas (real.test.mjs) funcionen sin claves secretas:
--  1. Las cuentas ficticias del dominio reservado «@pruebas.example.com» reciben al registrarse:
--       creador…@  → permiso para crear campañas
--       superadmin…@ → superadministrador DEL PROYECTO DE PRUEBAS (sustituye al anterior)
--     En producción esto no existe: allí el superadministrador y los permisos solo se fijan con SQL del propietario.
--  2. diagnostico_esquema(): informe interno de tablas, RLS, políticas y claves foráneas (solo superadministrador).
-- Solo afecta a cuentas ficticias. Los datos del proyecto de pruebas son siempre ficticios.

create or replace function cc_priv.preparar_cuenta_prueba() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email like '%@pruebas.example.com' then
    if new.email like 'creador%' then
      update public.perfiles set puede_crear_campanas = true where id = new.id;
    elsif new.email like 'superadmin%' then
      insert into public.superadmin (user_id) values (new.id) on conflict (unico) do update set user_id = excluded.user_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists preparar_prueba on auth.users;
-- Se llama «zz_…» para ejecutarse después de «al_registrarse» (que crea el perfil): los disparadores van por orden alfabético
create trigger zz_preparar_prueba after insert on auth.users for each row execute function cc_priv.preparar_cuenta_prueba();

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
