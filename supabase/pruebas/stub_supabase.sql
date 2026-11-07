-- Lo mínimo de Supabase que necesita la migración para ejecutarse en un PostgreSQL local (PGlite) durante las pruebas.
-- Reproduce cómo funciona Supabase: roles anon/authenticated y auth.uid() leído del JWT de la petición.
-- NO se usa en producción: allí estos objetos ya existen.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz
);
-- Igual que en Supabase: el usuario sale de la reclamación «sub» del JWT
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
