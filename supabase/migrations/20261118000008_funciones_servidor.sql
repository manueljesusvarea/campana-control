-- =====================================================================
-- CAMPAÑA CONTROL 3.0 · Funciones para la Edge Function «gestion-usuarios» (18-11-2026)
-- El rol de servidor (clave secreta) NO tiene permisos sobre las tablas (exposición automática desactivada).
-- En lugar de dárselos, la Edge Function usa solo estas dos funciones concretas, que nadie más puede llamar.
-- =====================================================================
create function public.cuenta_bloqueada_servidor(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select bloqueado from public.perfiles where id = p_user), true)
$$;
-- Si Supabase Auth no llega a crear la identidad, se descarta el alta preparada (y el nombre queda libre)
create function public.descartar_alta_servidor(p_usuario text) returns void language sql security definer set search_path = '' as $$
  delete from public.altas_pendientes where usuario = lower(trim(p_usuario)) and usada_en is null
$$;
revoke all on function public.cuenta_bloqueada_servidor(uuid), public.descartar_alta_servidor(text) from public, anon, authenticated;
grant execute on function public.cuenta_bloqueada_servidor(uuid), public.descartar_alta_servidor(text) to service_role;
