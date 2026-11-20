# Copias de seguridad y recuperación · CAMPAÑA CONTROL 3.0

Supabase Free no ofrece copias automáticas descargables ni restauración a un momento concreto: eso es de los planes de pago, y aquí no se usan. Por eso la 3.0 tiene sus propias copias, gratuitas.

**Hay tres copias distintas. No sustituyen unas a otras.**

| Copia | Qué contiene | Quién la hace | Cómo |
| --- | --- | --- | --- |
| **1. Copia de campaña** | Una campaña entera: trabajadores (con sus datos personales), dueños, maquinaria, partes, jornadas, pagos, modelos, documentos y cuentas autorizadas (sin contraseñas), con **sello** del servidor, y opcionalmente las fotos | Quien gestiona la campaña (creador o superadministrador) | App → Campañas → **Copias e importación** → «Descargar copia» |
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

## Huella y sello: qué demuestra cada uno (000014)

- **Huella SHA-256:** detecta un archivo **dañado** (corte de descarga, disco). **No** demuestra que nadie lo haya cambiado a propósito: quien cambie los datos puede recalcular la huella.
- **Sello:** HMAC-SHA256 de los datos con una clave que solo existe en la base de datos del proyecto. Está en la tabla `cc_priv.sello`, con RLS, fuera de la API y sin permiso de lectura para nadie. Lo pone el servidor al hacer la copia (`copia_campana`) y lo comprueba al importarla (`verificar_sello`). Sin la clave no se puede falsificar.
  - **Probado:** se cambia un importe y se recalcula la huella. La huella ya no lo delata, pero el sello sí, y la app no deja importar sin una confirmación expresa.
- **Una copia de otro proyecto** (por ejemplo, de pruebas a producción) no se puede comprobar, porque la clave es otra. La app lo dice y pide confirmación.
- **Límite honesto:** el sello demuestra que la copia la hizo este proyecto y que no se ha cambiado. No impide que alguien con la copia la lea (lleva datos personales). Para eso, el cifrado de las copias diarias.

## Copias diarias automáticas, cifradas y fuera de Supabase (gratis)

`herramientas/respaldo/respaldo_diario.mjs`, lanzado con `respaldo_diario.ps1` en tu ordenador con Windows.

**Qué hace cada día:**
1. Entra con la **cuenta técnica de copias** `respaldo.copias` (solo lectura, 000015). Nunca con una cuenta personal.
2. Mira la huella de cambios de cada campaña y **solo copia las que han cambiado** desde la última vez.
3. Pide la copia sellada al servidor y descarga sus fotos.
4. **Comprueba** la huella de cada foto y el sello, y que el archivo cifrado se puede volver a leer.
5. Lo guarda **cifrado** (AES-256-GCM con tu frase de paso) como `AAAA-MM-DD_<campaña>.ccr`, en la carpeta que elijas.
6. Conserva las copias de los últimos **30 días** y la primera de cada mes de los últimos **12 meses**.

**Fuera de Supabase:** elige una carpeta que esté fuera del ordenador o se sincronice fuera, como una memoria USB o una carpeta de OneDrive o Google Drive personal (gratis hasta su cuota). Los archivos están cifrados: sin la frase de paso no se leen.

**Probado contra el proyecto de pruebas el 20-11-2026:**
- 105 campañas copiadas en 46 s;
- la segunda ejecución no copió nada, porque no había cambios;
- una copia descifrada lleva su sello, sus fotos y las cuentas autorizadas, y ninguna contraseña;
- con una frase equivocada no se descifra nada.

**Configurar, una sola vez:**

```
cd herramientas\respaldo
npm install
powershell -ExecutionPolicy Bypass -File respaldo_diario.ps1 -Configurar
```

- Pide la URL, la clave **pública**, el usuario y la contraseña de respaldo, la frase de paso y la carpeta.
- La contraseña y la frase se guardan **cifradas con DPAPI de Windows** en `%APPDATA%\CampanaControl\respaldo.xml`. Solo tu usuario de Windows en este ordenador puede leerlas; nunca van al proyecto ni a git.
- **Apunta la frase de paso en un sitio seguro: sin ella, las copias no se pueden recuperar.**

**Programarla a diario:** Programador de tareas de Windows → Crear tarea básica → «Copia Campaña Control» → Diariamente, a las 22:00 → Iniciar un programa:
- Programa: `powershell`
- Argumentos: `-ExecutionPolicy Bypass -File "<ruta>\herramientas\respaldo\respaldo_diario.ps1"`
- Marca «Ejecutar tanto si el usuario inició sesión como si no».

Cada ejecución deja un registro en `registro.txt`, en la carpeta de destino. Si el ordenador está apagado, se copia al día siguiente, porque las copias dependen de los cambios y no de la fecha.

**Recuperar una copia:**

```
node respaldo_diario.mjs descifrar <archivo.ccr> <salida.json>
```

Con la frase en `CC_RESPALDO_FRASE`, en la misma sesión. Después, en la app: Copias e importación → Importar o restaurar, en una campaña nueva. El sello se comprueba y el superadministrador recupera las cuentas autorizadas.

### Copias de producción en GitHub Actions (OPERATIVAS desde el 20-11-2026, sin ordenador encendido)

Repositorio **privado** `manueljesusvarea/campana-control-copias`, flujo `copias.yml`: todos los días a las 02:15 UTC
(GitHub puede retrasar las ejecuciones programadas varias horas) y a mano con «Run workflow». Coste 0 €.

| Qué | Con qué cuenta | Resultado |
|---|---|---|
| Copia sellada de cada campaña con sus fotos (`.ccr`) | `respaldo.copias` (cuenta de la app de SOLO LECTURA, 000015) | cifrada AES-256-GCM |
| Todos los archivos del bucket `fotos` + manifiesto con huellas | `respaldo.copias` (000016) | `storage.tar.enc` |
| `pg_dump` de `public` y `cc_priv`, cuentas completas (`cc_priv.respaldo_cuentas()`, 000017) y metadatos de Storage | `respaldo_lectura` (usuario de PostgreSQL de SOLO LECTURA, 000016-000017) | `base_datos.tar.enc` |
| **Prueba de restauración**: descifra `base_datos.tar.enc`, lo restaura en un PostgreSQL 17 desechable con el esquema exacto de producción y compara cada tabla (filas y huella del contenido) y el número de cuentas | — | si algo no coincide, la ejecución falla y GitHub avisa por correo |

- Secretos: `CC_RESPALDO_CLAVE` (contraseña de `respaldo.copias`), `CC_DB_URL` (Session pooler con `respaldo_lectura`, la crea
  `herramientas/respaldo/activar_lectura_bd.ps1`: producción registra el DDL, así que solo se envía la huella SCRAM), `CC_RESPALDO_FRASE`.
  **Ninguno es la contraseña de una persona ni la contraseña principal de la base de datos.** El flujo se niega a funcionar si
  `CC_DB_URL` no usa `respaldo_lectura` o si apunta al proyecto de pruebas, y una copia incompleta cuenta como fallo.
- `respaldo.copias`: no es superadministrador, ni creador, ni miembro; la base de datos impide dárselo. Solo funciones de lectura.
- `respaldo_lectura`: SELECT en `public`, `cc_priv` y `storage.objects`; las cuentas solo mediante `cc_priv.respaldo_cuentas()`.
  No puede escribir nada. (El esquema `auth` es de Supabase y `postgres` no puede conceder USAGE sobre él: por eso la función.)
- Los artefactos (solo archivos cifrados y un informe sin datos personales) se guardan 30 días.
- **Primera ejecución completa correcta: 20-11-2026, ejecución 44729785813.** 26 tablas y 2 cuentas restauradas idénticas.
- Si se aplica una migración nueva en producción, actualiza en `copias.yml` el commit de `ESQUEMA` (prueba de restauración).

**Límites (no ocultar):** la prueba automática restaura la base de datos, no un proyecto Supabase completo (el plan gratuito solo
permite 2 proyectos); los archivos de Storage se guardan y se comprueban por huella, pero no se suben de nuevo en la prueba.
Sin la frase de paso `CC_RESPALDO_FRASE` no se puede descifrar nada: guárdala también fuera de GitHub.

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
