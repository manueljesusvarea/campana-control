# Plan de la versión 3.0 · multiusuario

Rama de trabajo: `desarrollo/multiusuario-v3`. La rama `main` conserva la 2.3.0 pública (etiquetas `v2.3.0` y `v2.3.0-publica`). No se fusiona nada con `main` ni se publica sin autorización expresa del dueño del proyecto.

## Decisiones (etapa A, 7-11-2026)

Las condiciones de los planes gratuitos se comprobaron el 7-11-2026 en las fuentes oficiales enlazadas. Pueden cambiar: hay que revisarlas antes de publicar.

| Necesidad | Elección | Motivo y condiciones del plan gratuito |
| --- | --- | --- |
| Base de datos, permisos, cuentas, fotos y tiempo real | **Supabase Free**, región UE | PostgreSQL con permisos por fila (RLS), autenticación, Storage y Realtime en un solo servicio. Free: 500 MB de base de datos, 1 GB de archivos, 5 GB de transferencia al mes, 50.000 usuarios activos al mes, 200 conexiones de tiempo real simultáneas y 2 M de mensajes al mes ([precios](https://supabase.com/pricing)). **Sin facturación:** si se superan los límites, Supabase restringe el proyecto (pausa, solo lectura o errores 402) hasta el ciclo siguiente; no cobra ([FAQ de facturación](https://supabase.com/docs/guides/platform/billing-faq)). |
| Web con inicio de sesión | **Cloudflare Pages Free** (propuesta, a decidir en la etapa F) | GitHub Pages pide no manejar datos sensibles como contraseñas ([límites de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Cloudflare Pages Free: peticiones a archivos estáticos gratis e ilimitadas y 500 compilaciones al mes ([precios](https://developers.cloudflare.com/pages/functions/pricing/), [límites](https://developers.cloudflare.com/pages/platform/limits/)). La 2.3.0 sigue en GitHub Pages. El APK y el `.exe` llevan la web dentro y no dependen del alojamiento. |
| Invitaciones | **Códigos de un solo uso** (sin correo) | El correo integrado de Supabase solo envía a las direcciones del equipo del proyecto y 2 mensajes por hora; no sirve para producción ([SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). El creador genera un código (caduca en 1–30 días) y lo pasa por WhatsApp o en persona; la persona crea su cuenta y lo canjea. |
| Cuentas | Supabase Auth con correo y contraseña, **sin confirmación por correo** | Por la misma limitación de correo. El acceso a una campaña solo se obtiene con un código. Contraseñas gestionadas por Supabase (nunca en texto plano). Para restablecer una contraseña olvidada, el superadministrador tendrá una función en el servidor (etapa B). |
| Copias de seguridad | Exportación desde la app y `supabase db dump` local | Free no incluye copias automáticas ([precios](https://supabase.com/pricing)). Nunca se guardan copias con datos en GitHub (el repositorio es público). |
| Pausa por inactividad | Aviso y reactivación manual | Los proyectos Free se pausan tras una semana sin actividad ([precios](https://supabase.com/pricing)). Los datos se conservan; se reactiva desde el panel de Supabase. Durante la campaña el uso diario lo evita. |

**Por qué no otras opciones:**
- **Firebase:** el almacenamiento de archivos exige un plan con facturación, y sus permisos son menos fáciles de auditar que SQL.
- **PocketBase:** necesita un servidor propio.
- **Cloudflare D1:** autenticación y permisos a mano.
- **Base de datos de claude.ai:** no sirve para dueños ni trabajadores.

## Etapas

| Etapa | Contenido | Estado |
| --- | --- | --- |
| A · Preparación | Rama, análisis, elección de backend, modelo de datos, permisos (RLS) y pruebas de seguridad en PostgreSQL real | ✔ Hecha (7-11-2026). Ver «Resultado de la etapa A». |
| B · Autenticación | Proyecto Supabase, migraciones aplicadas, alta e inicio de sesión en la app, superadministrador, pruebas contra el proyecto real | En curso: proyecto de pruebas creado y verificado (14/14 pruebas reales, 7-11-2026). Falta la pantalla de inicio de sesión en la app. |
| C · Campañas y roles | Selector de campaña, invitaciones, gestión de roles y equipos en la interfaz | — |
| D · Funciones compartidas | Partes, pagos, maquinaria y cuentas contra la base de datos; tiempo real; avisos de conflicto y de falta de conexión | — |
| E · Informes y migración | PDF y Excel locales a partir de los datos autorizados; fotos privadas; asistente de migración desde la copia 2.3.0 | — |
| F · Verificación | Pruebas completas, revisión de seguridad, plataformas y versión candidata | — |

## Resultado de la etapa A

- **Esquema:** `supabase/migrations/20261107000001_esquema_v3.sql` (tablas, RLS, versiones, auditoría y funciones) y `…000002_almacenamiento.sql` (fotos privadas).
- **Pruebas:** `supabase/pruebas/permisos.test.mjs` (`npm test` en esa carpeta). Usa PostgreSQL 18.6 real (PGlite) con lo mínimo de Supabase (`auth.uid()` desde el JWT, roles `anon` y `authenticated`).
  - **16 de 16 correctas** el 7-11-2026.
  - **Pendiente** de repetir contra el proyecto Supabase real (etapa B), e incluir entonces Storage, que no existe en local.
- **Detalle:** `docs/MODELO_MULTIUSUARIO.md` y `docs/PERMISOS_Y_SEGURIDAD.md`.
