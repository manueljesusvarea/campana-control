-- CAMPAÑA CONTROL 3.0 · 000019: tiempo real también para la configuración de la campaña
--
-- Con 000018 la configuración, los precios, las personas y la maquinaria se cambian desde la app. Hasta ahora solo
-- partes, jornadas, pagos y miembros avisaban al momento; el resto se notaba en la comprobación periódica (huella,
-- cada 45 s). Se añaden a la publicación de Supabase Realtime (que respeta la RLS: cada cual solo recibe avisos de
-- lo que puede leer). No cambia datos ni permisos.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['campanas', 'campanas_economia', 'trabajadores', 'duenos', 'maquinas'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
