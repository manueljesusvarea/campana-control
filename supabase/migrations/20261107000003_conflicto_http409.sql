-- CAMPAÑA CONTROL 3.0 · Conflictos de versión como HTTP 409
--
-- Problema detectado en el proyecto Supabase de pruebas (7-11-2026): los conflictos de versión usaban el código
-- SQLSTATE 40001 («serialization_failure»). La API de Supabase (PostgREST) lo trata como reintentable y repetía
-- la petición hasta agotar el tiempo («upstream request timeout») en lugar de devolver el conflicto.
-- Solución: código PT409, que PostgREST convierte en una respuesta HTTP 409 Conflict, sin reintentos.
-- El mensaje sigue empezando por «CONFLICTO:» para que la app lo reconozca.

create or replace function cc_priv.control_version() returns trigger language plpgsql as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'CONFLICTO: el registro ha cambiado desde que lo abriste (versión % en la base de datos)', old.version
      using errcode = 'PT409', hint = 'Vuelve a cargarlo y repite el cambio';
  end if;
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

create or replace function public.guardar_parte(p_campana uuid, p_dueno uuid, p_fecha date, p_version int, p_kilos numeric, p_notas text,
  p_filas jsonb, p_maquinas jsonb) returns public.partes
language plpgsql security invoker set search_path = '' as $$
declare v public.partes;
begin
  select * into v from public.partes where dueno_id = p_dueno and fecha = p_fecha and campana_id = p_campana;
  if not found then
    if p_version is not null then raise exception 'CONFLICTO: ese parte se ha borrado desde que lo abriste' using errcode = 'PT409'; end if;
    insert into public.partes (campana_id, dueno_id, fecha, kilos, notas, creado_por) values (p_campana, p_dueno, p_fecha, p_kilos, p_notas, auth.uid()) returning * into v;
  else
    if p_version is null then raise exception 'CONFLICTO: otra persona ya ha creado el parte de este día' using errcode = 'PT409'; end if;
    update public.partes set kilos = p_kilos, notas = p_notas, version = p_version + 1 where id = v.id returning * into v;
    if not found then raise exception 'PERMISO: no puedes modificar este parte' using errcode = '42501'; end if;
    delete from public.partes_filas where parte_id = v.id;
    delete from public.partes_maquinas where parte_id = v.id;
  end if;
  insert into public.partes_filas (parte_id, campana_id, fecha, trabajador_id, tipo, horas, nota)
  select v.id, v.campana_id, v.fecha, (f ->> 'trabajador_id')::uuid, coalesce(f ->> 'tipo', 'normal')::public.tipo_dia, nullif(f ->> 'horas', '')::numeric, f ->> 'nota'
  from jsonb_array_elements(coalesce(p_filas, '[]')) f;
  insert into public.partes_maquinas (parte_id, campana_id, maquina_id, cantidad)
  select v.id, v.campana_id, (m ->> 'maquina_id')::uuid, (m ->> 'cantidad')::int
  from jsonb_array_elements(coalesce(p_maquinas, '[]')) m where (m ->> 'cantidad')::int > 0;
  return v;
end $$;
revoke all on function public.guardar_parte(uuid, uuid, date, int, numeric, text, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_parte(uuid, uuid, date, int, numeric, text, jsonb, jsonb) to authenticated;
