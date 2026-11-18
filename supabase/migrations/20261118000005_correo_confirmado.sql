-- =====================================================================
-- CAMPAÑA CONTROL 3.0 · Sin permisos hasta confirmar el correo (18-11-2026)
-- Una cuenta necesita DOS cosas para ver o hacer algo: un código de invitación válido (000004) y el correo
-- confirmado (código de un solo uso que envía Supabase Auth con «Confirm email» activado).
--
-- Todas las comprobaciones de permisos ya exigen perfiles.activo. Aquí:
--  · perfiles.correo_confirmado copia auth.users.email_confirmed_at (solo lo cambia el servidor).
--  · Una cuenta sin correo confirmado nunca está activa: aunque el código ya le haya dado su campaña y rol,
--    no ve ni hace nada hasta confirmar. Al confirmar, se activa sola (salvo que el superadministrador la
--    haya bloqueado: el bloqueo se recuerda en perfiles.bloqueado).
--  · Con «Confirm email» desactivado (solo proyecto de pruebas), Supabase confirma al crear la cuenta.
-- =====================================================================

alter table public.perfiles
  add column correo_confirmado boolean not null default false,
  add column bloqueado boolean not null default false;      -- lo decide el superadministrador (activo = false)

-- Cuentas que ya existían: se copia el estado real del correo
update public.perfiles p set correo_confirmado = (u.email_confirmed_at is not null) from auth.users u where u.id = p.id;
update public.perfiles set bloqueado = true where not activo and correo_confirmado;
update public.perfiles set activo = false where not correo_confirmado;

-- Reglas al cambiar un perfil:
--  · Los usuarios no cambian estado, permisos, correo confirmado ni bloqueo (activo, permisos y bloqueo solo
--    el superadministrador; correo_confirmado solo el servidor, cuando Supabase Auth confirma el correo).
--  · Si el superadministrador activa o bloquea una cuenta, se recuerda como bloqueo.
--  · Nunca activa sin correo confirmado.
create or replace function cc_priv.proteger_perfil() returns trigger language plpgsql as $$
begin
  if current_user::text = 'authenticated' then
    if not cc_priv.es_superadmin()
       and (new.activo is distinct from old.activo or new.puede_crear_campanas is distinct from old.puede_crear_campanas or new.id is distinct from old.id) then
      raise exception 'PERMISO: solo el superadministrador cambia el estado o los permisos de una cuenta' using errcode = '42501';
    end if;
    if not cc_priv.es_superadmin() and new.bloqueado is distinct from old.bloqueado then
      raise exception 'PERMISO: solo el superadministrador bloquea cuentas' using errcode = '42501';
    end if;
    if new.correo_confirmado is distinct from old.correo_confirmado then
      raise exception 'PERMISO: la confirmación del correo solo la registra Supabase Auth' using errcode = '42501';
    end if;
    -- Activar/desactivar o bloquear/desbloquear son la misma decisión del superadministrador
    if new.activo is distinct from old.activo then new.bloqueado := not new.activo;
    elsif new.bloqueado is distinct from old.bloqueado then new.activo := not new.bloqueado; end if;
  end if;
  if new.activo and not new.correo_confirmado then new.activo := false; end if;
  return new;
end $$;

-- Alta: perfil (inactivo si el correo aún no está confirmado) + código obligatorio (000004)
create or replace function cc_priv.nuevo_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_codigo text := nullif(trim(new.raw_user_meta_data ->> 'codigo_invitacion'), '');
        v_ok boolean := new.email_confirmed_at is not null;
begin
  insert into public.perfiles (id, nombre, activo, correo_confirmado)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 120), v_ok, v_ok);
  if v_codigo is null then
    raise exception 'ALTA: para crear una cuenta necesitas un código de invitación' using errcode = '42501';
  end if;
  perform cc_priv.aplicar_codigo(new.id, v_codigo);
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'codigo_invitacion' where id = new.id;
  return new;
end $$;

-- Cuando Supabase Auth confirma el correo (código de 6 cifras o confirmación automática), la cuenta se activa
create function cc_priv.correo_confirmado() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.perfiles set correo_confirmado = (new.email_confirmed_at is not null),
                             activo = (new.email_confirmed_at is not null) and not bloqueado
  where id = new.id;
  return new;
end $$;
create trigger al_confirmar_correo after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function cc_priv.correo_confirmado();

-- Ver tu propia fila de miembro (campaña y rol) también exige cuenta activa (correo confirmado y sin bloqueo)
create function cc_priv.cuenta_activa() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = (select auth.uid()) and activo)
$$;
alter policy miembros_leer on public.miembros using ((user_id = (select auth.uid()) and cc_priv.cuenta_activa()) or cc_priv.consulta(campana_id));
revoke all on function cc_priv.cuenta_activa() from public, anon;
grant execute on function cc_priv.cuenta_activa() to authenticated;

revoke all on function cc_priv.correo_confirmado(), cc_priv.nuevo_perfil(), cc_priv.proteger_perfil() from public, anon, authenticated;
