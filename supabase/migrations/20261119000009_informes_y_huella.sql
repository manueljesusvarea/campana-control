-- CAMPAÑA CONTROL 3.0 · 000009: datos para los informes del dueño y huella de cambios de una campaña
--
-- 1) datos_dueno(campaña): lo justo para que el dueño genere en su dispositivo los mismos PDF y Excel de la 2.3.0
--    («Cuenta de dueños»), con las mismas fórmulas: sus partes, las filas y la maquinaria de esos partes, el nombre
--    de los trabajadores y máquinas que aparecen en ellos, sus pagos, su precio por hora y el IVA. Nada de otros
--    dueños ni datos personales de los trabajadores. (La RLS ya le deja leer sus partes, filas y pagos, pero no
--    los nombres de trabajadores ni las máquinas: por eso una función que solo devuelve lo de sus partes.)
-- 2) huella_campana(campaña): un texto que cambia cuando cambia algo que el usuario puede ver. Se ejecuta con los
--    permisos de quien llama (security invoker): la RLS filtra igual que en el resto de consultas. La app la compara
--    cada cierto tiempo y al volver a primer plano para no depender solo de los avisos en tiempo real.
-- No modifica ni borra datos.

create function public.datos_dueno(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_d uuid; r jsonb;
begin
  select m.dueno_id into v_d from public.miembros m join public.perfiles p on p.id = m.user_id
   where m.campana_id = p_campana and m.user_id = auth.uid() and m.rol = 'dueno' and m.activo and p.activo and m.dueno_id is not null limit 1;
  if v_d is null then raise exception 'PERMISO: no eres dueño en esta campaña' using errcode = '42501'; end if;
  with ps as (select x.id, x.fecha, x.kilos, x.notas from public.partes x where x.campana_id = p_campana and x.dueno_id = v_d),
  fs as (select f.parte_id, f.trabajador_id, f.tipo, f.horas, f.nota from public.partes_filas f join ps on ps.id = f.parte_id),
  pm as (select q.parte_id, q.maquina_id, q.cantidad from public.partes_maquinas q join ps on ps.id = q.parte_id)
  select jsonb_build_object(
    'campana', (select jsonb_build_object('id', k.id, 'nombre', k.nombre, 'anio', k.anio, 'inicio', k.inicio, 'horas_dia', k.horas_dia, 'empresa', k.empresa)
                from public.campanas k where k.id = p_campana),
    'iva', (select e.iva from public.campanas_economia e where e.campana_id = p_campana),
    'precio_hora_cent', (select coalesce(d.precio_hora_cent, e.precio_hora_dueno_cent) from public.duenos d
                         join public.campanas_economia e on e.campana_id = d.campana_id where d.id = v_d),
    'dueno', (select jsonb_build_object('id', d.id, 'nombre', d.nombre, 'finca', d.finca, 'municipio', d.municipio, 'num', d.num, 'kilos_total', d.kilos_total,
                     'nif', v.nif, 'direccion', v.direccion, 'telefono', v.telefono, 'poligono', v.poligono, 'parcela', v.parcela)
              from public.duenos d left join public.duenos_privado v on v.dueno_id = d.id where d.id = v_d),
    'partes', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'fecha', ps.fecha, 'kilos', ps.kilos, 'notas', ps.notas) order by ps.fecha), '[]') from ps),
    'filas', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]') from fs),
    'maquinas_partes', (select coalesce(jsonb_agg(to_jsonb(pm)), '[]') from pm),
    'trabajadores', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre)), '[]') from public.trabajadores t
                     where t.id in (select trabajador_id from fs)),
    'maquinas', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'nombre', q.nombre, 'precio_cent', q.precio_cent, 'unidad', q.unidad)), '[]')
                 from public.maquinas q where q.id in (select maquina_id from pm)),
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'fecha', g.fecha, 'hora', g.hora, 'forma', g.forma, 'nota', g.nota, 'importe_cent', g.importe_cent)
                     order by g.fecha, g.hora), '[]')
              from public.pagos g where g.campana_id = p_campana and g.tipo = 'dueno' and g.dueno_id = v_d)) into r;
  return r;
end $$;

create function public.huella_campana(p_campana uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select md5(concat_ws('|',
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.campanas where id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.campanas_economia where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.trabajadores where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.duenos where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.maquinas where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text || ':' || coalesce(max(actualizado_en)::text, '') from public.partes where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(md5(string_agg(id::text, ',' order by id)), '') from public.partes_filas where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text || ':' || coalesce(max(actualizado_en)::text, '') from public.pagos where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(md5(string_agg(id::text || rol::text || activo::text || puede_editar::text, ',' order by id)), '')
       from public.miembros where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(md5(string_agg(id::text || coalesce(hasta::text, ''), ',' order by id)), '') from public.asignaciones_equipo where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.documentos where campana_id = p_campana),
    (select count(*)::text from public.fotos where campana_id = p_campana)))
$$;

revoke all on function public.datos_dueno(uuid), public.huella_campana(uuid) from public, anon;
grant execute on function public.datos_dueno(uuid), public.huella_campana(uuid) to authenticated;
