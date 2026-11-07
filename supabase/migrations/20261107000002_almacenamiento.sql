-- CAMPAÑA CONTROL 3.0 · Fotos privadas en Supabase Storage
-- Bucket privado «fotos». Ruta de cada archivo: <campana_id>/<foto_id>.jpg
-- Solo se pueden leer las fotos cuya fila en public.fotos es visible para el usuario (mismas reglas RLS que los documentos).
-- Solo quien gestiona la campaña puede subir o borrar. Límite de 2 MB por foto y solo JPEG/PNG/WebP (la app comprime antes de subir).
-- PENDIENTE de probar en un proyecto Supabase real (Storage no existe en el PostgreSQL local de las pruebas).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy fotos_leer on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and exists (select 1 from public.fotos f where f.ruta = storage.objects.name));   -- RLS de public.fotos decide

create policy fotos_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'fotos' and cc_priv.gestiona(((storage.foldername(name))[1])::uuid));

create policy fotos_borrar on storage.objects for delete to authenticated using (
  bucket_id = 'fotos' and cc_priv.gestiona(((storage.foldername(name))[1])::uuid));
