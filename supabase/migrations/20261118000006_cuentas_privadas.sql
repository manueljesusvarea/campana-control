-- =====================================================================
-- CAMPAÑA CONTROL 3.0 · Cuentas privadas con nombre de usuario y contraseña (18-11-2026)
-- Sustituye el alta por invitación (000004) y la confirmación del correo (000005), sin borrar datos ni cuentas.
--
-- · No hay registro público ni correo. Las cuentas las crean el superadministrador (cuentas de creador) y los
--   creadores (personas de sus campañas) desde «Gestión de usuarios».
-- · Cómo se crea una cuenta: la Edge Function «gestion-usuarios» llama a public.preparar_alta() CON LA SESIÓN DE
--   QUIEN CREA (aquí se comprueban sus permisos) y después crea la identidad en Supabase Auth con la clave secreta,
--   que solo existe en el servidor. El disparador al_registrarse exige esa alta autorizada y reciente: sin ella,
--   ninguna vía (API pública, panel, inserción directa) crea una cuenta.
-- · Supabase Auth necesita un correo como identificador técnico: se usa «usuario@usuarios.campana-control.invalid».
--   El dominio .invalid está reservado (RFC 2606) y no puede recibir correo. No sirve de prueba de identidad ni
--   para autorizar nada: los permisos salen de perfiles, miembros y superadmin.
-- · Contraseña temporal: la cuenta no está habilitada (activo = false) hasta que la persona pone la suya.
-- · Cuenta habilitada = creada por alta autorizada + identidad en Auth + no bloqueada + contraseña propia.
-- · Administradores de campaña: de lectura o con edición de jornadas y cuentas (miembros.puede_editar).
-- =====================================================================

-- ---------- Perfiles y miembros ----------
alter table public.perfiles
  add column usuario text,
  add column debe_cambiar_clave boolean not null default false,
  add column creado_por uuid references public.perfiles (id) on delete set null,
  add constraint perfiles_usuario_formato check (usuario is null or usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
create unique index perfiles_usuario_unico on public.perfiles (usuario) where usuario is not null;

alter table public.miembros
  add column puede_editar boolean not null default false,
  add constraint miembros_editar_solo_admin check (not puede_editar or rol = 'admin');

create function cc_priv.email_interno(p_usuario text) returns text language sql immutable set search_path = '' as $$
  select lower(p_usuario) || '@usuarios.campana-control.invalid'
$$;

-- ---------- Altas autorizadas (pendientes de crear la identidad en Auth; caducan a los 10 minutos) ----------
create table public.altas_pendientes (
  id uuid primary key default gen_random_uuid(),
  usuario text not null check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  nombre text not null check (length(nombre) between 1 and 120),
  tipo text not null check (tipo in ('superadmin', 'creador', 'miembro')),
  campana_id uuid references public.campanas (id) on delete cascade,
  rol public.rol_campana,
  trabajador_id uuid,
  dueno_id uuid,
  puede_editar boolean not null default false,
  creado_por uuid references public.perfiles (id) on delete set null,
  creada_en timestamptz not null default now(),
  caduca_en timestamptz not null default now() + interval '10 minutes',
  usada_en timestamptz,
  user_id uuid,
  check ((tipo = 'miembro') = (campana_id is not null and rol is not null))
);
create unique index altas_pendientes_usuario on public.altas_pendientes (usuario) where usada_en is null;
alter table public.altas_pendientes enable row level security;
alter table public.altas_pendientes force row level security;     -- sin políticas: solo las funciones del servidor
revoke all on public.altas_pendientes from public, anon, authenticated;

-- ---------- Funciones de permisos ----------
-- edita: puede cambiar jornadas (partes) y cuentas (pagos): quien gestiona o un administrador con edición
create function cc_priv.edita(c uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select cc_priv.gestiona(c) or exists (
    select 1 from public.miembros m join public.perfiles p on p.id = m.user_id
    where m.campana_id = c and m.user_id = (select auth.uid()) and m.activo and p.activo and m.rol = 'admin' and m.puede_editar)
$$;
-- gestiona_usuario: quien llama puede restablecer, bloquear o ver a esa persona. Superadministrador: a todos.
-- Un creador: a quien no tiene permisos globales y solo pertenece a campañas que él gestiona (o creó él y aún no
-- tiene campaña). Así nadie toca cuentas que también usan campañas de otro creador.
create function cc_priv.gestiona_usuario(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select cc_priv.es_superadmin() or (
    u <> (select auth.uid())
    and exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo)
    and not exists (select 1 from public.superadmin s where s.user_id = u)
    and not exists (select 1 from public.perfiles p where p.id = u and p.puede_crear_campanas)
    and not exists (select 1 from public.miembros m where m.user_id = u and (m.rol = 'creador' or not cc_priv.gestiona(m.campana_id)))
    and (exists (select 1 from public.miembros m where m.user_id = u)
         or exists (select 1 from public.perfiles p where p.id = u and p.creado_por = (select auth.uid()))))
$$;

-- ---------- Alta autorizada ----------
create function public.preparar_alta(p_usuario text, p_nombre text, p_tipo text, p_campana uuid default null, p_rol public.rol_campana default null,
  p_trabajador uuid default null, p_dueno uuid default null, p_editor boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_usuario text := lower(trim(coalesce(p_usuario, ''))); v_nombre text := trim(coalesce(p_nombre, ''));
begin
  if not exists (select 1 from public.perfiles where id = (select auth.uid()) and activo) then
    raise exception 'PERMISO: inicia sesión con una cuenta activa' using errcode = '42501';
  end if;
  if v_usuario !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'USUARIO: de 3 a 30 caracteres: letras sin tilde, números, punto, guion o guion bajo' using errcode = '22023';
  end if;
  if length(v_nombre) not between 1 and 120 then raise exception 'USUARIO: escribe el nombre de la persona' using errcode = '22023'; end if;
  delete from public.altas_pendientes where usuario = v_usuario and usada_en is null and caduca_en <= now();
  if exists (select 1 from public.perfiles where usuario = v_usuario) or exists (select 1 from public.altas_pendientes where usuario = v_usuario and usada_en is null) then
    raise exception 'USUARIO: ese nombre de usuario ya existe' using errcode = '23505';
  end if;
  if p_tipo = 'creador' then
    if not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador crea cuentas de creador' using errcode = '42501'; end if;
    insert into public.altas_pendientes (usuario, nombre, tipo, creado_por) values (v_usuario, v_nombre, 'creador', auth.uid());
  elsif p_tipo = 'miembro' then
    if p_campana is null or p_rol is null then raise exception 'USUARIO: elige la campaña y el rol' using errcode = '22023'; end if;
    if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: no gestionas esa campaña' using errcode = '42501'; end if;
    if p_rol = 'creador' and not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador da el rol de creador' using errcode = '42501'; end if;
    if coalesce(p_editor, false) and p_rol <> 'admin' then raise exception 'USUARIO: la edición solo se da a administradores' using errcode = '22023'; end if;
    if (p_rol = 'trabajador') <> (p_trabajador is not null) or (p_rol = 'dueno') <> (p_dueno is not null) then
      raise exception 'USUARIO: un trabajador o un dueño necesita su ficha (y los demás roles no llevan ficha)' using errcode = '22023';
    end if;
    if p_trabajador is not null and not exists (select 1 from public.trabajadores where id = p_trabajador and campana_id = p_campana) then
      raise exception 'USUARIO: esa ficha de trabajador no es de esta campaña' using errcode = '22023'; end if;
    if p_dueno is not null and not exists (select 1 from public.duenos where id = p_dueno and campana_id = p_campana) then
      raise exception 'USUARIO: esa ficha de dueño no es de esta campaña' using errcode = '22023'; end if;
    if exists (select 1 from public.miembros where campana_id = p_campana and activo and ((p_trabajador is not null and trabajador_id = p_trabajador) or (p_dueno is not null and dueno_id = p_dueno)))
       or exists (select 1 from public.altas_pendientes where usada_en is null and caduca_en > now() and campana_id = p_campana
                  and ((p_trabajador is not null and trabajador_id = p_trabajador) or (p_dueno is not null and dueno_id = p_dueno))) then
      raise exception 'USUARIO: esa ficha ya tiene una cuenta' using errcode = '23505';
    end if;
    insert into public.altas_pendientes (usuario, nombre, tipo, campana_id, rol, trabajador_id, dueno_id, puede_editar, creado_por)
    values (v_usuario, v_nombre, 'miembro', p_campana, p_rol, p_trabajador, p_dueno, coalesce(p_editor, false), auth.uid());
  else
    raise exception 'USUARIO: tipo de cuenta no válido' using errcode = '22023';
  end if;
  return cc_priv.email_interno(v_usuario);
end $$;

-- Primer superadministrador (solo el propietario, en el editor SQL del panel). Después: Authentication → Users →
-- Add user con ese correo técnico y una contraseña, en los 10 minutos siguientes.
create function cc_priv.autorizar_alta_propietario(p_usuario text, p_nombre text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_usuario text := lower(trim(p_usuario));
begin
  delete from public.altas_pendientes where usuario = v_usuario and usada_en is null;
  insert into public.altas_pendientes (usuario, nombre, tipo) values (v_usuario, trim(p_nombre), 'superadmin');
  return cc_priv.email_interno(v_usuario);
end $$;

-- ---------- Disparador de alta: solo con alta autorizada ----------
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
  values (new.id, a.nombre, a.usuario, a.tipo = 'superadmin', true, a.tipo <> 'superadmin', a.creado_por);
  if a.tipo = 'superadmin' then
    insert into public.superadmin (user_id) values (new.id) on conflict (unico) do update set user_id = excluded.user_id;
  elsif a.tipo = 'creador' then
    update public.perfiles set puede_crear_campanas = true where id = new.id;
  else
    insert into public.miembros (campana_id, user_id, rol, trabajador_id, dueno_id, puede_editar, creado_por)
    values (a.campana_id, new.id, a.rol, a.trabajador_id, a.dueno_id, a.puede_editar, a.creado_por);
  end if;
  update public.altas_pendientes set usada_en = now(), user_id = new.id where id = a.id;
  return new;
end $$;

-- Hook «Before User Created» (sigue activo): mismo criterio, con mensaje claro antes de intentar crear la cuenta
create or replace function public.hook_alta_con_codigo(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.altas_pendientes where cc_priv.email_interno(usuario) = lower(event -> 'user' ->> 'email')
             and usada_en is null and caduca_en > now()) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'ALTA: las cuentas solo se crean desde «Gestión de usuarios»'));
end $$;

-- ---------- Estado de la cuenta ----------
-- activo = no bloqueada y con contraseña propia (ya no depende del correo). Los usuarios no tocan su estado.
create or replace function cc_priv.proteger_perfil() returns trigger language plpgsql as $$
begin
  if current_user::text = 'authenticated' then
    if not cc_priv.es_superadmin()
       and (new.activo is distinct from old.activo or new.puede_crear_campanas is distinct from old.puede_crear_campanas
            or new.id is distinct from old.id or new.bloqueado is distinct from old.bloqueado) then
      raise exception 'PERMISO: solo el superadministrador cambia el estado o los permisos de una cuenta' using errcode = '42501';
    end if;
    if new.correo_confirmado is distinct from old.correo_confirmado or new.debe_cambiar_clave is distinct from old.debe_cambiar_clave
       or new.usuario is distinct from old.usuario or new.creado_por is distinct from old.creado_por then
      raise exception 'PERMISO: esos datos solo los cambia el servidor' using errcode = '42501';
    end if;
    if new.activo is distinct from old.activo then new.bloqueado := not new.activo; end if;
    if new.bloqueado and new.id = (select auth.uid()) then
      raise exception 'PERMISO: no puedes bloquear tu propia cuenta' using errcode = '42501';
    end if;
  end if;
  new.activo := not new.bloqueado and not new.debe_cambiar_clave;
  return new;
end $$;

-- La confirmación del correo ya no decide nada (las cuentas se crean confirmadas): solo se anota
create or replace function cc_priv.correo_confirmado() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles set correo_confirmado = (new.email_confirmed_at is not null) where id = new.id;
  return new;
end $$;

-- Cuentas que ya existían: mismo criterio (no se borra ni bloquea a nadie)
update public.perfiles set activo = not bloqueado and not debe_cambiar_clave;

-- Restablecer contraseña: marca la cuenta (sin acceso hasta poner una propia). La contraseña temporal la pone la
-- Edge Function en Supabase Auth. Devuelve el id de la cuenta.
create function public.preparar_restablecer(p_usuario text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.perfiles where usuario = lower(trim(p_usuario));
  if v is null or not cc_priv.gestiona_usuario(v) then raise exception 'PERMISO: no puedes gestionar esa cuenta' using errcode = '42501'; end if;
  update public.perfiles set debe_cambiar_clave = true where id = v;
  return v;
end $$;

-- Bloquear o desbloquear (además, la Edge Function bloquea la identidad en Supabase Auth)
create function public.preparar_bloqueo(p_usuario text, p_bloquear boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  select id into v from public.perfiles where usuario = lower(trim(p_usuario));
  if v is null or not cc_priv.gestiona_usuario(v) then raise exception 'PERMISO: no puedes gestionar esa cuenta' using errcode = '42501'; end if;
  if v = auth.uid() then raise exception 'PERMISO: no puedes bloquear tu propia cuenta' using errcode = '42501'; end if;
  update public.perfiles set bloqueado = p_bloquear where id = v;
  return v;
end $$;

-- La persona ha puesto su contraseña (solo la Edge Function, con la clave secreta, tras cambiarla en Auth)
create function public.clave_cambiada_servidor(p_user uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles set debe_cambiar_clave = false where id = p_user;
  return (select activo from public.perfiles where id = p_user);
end $$;

-- Lista de «Gestión de usuarios»: superadministrador, todas; creador, las de sus campañas y las que creó
create function public.usuarios_gestionados() returns table (id uuid, usuario text, nombre text, bloqueado boolean, debe_cambiar_clave boolean,
  puede_crear_campanas boolean, es_superadmin boolean, gestionable boolean, campanas jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.usuario, p.nombre, p.bloqueado, p.debe_cambiar_clave, p.puede_crear_campanas,
         exists (select 1 from public.superadmin s where s.user_id = p.id), cc_priv.gestiona_usuario(p.id),
         coalesce((select jsonb_agg(jsonb_build_object('miembro_id', m.id, 'campana_id', m.campana_id, 'campana', k.nombre, 'rol', m.rol,
                    'puede_editar', m.puede_editar, 'activo', m.activo) order by k.nombre)
                   from public.miembros m join public.campanas k on k.id = m.campana_id
                   where m.user_id = p.id and cc_priv.gestiona(m.campana_id)), '[]'::jsonb)
  from public.perfiles p
  where exists (select 1 from public.perfiles yo where yo.id = (select auth.uid()) and yo.activo)
    and (cc_priv.es_superadmin() or p.creado_por = (select auth.uid())
         or exists (select 1 from public.miembros m where m.user_id = p.id and cc_priv.gestiona(m.campana_id)))
  order by p.nombre
$$;

-- Mis pertenencias (para la app: saber si soy administrador con edición)
create function public.mis_permisos(p_campana uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('gestiona', cc_priv.gestiona(p_campana), 'edita', cc_priv.edita(p_campana), 'consulta', cc_priv.consulta(p_campana),
                            'debe_cambiar_clave', (select debe_cambiar_clave from public.perfiles where id = (select auth.uid())))
$$;

-- ---------- Escritura de jornadas y cuentas: también administradores con edición ----------
do $$
declare t text;
begin
  foreach t in array array['partes', 'partes_filas', 'partes_maquinas', 'pagos'] loop
    execute format('alter policy %I on public.%I with check (cc_priv.edita(campana_id))', t || '_alta', t);
    execute format('alter policy %I on public.%I using (cc_priv.edita(campana_id)) with check (cc_priv.edita(campana_id))', t || '_cambiar', t);
    execute format('alter policy %I on public.%I using (cc_priv.edita(campana_id))', t || '_borrar', t);
  end loop;
end $$;

-- ---------- Invitaciones y códigos (000004): desactivados, se conservan sus datos ----------
revoke execute on function public.crear_invitacion(uuid, public.rol_campana, uuid, uuid, int), public.canjear_invitacion(text),
  public.crear_autorizacion_creador(int) from authenticated;

-- ---------- Permisos de las funciones nuevas ----------
revoke all on function cc_priv.email_interno(text), cc_priv.autorizar_alta_propietario(text, text), cc_priv.nuevo_perfil(),
  cc_priv.proteger_perfil(), cc_priv.correo_confirmado() from public, anon, authenticated;
revoke all on function cc_priv.edita(uuid), cc_priv.gestiona_usuario(uuid) from public, anon;
grant execute on function cc_priv.edita(uuid), cc_priv.gestiona_usuario(uuid) to authenticated;
revoke all on function public.preparar_alta(text, text, text, uuid, public.rol_campana, uuid, uuid, boolean), public.preparar_restablecer(text),
  public.preparar_bloqueo(text, boolean), public.usuarios_gestionados(), public.mis_permisos(uuid) from public, anon;
grant execute on function public.preparar_alta(text, text, text, uuid, public.rol_campana, uuid, uuid, boolean), public.preparar_restablecer(text),
  public.preparar_bloqueo(text, boolean), public.usuarios_gestionados(), public.mis_permisos(uuid) to authenticated;
revoke all on function public.clave_cambiada_servidor(uuid) from public, anon, authenticated;
grant execute on function public.clave_cambiada_servidor(uuid) to service_role;
