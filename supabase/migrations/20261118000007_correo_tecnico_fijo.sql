-- =====================================================================
-- CAMPAÑA CONTROL 3.0 · El identificador técnico de una cuenta no se puede cambiar (18-11-2026)
-- Con cuentas privadas, el «correo» de Supabase Auth es solo usuario@usuarios.campana-control.invalid.
-- Sin confirmación de correo, una persona podría cambiar el suyo (auth.updateUser) por el de otro nombre de
-- usuario: ocuparlo antes de que se cree o confundir el inicio de sesión. Este disparador lo impide en el servidor:
-- una cuenta solo puede tener como identificador técnico el de su propio nombre de usuario.
-- =====================================================================
create function cc_priv.proteger_correo_tecnico() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_usuario text;
begin
  if new.email is not distinct from old.email then return new; end if;
  select usuario into v_usuario from public.perfiles where id = new.id;
  if lower(coalesce(old.email, '')) like '%@usuarios.campana-control.invalid' or lower(coalesce(new.email, '')) like '%@usuarios.campana-control.invalid' then
    if v_usuario is null or lower(new.email) <> cc_priv.email_interno(v_usuario) then
      raise exception 'PERMISO: el identificador de una cuenta no se puede cambiar' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_correo_tecnico before update of email on auth.users
  for each row execute function cc_priv.proteger_correo_tecnico();
revoke all on function cc_priv.proteger_correo_tecnico() from public, anon, authenticated;
