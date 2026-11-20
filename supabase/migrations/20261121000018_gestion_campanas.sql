-- CAMPAÑA CONTROL 3.0 · 000018: administrar campañas (archivar, restaurar y eliminar definitivamente)
--
-- Qué fallaba: la base de datos ya dejaba al superadministrador y al creador cambiar la configuración, los precios,
-- los trabajadores, los dueños y la maquinaria de una campaña (cc_priv.gestiona), pero la app con cuenta no tenía
-- ninguna pantalla para hacerlo. Además, «archivar» no existía de verdad: la columna «activa» no impedía nada, y
-- borrar una campaña con datos podía fallar por las relaciones protegidas (jornadas → trabajadores, dueños, máquinas)
-- y dejaba sus fotos en Storage.
--
-- Esta migración (no borra ni cambia ningún dato):
--   1. Campaña ARCHIVADA = solo lectura para todos, comprobado en el servidor: nadie puede crear, cambiar ni borrar
--      sus jornadas, pagos, personas, máquinas, documentos, fotos ni precios. Quien la gestiona (creador o
--      superadministrador) la archiva y la restaura; las cuentas de sus miembros se siguen pudiendo gestionar.
--   2. resumen_campana(): qué hay en una campaña (lo que se perdería al eliminarla). Solo quien la gestiona.
--   3. eliminar_campana(): SOLO el superadministrador, SOLO si la campaña está archivada y SOLO si escribe su nombre
--      exacto. Borra en orden (sin chocar con las relaciones), deja constancia en la auditoría con el resumen y
--      devuelve las rutas de sus fotos para que la app las borre de Storage.
--   4. mis_campanas() devuelve también si la campaña está activa o archivada.
-- Los precios se siguen cambiando con las políticas existentes (gestiona) y quedan en la auditoría (antes/después).

-- 1. Campaña archivada: solo lectura
create function cc_priv.campana_abierta() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_c uuid;
begin
  if tg_op = 'DELETE' then v_c := old.campana_id; else v_c := new.campana_id; end if;
  if v_c is not null and coalesce(current_setting('cc.eliminando', true), '') <> v_c::text
     and exists (select 1 from public.campanas k where k.id = v_c and not k.activa) then
    raise exception 'ARCHIVADA: la campaña está archivada y es de solo lectura. Restáurala para hacer cambios' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['campanas_economia', 'trabajadores', 'trabajadores_privado', 'duenos', 'duenos_privado', 'duenos_trabajadores',
                           'maquinas', 'asignaciones_equipo', 'partes', 'partes_filas', 'partes_maquinas', 'pagos', 'plantillas',
                           'documentos', 'fotos', 'importaciones'] loop
    execute format('create trigger campana_abierta before insert or update or delete on public.%I for each row execute function cc_priv.campana_abierta()', t);
  end loop;
end $$;

-- Una campaña archivada solo admite un cambio: restaurarla (activa = true)
create function cc_priv.campana_archivada() returns trigger language plpgsql as $$
begin
  if not old.activa and not new.activa then
    raise exception 'ARCHIVADA: la campaña está archivada y es de solo lectura. Restáurala para hacer cambios' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger archivada before update on public.campanas for each row execute function cc_priv.campana_archivada();

-- 2. Resumen de una campaña (lo que se perdería al eliminarla)
create function public.resumen_campana(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_archivos bigint := 0;
begin
  if not cc_priv.gestiona(p_campana) then
    raise exception 'PERMISO: solo quien gestiona la campaña ve su resumen' using errcode = '42501';
  end if;
  if not exists (select 1 from public.campanas where id = p_campana) then
    raise exception 'NO_EXISTE: esa campaña no existe' using errcode = 'P0002';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects where bucket_id = ''fotos'' and name like $1' into v_archivos using p_campana::text || '/%';
  end if;
  select jsonb_build_object(
    'nombre', k.nombre, 'anio', k.anio, 'activa', k.activa,
    'trabajadores', (select count(*) from public.trabajadores where campana_id = p_campana),
    'duenos', (select count(*) from public.duenos where campana_id = p_campana),
    'maquinas', (select count(*) from public.maquinas where campana_id = p_campana),
    'partes', (select count(*) from public.partes where campana_id = p_campana),
    'jornadas', (select count(*) from public.partes_filas where campana_id = p_campana),
    'pagos', (select count(*) from public.pagos where campana_id = p_campana),
    'pagos_cent', (select coalesce(sum(importe_cent), 0) from public.pagos where campana_id = p_campana),
    'documentos', (select count(*) from public.documentos where campana_id = p_campana),
    'fotos', (select count(*) from public.fotos where campana_id = p_campana),
    'archivos', v_archivos,
    'modelos', (select count(*) from public.plantillas where campana_id = p_campana),
    'asignaciones', (select count(*) from public.asignaciones_equipo where campana_id = p_campana),
    'cuentas', (select count(distinct user_id) from public.miembros where campana_id = p_campana),
    'cuentas_solo_aqui', (select count(distinct m.user_id) from public.miembros m where m.campana_id = p_campana
                            and not exists (select 1 from public.miembros o where o.user_id = m.user_id and o.campana_id <> p_campana)
                            and not exists (select 1 from public.superadmin s where s.user_id = m.user_id)))
  into v from public.campanas k where k.id = p_campana;
  return v;
end $$;

-- 3. Eliminar definitivamente (solo el superadministrador, archivada y con el nombre exacto)
create function public.eliminar_campana(p_campana uuid, p_confirmacion text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare v public.campanas; v_res jsonb; v_rutas text[] := '{}';
begin
  if not cc_priv.es_superadmin() then
    raise exception 'PERMISO: solo el superadministrador puede eliminar una campaña' using errcode = '42501';
  end if;
  select * into v from public.campanas where id = p_campana for update;
  if not found then raise exception 'NO_EXISTE: esa campaña no existe' using errcode = 'P0002'; end if;
  if v.activa then
    raise exception 'ESTADO: archiva la campaña antes de eliminarla' using errcode = '55000';
  end if;
  if p_confirmacion is distinct from v.nombre then
    raise exception 'CONFIRMACION: escribe el nombre exacto de la campaña para eliminarla' using errcode = '22023';
  end if;
  v_res := public.resumen_campana(p_campana);
  if to_regclass('storage.objects') is not null then
    execute 'select coalesce(array_agg(name order by name), ''{}'') from storage.objects where bucket_id = ''fotos'' and name like $1'
      into v_rutas using p_campana::text || '/%';
  end if;
  perform set_config('cc.eliminando', p_campana::text, true);
  -- En orden: primero lo que depende de trabajadores, dueños y máquinas (relaciones protegidas)
  delete from public.partes_maquinas where campana_id = p_campana;
  delete from public.partes_filas where campana_id = p_campana;
  delete from public.partes where campana_id = p_campana;
  delete from public.pagos where campana_id = p_campana;
  delete from public.fotos where campana_id = p_campana;
  delete from public.documentos where campana_id = p_campana;
  delete from public.asignaciones_equipo where campana_id = p_campana;
  delete from public.duenos_trabajadores where campana_id = p_campana;
  delete from public.miembros where campana_id = p_campana;
  delete from public.campanas where id = p_campana;     -- el resto, en cascada (personas, máquinas, modelos, precios…)
  perform set_config('cc.eliminando', '', true);
  insert into public.auditoria (campana_id, user_id, tabla, fila_id, accion, antes, despues)
  values (p_campana, auth.uid(), 'campanas', p_campana::text, 'eliminar_campana', v_res || jsonb_build_object('archivos_storage', coalesce(array_length(v_rutas, 1), 0)), null);
  return v_rutas;
end $$;

-- 4. mis_campanas con el estado (activa / archivada)
drop function public.mis_campanas();
create function public.mis_campanas() returns table (campana_id uuid, nombre text, anio int, roles public.rol_campana[], superadmin boolean, activa boolean)
language sql stable security definer set search_path = '' as $$
  select k.id, k.nombre, k.anio,
         coalesce(array_agg(m.rol order by m.rol) filter (where m.rol is not null), '{}'),
         cc_priv.es_superadmin(), k.activa
  from public.campanas k
  left join public.miembros m on m.campana_id = k.id and m.user_id = (select auth.uid()) and m.activo
  where exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo)
    and (cc_priv.es_superadmin() or m.user_id is not null)
  group by k.id, k.nombre, k.anio, k.activa
  order by k.activa desc, k.anio desc nulls last, k.nombre
$$;

revoke all on function public.mis_campanas(), public.resumen_campana(uuid), public.eliminar_campana(uuid, text) from public, anon;
grant execute on function public.mis_campanas(), public.resumen_campana(uuid), public.eliminar_campana(uuid, text) to authenticated;
revoke all on function cc_priv.campana_abierta(), cc_priv.campana_archivada() from public, anon, authenticated;
