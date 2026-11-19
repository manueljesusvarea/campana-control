# Copias de seguridad y recuperación · CAMPAÑA CONTROL 3.0

Supabase Free no ofrece copias automáticas descargables ni restauración a un momento concreto: eso es de los planes de pago, y aquí no se usan. Por eso la 3.0 tiene sus propias copias, gratuitas.

**Hay tres copias distintas. No sustituyen unas a otras.**

| Copia | Qué contiene | Quién la hace | Cómo |
| --- | --- | --- | --- |
| **1. Copia de campaña** | Una campaña entera: trabajadores (con sus datos personales), dueños, maquinaria, partes, jornadas, pagos, modelos y documentos, y opcionalmente las fotos | Quien gestiona la campaña (creador o superadministrador) | App → Campañas → **Copias e importación** → «Descargar copia» |
| **2. Copia completa de la base de datos** | Todas las campañas, cuentas (sin contraseñas legibles), permisos y auditoría | El dueño del proyecto, desde su ordenador | `pg_dump` (ver abajo) |
| **3. Copia de los archivos de Storage** | Las fotos de todas las campañas (bucket privado `fotos`) | El dueño del proyecto, desde su ordenador | Descarga desde el panel o con la CLI de Supabase (ver abajo) |

Además, el **esquema y la Edge Function están en git** (`supabase/migrations/`, `supabase/functions/`), así que el backend vacío se puede rehacer en cualquier proyecto nuevo.

## 1. Copia de campaña (desde la app)

**Archivo:** `CampanaControl-copia-<campaña>-<fecha>.json`. Se genera y se descarga en el dispositivo, no se guarda en la nube.

**Contenido:**
- `datos`: lo que devuelve `exportar_campana()`. La base de datos solo se la da a quien gestiona la campaña: un administrador, un trabajador, un dueño u otro creador no pueden pedirla. Esto está probado.
- `fotos`: cada foto, con la huella SHA-256 de su contenido. Es opcional.
- `integridad`:
  - huella SHA-256 de `datos`;
  - recuentos por tipo;
  - importes por persona, calculados con las fórmulas de la 2.3.0.

**Nunca lleva** cuentas, nombres de usuario, contraseñas, sesiones ni claves.

**Cuidado:** lleva datos personales (DNI, NSS, teléfonos). Guárdala en un sitio privado y no la compartas por grupos.

**Recomendación:** una copia al final de cada quincena, y otra al cerrar la campaña. Guárdalas en el ordenador y en una memoria USB o en una nube personal.

## Restaurar o importar (desde la app)

En **Copias e importación → Importar o restaurar** se puede usar una copia de campaña de la 3.0 o una copia `.json` de la 2.3.0.

1. **Se comprueba el archivo.**
   - Copia de la 3.0: si la huella de los datos o la de una foto no coincide, se rechaza (copia dañada o modificada).
   - Copia de la 2.3.0: se elige qué campaña de la copia se importa.
2. **Se convierte y se comprueba.** Para la 2.3.0, se calculan los importes de cada persona con la copia original y con los datos ya convertidos: deben salir idénticos. Si no, se avisa antes de seguir.
3. **Simulación en el servidor.** La app enseña:
   - qué se va a crear;
   - qué ya existía (importado antes);
   - qué se reutiliza por nombre;
   - qué partes o pagos ya estaban y no se duplican.

   No se guarda nada.
4. **Importación**, en una sola transacción: si cualquier dato falla, no se guarda nada y se dice cuál. No borra ni sobrescribe nada de la campaña de destino. La misma copia no se puede importar dos veces en la misma campaña.
5. **Fotos.** Se suben a sus documentos y las repetidas se saltan. Si alguna falla, se puede reintentar.
6. **Comprobación final.** Para cada dueño y cada trabajador, se compara el importe de la copia con el de la campaña.

**Restaurar sin riesgo («entorno aislado»):** crea una campaña vacía nueva y restaura en ella. La campaña original no se toca; cuando hayas comparado las dos, decides cuál usar. Así se probó el 19-11-2026: restaurada en otra campaña, con los mismos recuentos, los mismos importes, el documento, su foto y el PDF.

**Nunca restaures sobre la campaña en uso para «volver atrás»:** la importación no borra nada, solo añade.

## 2. Copia completa de la base de datos (dueño del proyecto)

Se hace con `pg_dump`, que es gratuito. Necesitas la cadena de conexión, que **solo tiene el dueño del proyecto**: Supabase → Project Settings → Database → «Connection string», en modo Session pooler, con la contraseña de la base de datos.

**Nunca** pongas esa cadena en un archivo del repositorio ni en un chat.

```
pg_dump "postgresql://postgres.<proyecto>:<CONTRASEÑA>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
  --schema=public --schema=cc_priv --no-owner --no-privileges -Fc -f campana-control-AAAA-MM-DD.dump
```

- Se restaura con `pg_restore` en **otro** proyecto o en un PostgreSQL local, nunca encima del proyecto en uso.
- Las cuentas (`auth.users`) se pueden incluir con `--schema=auth`. Contienen huellas de contraseñas, no contraseñas, así que guarda el archivo cifrado.
- Para no escribir la contraseña en el historial de la terminal, ponla en la variable de entorno `PGPASSWORD` en la misma sesión o en un archivo `.pgpass` que no esté en el repositorio.

## 3. Copia de los archivos de Storage (dueño del proyecto)

- **Pocas fotos:** desde el panel, Storage → `fotos` → descargar.
- **Muchas fotos:** con la CLI oficial de Supabase, que es gratuita. Antes hay que iniciar sesión (`supabase login`) y vincular el proyecto. La orden exacta puede cambiar entre versiones de la CLI: compruébala con `supabase storage --help`.

  ```
  supabase storage cp -r ss:///fotos ./copia-fotos --experimental
  ```

Cada foto se llama `<id de campaña>/<id de foto>.jpg`. Su ficha (documento y huella) está en la tabla `public.fotos`, que va en la copia de la base de datos.

## Si Supabase pausa el proyecto (plan gratuito)

Supabase Free pausa un proyecto tras unos 7 días sin actividad. La web abre, pero no deja entrar ni muestra datos. **No se pierde nada.**

1. Entra en https://supabase.com/dashboard con la cuenta del proyecto.
2. Abre `campana-control-pruebas` y pulsa **«Resume project»** (o «Restore project»). Es gratis.
3. En unos minutos vuelve a funcionar. Abre la app y comprueba que puedes entrar.

Durante la campaña el uso diario evita la pausa. Fuera de campaña, entra en la app una vez por semana o reactívalo cuando haga falta.

Supabase avisa por correo antes de pausar. Si un proyecto pausado pasa mucho tiempo así, puede dejar de poder reactivarse: revisa los avisos.
