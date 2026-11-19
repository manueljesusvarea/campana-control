# Despliegue de la beta 3.0 de pruebas (Cloudflare Pages)

**Dirección:** https://campana-control-v3-pruebas.pages.dev

Es la versión 3.0.0-beta.1, para pruebas con **datos ficticios**. La versión estable 2.3.0 sigue en https://manueljesusvarea.github.io/campana-control/ (GitHub Pages, rama `main`) y no cambia.

## Piezas

| Pieza | Dónde | Coste |
| --- | --- | --- |
| Web (HTML, iconos, librerías) | Cloudflare Pages, proyecto `campana-control-v3-pruebas`, cuenta del dueño | Free (0 €) |
| Datos, cuentas, permisos, tiempo real | Supabase, proyecto de pruebas `rvpftigkagrtkfdzaixf` (Frankfurt) | Free (0 €) |
| Alta y gestión de cuentas | Edge Function `gestion-usuarios` de ese proyecto | Free (0 €) |
| Código | GitHub, rama `desarrollo/multiusuario-v3` | Gratis |

## Despliegue automático

- **Qué lo dispara:** cada `push` a `desarrollo/multiusuario-v3`. No hay despliegues de vista previa de otras ramas: Branch control → Preview branch = None. `main` no se despliega aquí.
- **Comando de construcción:** `bash herramientas/despliegue_pruebas.sh`. Hace tres cosas:
  1. Ejecuta las 25 pruebas de permisos (PostgreSQL local con PGlite; no toca Supabase).
  2. Construye `www/` con la configuración pública.
  3. Comprueba que no hay claves secretas ni IP locales y que están todos los archivos.

  Si algo falla, Cloudflare **no publica** y sigue en línea la versión anterior.
- **Carpeta publicada:** `www`.
- **Variables del proyecto:**
  - `CC_NUBE_URL`: la URL de Supabase;
  - `CC_NUBE_CLAVE`: la clave **pública** `sb_publishable_…`.

  Nunca se pone aquí una clave secreta. La configuración no está en git: así, si algún día se fusiona la rama con `main`, la web estable no queda conectada por accidente al proyecto de pruebas.
- **Cabeceras de seguridad:** están en `www/_headers` (GitHub Pages ignora este archivo):
  - CSP: solo scripts de la propia web y conexiones a la propia web y a Supabase;
  - sin marcos ni referer;
  - `no-cache` en la página y en el service worker.
- **En los dispositivos:** cuando hay una versión nueva, la app instalada muestra «Hay una versión nueva · Actualizar». Nunca se recarga sola.

**Antes de subir cambios**, en este ordenador:
1. `npm test` en `supabase/pruebas`.
2. Las 21 pruebas de la 2.3.0: `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js`.
3. La prueba real: `… ejecutar.js nube`.

**Después del despliegue**, contra la web publicada:

```
URL_PUBLICADA=https://campana-control-v3-pruebas.pages.dev  …\electron.exe herramientas\pruebas\ejecutar.js nube
```

## Límites del plan gratuito y riesgos

- **Cloudflare Pages Free:**
  - 500 construcciones al mes, de una en una, con un máximo de 20 minutos cada una;
  - hasta 20.000 archivos de 25 MiB como máximo;
  - el tráfico de una web estática no tiene límite publicado.

  No pide tarjeta. La web no se suspende por inactividad.
- **Supabase Free:**
  - **el proyecto se pausa tras unos 7 días sin actividad.** Entonces la web abre, pero no deja entrar ni guardar. Se reactiva desde el panel de Supabase («Resume project»), sin perder datos;
  - 500 MB de base de datos y 50.000 usuarios activos al mes;
  - Edge Functions y tiempo real con cuotas mensuales holgadas para una cuadrilla.

  Si se agota una cuota, el plan Free limita el servicio; nunca cobra.
- **Copias:**
  - **Datos:** el proyecto de pruebas solo tiene datos ficticios. Si hiciera falta, se puede exportar con el editor SQL o con `pg_dump` desde el panel.
  - **Esquema:** las migraciones de `supabase/migrations/` y la Edge Function de `supabase/functions/` están en git y permiten rehacer el backend.
  - **Web:** se reconstruye desde git en cualquier momento («Retry deployment» o un `push`).
- **Coste:** 0 €/mes. No hay facturación activada ni dominio contratado. Si Cloudflare o Supabase ofrecen un plan de pago, se rechaza.

## Consumo real del plan gratuito (19-11-2026, ciclo 07-11 → 07-12)

Del panel Usage de Supabase, después de dos días de pruebas automáticas intensivas:

| Recurso | Uso | Límite Free |
| --- | --- | --- |
| Base de datos | 33 MB | 500 MB |
| Transferencia de salida (egress) | 0,01 GB | 5 GB |
| Usuarios activos al mes | 158 | 50.000 |
| Llamadas a Edge Functions | 116 | 500.000 |
| Mensajes en tiempo real | 246 | 2.000.000 |
| Conexiones simultáneas en tiempo real (pico) | 5 | 200 |
| Storage | 145 kB (11 fotos) | 1 GB |
| Despliegues de Cloudflare | 5 | 500 al mes |

Supabase Free **no factura excesos**: si se pasa de una cuota, limita el servicio. Cloudflare Pages Free no pide tarjeta.

**Estimación para una cuadrilla** (20 trabajadores, 60 días, 10 dispositivos):
- Base de datos: unos 2 MB.
- Fotos: unas 300 a 300 kB, unos 90 MB.
- Egress: cada recarga completa de una campaña así pesa unos 40 a 60 kB comprimida. Con unos 30 cambios al día y 10 dispositivos abiertos, sale menos de 1 GB al mes.
- Lo que más transferencia gasta es ver fotos, unos 300 kB cada una, y las copias con fotos.

**Optimizaciones:**
- La app solo recarga cuando hay un aviso o cuando cambia la huella. La huella es una consulta de unos 100 bytes cada 45 s, y solo con la app visible.
- En segundo plano no se descarga nada.
- Las fotos se comprimen a 1600 px antes de subirlas y se descargan solo al abrir su documento.

**Límite de inicios de sesión:** Supabase Auth admite unos 30 inicios de sesión cada 5 minutos por dirección IP. Una cuadrilla no lo alcanza. Las pruebas automáticas, al encadenarse, sí lo alcanzaron, y salía «Request rate limit reached».

**Si Supabase pausa el proyecto por inactividad:** ver `docs/COPIAS_Y_RECUPERACION.md`, apartado final.

## Instalar la app

- **iPhone (Safari):**
  1. Abre https://campana-control-v3-pruebas.pages.dev.
  2. Botón Compartir → «Añadir a pantalla de inicio» → Añadir.
  3. Aparece el icono «Campaña» y la app se abre a pantalla completa, sin barra de Safari.
  - En Chrome para iPhone también se puede, desde Compartir. Con Safari es lo más fiable.
- **Android (Chrome):**
  1. Abre la dirección.
  2. Chrome ofrece «Instalar app». Si no lo hace: menú ⋮ → «Instalar aplicación» (o «Añadir a pantalla de inicio»).
- **Windows (Chrome o Edge):**
  1. Abre la dirección.
  2. Pulsa el icono de instalar de la barra de direcciones, o menú → «Instalar Campaña Control» (en Edge: Aplicaciones → Instalar este sitio como aplicación).
- **Convivencia con la 2.3.0:** la beta es otra dirección, así que no toca la 2.3.0 instalada ni sus datos. Las dos apps conviven: tienen el mismo icono, pero la beta dice «Versión 3.0.0-beta.1 · con cuenta» en Ajustes.

## Prueba manual con datos móviles (sin wifi)

1. En el móvil, **desactiva el wifi** y deja solo los datos móviles.
2. Abre https://campana-control-v3-pruebas.pages.dev e instálala como se indica arriba.
3. **Entra con `gestor.prueba`** y la contraseña que pusiste en la prueba del 18-11. Si no la recuerdas, pídeme que la restablezca: te daré una temporal en un archivo local, nunca por el chat.
4. **Crea una campaña** «Prueba datos móviles» y, en Personas, 2 trabajadores y 1 dueño.
5. **Crea las cuentas** en Usuarios: un trabajador y un administrador (solo consulta). Apunta las contraseñas temporales: solo se muestran una vez.
6. **En el ordenador**, con otra red, entra con la cuenta del trabajador y pon su contraseña.
7. **En el móvil**, guarda un parte de hoy. En el ordenador, el trabajador debe ver sus horas y su importe en pocos segundos.
8. **Bloquea el móvil** 1 o 2 minutos. Mientras, cambia algo desde el ordenador con la cuenta del administrador si tiene edición, o desde otra sesión del gestor. Al desbloquear el móvil, debe aparecer el cambio sin recargar.
9. **Cierra la sesión** en el ordenador (Ajustes → Cerrar sesión). Ya no debe verse nada de la campaña.
10. **Modo avión** en el móvil y abre la app instalada. Debe abrir y avisar de que no hay conexión, sin dejar guardar. Puede que con la sesión iniciada no muestre los datos: la beta aún no guarda una copia para consultarlos sin conexión. Lo comprobado automáticamente es que abre la pantalla de entrar. Quita el modo avión.

Dime qué pasos salen bien o mal, sin mandar contraseñas.

## Volver atrás o retirar la beta

- **Volver a una versión anterior:** Cloudflare → `campana-control-v3-pruebas` → Deployments → «Rollback» en un despliegue anterior.
- **Pausar la publicación:** Settings → Branch control → desmarcar «automatic production branch deployments».
- **Retirarla del todo:** Settings → Delete project. Solo con autorización del dueño. Los datos de Supabase no se tocan.
