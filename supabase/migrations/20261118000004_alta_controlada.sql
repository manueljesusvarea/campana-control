-- =====================================================================
-- CAMPAÑA CONTROL 3.0 · Alta controlada (18-11-2026)
-- Solo se puede crear una cuenta con un código de invitación válido. Todo se comprueba en el servidor:
--
-- 1. public.hook_alta_con_codigo(event): hook «Before User Created» de Supabase Auth
--    (panel → Authentication → Hooks). Rechaza el alta con un mensaje claro (403) si falta el código o
--    no es válido. No consume el código. Incluido en el plan Free.
-- 2. cc_priv.nuevo_perfil() (disparador al_registrarse de auth.users): en la MISMA transacción en la que se
--    crea la cuenta vuelve a comprobar el código, lo consume y da el acceso (campaña y rol, o permiso de
--    creador). Si falla, la cuenta no se crea. Así, aunque el hook no estuviera activado, o dos personas
--    usaran el mismo código a la vez, nadie obtiene una cuenta sin un código válido y sin usar.
-- 3. Autorizaciones de creador: códigos de un solo uso que solo emite el superadministrador
--    (public.crear_autorizacion_creador). Para el primer superadministrador, el propietario del proyecto
--    ejecuta en el editor SQL:  select cc_priv.emitir_autorizacion_creador(7, null);
--    crea su cuenta en la app con ese código y después se designa superadministrador por uuid.
-- Las cuentas creadas antes de esta migración no cambian.
-- =====================================================================

-- Huella de un código: admite minúsculas, espacios o sin guiones («abcd efgh…» = «ABCD-EFGH-…»)
create function cc_priv.huella_codigo(p text) returns bytea language sql immutable set search_path = '' as $$
  select sha256(convert_to(case when length(x) = 16 then substr(x, 1, 4) || '-' || substr(x, 5, 4) || '-' || substr(x, 9, 4) || '-' || substr(x, 13, 4) else x end, 'UTF8'))
  from (select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')) as x) s
$$;

-- 16 caracteres hexadecimales aleatorios (64 bits) en 4 grupos, igual que las invitaciones existentes
create function cc_priv.nuevo_codigo() returns text language sql volatile set search_path = '' as $$
  select upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4) || '-' || substr(h, 13, 4))
  from (select substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) as h) s
$$;

create table public.autorizaciones_creador (
  id uuid primary key default gen_random_uuid(),
  codigo_hash bytea not null unique,                       -- solo la huella SHA-256; el código no se guarda
  caduca_en timestamptz not null,
  creada_por uuid references public.perfiles (id) on delete set null,   -- null = propietario (editor SQL)
  creada_en timestamptz not null default now(),
  usada_por uuid references public.perfiles (id) on delete set null,
  usada_en timestamptz,
  revocada boolean not null default false
);
alter table public.autorizaciones_creador enable row level security;
alter table public.autorizaciones_creador force row level security;
create policy autorizaciones_creador_leer on public.autorizaciones_creador for select to authenticated using (cc_priv.es_superadmin());
create policy autorizaciones_creador_revocar on public.autorizaciones_creador for update to authenticated
  using (cc_priv.es_superadmin()) with check (cc_priv.es_superadmin());
revoke all on public.autorizaciones_creador from public, anon, authenticated;
grant select, update (revocada) on public.autorizaciones_creador to authenticated;

-- ¿Qué tipo de código es? 'campana', 'creador' o null si no vale (no existe, usado, anulado o caducado)
create function cc_priv.tipo_codigo(p_codigo text) returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.invitaciones i where i.codigo_hash = cc_priv.huella_codigo(p_codigo)
                 and not i.revocada and i.usada_por is null and i.caduca_en > now()) then 'campana'
    when exists (select 1 from public.autorizaciones_creador a where a.codigo_hash = cc_priv.huella_codigo(p_codigo)
                 and not a.revocada and a.usada_por is null and a.caduca_en > now()) then 'creador'
  end
$$;

-- Consume el código y da el acceso que indica. Devuelve la campaña (o null si era de creador).
create function cc_priv.aplicar_codigo(p_user uuid, p_codigo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.invitaciones; a public.autorizaciones_creador; h bytea := cc_priv.huella_codigo(p_codigo);
begin
  select * into v from public.invitaciones where codigo_hash = h for update;      -- bloquea: un solo uso aunque lleguen dos a la vez
  if found then
    if v.revocada or v.usada_por is not null or v.caduca_en < now() then
      raise exception 'INVITACION: el código no es válido, ya se usó o ha caducado' using errcode = '22023';
    end if;
    insert into public.miembros (campana_id, user_id, rol, trabajador_id, dueno_id, creado_por)
    values (v.campana_id, p_user, v.rol, v.trabajador_id, v.dueno_id, v.creada_por)
    on conflict (campana_id, user_id, rol) do update set activo = true, trabajador_id = excluded.trabajador_id, dueno_id = excluded.dueno_id;
    update public.invitaciones set usada_por = p_user, usada_en = now() where id = v.id;
    return v.campana_id;
  end if;
  select * into a from public.autorizaciones_creador where codigo_hash = h for update;
  if found and not a.revocada and a.usada_por is null and a.caduca_en >= now() then
    update public.perfiles set puede_crear_campanas = true where id = p_user;
    update public.autorizaciones_creador set usada_por = p_user, usada_en = now() where id = a.id;
    return null;
  end if;
  raise exception 'INVITACION: el código no es válido, ya se usó o ha caducado' using errcode = '22023';
end $$;

-- Solo el propietario (editor SQL) o crear_autorizacion_creador (superadministrador) emiten estos códigos
create function cc_priv.emitir_autorizacion_creador(p_dias int, p_por uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_codigo text := cc_priv.nuevo_codigo();
begin
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'La autorización debe caducar entre 1 y 30 días'; end if;
  insert into public.autorizaciones_creador (codigo_hash, caduca_en, creada_por)
  values (cc_priv.huella_codigo(v_codigo), now() + make_interval(days => p_dias), p_por);
  return v_codigo;
end $$;

create function public.crear_autorizacion_creador(p_dias int default 7) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not cc_priv.es_superadmin() then
    raise exception 'PERMISO: solo el superadministrador autoriza nuevos creadores' using errcode = '42501';
  end if;
  return cc_priv.emitir_autorizacion_creador(p_dias, auth.uid());
end $$;

-- Una cuenta que ya existe se une a otra campaña (o recibe permiso de creador) con un código nuevo
create or replace function public.canjear_invitacion(p_codigo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_yo uuid := auth.uid();
begin
  if v_yo is null or not exists (select 1 from public.perfiles where id = v_yo and activo) then
    raise exception 'PERMISO: inicia sesión con una cuenta activa' using errcode = '42501';
  end if;
  return cc_priv.aplicar_codigo(v_yo, p_codigo);
end $$;

-- Alta de cuenta: perfil + código obligatorio, todo en la misma transacción que crea la cuenta
create or replace function cc_priv.nuevo_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_codigo text := nullif(trim(new.raw_user_meta_data ->> 'codigo_invitacion'), '');
begin
  insert into public.perfiles (id, nombre) values (new.id, left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 120));
  if v_codigo is null then
    raise exception 'ALTA: para crear una cuenta necesitas un código de invitación' using errcode = '42501';
  end if;
  perform cc_priv.aplicar_codigo(new.id, v_codigo);
  -- El código ya está gastado: no se deja guardado en los datos de la cuenta
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'codigo_invitacion' where id = new.id;
  return new;
end $$;

-- Hook «Before User Created»: mensaje claro antes de intentar crear la cuenta (no consume el código)
create function public.hook_alta_con_codigo(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_codigo text := nullif(trim(event -> 'user' -> 'user_metadata' ->> 'codigo_invitacion'), '');
begin
  if v_codigo is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'ALTA: para crear una cuenta necesitas un código de invitación'));
  end if;
  if cc_priv.tipo_codigo(v_codigo) is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'ALTA: el código no es válido, ya se usó o ha caducado'));
  end if;
  return '{}'::jsonb;
end $$;

-- Proteger perfil: la comprobación es para peticiones de usuarios (rol authenticated). Las funciones del
-- servidor (security definer, como aplicar_codigo) sí pueden dar el permiso de creador tras un código válido.
create or replace function cc_priv.proteger_perfil() returns trigger language plpgsql as $$
begin
  if current_user::text = 'authenticated' and not cc_priv.es_superadmin()
     and (new.activo is distinct from old.activo or new.puede_crear_campanas is distinct from old.puede_crear_campanas or new.id is distinct from old.id) then
    raise exception 'PERMISO: solo el superadministrador cambia el estado o los permisos de una cuenta' using errcode = '42501';
  end if;
  return new;
end $$;

-- Permisos de las funciones nuevas (Supabase da EXECUTE a anon y authenticated por defecto: se quita)
revoke all on function cc_priv.huella_codigo(text), cc_priv.nuevo_codigo(), cc_priv.tipo_codigo(text),
  cc_priv.aplicar_codigo(uuid, text), cc_priv.emitir_autorizacion_creador(int, uuid), cc_priv.nuevo_perfil()
  from public, anon, authenticated;
revoke all on function public.crear_autorizacion_creador(int), public.canjear_invitacion(text) from public, anon;
grant execute on function public.crear_autorizacion_creador(int), public.canjear_invitacion(text) to authenticated;
revoke all on function public.hook_alta_con_codigo(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_alta_con_codigo(jsonb) to supabase_auth_admin;
