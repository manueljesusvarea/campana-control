-- CAMPAÑA CONTROL 3.0 · 000012: quien gestiona una campaña puede leer los archivos de su carpeta en Storage
--
-- Problema encontrado en la prueba real (19-11-2026): Storage exige permiso de LECTURA para BORRAR un archivo.
-- La política «fotos_leer» (000002) solo deja leer archivos que tienen ficha en public.fotos. Así, quien gestiona
-- no podía borrar un archivo suelto (subida interrumpida) ni el archivo de una foto cuya ficha acababa de quitar.
-- Ahora quien gestiona la campaña (creador o superadministrador) también puede leer los archivos de la carpeta de
-- su campaña. Para el resto nada cambia: administradores y dueños solo leen fotos con ficha visible para ellos.
-- No borra ni modifica datos; solo amplía la política de lectura para quien ya puede subir y borrar en esa carpeta.

alter policy fotos_leer on storage.objects using (
  bucket_id = 'fotos' and (
    exists (select 1 from public.fotos f where f.ruta = storage.objects.name)                       -- RLS de public.fotos decide
    or cc_priv.gestiona(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                             then ((storage.foldername(name))[1])::uuid end)));   -- carpeta = id de la campaña
