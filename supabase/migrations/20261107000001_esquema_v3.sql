-- CAMPAÑA CONTROL 3.0 · Esquema multiusuario (Supabase / PostgreSQL)
--
-- Principios:
--  * La identidad (auth.users / perfiles) está separada de las fichas de trabajador y dueño.
--  * Toda tabla con datos de campaña lleva campana_id y claves foráneas compuestas (id, campana_id):
--    es imposible enlazar un registro con otro de una campaña distinta.
--  * Los permisos se aplican en la base de datos con RLS (lectura, alta, cambio y baja), no en la interfaz.
--  * Importes en céntimos enteros (bigint). Horas y kilos en numeric. Nada de coma flotante.
--  * Control de versiones (columna version): una edición antigua no puede pisar una más reciente.
--  * Auditoría automática de los cambios importantes, con el usuario que los hizo.
--  * Los roles de solo lectura (jefe, trabajador, dueño) consultan con funciones que devuelven solo lo suyo.

-- =====================================================================
-- Tipos
-- =====================================================================
create type public.rol_campana as enum ('creador', 'admin', 'jefe', 'trabajador', 'dueno');
create type public.tipo_dia as enum ('normal', 'mas', 'menos', 'especial', 'ausente');
create type public.tipo_pago as enum ('trabajador', 'dueno');
create type public.forma_pago as enum ('efectivo', 'transferencia', 'bizum', 'otro');

-- Esquema privado para funciones auxiliares (no se expone en la API)
create schema if not exists cc_priv;

-- =====================================================================
-- Identidad
-- =====================================================================
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '' check (length(nombre) <= 120),
  activo boolean not null default true,                    -- false = bloqueado: pierde todo acceso
  puede_crear_campanas boolean not null default false,     -- lo concede el superadministrador
  creado_en timestamptz not null default now()
);

-- Un único superadministrador. Solo se fija desde el backend (SQL del propietario), nunca desde la app:
-- esta tabla no tiene políticas de escritura.
create table public.superadmin (
  unico boolean primary key default true check (unico),
  user_id uuid not null unique references public.perfiles (id) on delete restrict
);

-- =====================================================================
-- Campañas y miembros
-- =====================================================================
create table public.campanas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 1 and 120),
  anio int check (anio between 2000 and 2100),
  inicio date,
  horas_dia numeric(5,2) not null default 7.5 check (horas_dia > 0 and horas_dia <= 24),
  hora_inicio time not null default '08:00',
  empresa jsonb not null default '{}'::jsonb,              -- nombre, NIF, dirección… de la cuadrilla
  activa boolean not null default true,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  version int not null default 1,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

-- Datos económicos de la campaña: solo los ven creador, administrador y superadministrador
create table public.campanas_economia (
  campana_id uuid primary key references public.campanas (id) on delete cascade,
  precio_hora_trab_cent int not null default 1000 check (precio_hora_trab_cent >= 0),
  precio_hora_dueno_cent int not null default 1000 check (precio_hora_dueno_cent >= 0),
  iva numeric(5,2) not null default 0 check (iva >= 0 and iva <= 100),
  version int not null default 1,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

-- Fichas (pueden existir sin cuenta; se vinculan después con una invitación)
create table public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 120),
  precio_hora_cent int check (precio_hora_cent >= 0),      -- null = el de la campaña
  activo boolean not null default true,
  origen_id text,                                          -- id en la copia 2.3.0 (evita importar dos veces)
  version int not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  unique (id, campana_id),
  unique (campana_id, origen_id)
);
create table public.trabajadores_privado (                   -- datos personales: no los ven jefes ni dueños
  trabajador_id uuid primary key,
  campana_id uuid not null,
  nif text, nss text, telefono text,
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete cascade
);

create table public.duenos (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 120),
  finca text, municipio text,
  num int,
  precio_hora_cent int check (precio_hora_cent >= 0),      -- null = el de la campaña
  kilos_total numeric(12,1),
  origen_id text,
  version int not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  unique (id, campana_id),
  unique (campana_id, origen_id)
);
create table public.duenos_privado (
  dueno_id uuid primary key,
  campana_id uuid not null,
  nif text, direccion text, telefono text, poligono text, parcela text, notas text,
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete cascade
);
create table public.duenos_trabajadores (                    -- trabajadores que salen por defecto en sus partes
  campana_id uuid not null,
  dueno_id uuid not null,
  trabajador_id uuid not null,
  primary key (dueno_id, trabajador_id),
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete cascade,
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete cascade
);

create table public.miembros (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  user_id uuid not null references public.perfiles (id) on delete cascade,
  rol public.rol_campana not null,
  trabajador_id uuid,
  dueno_id uuid,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  unique (campana_id, user_id, rol),
  check ((rol = 'trabajador') = (trabajador_id is not null)),
  check ((rol = 'dueno') = (dueno_id is not null)),
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete cascade,
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete cascade
);
-- Una ficha solo puede estar vinculada a una cuenta (sin duplicados)
create unique index miembros_un_usuario_por_trabajador on public.miembros (campana_id, trabajador_id) where rol = 'trabajador' and activo;
create unique index miembros_un_usuario_por_dueno on public.miembros (campana_id, dueno_id) where rol = 'dueno' and activo;
create index miembros_usuario on public.miembros (user_id) where activo;

-- Equipos: qué trabajadores tiene cada jefe y desde/hasta cuándo (conserva el historial)
create table public.asignaciones_equipo (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  jefe_user_id uuid not null references public.perfiles (id) on delete cascade,
  trabajador_id uuid not null,
  desde date not null,
  hasta date,
  creado_en timestamptz not null default now(),
  check (hasta is null or hasta >= desde),
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete cascade
);
create index asignaciones_jefe on public.asignaciones_equipo (jefe_user_id, trabajador_id, desde);

-- =====================================================================
-- Maquinaria, partes, pagos
-- =====================================================================
create table public.maquinas (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  nombre text not null check (length(nombre) between 1 and 80),
  precio_cent int not null default 0 check (precio_cent >= 0),
  unidad text not null default 'día' check (unidad in ('día', 'jornada', 'hora')),
  activa boolean not null default true,
  orden int not null default 0,
  origen_id text,
  version int not null default 1,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  unique (id, campana_id),
  unique (campana_id, origen_id)
);

create table public.partes (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  dueno_id uuid not null,
  fecha date not null,
  kilos numeric(12,1) check (kilos >= 0),
  notas text,
  origen_id text,
  version int not null default 1,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  unique (dueno_id, fecha),                                -- un parte por dueño y día, como en la 2.3.0
  unique (id, campana_id),
  unique (id, campana_id, fecha),
  unique (campana_id, origen_id),
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete restrict
);
create index partes_campana_fecha on public.partes (campana_id, fecha);

create table public.partes_filas (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null,
  campana_id uuid not null,
  fecha date not null,                                     -- copia de partes.fecha (para permisos por fechas)
  trabajador_id uuid not null,
  tipo public.tipo_dia not null default 'normal',
  horas numeric(5,2) check (horas >= 0 and horas <= 24),   -- null = las de la campaña (día normal)
  nota text,
  unique (parte_id, trabajador_id),
  foreign key (parte_id, campana_id, fecha) references public.partes (id, campana_id, fecha) on delete cascade on update cascade,
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete restrict
);
create index partes_filas_trabajador on public.partes_filas (campana_id, trabajador_id, fecha);

create table public.partes_maquinas (
  parte_id uuid not null,
  campana_id uuid not null,
  maquina_id uuid not null,
  cantidad int not null check (cantidad > 0),
  primary key (parte_id, maquina_id),
  foreign key (parte_id, campana_id) references public.partes (id, campana_id) on delete cascade,
  foreign key (maquina_id, campana_id) references public.maquinas (id, campana_id) on delete restrict
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  tipo public.tipo_pago not null,
  trabajador_id uuid,
  dueno_id uuid,
  importe_cent bigint not null check (importe_cent > 0),
  fecha date not null,
  hora time,
  forma public.forma_pago not null default 'efectivo',
  nota text,
  origen_id text,
  version int not null default 1,
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  check ((tipo = 'trabajador' and trabajador_id is not null and dueno_id is null) or (tipo = 'dueno' and dueno_id is not null and trabajador_id is null)),
  unique (campana_id, origen_id),
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete restrict,
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete restrict
);
create index pagos_persona on public.pagos (campana_id, tipo, trabajador_id, dueno_id, fecha);

-- =====================================================================
-- Documentos
-- =====================================================================
create table public.plantillas (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  nombre text not null, asesoria text, titulo text, cuerpo text,
  campos jsonb not null default '[]'::jsonb,
  origen_id text,
  version int not null default 1,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  unique (campana_id, origen_id)
);
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  dueno_id uuid not null,
  plantilla_ref text not null,                             -- uuid de plantillas o «gen-riesgos» (modelo de la app)
  nombre text,
  fecha date, desde date, hasta date,
  campos jsonb not null default '{}'::jsonb,
  trabajadores uuid[] not null default '{}',
  origen_id text,
  version int not null default 1,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  unique (id, campana_id),
  unique (campana_id, origen_id),
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete cascade
);
-- Fotos del papel: el archivo va en Storage (bucket privado «fotos», ruta <campana>/<foto>.jpg)
create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null,
  documento_id uuid not null,
  ruta text not null unique,
  bytes int not null check (bytes > 0 and bytes <= 2000000),
  sha256 text not null,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  unique (documento_id, sha256),                            -- la misma foto no se guarda dos veces
  foreign key (documento_id, campana_id) references public.documentos (id, campana_id) on delete cascade
);

-- =====================================================================
-- Invitaciones, auditoría, importaciones
-- =====================================================================
create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  rol public.rol_campana not null,
  trabajador_id uuid,
  dueno_id uuid,
  codigo_hash bytea not null unique,                       -- solo la huella SHA-256; el código no se guarda
  caduca_en timestamptz not null,
  creada_por uuid not null,
  creada_en timestamptz not null default now(),
  usada_por uuid,
  usada_en timestamptz,
  revocada boolean not null default false,
  check ((rol = 'trabajador') = (trabajador_id is not null)),
  check ((rol = 'dueno') = (dueno_id is not null)),
  foreign key (trabajador_id, campana_id) references public.trabajadores (id, campana_id) on delete cascade,
  foreign key (dueno_id, campana_id) references public.duenos (id, campana_id) on delete cascade
);

create table public.auditoria (
  id bigserial primary key,
  campana_id uuid,
  user_id uuid,
  tabla text not null,
  fila_id text,
  accion text not null,
  antes jsonb,
  despues jsonb,
  en timestamptz not null default now()
);
create index auditoria_campana on public.auditoria (campana_id, en desc);

create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.campanas (id) on delete cascade,
  huella text not null,                                    -- SHA-256 de la copia .json importada
  resumen jsonb not null default '{}'::jsonb,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  unique (campana_id, huella)
);

-- =====================================================================
-- Funciones auxiliares de permisos (SECURITY DEFINER: leen sin RLS, pero solo devuelven sí/no sobre el usuario actual)
-- =====================================================================
create function cc_priv.yo() returns uuid language sql stable as $$ select auth.uid() $$;

create function cc_priv.es_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.superadmin s join public.perfiles p on p.id = s.user_id
                 where s.user_id = (select auth.uid()) and p.activo)
$$;

create function cc_priv.tiene_rol(c uuid, roles public.rol_campana[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m join public.perfiles p on p.id = m.user_id
                 join public.campanas k on k.id = m.campana_id
                 where m.campana_id = c and m.user_id = (select auth.uid()) and m.activo and p.activo and m.rol = any (roles))
$$;

-- gestiona: puede crear, cambiar y borrar datos de la campaña (creador o superadministrador)
create function cc_priv.gestiona(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cc_priv.es_superadmin() or cc_priv.tiene_rol(c, array['creador']::public.rol_campana[])
$$;
-- consulta: puede leer toda la campaña (además: administrador de campaña, solo lectura)
create function cc_priv.consulta(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cc_priv.es_superadmin() or cc_priv.tiene_rol(c, array['creador', 'admin']::public.rol_campana[])
$$;
create function cc_priv.es_miembro(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cc_priv.es_superadmin() or cc_priv.tiene_rol(c, array['creador', 'admin', 'jefe', 'trabajador', 'dueno']::public.rol_campana[])
$$;
create function cc_priv.es_mi_trabajador(c uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m join public.perfiles p on p.id = m.user_id
                 where m.campana_id = c and m.user_id = (select auth.uid()) and m.activo and p.activo and m.rol = 'trabajador' and m.trabajador_id = t)
$$;
create function cc_priv.es_mi_dueno(c uuid, d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m join public.perfiles p on p.id = m.user_id
                 where m.campana_id = c and m.user_id = (select auth.uid()) and m.activo and p.activo and m.rol = 'dueno' and m.dueno_id = d)
$$;
-- El jefe ve a un trabajador solo en las fechas en que lo tuvo asignado
create function cc_priv.jefe_ve(c uuid, t uuid, f date) returns boolean
language sql stable security definer set search_path = '' as $$
  select cc_priv.tiene_rol(c, array['jefe']::public.rol_campana[]) and exists (
    select 1 from public.asignaciones_equipo a
    where a.campana_id = c and a.trabajador_id = t and a.jefe_user_id = (select auth.uid())
      and a.desde <= f and (a.hasta is null or a.hasta >= f))
$$;
create function cc_priv.jefe_tuvo(c uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select cc_priv.tiene_rol(c, array['jefe']::public.rol_campana[]) and exists (
    select 1 from public.asignaciones_equipo a where a.campana_id = c and a.trabajador_id = t and a.jefe_user_id = (select auth.uid()))
$$;
create function cc_priv.parte_de_mi_dueno(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.partes x where x.id = p and cc_priv.es_mi_dueno(x.campana_id, x.dueno_id))
$$;

-- =====================================================================
-- Disparadores: versión, sello de cambios, auditoría, perfiles
-- =====================================================================
-- Control optimista: quien edita debe enviar version = la que leyó + 1. Si otro guardó antes, falla.
create function cc_priv.control_version() returns trigger language plpgsql as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'CONFLICTO: el registro ha cambiado desde que lo abriste (versión % en la base de datos)', old.version
      using errcode = '40001', hint = 'Vuelve a cargarlo y repite el cambio';
  end if;
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

create function cc_priv.auditar() returns trigger language plpgsql security definer set search_path = '' as $$
declare fila jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.auditoria (campana_id, user_id, tabla, fila_id, accion, antes, despues)
  values (nullif(coalesce(fila ->> 'campana_id', fila ->> 'id'), '')::uuid, auth.uid(), tg_table_name,
          coalesce(fila ->> 'id', fila ->> 'parte_id', fila ->> 'campana_id'), lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

-- Perfil automático al registrarse
create function cc_priv.nuevo_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre) values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''));
  return new;
end $$;
create trigger al_registrarse after insert on auth.users for each row execute function cc_priv.nuevo_perfil();

-- Nadie salvo el superadministrador (o el propio backend) cambia «activo» o «puede_crear_campanas»
create function cc_priv.proteger_perfil() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not cc_priv.es_superadmin()
     and (new.activo is distinct from old.activo or new.puede_crear_campanas is distinct from old.puede_crear_campanas or new.id is distinct from old.id) then
    raise exception 'PERMISO: solo el superadministrador cambia el estado o los permisos de una cuenta' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger proteger before update on public.perfiles for each row execute function cc_priv.proteger_perfil();

-- La fecha de cada fila copia la del parte (y se actualiza en cascada por la clave foránea)
create function cc_priv.fecha_de_parte() returns trigger language plpgsql as $$
begin
  select p.fecha, p.campana_id into new.fecha, new.campana_id from public.partes p where p.id = new.parte_id;
  return new;
end $$;
create trigger fecha_fila before insert on public.partes_filas for each row execute function cc_priv.fecha_de_parte();

do $$
declare t text;
begin
  foreach t in array array['campanas', 'campanas_economia', 'trabajadores', 'duenos', 'maquinas', 'partes', 'pagos', 'plantillas', 'documentos'] loop
    execute format('create trigger version before update on public.%I for each row execute function cc_priv.control_version()', t);
  end loop;
  foreach t in array array['campanas', 'campanas_economia', 'miembros', 'trabajadores', 'duenos', 'maquinas', 'asignaciones_equipo', 'partes', 'partes_filas', 'partes_maquinas', 'pagos', 'documentos', 'fotos', 'invitaciones'] loop
    execute format('create trigger auditoria after insert or update or delete on public.%I for each row execute function cc_priv.auditar()', t);
  end loop;
end $$;

-- =====================================================================
-- Seguridad por filas (RLS)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['perfiles', 'superadmin', 'campanas', 'campanas_economia', 'trabajadores', 'trabajadores_privado', 'duenos', 'duenos_privado',
    'duenos_trabajadores', 'miembros', 'asignaciones_equipo', 'maquinas', 'partes', 'partes_filas', 'partes_maquinas', 'pagos', 'plantillas',
    'documentos', 'fotos', 'invitaciones', 'auditoria', 'importaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- perfiles: el propio, el superadministrador, y quien gestiona o consulta una campaña ve a sus miembros
create policy perfiles_leer on public.perfiles for select to authenticated using (
  id = (select auth.uid()) or cc_priv.es_superadmin()
  or exists (select 1 from public.miembros m where m.user_id = perfiles.id and cc_priv.consulta(m.campana_id)));
create policy perfiles_cambiar on public.perfiles for update to authenticated
  using (id = (select auth.uid()) or cc_priv.es_superadmin()) with check (id = (select auth.uid()) or cc_priv.es_superadmin());

create policy superadmin_leer on public.superadmin for select to authenticated using (user_id = (select auth.uid()));
-- (sin políticas de escritura: nadie puede hacerse superadministrador desde la app)

create policy campanas_leer on public.campanas for select to authenticated using (cc_priv.es_miembro(id));
create policy campanas_cambiar on public.campanas for update to authenticated using (cc_priv.gestiona(id)) with check (cc_priv.gestiona(id));
create policy campanas_borrar on public.campanas for delete to authenticated using (cc_priv.es_superadmin());
-- (alta solo con la función crear_campana)

create policy economia_leer on public.campanas_economia for select to authenticated using (cc_priv.consulta(campana_id));
create policy economia_cambiar on public.campanas_economia for update to authenticated using (cc_priv.gestiona(campana_id)) with check (cc_priv.gestiona(campana_id));

create policy miembros_leer on public.miembros for select to authenticated using (user_id = (select auth.uid()) or cc_priv.consulta(campana_id));
create policy miembros_alta on public.miembros for insert to authenticated with check (cc_priv.es_superadmin());
create policy miembros_cambiar on public.miembros for update to authenticated
  using (cc_priv.gestiona(campana_id) and (rol <> 'creador' or cc_priv.es_superadmin()))
  with check (cc_priv.gestiona(campana_id) and (rol <> 'creador' or cc_priv.es_superadmin()));
create policy miembros_borrar on public.miembros for delete to authenticated using (cc_priv.gestiona(campana_id) and (rol <> 'creador' or cc_priv.es_superadmin()));

create policy trabajadores_leer on public.trabajadores for select to authenticated using (
  cc_priv.consulta(campana_id) or cc_priv.es_mi_trabajador(campana_id, id) or cc_priv.jefe_tuvo(campana_id, id));
create policy trabajadores_privado_leer on public.trabajadores_privado for select to authenticated using (
  cc_priv.consulta(campana_id) or cc_priv.es_mi_trabajador(campana_id, trabajador_id));
create policy duenos_leer on public.duenos for select to authenticated using (cc_priv.consulta(campana_id) or cc_priv.es_mi_dueno(campana_id, id));
create policy duenos_privado_leer on public.duenos_privado for select to authenticated using (cc_priv.consulta(campana_id) or cc_priv.es_mi_dueno(campana_id, dueno_id));
create policy duenos_trab_leer on public.duenos_trabajadores for select to authenticated using (cc_priv.consulta(campana_id));
create policy asignaciones_leer on public.asignaciones_equipo for select to authenticated using (cc_priv.consulta(campana_id) or jefe_user_id = (select auth.uid()));
create policy maquinas_leer on public.maquinas for select to authenticated using (cc_priv.consulta(campana_id));
create policy partes_leer on public.partes for select to authenticated using (cc_priv.consulta(campana_id) or cc_priv.es_mi_dueno(campana_id, dueno_id));
create policy filas_leer on public.partes_filas for select to authenticated using (
  cc_priv.consulta(campana_id) or cc_priv.es_mi_trabajador(campana_id, trabajador_id)
  or cc_priv.jefe_ve(campana_id, trabajador_id, fecha) or cc_priv.parte_de_mi_dueno(parte_id));
create policy pmaq_leer on public.partes_maquinas for select to authenticated using (cc_priv.consulta(campana_id) or cc_priv.parte_de_mi_dueno(parte_id));
create policy pagos_leer on public.pagos for select to authenticated using (
  cc_priv.consulta(campana_id)
  or (tipo = 'trabajador' and cc_priv.es_mi_trabajador(campana_id, trabajador_id))
  or (tipo = 'dueno' and cc_priv.es_mi_dueno(campana_id, dueno_id)));
create policy plantillas_leer on public.plantillas for select to authenticated using (cc_priv.consulta(campana_id));
create policy documentos_leer on public.documentos for select to authenticated using (cc_priv.consulta(campana_id) or cc_priv.es_mi_dueno(campana_id, dueno_id));
create policy fotos_leer on public.fotos for select to authenticated using (
  cc_priv.consulta(campana_id) or exists (select 1 from public.documentos d where d.id = fotos.documento_id and cc_priv.es_mi_dueno(d.campana_id, d.dueno_id)));
create policy invitaciones_leer on public.invitaciones for select to authenticated using (cc_priv.gestiona(campana_id));
create policy invitaciones_revocar on public.invitaciones for update to authenticated using (cc_priv.gestiona(campana_id)) with check (cc_priv.gestiona(campana_id));
create policy auditoria_leer on public.auditoria for select to authenticated using (cc_priv.consulta(campana_id) or (campana_id is null and cc_priv.es_superadmin()));
create policy importaciones_leer on public.importaciones for select to authenticated using (cc_priv.gestiona(campana_id));
create policy importaciones_alta on public.importaciones for insert to authenticated with check (cc_priv.gestiona(campana_id));

-- Escritura de datos de campaña: solo quien gestiona (creador o superadministrador)
do $$
declare t text;
begin
  foreach t in array array['trabajadores', 'trabajadores_privado', 'duenos', 'duenos_privado', 'duenos_trabajadores', 'asignaciones_equipo', 'maquinas',
                           'partes', 'partes_filas', 'partes_maquinas', 'pagos', 'plantillas', 'documentos', 'fotos'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (cc_priv.gestiona(campana_id))', t || '_alta', t);
    execute format('create policy %I on public.%I for update to authenticated using (cc_priv.gestiona(campana_id)) with check (cc_priv.gestiona(campana_id))', t || '_cambiar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (cc_priv.gestiona(campana_id))', t || '_borrar', t);
  end loop;
end $$;

-- =====================================================================
-- Funciones de la API (RPC)
-- =====================================================================
-- Campañas del usuario y sus roles (selector de campaña)
create function public.mis_campanas() returns table (campana_id uuid, nombre text, anio int, roles public.rol_campana[], superadmin boolean)
language sql stable security definer set search_path = '' as $$
  select k.id, k.nombre, k.anio,
         coalesce(array_agg(m.rol order by m.rol) filter (where m.rol is not null), '{}'),
         cc_priv.es_superadmin()
  from public.campanas k
  left join public.miembros m on m.campana_id = k.id and m.user_id = (select auth.uid()) and m.activo
  where exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo)
    and (cc_priv.es_superadmin() or m.user_id is not null)
  group by k.id, k.nombre, k.anio
  order by k.anio desc nulls last, k.nombre
$$;

-- Crear campaña: solo usuarios autorizados por el superadministrador. Quien la crea queda como creador.
create function public.crear_campana(p_nombre text, p_anio int default null, p_inicio date default null,
  p_horas_dia numeric default 7.5, p_precio_trab_cent int default 1000, p_precio_dueno_cent int default 1000, p_iva numeric default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_yo uuid := auth.uid();
begin
  if v_yo is null then raise exception 'PERMISO: inicia sesión' using errcode = '42501'; end if;
  if not (cc_priv.es_superadmin() or exists (select 1 from public.perfiles where id = v_yo and activo and puede_crear_campanas)) then
    raise exception 'PERMISO: tu cuenta no está autorizada para crear campañas' using errcode = '42501';
  end if;
  insert into public.campanas (nombre, anio, inicio, horas_dia, creado_por) values (p_nombre, p_anio, p_inicio, p_horas_dia, v_yo) returning id into v_id;
  insert into public.campanas_economia (campana_id, precio_hora_trab_cent, precio_hora_dueno_cent, iva) values (v_id, p_precio_trab_cent, p_precio_dueno_cent, p_iva);
  insert into public.miembros (campana_id, user_id, rol, creado_por) values (v_id, v_yo, 'creador', v_yo);
  return v_id;
end $$;

-- Invitación de un solo uso (sin correo). Devuelve el código una sola vez; en la base solo queda su huella.
create function public.crear_invitacion(p_campana uuid, p_rol public.rol_campana, p_trabajador uuid default null, p_dueno uuid default null, p_dias int default 7)
returns text language plpgsql security definer set search_path = '' as $$
declare v_codigo text;
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: no gestionas esta campaña' using errcode = '42501'; end if;
  if p_rol = 'creador' and not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador asigna creadores' using errcode = '42501'; end if;
  if p_dias < 1 or p_dias > 30 then raise exception 'La invitación debe caducar entre 1 y 30 días'; end if;
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-'
              || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.invitaciones (campana_id, rol, trabajador_id, dueno_id, codigo_hash, caduca_en, creada_por)
  values (p_campana, p_rol, p_trabajador, p_dueno, sha256(convert_to(v_codigo, 'UTF8')), now() + make_interval(days => p_dias), auth.uid());
  return v_codigo;
end $$;

create function public.canjear_invitacion(p_codigo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.invitaciones; v_yo uuid := auth.uid();
begin
  if v_yo is null or not exists (select 1 from public.perfiles where id = v_yo and activo) then
    raise exception 'PERMISO: inicia sesión con una cuenta activa' using errcode = '42501';
  end if;
  select * into v from public.invitaciones
  where codigo_hash = sha256(convert_to(upper(trim(p_codigo)), 'UTF8')) for update;
  if not found or v.revocada or v.usada_por is not null or v.caduca_en < now() then
    raise exception 'INVITACION: el código no es válido, ya se usó o ha caducado' using errcode = '22023';
  end if;
  insert into public.miembros (campana_id, user_id, rol, trabajador_id, dueno_id, creado_por)
  values (v.campana_id, v_yo, v.rol, v.trabajador_id, v.dueno_id, v.creada_por)
  on conflict (campana_id, user_id, rol) do update set activo = true, trabajador_id = excluded.trabajador_id, dueno_id = excluded.dueno_id;
  update public.invitaciones set usada_por = v_yo, usada_en = now() where id = v.id;
  return v.campana_id;
end $$;

-- Guardar un parte completo de una vez (cabecera, trabajadores y máquinas) con control de versión.
-- Se ejecuta con los permisos de quien llama (RLS): solo funciona para quien gestiona la campaña.
create function public.guardar_parte(p_campana uuid, p_dueno uuid, p_fecha date, p_version int, p_kilos numeric, p_notas text,
  p_filas jsonb, p_maquinas jsonb) returns public.partes
language plpgsql security invoker set search_path = '' as $$
declare v public.partes;
begin
  select * into v from public.partes where dueno_id = p_dueno and fecha = p_fecha and campana_id = p_campana;
  if not found then
    if p_version is not null then raise exception 'CONFLICTO: ese parte se ha borrado desde que lo abriste' using errcode = '40001'; end if;
    insert into public.partes (campana_id, dueno_id, fecha, kilos, notas, creado_por) values (p_campana, p_dueno, p_fecha, p_kilos, p_notas, auth.uid()) returning * into v;
  else
    if p_version is null then raise exception 'CONFLICTO: otra persona ya ha creado el parte de este día' using errcode = '40001'; end if;
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

-- Horas de una fila según las reglas de la 2.3.0 (horasFila): falta = 0; día normal o sin horas = jornada de la campaña
create function cc_priv.horas_fila(tipo public.tipo_dia, horas numeric, horas_dia numeric) returns numeric
language sql immutable as $$
  select case when tipo = 'ausente' then 0 when tipo = 'normal' or horas is null then horas_dia else horas end
$$;

-- Panel del trabajador: solo sus jornadas y entregas (solo lectura)
create function public.resumen_trabajador(p_campana uuid, p_desde date default null, p_hasta date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid; v_precio int; v_hd numeric; r jsonb;
begin
  select m.trabajador_id into v_t from public.miembros m join public.perfiles p on p.id = m.user_id
  where m.campana_id = p_campana and m.user_id = auth.uid() and m.rol = 'trabajador' and m.activo and p.activo limit 1;
  if v_t is null then raise exception 'PERMISO: no eres trabajador de esta campaña' using errcode = '42501'; end if;
  select coalesce(t.precio_hora_cent, e.precio_hora_trab_cent), k.horas_dia into v_precio, v_hd
  from public.trabajadores t join public.campanas k on k.id = t.campana_id join public.campanas_economia e on e.campana_id = k.id where t.id = v_t;
  with j as (
    select f.fecha, d.nombre as dueno, f.tipo, cc_priv.horas_fila(f.tipo, f.horas, v_hd) as horas, f.nota
    from public.partes_filas f join public.partes x on x.id = f.parte_id join public.duenos d on d.id = x.dueno_id
    where f.campana_id = p_campana and f.trabajador_id = v_t and (p_desde is null or f.fecha >= p_desde) and (p_hasta is null or f.fecha <= p_hasta)),
  e as (select fecha, hora, forma, nota, importe_cent from public.pagos
        where campana_id = p_campana and tipo = 'trabajador' and trabajador_id = v_t and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta))
  select jsonb_build_object(
    'trabajador', (select nombre from public.trabajadores where id = v_t),
    'precio_hora_cent', v_precio,
    'dias', (select count(distinct fecha) from j where tipo <> 'ausente'),
    'faltas', (select count(*) from j where tipo = 'ausente'),
    'horas', (select coalesce(sum(horas), 0) from j where tipo <> 'ausente'),
    'importe_cent', (select round(coalesce(sum(horas), 0) * v_precio) from j where tipo <> 'ausente'),
    'entregado_cent', (select coalesce(sum(importe_cent), 0) from e),
    'jornadas', (select coalesce(jsonb_agg(to_jsonb(j) order by j.fecha), '[]') from j),
    'entregas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.fecha, e.hora), '[]') from e)) into r;
  return r || jsonb_build_object('pendiente_cent', (r ->> 'importe_cent')::numeric - (r ->> 'entregado_cent')::numeric);
end $$;

-- Cuenta de un dueño (el propio dueño, o creador/administrador/superadministrador para cualquier dueño de su campaña)
create function public.cuenta_dueno(p_campana uuid, p_dueno uuid default null, p_desde date default null, p_hasta date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_d uuid := p_dueno; v_precio int; v_hd numeric; v_iva numeric; r jsonb; v_mano numeric; v_maq numeric;
begin
  if v_d is null then
    select m.dueno_id into v_d from public.miembros m where m.campana_id = p_campana and m.user_id = auth.uid() and m.rol = 'dueno' and m.activo limit 1;
  end if;
  if v_d is null or not (cc_priv.consulta(p_campana) or cc_priv.es_mi_dueno(p_campana, v_d)) then
    raise exception 'PERMISO: no puedes ver la cuenta de este dueño' using errcode = '42501';
  end if;
  select coalesce(d.precio_hora_cent, e.precio_hora_dueno_cent), k.horas_dia, e.iva into v_precio, v_hd, v_iva
  from public.duenos d join public.campanas k on k.id = d.campana_id join public.campanas_economia e on e.campana_id = k.id
  where d.id = v_d and d.campana_id = p_campana;
  if v_precio is null then raise exception 'Ese dueño no es de esta campaña'; end if;
  with ps as (select * from public.partes where campana_id = p_campana and dueno_id = v_d and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta)),
  fs as (select f.*, cc_priv.horas_fila(f.tipo, f.horas, v_hd) as h from public.partes_filas f join ps on ps.id = f.parte_id),
  mano as (select t.nombre, count(distinct fs.fecha) as dias, sum(fs.h) as horas from fs join public.trabajadores t on t.id = fs.trabajador_id where fs.tipo <> 'ausente' group by t.id, t.nombre),
  maq as (select q.nombre, q.unidad, q.precio_cent, sum(pm.cantidad) as unidades from public.partes_maquinas pm join ps on ps.id = pm.parte_id join public.maquinas q on q.id = pm.maquina_id group by q.id, q.nombre, q.unidad, q.precio_cent),
  pg as (select fecha, hora, forma, nota, importe_cent from public.pagos where campana_id = p_campana and tipo = 'dueno' and dueno_id = v_d and (p_desde is null or fecha >= p_desde) and (p_hasta is null or fecha <= p_hasta))
  select jsonb_build_object(
    'dueno', (select nombre from public.duenos where id = v_d), 'precio_hora_cent', v_precio, 'iva', v_iva,
    'mano', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'dias', dias, 'horas', horas, 'importe_cent', round(horas * v_precio)) order by nombre), '[]') from mano),
    'maquinas', (select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'unidad', unidad, 'unidades', unidades, 'precio_cent', precio_cent, 'importe_cent', unidades * precio_cent) order by nombre), '[]') from maq),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('fecha', ps.fecha, 'kilos', ps.kilos,
               'presentes', (select count(*) from fs where fs.parte_id = ps.id and fs.tipo <> 'ausente'),
               'horas', (select coalesce(sum(h), 0) from fs where fs.parte_id = ps.id and fs.tipo <> 'ausente')) order by ps.fecha), '[]') from ps),
    'kilos', coalesce((select nullif(sum(kilos), 0) from ps), (select kilos_total from public.duenos where id = v_d), 0),   -- como la 2.3.0: kilos de los partes o, si no hay, los totales del dueño
    'horas', (select coalesce(sum(horas), 0) from mano),
    'pagos', (select coalesce(jsonb_agg(to_jsonb(pg) order by pg.fecha, pg.hora), '[]') from pg),
    'pagado_cent', (select coalesce(sum(importe_cent), 0) from pg)) into r;
  select coalesce(sum(horas), 0) * v_precio into v_mano from (select (j ->> 'horas')::numeric as horas from jsonb_array_elements(r -> 'mano') j) x;
  select coalesce(sum((j ->> 'importe_cent')::numeric), 0) into v_maq from jsonb_array_elements(r -> 'maquinas') j;
  -- Mismas reglas que la 2.3.0: base = mano de obra + maquinaria; IVA sobre la base; cada cifra se redondea al céntimo al mostrarla
  return r || jsonb_build_object('mano_cent', round(v_mano), 'maquinaria_cent', round(v_maq), 'base_cent', round(v_mano + v_maq),
    'iva_cent', round((v_mano + v_maq) * v_iva / 100), 'total_cent', round((v_mano + v_maq) * (1 + v_iva / 100)),
    'pendiente_cent', round((v_mano + v_maq) * (1 + v_iva / 100) - (r ->> 'pagado_cent')::numeric));
end $$;

-- Panel del jefe: jornadas de su equipo solo en las fechas de cada asignación (sin datos económicos)
create function public.jornadas_equipo(p_campana uuid, p_desde date default null, p_hasta date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_hd numeric;
begin
  if not cc_priv.tiene_rol(p_campana, array['jefe']::public.rol_campana[]) then raise exception 'PERMISO: no eres jefe en esta campaña' using errcode = '42501'; end if;
  select horas_dia into v_hd from public.campanas where id = p_campana;
  return (select coalesce(jsonb_agg(jsonb_build_object('fecha', f.fecha, 'trabajador', t.nombre, 'dueno', d.nombre, 'finca', d.finca, 'tipo', f.tipo,
            'horas', cc_priv.horas_fila(f.tipo, f.horas, v_hd)) order by f.fecha, t.nombre), '[]')
    from public.partes_filas f join public.trabajadores t on t.id = f.trabajador_id join public.partes x on x.id = f.parte_id join public.duenos d on d.id = x.dueno_id
    where f.campana_id = p_campana and cc_priv.jefe_ve(p_campana, f.trabajador_id, f.fecha)
      and (p_desde is null or f.fecha >= p_desde) and (p_hasta is null or f.fecha <= p_hasta));
end $$;

-- Panel global del superadministrador
create function public.admin_usuarios() returns table (id uuid, email text, nombre text, activo boolean, puede_crear_campanas boolean, creado_en timestamptz, ultimo_acceso timestamptz, campanas bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador' using errcode = '42501'; end if;
  return query select p.id, u.email::text, p.nombre, p.activo, p.puede_crear_campanas, p.creado_en, u.last_sign_in_at,
    (select count(distinct m.campana_id) from public.miembros m where m.user_id = p.id and m.activo)
    from public.perfiles p join auth.users u on u.id = p.id order by p.creado_en;
end $$;

create function public.admin_estadisticas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.es_superadmin() then raise exception 'PERMISO: solo el superadministrador' using errcode = '42501'; end if;
  return jsonb_build_object('usuarios', (select count(*) from public.perfiles), 'usuarios_activos', (select count(*) from public.perfiles where activo),
    'campanas', (select count(*) from public.campanas), 'partes', (select count(*) from public.partes), 'filas', (select count(*) from public.partes_filas),
    'pagos', (select count(*) from public.pagos), 'fotos', (select count(*) from public.fotos), 'fotos_bytes', (select coalesce(sum(bytes), 0) from public.fotos),
    'tamano_bd_bytes', pg_database_size(current_database()));
end $$;

-- =====================================================================
-- Privilegios: anon no ve nada; authenticated pasa siempre por RLS
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete on public.auditoria, public.superadmin from authenticated;
grant usage on schema cc_priv to authenticated;
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema cc_priv from public, anon;
grant execute on all functions in schema cc_priv to authenticated;

-- Tiempo real (Supabase Realtime respeta RLS): solo las tablas que cambian a menudo
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.partes, public.partes_filas, public.pagos, public.miembros;
  end if;
end $$;
