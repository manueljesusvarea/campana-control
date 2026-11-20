-- CAMPAÑA CONTROL 3.0 · 000017: lectura de las cuentas (auth.users) para la copia completa de la base de datos
--
-- Por qué: en 000016 se concedió a «respaldo_lectura» SELECT sobre auth.users, pero no se pudo conceder USAGE sobre
-- el esquema «auth»: ese esquema es de supabase_admin y el usuario postgres lo usa sin opción de concederlo
-- (PostgreSQL ignora esa concesión con un simple aviso). Sin USAGE, la copia falla con «permission denied for
-- schema auth». No se toca el esquema de Supabase: esta función de solo lectura, con los permisos del propietario,
-- devuelve cada cuenta completa (una fila jsonb por cuenta, para poder restaurarla) y SOLO la puede ejecutar
-- «respaldo_lectura». Ni la app (anon, authenticated) ni service_role pueden usarla.
-- No borra ni modifica datos.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'respaldo_lectura') then
    create role respaldo_lectura nologin bypassrls;
  end if;
end $$;
grant usage on schema cc_priv to respaldo_lectura;

create function cc_priv.respaldo_cuentas() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(u) from auth.users u order by u.id
$$;
revoke all on function cc_priv.respaldo_cuentas() from public, anon, authenticated;
grant execute on function cc_priv.respaldo_cuentas() to respaldo_lectura;
