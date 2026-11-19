-- CAMPAÑA CONTROL 3.0 · 000011: control de fotos en Storage (bucket privado «fotos», migración 000002)
-- (El nombre contiene «almacenamiento»: las pruebas locales con PGlite no tienen Storage y no lo aplican.)
--
-- fotos_huerfanas(campaña): archivos de la carpeta de la campaña que no tienen ficha en public.fotos
--   (p. ej., una subida interrumpida). La app ofrece borrarlos.
-- fotos_sin_archivo(campaña): fichas de public.fotos cuyo archivo ya no está. La app ofrece quitarlas.
-- Solo quien gestiona la campaña. Solo leen: no borran nada (el borrado lo hace la app con los permisos del usuario).

create function public.fotos_huerfanas(p_campana uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña' using errcode = '42501'; end if;
  return query select o.name from storage.objects o
    where o.bucket_id = 'fotos' and (storage.foldername(o.name))[1] = p_campana::text
      and not exists (select 1 from public.fotos f where f.ruta = o.name)
    order by o.name;
end $$;

create function public.fotos_sin_archivo(p_campana uuid) returns table (id uuid, ruta text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña' using errcode = '42501'; end if;
  return query select f.id, f.ruta from public.fotos f
    where f.campana_id = p_campana and not exists (select 1 from storage.objects o where o.bucket_id = 'fotos' and o.name = f.ruta)
    order by f.creado_en;
end $$;

revoke all on function public.fotos_huerfanas(uuid), public.fotos_sin_archivo(uuid) from public, anon;
grant execute on function public.fotos_huerfanas(uuid), public.fotos_sin_archivo(uuid) to authenticated;
