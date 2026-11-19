# Estado actual de CAMPAÑA CONTROL 3.0 (multiusuario)

Revisión del 19-11-2026, por la tarde. Lo que figura como «verificado» se ha comprobado ejecutando pruebas ese día; lo que no, figura como pendiente. El historial completo está en git, rama `desarrollo/multiusuario-v3`.

## 1. Estado exacto del proyecto

- **Versión pública 2.3.0:** sin cambios.
  - Web: https://manueljesusvarea.github.io/campana-control/
  - Release `v2.3.0`.
  - `main` = `f4c9c1e`, sin tocar.
- **Beta 3.0.0-beta.1:** **https://campana-control-v3-pruebas.pages.dev** (Cloudflare Pages Free, HTTPS). Se actualiza sola con cada `push` a `desarrollo/multiusuario-v3` si pasan las comprobaciones.
- **Funciona con datos compartidos:**
  - cuentas privadas y roles;
  - partes, jornadas, maquinaria y kilos;
  - pagos y entregas;
  - **informes PDF y Excel y gráficas**, con las fórmulas de la 2.3.0;
  - **documentos con fotos privadas**;
  - **copias de campaña y restauración**;
  - **importación de copias de la 2.3.0**;
  - sincronización con reconciliación.
- **Proyecto Supabase de pruebas** (Free, Frankfurt):
  - migraciones 000001 a 000012 aplicadas;
  - Edge Function `gestion-usuarios`;
  - bucket privado `fotos`;
  - registro público desactivado.
- **No hay proyecto de producción.** Coste: **0 €/mes** (consumo en `docs/DESPLIEGUE_PRUEBAS_V3.md`).
- **Antes de usar datos reales** falta lo de la sección 4, marcado ⚠.

## 2. Último commit y rama de trabajo

- **Rama:** `desarrollo/multiusuario-v3`, la que publica la beta. El trabajo grande se hace antes en `trabajo/v3-completa` (Cloudflare no la despliega) y se pasa con `merge --ff-only` cuando todo está en verde.
- **Commits del 19-11, por la tarde:**

  | Commit | Contenido |
  | --- | --- |
  | `e25747b` | Informes PDF, Excel y gráficas con datos compartidos; reconciliación por huella de cambios (000009) |
  | `cd09425` | Documentos y fotos privadas, copias de campaña, importación 2.3.0 y restauración (000010-000012) |
  | (siguiente) | Documentación: copias y recuperación, consumo, seguridad y este estado |

## 3. Funcionalidades terminadas (verificadas el 19-11-2026)

| Funcionalidad | Cómo se ha verificado |
| --- | --- |
| **Informes de la 2.3.0 con datos compartidos**: cuenta de dueños, cuenta de trabajadores, registro de horas y gráfica de la campaña, en PDF y Excel. Gráficas por día y tablas por quincena | Prueba real en la app publicada: el creador descarga los 8 archivos. La cuenta del dueño calculada en el dispositivo (214 €, con maquinaria) es igual a la del servidor |
| **Mismas fórmulas que la 2.3.0**: se usan las funciones originales (`registros`, `resumenTrab`, `cuentaDueno`, `porQuincena`, `grafica`, `pdf*`, `xls*`) sobre los datos de la nube; no hay un segundo juego de fórmulas | Importación de la copia de la 2.3.0 del caso de control: importes idénticos antes y después, por persona |
| **Informes por rol**: el trabajador, su cuenta (PDF y Excel) y su gráfica por quincena; el dueño, su cuenta; el jefe, el registro de horas de su equipo **sin dinero** | Prueba real: se lee el Excel. El trabajador solo ve lo suyo (9 h, 90 €, entregado 25 €, le quedan 65 €); el dueño, sin el otro dueño; el jefe, sin importes ni otro equipo |
| **Documentos y fotos privadas** (Storage): crear el documento con su modelo, editar los campos, fotos comprimidas y con huella, PDF del documento con sus fotos, borrar sin dejar restos, revisar archivos sueltos | Prueba real: la foto se ve en otro dispositivo; el PDF lleva la foto; al borrar el documento desaparece su archivo; un archivo suelto se detecta y se limpia |
| **Fotos protegidas como la RLS** | Prueba real: sin sesión no se descarga, no se firma un enlace ni se leen las fichas, y la URL pública da error. El trabajador y el jefe no la leen; el lector y el dueño sí; el dueño no sube ni borra. La misma foto dos veces se rechaza |
| **Copia de campaña 3.0** (con fotos, huella, recuentos e importes; sin cuentas ni contraseñas) | Prueba real: se descarga, lleva 1 foto con su huella y ningún dato de acceso. Una copia manipulada (un importe cambiado) se rechaza |
| **Restauración en entorno aislado** (campaña nueva) | Prueba real: mismos importes de cada persona, el documento, su foto y el PDF. Local (PGlite): mismos recuentos y la misma cuenta (316,80 €) |
| **Importación desde la 2.3.0** (asistente): eliges la campaña de la copia y la de destino; conversión comprobada; simulación (nuevos, ya existentes, por nombre, duplicados); importación todo o nada; fotos; comprobación final | Prueba real con la copia `.json` generada por la 2.3.0: importes iguales, foto incluida. La misma copia otra vez se rechaza. Local: un error al final no deja nada a medias, y una segunda exportación de los mismos datos no duplica nada |
| **Sincronización sin depender del tiempo real**: huella de cambios cada 45 s con la app visible, al volver a la app y al reconectar; vuelve a suscribirse tras un corte | Prueba real: un aviso perdido se recupera; sin conexión se conservan los datos y no deja guardar; al volver la conexión se pone al día |
| **Cambios simultáneos** | Prueba real: el editor tenía el parte abierto y otro lo guardó antes: recibe «otra persona ha cambiado esto», se recarga y no pisa nada |
| **Permisos retirados o cuenta bloqueada con la app abierta** | Prueba real, sin recargar: el editor pierde Parte y Pagos; el dueño bloqueado se queda sin datos en pantalla |
| **Cerrar sesión y entrar otra persona** | Prueba real: nada en memoria, ni en el almacenamiento, ni en la caché. Las fotos (blobs) se liberan |
| Cuentas privadas, roles, editor y lector, jefe, trabajador, dueño, restablecer, bloquear | Pruebas reales anteriores, repetidas hoy contra la web publicada |
| PWA en HTTPS (recarga, sin conexión, manifiesto, iconos, caché sin datos) | `nube-pwa` contra la web publicada |
| App 2.3.0 («Usar sin cuenta») intacta | 21/21 regresión, con la política de seguridad de Cloudflare |

## 4. Funcionalidades pendientes

⚠ = resolver antes de usar la app con una campaña real.

| Pendiente | Estado |
| --- | --- |
| ⚠ **Prueba del dueño con datos reales de una campaña antigua**, en una campaña nueva | Necesita tu autorización. El asistente está listo y probado con copias ficticias |
| ⚠ **Proyecto de producción** separado del de pruebas, con el superadministrador real | Con autorización. Ahora todo vive en el proyecto de pruebas (con más de 300 cuentas ficticias) |
| ⚠ **Rutina de copias**: una copia de campaña cada quincena y una copia completa de la base de datos periódica | Documentada en `docs/COPIAS_Y_RECUPERACION.md`. La copia completa la tiene que hacer el dueño con su contraseña de base de datos |
| Editor de modelos de documento con cuenta | Con cuenta se usan los modelos incluidos y los importados de la 2.3.0. No se pueden crear modelos nuevos desde la 3.0 |
| Consulta sin conexión con la sesión iniciada | La app abre sin conexión, pero no guarda una copia de los datos de la nube para verlos sin cobertura |
| Pagos y entregas: editar un pago (ahora se borra y se vuelve a anotar) | Menor |
| Paginación o carga por fechas | No hace falta para una campaña normal (unos 50 kB por carga); sí para varias campañas largas |
| APK y `.exe` de la 3.0 | Cuando la 3.0 esté aprobada y con tu autorización |
| Detalles de diseño: barra inferior con una sola pestaña (trabajador, jefe) e icono repetido en «Campañas» | Menor |

## 5. Estado real de Supabase (proyecto de pruebas)

| Comprobación | Resultado |
| --- | --- |
| Migraciones | 000001-000012 aplicadas el 18 y 19-11. Cada una se comprobó por su huella SHA-256 antes de ejecutarla. Ninguna borra ni modifica datos |
| Nuevas funciones | `datos_dueno`, `huella_campana` (000009) · `importar_campana`, `exportar_campana` (000010) · `fotos_huerfanas`, `fotos_sin_archivo` (000011) · la política `fotos_leer` amplía la lectura a quien gestiona su carpeta (000012) |
| Storage | Bucket `fotos` privado, de 2 MB por foto y solo imágenes. 11 fotos, 145 kB. Hay 1 archivo suelto de una prueba anterior a la 000012, que se puede limpiar desde la app |
| Consumo (ciclo 07-11 → 07-12) | Base de datos 33 MB / 500 MB · egress 0,01 / 5 GB · 158 / 50.000 usuarios activos · 116 / 500.000 llamadas a funciones · 246 / 2.000.000 mensajes en tiempo real · pico 5 / 200 conexiones. Sin excesos: el plan Free no los factura |
| Datos | Todos ficticios: unas 97 campañas y 344 cuentas de las pruebas automáticas |
| Riesgos | Pausa tras ~7 días sin uso (se reactiva gratis). Unos 30 inicios de sesión cada 5 minutos por IP |

## 6. Autenticación y permisos

Sin cambios en las cuentas (usuario y contraseña, sin correo).

**Nuevo:** permisos de informes, fotos, copias e importación en `docs/PERMISOS_Y_SEGURIDAD.md`, sección «Informes, fotos, copias e importación». En resumen:
- cada rol solo recibe en el navegador lo que la base de datos le deja leer;
- solo quien gestiona una campaña puede exportarla, importar en ella, subir fotos o borrarlas.

## 7. Pruebas ejecutadas y resultados (19-11-2026)

| Prueba | Dónde | Resultado |
| --- | --- | --- |
| Permisos (`npm test`) | PostgreSQL local; también en cada despliegue de Cloudflare | **29/29** (nuevas: datos del dueño, huella, importar y restaurar) |
| Seguridad por API (`node real.test.mjs`) | Proyecto real | **12/12**. La prueba de tiempo real ahora espera a que Supabase esté listo (pasó 3 de 3 veces) |
| `nube-sesiones` (7 sesiones; pagos, maquinaria, 14 informes, fotos por rol, conflicto, aviso perdido, sin conexión, permiso retirado, bloqueo en vivo, cierre de sesión) | **App publicada** → Supabase | **Correcta** |
| `nube-migracion` (copia 2.3.0 → importación → copia 3.0 → restauración aislada → fotos privadas) | **App publicada** → Supabase | **Correcta** |
| `nube-pwa` | App publicada | **Correcta** |
| Regresión 2.3.0 (`ejecutar.js`) | Local, con la CSP de Cloudflare | **21/21** |

## 8. Cambios realizados el 19-11-2026 (tarde)

1. **Informes con datos compartidos.**
   - `conS()` pone temporalmente los datos de la nube en el formato de la 2.3.0 y se usan sus mismas funciones.
   - `saveLocal()` no guarda mientras `S` tiene datos prestados, así que los datos sin cuenta del dispositivo nunca se mezclan.
   - Vista «Informes» para creador y administradores; PDF, Excel y gráfica para trabajador, dueño y jefe (este, sin dinero).
2. **Sincronización.**
   - Huella de cambios (`huella_campana`).
   - Roles y permisos releídos en cada carga.
   - Un fallo de permisos lleva a la pantalla que corresponda; sin red se conservan los datos.
   - Se vuelve a suscribir al reconectar.
   - En segundo plano no se descarga nada.
   - Una carga que se queda atrás espera a la más reciente.
3. **Documentos y fotos privadas**, con el control de archivos sueltos.
4. **Copias de campaña, importación de la 2.3.0 y restauración** (asistente con simulación y comprobación).
5. **Pestaña «Más»** en el móvil cuando hay más de 6 secciones.
6. **Documentación:** `COPIAS_Y_RECUPERACION.md` (nuevo), consumo y límites en `DESPLIEGUE_PRUEBAS_V3.md`, seguridad en `PERMISOS_Y_SEGURIDAD.md`, `CLAUDE.md`.

## 9. Problemas encontrados (y cómo quedaron)

- **El aviso de tiempo real a veces no llegaba.** Causa: Supabase confirma la suscripción un instante antes de enviar los cambios. Ahora la app compara la huella (al conectar, cada 45 s, al volver y al reconectar). La prueba por API espera al mensaje de sistema.
- **Storage no deja borrar lo que no se puede leer.** Quien gestionaba no podía borrar archivos sueltos ni el de una foto ya quitada. Resuelto en la 000012.
- **Caché del navegador:** una foto borrada seguía saliendo de la caché. Ahora se sube con `cacheControl 0`.
- **Carrera en las cargas:** una carga superada volvía antes de tener los datos nuevos. Resuelto.
- **Un error de inicialización** (`nAfter` usado antes de declararlo) dejaba la app sin arrancar. Lo detectaron las pruebas antes de publicar.
- **Límite de inicios de sesión de Supabase** al encadenar pruebas: «Request rate limit reached». No afecta al uso normal; está documentado.

## 10. Próximas tareas recomendadas

1. **Tu prueba manual** en la beta publicada (`docs/DESPLIEGUE_PRUEBAS_V3.md`, «Prueba manual»), ahora también con:
   - informes;
   - una foto en un documento;
   - una copia de campaña;
   - importar una copia de la 2.3.0, primero de datos ficticios.
2. **Con tu autorización:** importar una copia real de la 2.3.0 en una campaña nueva y revisar las cuentas.
3. **Con tu autorización:** proyecto de producción (Free), migraciones 000001-000012, Edge Function, superadministrador real y otra web de producción.
4. Editor de modelos de documento con cuenta; consulta sin conexión con la sesión iniciada.
5. **Etapa final:**
   - revisión de seguridad;
   - versión candidata;
   - APK, `.exe` y web por GitHub Actions (con autorización).

## 11. Información para dirigir la continuación

- **Código fuente único:** `claude-artifact/campana-control.html`, y después `python herramientas/construir_www.py`.
  - Bloques nuevos: «Informes con cuenta», «Documentos y fotos privadas» y «Copias de campaña».
- **Backend:**
  - migraciones `supabase/migrations/000001-000012`; las que contienen «almacenamiento» no se aplican en PGlite;
  - Edge Function en `supabase/functions/gestion-usuarios`.
- **Pruebas:**
  - `cd supabase/pruebas && npm test`;
  - `node real.test.mjs`;
  - `…\electron.exe herramientas\pruebas\ejecutar.js` (regresión);
  - con `nube` (añade `URL_PUBLICADA=https://campana-control-v3-pruebas.pages.dev` para la web publicada).

  Espera unos minutos entre ejecuciones seguidas por el límite de inicios de sesión.
- **Archivos locales que nunca van a GitHub:** `supabase/config-app.local.json`, `supabase/pruebas/.env.pruebas`, `supabase/pruebas/.cuentas-pruebas.json` y `www/config-nube.js`.
- **Reglas que siguen en vigor:**
  - nada a `main` ni a Releases sin autorización;
  - coste 0 € (rechazar cualquier pago, tarjeta o complemento);
  - sin claves secretas en la app ni en el chat;
  - solo datos ficticios;
  - sin correo;
  - sin SQL destructivo;
  - sin firmas.
