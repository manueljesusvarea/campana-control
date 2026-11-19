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
