-- CAMPAÑA CONTROL 3.0 · 000014: copias de campaña con sello de autenticidad y cuentas autorizadas
--
-- Una huella SHA-256 detecta un archivo dañado, pero NO una manipulación intencionada: quien cambia los datos puede
-- recalcular la huella. Por eso cada copia lleva además un SELLO: HMAC-SHA256 de los datos con una clave secreta que
-- solo está en esta base de datos (cc_priv.sello, fuera de la API; ningún usuario puede leerla). Solo este proyecto
-- puede sellar una copia y comprobar el sello. Una copia de otro proyecto (p. ej., de pruebas a producción) no se
-- puede comprobar: la app lo dice y pide confirmación expresa.
--
-- copia_campana(campaña) → { datos, sello, emisor }. Solo quien gestiona la campaña. «datos» = lo de exportar_campana
--   más las cuentas autorizadas (nombre de usuario, nombre, rol, edición y ficha; nunca contraseñas ni ids de cuenta).
--   Los números se normalizan (sin ceros sobrantes) para que el sello no dependa de cómo se escriba el archivo.
-- verificar_sello(datos, sello) → true/false. Cualquier usuario con sesión; no revela la clave.
-- restaurar_miembros(campaña, miembros) → vuelve a dar acceso a las cuentas de la copia que existan en este proyecto,
--   con su rol y su ficha. Solo el superadministrador (es quien puede dar de alta miembros). No crea cuentas.
-- No borra ni modifica datos existentes (exportar_campana sigue igual).

create extension if not exists pgcrypto with schema extensions;

create table cc_priv.sello (id int primary key check (id = 1), clave bytea not null, creado_en timestamptz not null default now());
insert into cc_priv.sello (id, clave) values (1, extensions.gen_random_bytes(32)) on conflict (id) do nothing;
revoke all on table cc_priv.sello from public, anon, authenticated;
alter table cc_priv.sello enable row level security;   -- sin políticas: nadie la lee por la API (solo las funciones del propietario)

-- Números a su forma mínima (7.50 → 7.5, 2350.0 → 2350), igual que JSON.parse/JSON.stringify en el navegador
create function cc_priv.normalizar(j jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare r jsonb;
begin
  case jsonb_typeof(j)
    when 'object' then select coalesce(jsonb_object_agg(k, cc_priv.normalizar(v)), '{}'::jsonb) into r from jsonb_each(j) as e(k, v); return r;
    when 'array' then select coalesce(jsonb_agg(cc_priv.normalizar(v) order by n), '[]'::jsonb) into r from jsonb_array_elements(j) with ordinality as e(v, n); return r;
    when 'number' then return to_jsonb((j #>> '{}')::float8);
    else return j;
  end case;
end $$;

create function cc_priv.sellar(d jsonb) returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(cc_priv.normalizar(d)::text, 'UTF8'), (select clave from cc_priv.sello where id = 1), 'sha256'), 'hex')
$$;

create function public.copia_campana(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb;
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña puede hacer su copia' using errcode = '42501'; end if;
  d := public.exportar_campana(p_campana) || jsonb_build_object('miembros', (
    select coalesce(jsonb_agg(jsonb_build_object('usuario', p.usuario, 'nombre', p.nombre, 'rol', m.rol, 'puede_editar', m.puede_editar,
                    'trabajador', m.trabajador_id, 'dueno', m.dueno_id) order by m.rol, p.usuario), '[]')
    from public.miembros m join public.perfiles p on p.id = m.user_id
    where m.campana_id = p_campana and m.activo and p.usuario is not null));
  d := cc_priv.normalizar(d);
  return jsonb_build_object('datos', d, 'sello', cc_priv.sellar(d),
    'emisor', left(encode(extensions.hmac(convert_to('emisor', 'UTF8'), (select clave from cc_priv.sello where id = 1), 'sha256'), 'hex'), 12));
end $$;

create function public.verificar_sello(p_datos jsonb, p_sello text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_sello is not null and cc_priv.sellar(p_datos) = lower(p_sello)
$$;

create function public.restaurar_miembros(p_campana uuid, p_miembros jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x jsonb; v_u uuid; v_t uuid; v_d uuid; n_ok int := 0; n_ya int := 0; n_no int := 0; n_sin int := 0; v_rol public.rol_campana;
begin
  if not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador puede volver a dar acceso a cuentas' using errcode = '42501'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_miembros, '[]')) loop
    select id into v_u from public.perfiles where usuario = lower(x ->> 'usuario');
    if v_u is null then n_no := n_no + 1; continue; end if;
    v_rol := (x ->> 'rol')::public.rol_campana; v_t := null; v_d := null;
    if v_rol = 'trabajador' then select id into v_t from public.trabajadores where campana_id = p_campana and origen_id = x ->> 'trabajador'; end if;
    if v_rol = 'dueno' then select id into v_d from public.duenos where campana_id = p_campana and origen_id = x ->> 'dueno'; end if;
    if (v_rol = 'trabajador' and v_t is null) or (v_rol = 'dueno' and v_d is null) then n_sin := n_sin + 1; continue; end if;
    if exists (select 1 from public.miembros where campana_id = p_campana and user_id = v_u and rol = v_rol) then n_ya := n_ya + 1; continue; end if;
    insert into public.miembros (campana_id, user_id, rol, trabajador_id, dueno_id, puede_editar, creado_por)
    values (p_campana, v_u, v_rol, v_t, v_d, coalesce((x ->> 'puede_editar')::boolean, false) and v_rol = 'admin', auth.uid());
    n_ok := n_ok + 1;
  end loop;
  return jsonb_build_object('vinculadas', n_ok, 'ya', n_ya, 'no_existen', n_no, 'sin_ficha', n_sin);
end $$;

revoke all on function cc_priv.normalizar(jsonb), cc_priv.sellar(jsonb) from public, anon, authenticated;
revoke all on function public.copia_campana(uuid), public.verificar_sello(jsonb, text), public.restaurar_miembros(uuid, jsonb) from public, anon;
grant execute on function public.copia_campana(uuid), public.verificar_sello(jsonb, text), public.restaurar_miembros(uuid, jsonb) to authenticated;
