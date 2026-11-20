-- CAMPAÑA CONTROL 3.0 · 000015: cuenta técnica de copias de SOLO LECTURA («respaldo»)
--
-- Por qué: las copias automáticas (GitHub Actions) necesitan leer todas las campañas y sus fotos. Hasta ahora eso
-- solo lo podía hacer un superadministrador, que además puede cambiarlo todo. Guardar su contraseña en GitHub da
-- demasiado poder a quien la obtenga. Esta cuenta técnica solo puede LEER lo necesario para las copias:
--   · no es superadministrador, ni creador, ni miembro de ninguna campaña: la RLS no le deja leer ni escribir
--     ninguna tabla directamente;
--   · solo puede usar funciones de lectura concretas (lista de campañas, huella, copia sellada, lista de fotos) y
--     leer los archivos del bucket «fotos» (migración 000016);
--   · la base de datos impide convertirla en superadministrador, miembro o creador, aunque alguien lo intente;
--   · se crea solo con una autorización del propietario en el editor SQL (cc_priv.autorizar_alta_respaldo), igual
--     que el primer superadministrador; su contraseña la pone el dueño en el panel y no hay que cambiarla.
-- No borra ni modifica datos. Redefine exportar_campana y copia_campana con el mismo contenido y una condición más.

create table cc_priv.cuentas_respaldo (
  user_id uuid primary key references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table cc_priv.cuentas_respaldo enable row level security;
revoke all on table cc_priv.cuentas_respaldo from public, anon, authenticated;

create function cc_priv.es_respaldo() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from cc_priv.cuentas_respaldo r join public.perfiles p on p.id = r.user_id
                 where r.user_id = (select auth.uid()) and p.activo and not p.bloqueado
                   and not exists (select 1 from public.superadmin s where s.user_id = r.user_id))
$$;

-- Alta: nuevo tipo «respaldo» (solo lo crea el propietario)
alter table public.altas_pendientes drop constraint altas_pendientes_tipo_check;
alter table public.altas_pendientes add constraint altas_pendientes_tipo_check check (tipo in ('superadmin', 'creador', 'miembro', 'respaldo'));

create function cc_priv.autorizar_alta_respaldo(p_usuario text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_usuario text := lower(trim(p_usuario));
begin
  delete from public.altas_pendientes where usuario = v_usuario and usada_en is null;
  insert into public.altas_pendientes (usuario, nombre, tipo) values (v_usuario, 'Copias automáticas (solo lectura)', 'respaldo');
  return cc_priv.email_interno(v_usuario);
end $$;
revoke all on function cc_priv.autorizar_alta_respaldo(text) from public, anon, authenticated;

create or replace function cc_priv.nuevo_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.altas_pendientes;
begin
  select * into a from public.altas_pendientes
  where cc_priv.email_interno(usuario) = lower(new.email) and usada_en is null and caduca_en > now()
  order by creada_en desc limit 1 for update;
  if not found then
    raise exception 'ALTA: las cuentas solo se crean desde «Gestión de usuarios»' using errcode = '42501';
  end if;
  insert into public.perfiles (id, nombre, usuario, activo, correo_confirmado, debe_cambiar_clave, creado_por)
  values (new.id, a.nombre, a.usuario, a.tipo in ('superadmin', 'respaldo'), true, a.tipo not in ('superadmin', 'respaldo'), a.creado_por);
  if a.tipo = 'superadmin' then
    insert into public.superadmin (user_id) values (new.id) on conflict (unico) do update set user_id = excluded.user_id;
  elsif a.tipo = 'respaldo' then
    insert into cc_priv.cuentas_respaldo (user_id) values (new.id);
  elsif a.tipo = 'creador' then
    update public.perfiles set puede_crear_campanas = true where id = new.id;
  else
    insert into public.miembros (campana_id, user_id, rol, trabajador_id, dueno_id, puede_editar, creado_por)
    values (a.campana_id, new.id, a.rol, a.trabajador_id, a.dueno_id, a.puede_editar, a.creado_por);
  end if;
  update public.altas_pendientes set usada_en = now(), user_id = new.id where id = a.id;
  return new;
end $$;

-- Nunca más que lectura: ni superadministrador, ni miembro, ni creador
create function cc_priv.respaldo_sin_permisos() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_u uuid;
begin
  if tg_table_name = 'perfiles' then
    if not new.puede_crear_campanas then return new; end if;
    v_u := new.id;
  else
    v_u := new.user_id;
  end if;
  if exists (select 1 from cc_priv.cuentas_respaldo r where r.user_id = v_u) then
    raise exception 'PERMISO: la cuenta de copias es de solo lectura y no puede recibir permisos' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger respaldo_sin_permisos before insert or update on public.superadmin for each row execute function cc_priv.respaldo_sin_permisos();
create trigger respaldo_sin_permisos before insert or update on public.miembros for each row execute function cc_priv.respaldo_sin_permisos();
create trigger respaldo_sin_permisos before update on public.perfiles for each row execute function cc_priv.respaldo_sin_permisos();

-- Funciones de lectura para las copias (solo la cuenta de copias)
create function public.respaldo_campanas() returns table (campana_id uuid, nombre text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.es_respaldo() then raise exception 'PERMISO: solo la cuenta de copias' using errcode = '42501'; end if;
  return query select k.id, k.nombre from public.campanas k order by k.creado_en;
end $$;
create function public.respaldo_huella(p_campana uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.es_respaldo() then raise exception 'PERMISO: solo la cuenta de copias' using errcode = '42501'; end if;
  return public.huella_campana(p_campana);
end $$;
create function public.respaldo_fotos() returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.es_respaldo() then raise exception 'PERMISO: solo la cuenta de copias' using errcode = '42501'; end if;
  return query select f.ruta from public.fotos f order by f.ruta;
end $$;

create or replace function public.exportar_campana(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (cc_priv.gestiona(p_campana) or cc_priv.es_respaldo()) then raise exception 'PERMISO: solo quien gestiona la campaña puede exportarla' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'campana', (select jsonb_build_object('nombre', k.nombre, 'anio', k.anio, 'inicio', k.inicio, 'horas_dia', k.horas_dia, 'precio_hora_trab_cent', e.precio_hora_trab_cent,
                       'precio_hora_dueno_cent', e.precio_hora_dueno_cent, 'iva', e.iva)
                from public.campanas k join public.campanas_economia e on e.campana_id = k.id where k.id = p_campana),
    'empresa', (select empresa from public.campanas where id = p_campana),
    'trabajadores', (select coalesce(jsonb_agg(jsonb_build_object('o', t.id, 'nombre', t.nombre, 'precio_hora_cent', t.precio_hora_cent, 'activo', t.activo,
                            'nif', v.nif, 'nss', v.nss, 'telefono', v.telefono) order by t.nombre), '[]')
                     from public.trabajadores t left join public.trabajadores_privado v on v.trabajador_id = t.id where t.campana_id = p_campana),
    'duenos', (select coalesce(jsonb_agg(jsonb_build_object('o', d.id, 'nombre', d.nombre, 'finca', d.finca, 'municipio', d.municipio, 'num', d.num,
                      'precio_hora_cent', d.precio_hora_cent, 'kilos_total', d.kilos_total, 'nif', v.nif, 'direccion', v.direccion, 'telefono', v.telefono,
                      'poligono', v.poligono, 'parcela', v.parcela, 'notas', v.notas,
                      'trabajadores', (select coalesce(jsonb_agg(x.trabajador_id), '[]') from public.duenos_trabajadores x where x.dueno_id = d.id)) order by d.nombre), '[]')
               from public.duenos d left join public.duenos_privado v on v.dueno_id = d.id where d.campana_id = p_campana),
    'maquinas', (select coalesce(jsonb_agg(jsonb_build_object('o', q.id, 'nombre', q.nombre, 'precio_cent', q.precio_cent, 'unidad', q.unidad, 'activa', q.activa) order by q.orden, q.nombre), '[]')
                 from public.maquinas q where q.campana_id = p_campana),
    'partes', (select coalesce(jsonb_agg(jsonb_build_object('o', p.id, 'dueno', p.dueno_id, 'fecha', p.fecha, 'kilos', p.kilos, 'notas', p.notas,
                      'filas', (select coalesce(jsonb_agg(jsonb_build_object('t', f.trabajador_id, 'tipo', f.tipo, 'horas', f.horas, 'nota', f.nota) order by f.trabajador_id), '[]')
                                from public.partes_filas f where f.parte_id = p.id),
                      'maquinas', (select coalesce(jsonb_agg(jsonb_build_object('m', m.maquina_id, 'cantidad', m.cantidad) order by m.maquina_id), '[]')
                                   from public.partes_maquinas m where m.parte_id = p.id)) order by p.fecha, p.dueno_id), '[]')
               from public.partes p where p.campana_id = p_campana),
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('o', g.id, 'tipo', g.tipo, 'persona', coalesce(g.trabajador_id, g.dueno_id), 'importe_cent', g.importe_cent,
                     'fecha', g.fecha, 'hora', g.hora, 'forma', g.forma, 'nota', g.nota) order by g.fecha, g.hora, g.id), '[]')
              from public.pagos g where g.campana_id = p_campana),
    'plantillas', (select coalesce(jsonb_agg(jsonb_build_object('o', l.id, 'nombre', l.nombre, 'asesoria', l.asesoria, 'titulo', l.titulo, 'cuerpo', l.cuerpo, 'campos', l.campos) order by l.nombre), '[]')
                   from public.plantillas l where l.campana_id = p_campana),
    'documentos', (select coalesce(jsonb_agg(jsonb_build_object('o', x.id, 'dueno', x.dueno_id, 'plantilla', x.plantilla_ref, 'nombre', x.nombre, 'fecha', x.fecha,
                          'desde', x.desde, 'hasta', x.hasta, 'campos', x.campos, 'trabajadores', to_jsonb(x.trabajadores)) order by x.creado_en), '[]')
                   from public.documentos x where x.campana_id = p_campana),
    'fotos', (select coalesce(jsonb_agg(jsonb_build_object('documento', f.documento_id, 'ruta', f.ruta, 'sha256', f.sha256, 'bytes', f.bytes) order by f.creado_en), '[]')
              from public.fotos f where f.campana_id = p_campana)));
end $$;


create or replace function public.copia_campana(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb;
begin
  if not (cc_priv.gestiona(p_campana) or cc_priv.es_respaldo()) then raise exception 'PERMISO: solo quien gestiona la campaña puede hacer su copia' using errcode = '42501'; end if;
  d := public.exportar_campana(p_campana) || jsonb_build_object('miembros', (
    select coalesce(jsonb_agg(jsonb_build_object('usuario', p.usuario, 'nombre', p.nombre, 'rol', m.rol, 'puede_editar', m.puede_editar,
                    'trabajador', m.trabajador_id, 'dueno', m.dueno_id) order by m.rol, p.usuario), '[]')
    from public.miembros m join public.perfiles p on p.id = m.user_id
    where m.campana_id = p_campana and m.activo and p.usuario is not null));
  d := cc_priv.normalizar(d);
  return jsonb_build_object('datos', d, 'sello', cc_priv.sellar(d),
    'emisor', left(encode(extensions.hmac(convert_to('emisor', 'UTF8'), (select clave from cc_priv.sello where id = 1), 'sha256'), 'hex'), 12));
end $$;


revoke all on function public.respaldo_campanas(), public.respaldo_huella(uuid), public.respaldo_fotos() from public, anon;
grant execute on function public.respaldo_campanas(), public.respaldo_huella(uuid), public.respaldo_fotos() to authenticated;
revoke all on function cc_priv.es_respaldo() from public, anon;
grant execute on function cc_priv.es_respaldo() to authenticated;
