-- CAMPAÑA CONTROL 3.0 · 000016: fotos para la cuenta de copias y usuario de base de datos de SOLO LECTURA
-- (El nombre contiene «almacenamiento»: las pruebas locales con PGlite no tienen Storage y no lo aplican.)
--
-- 1) La cuenta técnica de copias (000015) puede LEER los archivos del bucket privado «fotos» para copiarlos.
--    No puede subir ni borrar (esas políticas no cambian: solo quien gestiona la campaña).
-- 2) Usuario de PostgreSQL «respaldo_lectura» para la copia completa (pg_dump) sin guardar en GitHub la contraseña
--    principal de la base de datos. Solo puede LEER: tablas de la app (public, cc_priv), las cuentas (auth.users) y
--    los datos de los archivos (storage.objects). BYPASSRLS es necesario para que pg_dump vea todas las filas (las
--    tablas tienen RLS forzada); no le da permiso para escribir nada. Se crea SIN contraseña y sin poder entrar
--    (NOLOGIN): el dueño la activa con su propia contraseña en el editor SQL (ver docs/COPIAS_Y_RECUPERACION.md).
-- No borra ni modifica datos.

alter policy fotos_leer on storage.objects using (
  bucket_id = 'fotos' and (
    exists (select 1 from public.fotos f where f.ruta = storage.objects.name)                       -- RLS de public.fotos decide
    or cc_priv.gestiona(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                             then ((storage.foldername(name))[1])::uuid end)                       -- carpeta = id de la campaña
    or cc_priv.es_respaldo()));                                                                     -- cuenta de copias (solo lectura)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'respaldo_lectura') then
    create role respaldo_lectura nologin bypassrls;
  end if;
end $$;
grant usage on schema public, cc_priv, auth, storage to respaldo_lectura;
grant select on all tables in schema public to respaldo_lectura;
grant select on all sequences in schema public to respaldo_lectura;
grant select on all tables in schema cc_priv to respaldo_lectura;
grant select on auth.users to respaldo_lectura;
grant select on storage.objects to respaldo_lectura;
alter default privileges in schema public grant select on tables to respaldo_lectura;
