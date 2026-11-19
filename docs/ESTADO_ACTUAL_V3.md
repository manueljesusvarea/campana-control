# Estado actual de CAMPAÑA CONTROL 3.0 (multiusuario)

Revisión del 19-11-2026. Lo que figura como «verificado» se ha comprobado ejecutando pruebas ese día; lo que no, figura como «sin probar». El historial completo está en git, rama `desarrollo/multiusuario-v3`.

## 1. Estado exacto del proyecto

- **Versión pública 2.3.0:** sin cambios.
  - Web: https://manueljesusvarea.github.io/campana-control/ (comprobado el 19-11: sirve `APP_VERSION = "2.3.0"`, sin modo con cuenta).
  - Release `v2.3.0`: APK y `.exe`.
  - `main` no se ha tocado.
- **Beta 3.0.0-beta.1 publicada para pruebas:** **https://campana-control-v3-pruebas.pages.dev**
  - Cloudflare Pages Free, HTTPS. No depende de este ordenador.
  - Se despliega sola desde `desarrollo/multiusuario-v3`.
  - Usa el proyecto Supabase de pruebas.
  - Detalle en `docs/DESPLIEGUE_PRUEBAS_V3.md`.
- **Cuentas privadas:** usuario y contraseña, sin correo y sin registro público (decisión del dueño, 18-11-2026).
- **Proyecto Supabase de pruebas** (`campana-control-pruebas`, plan Free, Frankfurt):
  - activo, con las migraciones 000001 a 000008;
  - Edge Function `gestion-usuarios` desplegada;
  - registro público desactivado.
- **No hay proyecto de producción.** Coste: **0 €/mes**.
- **Prueba en dos dispositivos de la red local (18-11):** el dueño la hizo, con un móvil y un ordenador, y salió correcta.

## 2. Último commit y rama de trabajo

- **Rama:** `desarrollo/multiusuario-v3`.
- **`main`:** `f4c9c1e`, con las etiquetas `v2.3.0` y `v2.3.0-publica`.
- **Commits del 19-11:**

  | Commit | Contenido |
  | --- | --- |
  | `8f4c91a` | 3.0.0-beta.1 preparada para Cloudflare Pages: configuración desde variables, script de despliegue con comprobaciones, cabeceras de seguridad, pruebas de dueño y de cierre de sesión |
  | `07e0482` | Service worker: no guardar respuestas redirigidas (la PWA no recargaba en Cloudflare) y prueba `nube-pwa` |
  | `1fddd1e` | Tiempo real: recargar al reconectar, al volver a la app y reintentar si el canal falla |
  | (siguiente) | Documentación del despliegue y de este estado |

## 3. Funcionalidades terminadas

| Funcionalidad | Cómo se ha verificado |
| --- | --- |
| **Beta en internet con HTTPS**: login, cuentas, campañas, jornadas y sincronización desde cualquier red | Pruebas `nube-sesiones` y `nube-pwa` contra la web publicada (19-11) |
| **PWA instalable**: manifiesto «standalone», iconos de Android/iPhone/Windows, service worker, abre sin conexión, aviso de versión nueva | `nube-pwa` contra la web publicada |
| **Despliegue automático con comprobaciones**: si fallan las pruebas de permisos o la construcción, no se publica | 3 despliegues correctos el 19-11, el último unos 25 s después del `push`. La parada ante un fallo se vio en local: el script se detuvo y no generó nada publicable |
| App 2.3.0 completa (partes, pagos, cuentas, informes PDF/Excel, fotos, copias, sin conexión, APK, Windows, iPhone), también en «Usar sin cuenta» | 21/21 pruebas de regresión, ahora con la misma política de seguridad (CSP) que la web publicada |
| Esquema con RLS forzada en 24 tablas; roles de superadministrador, creador, administrador (lector o editor), jefe, trabajador y dueño | 25/25 locales y 12/12 reales |
| Cuentas privadas: altas solo desde «Gestión de usuarios», contraseña temporal obligatoria de cambiar, restablecer y bloquear | Real (API) y app publicada |
| Dueño de finca: solo su cuenta; la de otro dueño y los datos privados de trabajadores se rechazan en el servidor | App publicada (nuevo 19-11) y API |
| Cerrar sesión: no queda nada privado en memoria, almacenamiento ni caché | App publicada (nuevo 19-11) |
| Tiempo real entre sesiones independientes; sin fuga a otra campaña | API: 0,7 s · app publicada: 2,9 s |

## 4. Funcionalidades pendientes

Ninguna bloquea la beta de pruebas. Las marcadas ⚠ deben estar resueltas **antes de usar la app con una campaña real**.

| Funcionalidad | Estado |
| --- | --- |
| ⚠ **PDF, Excel y gráficas con cuenta** (datos compartidos) | Pendiente. Con cuenta hoy solo se ven las cifras en pantalla. Los informes de la 2.3.0 funcionan en «Usar sin cuenta» |
| ⚠ **Fotos de los partes y documentos en Storage privado** | Política escrita (000002); falta la interfaz. Con cuenta no se pueden adjuntar fotos |
| ⚠ **Asistente para pasar una copia `.json` de la 2.3.0** a una campaña con cuenta | Pendiente. No se migran datos reales sin autorización |
| ⚠ **Copias de seguridad de la base de datos** | El plan Free no tiene copias automáticas descargables. Hace falta una exportación periódica antes de meter datos reales |
| ⚠ **Proyecto de producción y superadministrador real** | Solo con autorización (procedimiento en la sección 6) |
| Pantallas con cuenta sin prueba propia en la app: pagos y entregas, «Cuentas», maquinaria, panel global | La base de datos sí está probada |
| Paginación y carga por fechas | Pendiente (hace falta con campañas largas) |
| APK y `.exe` de la 3.0 por GitHub Actions | Cuando la 3.0 esté completa y con autorización |
| Detalles de diseño: barra inferior con una sola pestaña (trabajador, jefe) e icono repetido en «Campañas» | Menor |

## 5. Estado real de Supabase (proyecto de pruebas)

| Comprobación | Resultado |
| --- | --- |
| Migraciones | 000001-000008 aplicadas |
| Registro público | Desactivado. Además, el hook «Before User Created» y el disparador de alta exigen un alta autorizada |
| Inicio anónimo, teléfono, proveedores sociales, «Confirm email», SMTP | Desactivados o sin configurar |
| Edge Function | `gestion-usuarios`, con verificación de JWT. La clave secreta solo está en el entorno de Supabase |
| Conexión desde la web publicada | Directa del navegador a `https://rvpftigkagrtkfdzaixf.supabase.co` con la clave pública. CORS correcto (API, Auth, Realtime y Edge Function), probado desde `https://campana-control-v3-pruebas.pages.dev` |
| Rol de servidor | Sin acceso a tablas; solo tres funciones concretas |
| Superadministrador de pruebas | `propietario.pruebas` (ficticio). Contraseña solo en `supabase/pruebas/.cuentas-pruebas.json`, ignorado por git |
| Datos | Todos ficticios. Hay más de 200 cuentas de pruebas automáticas, cada una con su campaña ficticia |
| Riesgo | El proyecto Free se pausa tras ~7 días sin uso: la web abre pero no deja entrar. Se reactiva gratis desde el panel |

## 6. Autenticación y permisos

- **Cómo entra una persona.**
  1. Recibe en persona su usuario y una contraseña temporal.
  2. Al entrar, la app la obliga a poner una propia. La Edge Function comprueba la temporal.
  3. Después vuelve a entrar con la nueva, porque Supabase cierra las sesiones anteriores.
- **Cuenta habilitada:** la comprueba la base de datos (`perfiles.activo` y RLS). Tiene que cumplir todo esto:
  - creada por un alta autorizada;
  - no bloqueada;
  - con contraseña propia;
  - con sus pertenencias a campañas.
- **La web es pública, los datos no.** Cualquiera puede abrir la página. Sin sesión válida no se lee ninguna tabla (comprobado en las 24) ni se llama a ninguna función de alta.
- **Sesiones:** la sesión se guarda en el dispositivo (`campana-control-sesion`) y se renueva sola. Deja de valer al cerrar sesión, al cambiar o restablecer la contraseña o al bloquear la cuenta.
- **Primer superadministrador en producción:**
  1. El propietario ejecuta en el editor SQL `select cc_priv.autorizar_alta_propietario('su.usuario', 'Su nombre');`.
  2. En los 10 minutos siguientes, crea el usuario en Authentication → Users → Add user.
- **Matriz de permisos y piezas:** `docs/PERMISOS_Y_SEGURIDAD.md`.

## 7. Pruebas ejecutadas y resultados (19-11-2026)

| Prueba | Dónde | Resultado |
| --- | --- | --- |
| Permisos (`npm test`) | PostgreSQL local; también en cada despliegue de Cloudflare | **25/25** |
| Seguridad y los 15 casos pedidos (`node real.test.mjs`) | Proyecto real, API directa y Edge Function | **12/12**. En una ejecución anterior falló el aviso de tiempo real (no llegó en 20 s); repetida, 0,7 s. Ver la sección 9 |
| App con 7 sesiones (`ejecutar.js nube`), **contra la web publicada** | Electron → https://campana-control-v3-pruebas.pages.dev → Supabase | **Correcta** |
| PWA publicada (`ejecutar.js nube-pwa`) | Web publicada | **Correcta** |
| Regresión de la app 2.3.0 (`ejecutar.js`) | Electron, con la CSP de Cloudflare | **21/21**, sin violaciones de CSP |
| Cabeceras y dirección | `curl` a la web publicada | HTTPS; HTTP → 301 a HTTPS; CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`. Sin IP locales; `config-nube.js` solo con la URL y la clave pública |

**Prueba de la app contra la web publicada.** Cada ventana es un dispositivo con su propio almacenamiento y su propia sesión:
1. El superadministrador entra y crea un gestor (creador).
2. El gestor, en un móvil, pone su contraseña y crea:
   - la campaña;
   - 2 trabajadores y 2 dueños;
   - 5 cuentas: administrador lector, administrador editor, jefe, trabajador y dueño.
3. El editor modifica la jornada que anotó el gestor. El trabajador la recibe en 2,9 s: **9 h y 90 €**, sin ver al otro trabajador.
4. El lector ve las 17 h, pero no tiene botón de editar y la API le rechaza el cambio.
5. El jefe solo ve a su equipo.
6. El dueño ve su cuenta (17 h, 204 €). La de otro dueño, los datos privados y los pagos de otros se rechazan, y no puede editar partes.
7. El jefe cierra la sesión: no queda nada en memoria, ni en el almacenamiento ni en la caché.
8. Bloqueo de una cuenta y restablecimiento de contraseña, como en la prueba del 18-11.

**Prueba de PWA:**
- el service worker controla la página tras recargar;
- la dirección de inicio del manifiesto abre la app;
- **sin conexión**, la app abre;
- manifiesto «standalone» con iconos de 192 y 512 px (también maskable) y `apple-touch-icon`;
- la caché tiene 24 archivos de la app, ninguno de Supabase ni de otro origen.

## 8. Cambios realizados el 19-11-2026

1. **Publicación de la beta en Cloudflare Pages** (autorizada por el dueño):
   - proyecto `campana-control-v3-pruebas` en su cuenta, plan Free, sin tarjeta;
   - integración de GitHub limitada al repositorio `campana-control`;
   - solo se despliega `desarrollo/multiusuario-v3`; no hay vistas previas de otras ramas.
2. **`construir_www.py`:** toma la configuración pública de `CC_NUBE_URL` y `CC_NUBE_CLAVE`. Solo admite la clave `sb_publishable_`.
3. **`herramientas/despliegue_pruebas.sh`:** pruebas de permisos, construcción y comprobaciones antes de publicar.
4. **`www/_headers`:** cabeceras de seguridad y `no-cache` en la página, el service worker y la configuración.
5. **Arreglo del service worker:** Cloudflare redirige `index.html` a `/`, y la respuesta redirigida guardada en caché hacía fallar la recarga de la app instalada. Lo detectó la prueba contra la web publicada.
6. **Tiempo real más robusto:** la app recarga al reconectar el canal y al volver a primer plano, y reintenta si el canal da error. Así, el móvil que se suspende o cambia de red no se queda con datos viejos.
7. **`APP_VERSION` = `3.0.0-beta.1`.** Solo en la rama; la 2.3.0 publicada no cambia.
8. **Pruebas:**
   - el servidor local envía la misma CSP que Cloudflare;
   - la prueba `nube` funciona contra la web publicada (`URL_PUBLICADA`) y comprueba además al dueño y el cierre de sesión;
   - prueba nueva `nube-pwa`.
9. **Retirado:** el servidor de la red local del 18-11 ya no hace falta y está parado.

## 9. Problemas encontrados

- **Aviso de tiempo real perdido una vez** (1 de 3 ejecuciones de la prueba por API del 19-11). La app recargaba solo con cada aviso. Ahora también recarga al reconectar y al volver a la app; la prueba de la app publicada pasa con eso. Hay que vigilarlo en la prueba manual con datos móviles.
- **Redirección `index.html` → `/` de Cloudflare.** Rompía la recarga de la PWA. Corregido.
- **El proyecto Supabase Free se pausa tras una semana sin uso.** Durante la campaña el uso diario lo evita.
- **Al cambiar la contraseña, Supabase cierra las sesiones anteriores.** La app vuelve a pedir la contraseña nueva.
- **Cuentas de prueba acumuladas** (más de 200, ficticias) en el proyecto de pruebas. No molestan, pero el superadministrador las ve en «Gestión de usuarios».

## 10. Próximas tareas recomendadas

1. **Prueba manual del dueño con datos móviles** (sin wifi), en la beta publicada: ver `docs/DESPLIEGUE_PRUEBAS_V3.md` y la guía entregada.
2. **PDF, Excel y gráficas con datos compartidos**, generados en el dispositivo con las mismas fórmulas que la 2.3.0.
3. **Fotos y documentos** en Storage privado.
4. **Asistente de migración** desde una copia de la 2.3.0.
5. **Copia periódica de la base de datos** (exportación gratuita) antes de cualquier dato real.
6. **Etapa F:**
   - revisión de seguridad;
   - proyecto de producción y superadministrador real (con autorización);
   - versión candidata;
   - APK, `.exe` y web por GitHub Actions (con autorización).

## 11. Información para dirigir la continuación

- **Código fuente único:** `claude-artifact/campana-control.html`. Después de editarlo se ejecuta `python herramientas/construir_www.py`.
- **Beta publicada:**
  - https://campana-control-v3-pruebas.pages.dev;
  - cada `push` a la rama la actualiza en menos de un minuto si pasan las comprobaciones;
  - cuenta de Cloudflare del dueño, proyecto `campana-control-v3-pruebas`.
- **Backend:** `supabase/migrations/000001-000008` y `supabase/functions/gestion-usuarios/index.ts` (se despliega desde el panel).
- **Pruebas:**
  - `cd supabase/pruebas && npm test`;
  - `node real.test.mjs`;
  - `…\electron.exe herramientas\pruebas\ejecutar.js` (regresión), y con `nube`;
  - con `URL_PUBLICADA=https://campana-control-v3-pruebas.pages.dev` y `nube`, contra la web publicada (incluye `nube-pwa`).
- **Archivos locales que nunca van a GitHub:** `supabase/config-app.local.json`, `supabase/pruebas/.env.pruebas`, `supabase/pruebas/.cuentas-pruebas.json` y `www/config-nube.js`.
- **Reglas que siguen en vigor:**
  - nada a `main` ni a Releases sin autorización;
  - coste 0 € (rechazar cualquier opción de pago);
  - sin claves secretas en la app ni en el chat;
  - solo datos ficticios;
  - sin correo;
  - sin SQL destructivo;
  - sin firmas.
