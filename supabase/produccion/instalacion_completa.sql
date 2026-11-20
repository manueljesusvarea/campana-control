-- CAMPAÑA CONTROL 3.0 · Instalación completa para un proyecto Supabase NUEVO y vacío (producción).
-- Generado por supabase/pruebas/instalacion.test.mjs a partir de supabase/migrations/ (17 migraciones). No editar a mano.
-- Contiene solo el esquema, permisos y funciones: ningún dato, cuenta ni contraseña.
begin;

-- ===== 20261107000001_esquema_v3.sql =====
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


-- ===== 20261107000002_almacenamiento.sql =====
-- CAMPAÑA CONTROL 3.0 · Fotos privadas en Supabase Storage
-- Bucket privado «fotos». Ruta de cada archivo: <campana_id>/<foto_id>.jpg
-- Solo se pueden leer las fotos cuya fila en public.fotos es visible para el usuario (mismas reglas RLS que los documentos).
-- Solo quien gestiona la campaña puede subir o borrar. Límite de 2 MB por foto y solo JPEG/PNG/WebP (la app comprime antes de subir).
-- PENDIENTE de probar en un proyecto Supabase real (Storage no existe en el PostgreSQL local de las pruebas).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy fotos_leer on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and exists (select 1 from public.fotos f where f.ruta = storage.objects.name));   -- RLS de public.fotos decide

create policy fotos_subir on storage.objects for insert to authenticated with check (
  bucket_id = 'fotos' and cc_priv.gestiona(((storage.foldername(name))[1])::uuid));

create policy fotos_borrar on storage.objects for delete to authenticated using (
  bucket_id = 'fotos' and cc_priv.gestiona(((storage.foldername(name))[1])::uuid));


-- ===== 20261107000003_conflicto_http409.sql =====
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


-- ===== 20261118000004_alta_controlada.sql =====
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


-- ===== 20261118000005_correo_confirmado.sql =====
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


-- ===== 20261118000006_cuentas_privadas.sql =====
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


-- ===== 20261118000007_correo_tecnico_fijo.sql =====
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


-- ===== 20261118000008_funciones_servidor.sql =====
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


-- ===== 20261119000009_informes_y_huella.sql =====
-- CAMPAÑA CONTROL 3.0 · 000009: datos para los informes del dueño y huella de cambios de una campaña
--
-- 1) datos_dueno(campaña): lo justo para que el dueño genere en su dispositivo los mismos PDF y Excel de la 2.3.0
--    («Cuenta de dueños»), con las mismas fórmulas: sus partes, las filas y la maquinaria de esos partes, el nombre
--    de los trabajadores y máquinas que aparecen en ellos, sus pagos, su precio por hora y el IVA. Nada de otros
--    dueños ni datos personales de los trabajadores. (La RLS ya le deja leer sus partes, filas y pagos, pero no
--    los nombres de trabajadores ni las máquinas: por eso una función que solo devuelve lo de sus partes.)
-- 2) huella_campana(campaña): un texto que cambia cuando cambia algo que el usuario puede ver. Se ejecuta con los
--    permisos de quien llama (security invoker): la RLS filtra igual que en el resto de consultas. La app la compara
--    cada cierto tiempo y al volver a primer plano para no depender solo de los avisos en tiempo real.
-- No modifica ni borra datos.

create function public.datos_dueno(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_d uuid; r jsonb;
begin
  select m.dueno_id into v_d from public.miembros m join public.perfiles p on p.id = m.user_id
   where m.campana_id = p_campana and m.user_id = auth.uid() and m.rol = 'dueno' and m.activo and p.activo and m.dueno_id is not null limit 1;
  if v_d is null then raise exception 'PERMISO: no eres dueño en esta campaña' using errcode = '42501'; end if;
  with ps as (select x.id, x.fecha, x.kilos, x.notas from public.partes x where x.campana_id = p_campana and x.dueno_id = v_d),
  fs as (select f.parte_id, f.trabajador_id, f.tipo, f.horas, f.nota from public.partes_filas f join ps on ps.id = f.parte_id),
  pm as (select q.parte_id, q.maquina_id, q.cantidad from public.partes_maquinas q join ps on ps.id = q.parte_id)
  select jsonb_build_object(
    'campana', (select jsonb_build_object('id', k.id, 'nombre', k.nombre, 'anio', k.anio, 'inicio', k.inicio, 'horas_dia', k.horas_dia, 'empresa', k.empresa)
                from public.campanas k where k.id = p_campana),
    'iva', (select e.iva from public.campanas_economia e where e.campana_id = p_campana),
    'precio_hora_cent', (select coalesce(d.precio_hora_cent, e.precio_hora_dueno_cent) from public.duenos d
                         join public.campanas_economia e on e.campana_id = d.campana_id where d.id = v_d),
    'dueno', (select jsonb_build_object('id', d.id, 'nombre', d.nombre, 'finca', d.finca, 'municipio', d.municipio, 'num', d.num, 'kilos_total', d.kilos_total,
                     'nif', v.nif, 'direccion', v.direccion, 'telefono', v.telefono, 'poligono', v.poligono, 'parcela', v.parcela)
              from public.duenos d left join public.duenos_privado v on v.dueno_id = d.id where d.id = v_d),
    'partes', (select coalesce(jsonb_agg(jsonb_build_object('id', ps.id, 'fecha', ps.fecha, 'kilos', ps.kilos, 'notas', ps.notas) order by ps.fecha), '[]') from ps),
    'filas', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]') from fs),
    'maquinas_partes', (select coalesce(jsonb_agg(to_jsonb(pm)), '[]') from pm),
    'trabajadores', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre)), '[]') from public.trabajadores t
                     where t.id in (select trabajador_id from fs)),
    'maquinas', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'nombre', q.nombre, 'precio_cent', q.precio_cent, 'unidad', q.unidad)), '[]')
                 from public.maquinas q where q.id in (select maquina_id from pm)),
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'fecha', g.fecha, 'hora', g.hora, 'forma', g.forma, 'nota', g.nota, 'importe_cent', g.importe_cent)
                     order by g.fecha, g.hora), '[]')
              from public.pagos g where g.campana_id = p_campana and g.tipo = 'dueno' and g.dueno_id = v_d)) into r;
  return r;
end $$;

create function public.huella_campana(p_campana uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select md5(concat_ws('|',
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.campanas where id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.campanas_economia where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.trabajadores where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.duenos where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.maquinas where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text || ':' || coalesce(max(actualizado_en)::text, '') from public.partes where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(md5(string_agg(id::text, ',' order by id)), '') from public.partes_filas where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text || ':' || coalesce(max(actualizado_en)::text, '') from public.pagos where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(md5(string_agg(id::text || rol::text || activo::text || puede_editar::text, ',' order by id)), '')
       from public.miembros where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(md5(string_agg(id::text || coalesce(hasta::text, ''), ',' order by id)), '') from public.asignaciones_equipo where campana_id = p_campana),
    (select count(*)::text || ':' || coalesce(sum(version), 0)::text from public.documentos where campana_id = p_campana),
    (select count(*)::text from public.fotos where campana_id = p_campana)))
$$;

revoke all on function public.datos_dueno(uuid), public.huella_campana(uuid) from public, anon;
grant execute on function public.datos_dueno(uuid), public.huella_campana(uuid) to authenticated;


-- ===== 20261119000010_importar_exportar.sql =====
-- CAMPAÑA CONTROL 3.0 · 000010: importar (copia de la 2.3.0 o copia de campaña 3.0) y exportar una campaña
--
-- importar_campana(campaña, huella, datos, simular)
--   · Solo quien gestiona la campaña (creador o superadministrador).
--   · Todo o nada: es una sola transacción; si un dato no cumple las reglas, no se guarda nada y se dice cuál.
--   · No borra ni sobrescribe nada de la campaña de destino:
--       - cada registro lleva origen_id (su id en la copia); si ya existe, se salta (importar dos veces no duplica);
--       - trabajadores, dueños y máquinas con el mismo nombre (sin origen) se reutilizan;
--       - un parte del mismo dueño y día que ya exista, o un pago idéntico, se saltan y se cuentan aparte;
--       - la misma copia (misma huella SHA-256) no se puede importar dos veces en la misma campaña.
--   · Horas por día, precios e IVA: si la campaña de destino no tiene partes, se toman de la copia; si tiene partes
--     y son distintos, se rechaza (los importes cambiarían).
--   · simular = true: hace todo, devuelve el resumen y lo deshace (vista previa con los duplicados reales).
--   · «datos» ya viene en el formato de la base de datos (céntimos, ids de origen); lo prepara la app.
-- exportar_campana(campaña): copia completa de una campaña (sin cuentas ni contraseñas) en ese mismo formato.
--   Solo quien la gestiona. Las fotos van aparte (rutas y huellas), porque están en Storage.
-- No modifica ni borra datos existentes.

create function public.importar_campana(p_campana uuid, p_huella text, p_datos jsonb, p_simular boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb; y jsonb; v_id uuid; v_d uuid; v_t uuid; v_n int; v_partes int; v_k jsonb;
  mt jsonb := '{}'; md jsonb := '{}'; mm jsonb := '{}'; mpl jsonb := '{}'; mdoc jsonb := '{}';
  c jsonb := jsonb_build_object(
    'trabajadores', jsonb_build_object('nuevos', 0, 'por_nombre', 0, 'ya', 0),
    'duenos', jsonb_build_object('nuevos', 0, 'por_nombre', 0, 'ya', 0),
    'maquinas', jsonb_build_object('nuevas', 0, 'por_nombre', 0, 'ya', 0),
    'partes', jsonb_build_object('nuevos', 0, 'ya', 0, 'mismo_dia', 0, 'filas', 0),
    'pagos', jsonb_build_object('nuevos', 0, 'ya', 0, 'iguales', 0),
    'plantillas', jsonb_build_object('nuevas', 0, 'ya', 0),
    'documentos', jsonb_build_object('nuevos', 0, 'ya', 0));
  sube text[]; -- ruta de c que se incrementa
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña puede importar' using errcode = '42501'; end if;
  if p_huella is null or p_huella !~ '^[0-9a-f]{64}$' then raise exception 'IMPORTAR: la huella de la copia no es válida'; end if;
  if exists (select 1 from public.importaciones where campana_id = p_campana and huella = p_huella) then
    raise exception 'IMPORTAR: esta misma copia ya se importó en esta campaña';
  end if;
  begin
    select count(*) into v_partes from public.partes where campana_id = p_campana;

    -- Economía de la campaña
    x := p_datos -> 'campana';
    if x is not null then
      if v_partes = 0 then
        update public.campanas set horas_dia = (x ->> 'horas_dia')::numeric, version = version + 1 where id = p_campana and horas_dia is distinct from (x ->> 'horas_dia')::numeric;
        update public.campanas_economia set precio_hora_trab_cent = (x ->> 'precio_hora_trab_cent')::int, precio_hora_dueno_cent = (x ->> 'precio_hora_dueno_cent')::int,
               iva = coalesce((x ->> 'iva')::numeric, 0), version = version + 1
         where campana_id = p_campana and (precio_hora_trab_cent, precio_hora_dueno_cent, iva) is distinct from
               ((x ->> 'precio_hora_trab_cent')::int, (x ->> 'precio_hora_dueno_cent')::int, coalesce((x ->> 'iva')::numeric, 0));
      elsif exists (select 1 from public.campanas k join public.campanas_economia e on e.campana_id = k.id where k.id = p_campana
                    and (k.horas_dia <> (x ->> 'horas_dia')::numeric or e.precio_hora_trab_cent <> (x ->> 'precio_hora_trab_cent')::int
                         or e.precio_hora_dueno_cent <> (x ->> 'precio_hora_dueno_cent')::int or e.iva <> coalesce((x ->> 'iva')::numeric, 0))) then
        raise exception 'IMPORTAR: la campaña de destino ya tiene partes con otras horas por día, precios o IVA. Importa la copia en una campaña vacía.';
      end if;
    end if;
    if jsonb_typeof(p_datos -> 'empresa') = 'object' then
      update public.campanas set empresa = p_datos -> 'empresa', version = version + 1 where id = p_campana and empresa = '{}'::jsonb;
    end if;

    -- Trabajadores (+ datos personales)
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'trabajadores', '[]')) loop
      if coalesce(x ->> 'o', '') = '' or coalesce(trim(x ->> 'nombre'), '') = '' then raise exception 'IMPORTAR: hay un trabajador sin nombre o sin identificador'; end if;
      select id into v_id from public.trabajadores where campana_id = p_campana and origen_id = x ->> 'o';
      if v_id is not null then sube := '{trabajadores,ya}';
      else
        select min(t.id::text)::uuid, count(*) into v_id, v_n from public.trabajadores t
         where t.campana_id = p_campana and t.origen_id is null and lower(trim(t.nombre)) = lower(trim(x ->> 'nombre'));
        if v_n = 1 then update public.trabajadores set origen_id = x ->> 'o', version = version + 1 where id = v_id; sube := '{trabajadores,por_nombre}';
        else
          insert into public.trabajadores (campana_id, nombre, precio_hora_cent, activo, origen_id)
          values (p_campana, trim(x ->> 'nombre'), (x ->> 'precio_hora_cent')::int, coalesce((x ->> 'activo')::boolean, true), x ->> 'o') returning id into v_id;
          if coalesce(x ->> 'nif', '') <> '' or coalesce(x ->> 'nss', '') <> '' or coalesce(x ->> 'telefono', '') <> '' then
            insert into public.trabajadores_privado (trabajador_id, campana_id, nif, nss, telefono)
            values (v_id, p_campana, nullif(x ->> 'nif', ''), nullif(x ->> 'nss', ''), nullif(x ->> 'telefono', ''));
          end if;
          sube := '{trabajadores,nuevos}';
        end if;
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1)); mt := mt || jsonb_build_object(x ->> 'o', v_id);
    end loop;

    -- Dueños (+ datos personales y trabajadores habituales)
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'duenos', '[]')) loop
      if coalesce(x ->> 'o', '') = '' or coalesce(trim(x ->> 'nombre'), '') = '' then raise exception 'IMPORTAR: hay un dueño sin nombre o sin identificador'; end if;
      select id into v_id from public.duenos where campana_id = p_campana and origen_id = x ->> 'o';
      if v_id is not null then sube := '{duenos,ya}';
      else
        select min(d.id::text)::uuid, count(*) into v_id, v_n from public.duenos d
         where d.campana_id = p_campana and d.origen_id is null and lower(trim(d.nombre)) = lower(trim(x ->> 'nombre'));
        if v_n = 1 then update public.duenos set origen_id = x ->> 'o', version = version + 1 where id = v_id; sube := '{duenos,por_nombre}';
        else
          insert into public.duenos (campana_id, nombre, finca, municipio, num, precio_hora_cent, kilos_total, origen_id)
          values (p_campana, trim(x ->> 'nombre'), nullif(x ->> 'finca', ''), nullif(x ->> 'municipio', ''), (x ->> 'num')::int,
                  (x ->> 'precio_hora_cent')::int, (x ->> 'kilos_total')::numeric, x ->> 'o') returning id into v_id;
          if concat(x ->> 'nif', x ->> 'direccion', x ->> 'telefono', x ->> 'poligono', x ->> 'parcela', x ->> 'notas') <> '' then
            insert into public.duenos_privado (dueno_id, campana_id, nif, direccion, telefono, poligono, parcela, notas)
            values (v_id, p_campana, nullif(x ->> 'nif', ''), nullif(x ->> 'direccion', ''), nullif(x ->> 'telefono', ''), nullif(x ->> 'poligono', ''),
                    nullif(x ->> 'parcela', ''), nullif(x ->> 'notas', ''));
          end if;
          sube := '{duenos,nuevos}';
        end if;
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1)); md := md || jsonb_build_object(x ->> 'o', v_id);
      for y in select * from jsonb_array_elements(coalesce(x -> 'trabajadores', '[]')) loop
        if mt ? (y #>> '{}') then
          insert into public.duenos_trabajadores (campana_id, dueno_id, trabajador_id) values (p_campana, v_id, (mt ->> (y #>> '{}'))::uuid) on conflict do nothing;
        end if;
      end loop;
    end loop;

    -- Máquinas
    v_n := 0;
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'maquinas', '[]')) loop
      v_n := v_n + 1;
      if coalesce(x ->> 'o', '') = '' or coalesce(trim(x ->> 'nombre'), '') = '' then raise exception 'IMPORTAR: hay una máquina sin nombre o sin identificador'; end if;
      select id into v_id from public.maquinas where campana_id = p_campana and origen_id = x ->> 'o';
      if v_id is not null then sube := '{maquinas,ya}';
      else
        select q.id into v_id from public.maquinas q where q.campana_id = p_campana and q.origen_id is null and lower(trim(q.nombre)) = lower(trim(x ->> 'nombre')) limit 1;
        if v_id is not null then
          if exists (select 1 from public.maquinas q where q.id = v_id and (q.precio_cent <> (x ->> 'precio_cent')::int or q.unidad <> coalesce(x ->> 'unidad', 'día'))) then
            if v_partes > 0 then raise exception 'IMPORTAR: la máquina «%» ya existe con otro precio y la campaña tiene partes', x ->> 'nombre'; end if;
            update public.maquinas set precio_cent = (x ->> 'precio_cent')::int, unidad = coalesce(x ->> 'unidad', 'día'), version = version + 1 where id = v_id;
          end if;
          update public.maquinas set origen_id = x ->> 'o', version = version + 1 where id = v_id; sube := '{maquinas,por_nombre}';
        else
          insert into public.maquinas (campana_id, nombre, precio_cent, unidad, activa, orden, origen_id)
          values (p_campana, trim(x ->> 'nombre'), (x ->> 'precio_cent')::int, coalesce(x ->> 'unidad', 'día'), coalesce((x ->> 'activa')::boolean, true), v_n, x ->> 'o')
          returning id into v_id;
          sube := '{maquinas,nuevas}';
        end if;
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1)); mm := mm || jsonb_build_object(x ->> 'o', v_id);
    end loop;

    -- Partes, filas y maquinaria
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'partes', '[]')) loop
      v_d := (md ->> (x ->> 'dueno'))::uuid;
      if v_d is null then raise exception 'IMPORTAR: el parte del % es de un dueño que no está en la copia', x ->> 'fecha'; end if;
      if exists (select 1 from public.partes where campana_id = p_campana and origen_id = x ->> 'o') then sube := '{partes,ya}';
      elsif exists (select 1 from public.partes where dueno_id = v_d and fecha = (x ->> 'fecha')::date) then sube := '{partes,mismo_dia}';
      else
        insert into public.partes (campana_id, dueno_id, fecha, kilos, notas, origen_id, creado_por)
        values (p_campana, v_d, (x ->> 'fecha')::date, (x ->> 'kilos')::numeric, nullif(x ->> 'notas', ''), x ->> 'o', auth.uid()) returning id into v_id;
        for y in select * from jsonb_array_elements(coalesce(x -> 'filas', '[]')) loop
          v_t := (mt ->> (y ->> 't'))::uuid;
          if v_t is null then raise exception 'IMPORTAR: el parte del % tiene un trabajador que no está en la copia', x ->> 'fecha'; end if;
          insert into public.partes_filas (parte_id, campana_id, fecha, trabajador_id, tipo, horas, nota)
          values (v_id, p_campana, (x ->> 'fecha')::date, v_t, (y ->> 'tipo')::public.tipo_dia, (y ->> 'horas')::numeric, nullif(y ->> 'nota', ''));
          c := jsonb_set(c, '{partes,filas}', to_jsonb((c #>> '{partes,filas}')::int + 1));
        end loop;
        for y in select * from jsonb_array_elements(coalesce(x -> 'maquinas', '[]')) loop
          if (mm ->> (y ->> 'm')) is null then raise exception 'IMPORTAR: el parte del % usa una máquina que no está en la copia', x ->> 'fecha'; end if;
          insert into public.partes_maquinas (parte_id, campana_id, maquina_id, cantidad) values (v_id, p_campana, (mm ->> (y ->> 'm'))::uuid, (y ->> 'cantidad')::int);
        end loop;
        sube := '{partes,nuevos}';
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1));
    end loop;

    -- Pagos y entregas
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'pagos', '[]')) loop
      v_id := case when x ->> 'tipo' = 'trabajador' then (mt ->> (x ->> 'persona'))::uuid else (md ->> (x ->> 'persona'))::uuid end;
      if v_id is null then raise exception 'IMPORTAR: un pago del % es de una persona que no está en la copia', x ->> 'fecha'; end if;
      if exists (select 1 from public.pagos where campana_id = p_campana and origen_id = x ->> 'o') then sube := '{pagos,ya}';
      elsif exists (select 1 from public.pagos g where g.campana_id = p_campana and g.tipo = (x ->> 'tipo')::public.tipo_pago
                    and coalesce(g.trabajador_id, g.dueno_id) = v_id and g.fecha = (x ->> 'fecha')::date and g.importe_cent = (x ->> 'importe_cent')::bigint
                    and g.hora is not distinct from nullif(x ->> 'hora', '')::time and g.forma = coalesce(x ->> 'forma', 'efectivo')::public.forma_pago) then sube := '{pagos,iguales}';
      else
        insert into public.pagos (campana_id, tipo, trabajador_id, dueno_id, importe_cent, fecha, hora, forma, nota, origen_id, creado_por)
        values (p_campana, (x ->> 'tipo')::public.tipo_pago, case when x ->> 'tipo' = 'trabajador' then v_id end, case when x ->> 'tipo' = 'dueno' then v_id end,
                (x ->> 'importe_cent')::bigint, (x ->> 'fecha')::date, nullif(x ->> 'hora', '')::time, coalesce(x ->> 'forma', 'efectivo')::public.forma_pago,
                nullif(x ->> 'nota', ''), x ->> 'o', auth.uid());
        sube := '{pagos,nuevos}';
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1));
    end loop;

    -- Modelos de documentos y documentos (las fotos se suben después, a Storage)
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'plantillas', '[]')) loop
      select id into v_id from public.plantillas where campana_id = p_campana and origen_id = x ->> 'o';
      if v_id is not null then sube := '{plantillas,ya}';
      else
        insert into public.plantillas (campana_id, nombre, asesoria, titulo, cuerpo, campos, origen_id)
        values (p_campana, coalesce(nullif(x ->> 'nombre', ''), 'Modelo'), x ->> 'asesoria', x ->> 'titulo', x ->> 'cuerpo', coalesce(x -> 'campos', '[]'), x ->> 'o') returning id into v_id;
        sube := '{plantillas,nuevas}';
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1)); mpl := mpl || jsonb_build_object(x ->> 'o', v_id);
    end loop;
    for x in select * from jsonb_array_elements(coalesce(p_datos -> 'documentos', '[]')) loop
      v_d := (md ->> (x ->> 'dueno'))::uuid;
      if v_d is null then raise exception 'IMPORTAR: un documento es de un dueño que no está en la copia'; end if;
      select id into v_id from public.documentos where campana_id = p_campana and origen_id = x ->> 'o';
      if v_id is not null then sube := '{documentos,ya}';
      else
        insert into public.documentos (campana_id, dueno_id, plantilla_ref, nombre, fecha, desde, hasta, campos, trabajadores, origen_id)
        values (p_campana, v_d, coalesce(mpl ->> (x ->> 'plantilla'), x ->> 'plantilla'), x ->> 'nombre', (x ->> 'fecha')::date, (x ->> 'desde')::date, (x ->> 'hasta')::date,
                coalesce(x -> 'campos', '{}'),
                coalesce((select array_agg((mt ->> (t #>> '{}'))::uuid) from jsonb_array_elements(coalesce(x -> 'trabajadores', '[]')) t where mt ? (t #>> '{}')), '{}'),
                x ->> 'o') returning id into v_id;
        sube := '{documentos,nuevos}';
      end if;
      c := jsonb_set(c, sube, to_jsonb((c #>> sube)::int + 1)); mdoc := mdoc || jsonb_build_object(x ->> 'o', v_id);
    end loop;

    insert into public.importaciones (campana_id, huella, resumen, creado_por) values (p_campana, p_huella, c, auth.uid());
    if p_simular then raise exception 'CC_SIMULACION' using errcode = 'P0099'; end if;
  exception when sqlstate 'P0099' then
    return c || jsonb_build_object('simulacion', true);
  end;
  return c || jsonb_build_object('simulacion', false, 'documentos_ids', mdoc);
end $$;

create function public.exportar_campana(p_campana uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña puede exportarla' using errcode = '42501'; end if;
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

revoke all on function public.importar_campana(uuid, text, jsonb, boolean), public.exportar_campana(uuid) from public, anon;
grant execute on function public.importar_campana(uuid, text, jsonb, boolean), public.exportar_campana(uuid) to authenticated;


-- ===== 20261119000011_fotos_almacenamiento.sql =====
-- CAMPAÑA CONTROL 3.0 · 000011: control de fotos en Storage (bucket privado «fotos», migración 000002)
-- (El nombre contiene «almacenamiento»: las pruebas locales con PGlite no tienen Storage y no lo aplican.)
--
-- fotos_huerfanas(campaña): archivos de la carpeta de la campaña que no tienen ficha en public.fotos
--   (p. ej., una subida interrumpida). La app ofrece borrarlos.
-- fotos_sin_archivo(campaña): fichas de public.fotos cuyo archivo ya no está. La app ofrece quitarlas.
-- Solo quien gestiona la campaña. Solo leen: no borran nada (el borrado lo hace la app con los permisos del usuario).

create function public.fotos_huerfanas(p_campana uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña' using errcode = '42501'; end if;
  return query select o.name from storage.objects o
    where o.bucket_id = 'fotos' and (storage.foldername(o.name))[1] = p_campana::text
      and not exists (select 1 from public.fotos f where f.ruta = o.name)
    order by o.name;
end $$;

create function public.fotos_sin_archivo(p_campana uuid) returns table (id uuid, ruta text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cc_priv.gestiona(p_campana) then raise exception 'PERMISO: solo quien gestiona la campaña' using errcode = '42501'; end if;
  return query select f.id, f.ruta from public.fotos f
    where f.campana_id = p_campana and not exists (select 1 from storage.objects o where o.bucket_id = 'fotos' and o.name = f.ruta)
    order by f.creado_en;
end $$;

revoke all on function public.fotos_huerfanas(uuid), public.fotos_sin_archivo(uuid) from public, anon;
grant execute on function public.fotos_huerfanas(uuid), public.fotos_sin_archivo(uuid) to authenticated;


-- ===== 20261119000012_fotos_gestion_almacenamiento.sql =====
-- CAMPAÑA CONTROL 3.0 · 000012: quien gestiona una campaña puede leer los archivos de su carpeta en Storage
--
-- Problema encontrado en la prueba real (19-11-2026): Storage exige permiso de LECTURA para BORRAR un archivo.
-- La política «fotos_leer» (000002) solo deja leer archivos que tienen ficha en public.fotos. Así, quien gestiona
-- no podía borrar un archivo suelto (subida interrumpida) ni el archivo de una foto cuya ficha acababa de quitar.
-- Ahora quien gestiona la campaña (creador o superadministrador) también puede leer los archivos de la carpeta de
-- su campaña. Para el resto nada cambia: administradores y dueños solo leen fotos con ficha visible para ellos.
-- No borra ni modifica datos; solo amplía la política de lectura para quien ya puede subir y borrar en esa carpeta.

alter policy fotos_leer on storage.objects using (
  bucket_id = 'fotos' and (
    exists (select 1 from public.fotos f where f.ruta = storage.objects.name)                       -- RLS de public.fotos decide
    or cc_priv.gestiona(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                             then ((storage.foldername(name))[1])::uuid end)));   -- carpeta = id de la campaña


-- ===== 20261120000013_pagos_y_modelos.sql =====
-- CAMPAÑA CONTROL 3.0 · 000013: editar pagos con historial y administrar modelos de documento
--
-- Pagos: se pueden corregir (importe, día, hora, forma, nota) sin borrarlos. Cada cambio queda en la auditoría
-- (antes y después, quién y cuándo; ya existía para pagos). Para no mover un saldo por error, el tipo y la persona
-- de un pago no se cambian: para eso se borra y se anota de nuevo. Lo garantiza la base de datos, no solo la app.
-- Modelos (plantillas): crear, editar y borrar solo quien gestiona la campaña (políticas ya existentes). Ahora además:
--   · sus cambios quedan en la auditoría;
--   · no se puede borrar un modelo que usa algún documento (el documento perdería su texto).
-- No borra ni modifica datos.

create function cc_priv.pago_misma_persona() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tipo is distinct from old.tipo or new.trabajador_id is distinct from old.trabajador_id or new.dueno_id is distinct from old.dueno_id
     or new.campana_id is distinct from old.campana_id then
    raise exception 'PAGO: no se puede cambiar el tipo ni la persona de un pago; bórralo y anótalo de nuevo';
  end if;
  return new;
end $$;
create trigger pago_misma_persona before update on public.pagos for each row execute function cc_priv.pago_misma_persona();

create function cc_priv.modelo_sin_uso() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- (si se está borrando la campaña entera, la cascada borra también sus documentos: no se impide)
  if exists (select 1 from public.campanas k where k.id = old.campana_id)
     and exists (select 1 from public.documentos d where d.campana_id = old.campana_id and d.plantilla_ref = old.id::text) then
    raise exception 'MODELO: hay documentos que usan este modelo; bórralos antes o deja el modelo';
  end if;
  return old;
end $$;
create trigger modelo_sin_uso before delete on public.plantillas for each row execute function cc_priv.modelo_sin_uso();
create trigger auditoria after insert or update or delete on public.plantillas for each row execute function cc_priv.auditar();


-- ===== 20261120000014_copias_selladas.sql =====
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


-- ===== 20261120000015_cuenta_respaldo.sql =====
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


-- ===== 20261120000016_respaldo_almacenamiento.sql =====
-- CAMPAÑA CONTROL 3.0 · 000016: fotos para la cuenta de copias y usuario de base de datos de SOLO LECTURA
-- (El nombre contiene «almacenamiento»: las pruebas locales con PGlite no tienen Storage y no lo aplican.)
--
-- 1) La cuenta técnica de copias (000015) puede LEER los archivos del bucket privado «fotos» para copiarlos.
--    No puede subir ni borrar (esas políticas no cambian: solo quien gestiona la campaña).
-- 2) Usuario de PostgreSQL «respaldo_lectura» para la copia completa (pg_dump) sin guardar en GitHub la contraseña
--    principal de la base de datos. Solo puede LEER: tablas de la app (public, cc_priv), las cuentas (auth.users) y
--    los datos de los archivos (storage.objects). BYPASSRLS es necesario para que pg_dump vea todas las filas (las
--    tablas tienen RLS forzada); no le da permiso para escribir nada. Se crea SIN contraseña y sin poder entrar
--    (NOLOGIN): el dueño la activa con su propia contraseña en el editor SQL (ver docs/COPIAS_Y_RECUPERACION.md).
-- No borra ni modifica datos.

alter policy fotos_leer on storage.objects using (
  bucket_id = 'fotos' and (
    exists (select 1 from public.fotos f where f.ruta = storage.objects.name)                       -- RLS de public.fotos decide
    or cc_priv.gestiona(case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                             then ((storage.foldername(name))[1])::uuid end)                       -- carpeta = id de la campaña
    or cc_priv.es_respaldo()));                                                                     -- cuenta de copias (solo lectura)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'respaldo_lectura') then
    create role respaldo_lectura nologin bypassrls;
  end if;
end $$;
grant usage on schema public, cc_priv, auth, storage to respaldo_lectura;
grant select on all tables in schema public to respaldo_lectura;
grant select on all sequences in schema public to respaldo_lectura;
grant select on all tables in schema cc_priv to respaldo_lectura;
grant select on auth.users to respaldo_lectura;
grant select on storage.objects to respaldo_lectura;
alter default privileges in schema public grant select on tables to respaldo_lectura;


-- ===== 20261120000017_respaldo_cuentas.sql =====
-- CAMPAÑA CONTROL 3.0 · 000017: lectura de las cuentas (auth.users) para la copia completa de la base de datos
--
-- Por qué: en 000016 se concedió a «respaldo_lectura» SELECT sobre auth.users, pero no se pudo conceder USAGE sobre
-- el esquema «auth»: ese esquema es de supabase_admin y el usuario postgres lo usa sin opción de concederlo
-- (PostgreSQL ignora esa concesión con un simple aviso). Sin USAGE, la copia falla con «permission denied for
-- schema auth». No se toca el esquema de Supabase: esta función de solo lectura, con los permisos del propietario,
-- devuelve cada cuenta completa (una fila jsonb por cuenta, para poder restaurarla) y SOLO la puede ejecutar
-- «respaldo_lectura». Ni la app (anon, authenticated) ni service_role pueden usarla.
-- No borra ni modifica datos.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'respaldo_lectura') then
    create role respaldo_lectura nologin bypassrls;
  end if;
end $$;
grant usage on schema cc_priv to respaldo_lectura;

create function cc_priv.respaldo_cuentas() returns setof jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(u) from auth.users u order by u.id
$$;
revoke all on function cc_priv.respaldo_cuentas() from public, anon, authenticated;
grant execute on function cc_priv.respaldo_cuentas() to respaldo_lectura;

commit;
