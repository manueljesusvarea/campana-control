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
