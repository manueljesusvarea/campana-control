# Informe de estabilización y web instalable · CAMPAÑA CONTROL 2.3.0

Fecha: 6-11-2026. Trabajo hecho en local, sin publicar nada: no hay git push, ni despliegue, ni «Release».

**Qué se ha comprobado y cómo:**
- **Ejecutado** = probado de verdad en este ordenador (Windows 11), con el banco de pruebas automático o a mano.
- **Simulado** = probado imitando un entorno que no está disponible: la identificación del navegador de un iPhone, el puente de Capacitor o el `window.claude` de claude.ai.
- **Pendiente** = necesita un dispositivo real. **No se ha usado ningún iPhone ni ningún móvil Android.**

---

## 1. Estado inicial y problemas detectados

**Punto de partida:**
- Versión 2.2.0, con librerías y fuentes en local, fotos en IndexedDB, proyecto del APK (Capacitor 8.6) y del programa de Windows (Electron 45).
- Alguien había modificado `www/sw.js` fuera de esta sesión: cachés con nombre por alcance y respuesta primero desde la caché. También había añadido `Abrir-web-local.cmd`, `herramientas/abrir_local.py` y `docs/ENCARGO-MOVILES.md`.
- No había ninguna prueba automática.

**Cómo se auditó:**
- Se creó `herramientas/pruebas/ejecutar.js`. Usa el motor de Chrome de Electron como navegador, sirve `www/` en `/campana-control/` (igual que GitHub Pages) y cada prueba trabaja con **perfiles temporales aislados**. Nunca se tocaron `localhost:8000`, el navegador del usuario ni la app instalada.
- Antes de modificar nada se hizo una copia de los archivos críticos en `CAMPAÑA CONTROL\respaldos\20261106-2106-antes-estabilizacion\`, con sus sumas SHA-256.

**Primera ejecución** (`herramientas/pruebas/resultado-inicial.json`): **9 correctas, 5 con fallos.**

| # | Problema reproducido | Gravedad |
| --- | --- | --- |
| P1 | Con dos pestañas o ventanas de la app abiertas a la vez (por ejemplo, la app instalada y una pestaña del navegador), la última en guardar **borraba lo guardado por la otra**. En la prueba se perdió el trabajador «Desde A». | Alta: pérdida de datos |
| P2 | Si `campana-control-v1` estaba dañado (JSON roto), la app arrancaba vacía y **al primer guardado lo sobrescribía**, sin dejar copia. | Alta: pérdida de datos |
| P3 | Una copia de seguridad a la que le faltaba una foto **parecía completa**: el archivo no lo indicaba y solo salía un mensaje de 3 segundos. | Media: copia engañosa |
| P4 | El nuevo `sw.js` no borraba las cachés de versiones anteriores (`cc-2.0.1`…). | Baja: espacio |
| P5 | No había aviso de versión nueva, ni sección de instalación por dispositivo (fase 2). | Funcionalidad |

**La prueba anterior en la que «desaparecía un documento»:** se analizó y era un fallo **de la prueba, no de la app**. Se cambiaba solo el `#` de la dirección, así que la página no se recargaba y seguía con los datos vacíos en memoria. La prueba `fotos-migracion` recarga la página de verdad dos veces: el documento se conserva, la foto pasa a IndexedDB una sola vez y desaparece de `localStorage`.

**Revisado y correcto desde el principio** (ejecutado):
- cálculos;
- altas, cambios y bajas por pantalla;
- kilos «2.350»;
- maquinaria;
- persistencia;
- los 4 informes en PDF y Excel;
- migración de fotos;
- copia con fotos;
- funcionamiento sin conexión;
- diseño en móvil y ordenador.

## 2. Correcciones efectuadas

| Problema | Cambio | Archivo | Prueba que lo demuestra |
| --- | --- | --- | --- |
| P1 | Cuando otra pestaña o ventana guarda (evento `storage`), esta recarga `S` antes de seguir. Así su siguiente guardado ya incluye lo de la otra. Un parte a medio rellenar en pantalla se conserva. | `claude-artifact/campana-control.html` (`loadLocal`, listener `storage`) | `multipestana`: los dos trabajadores se conservan y la pestaña A ve lo que guardó la B |
| P2 | Si los datos no se pueden leer, su texto original se aparta en `campana-control-v1-danado-<fecha>` antes de escribir nada. Aparece un aviso con el botón «Descargar el contenido dañado». Si no se puede apartar la copia, la app **no guarda**. | Mismo archivo (`loadLocal`, `saveLocal`, `render`, `A.descargarDanado`) | `datos-danados`: el contenido original sigue en `localStorage` después de guardar |
| P3 | Si falta una foto, la copia lleva `incompleta: true` y `fotosFaltan: n`, y sale una ventana que hay que cerrar («Copia incompleta»). Al importarla, la confirmación avisa de las fotos que faltan. | Mismo archivo (`A.exportar`, importación en `after.ajustes`) | `copia-incompleta` |
| P4 | Al activarse, el service worker borra también las cachés con el formato antiguo exacto `cc-X.Y.Z`. Solo ese formato, para no tocar cachés de otras apps del mismo dominio de GitHub Pages. | `www/sw.js` | `actualizacion` |
| P5a | Aviso «Hay una versión nueva de la app · Actualizar» cuando se activa un service worker nuevo. Nunca recarga solo: si hay un parte sin guardar, el navegador avisa antes. Al volver a la app se comprueba si hay versión nueva, como mucho una vez por hora. | `herramientas/construir_www.py` (código que solo va en `www/`) | `actualizacion` |
| P5b | Sección «Instalar la app» en Ajustes y aviso discreto en Inicio que se puede cerrar. Se adaptan al dispositivo y desaparecen si la app ya está instalada (ver § 3). | `claude-artifact/campana-control.html` (`entorno`, `vInstalar`, `avisoInstalar`, `A.instalar`) | `instalacion`, `plataformas` |
| — | La `VERSION` de caché ya no se escribe a mano: `construir_www.py` la calcula con la huella SHA-256 de todos los archivos que guarda el service worker. Si cambia cualquier archivo publicado, los dispositivos reciben la versión nueva; si no cambia nada, sigue igual. | `herramientas/construir_www.py`, `www/sw.js` | Construcción repetida dos veces con el mismo resultado; `actualizacion` |
| — | El `versionCode` del APK ahora sale de la versión × 1000 + número de compilación de GitHub (2.3.0 → 20300000). Antes era siempre 1 en local y podía hacer que Android rechazara una actualización. | `android/app/build.gradle` | `aapt2 dump badging` (§ 4) |
| — | Manifiesto: `id` fijo (`./index.html`, el mismo que calculaba Chrome, así que la instalación conserva su identidad), `purpose` en los iconos, `lang` `es-ES` y categorías. Enlace del icono del iPhone con `sizes="180x180"`. | `www/manifest.webmanifest`, `herramientas/construir_www.py` | `carga`, `sin-conexion` |
| — | `construir.js` del instalador de Windows pasa argumentos extra a electron-builder. Hizo falta para generar el instalador en otra carpeta porque `windows/dist` estaba bloqueado. | `windows/construir.js` | Instalador 2.3.0 generado |
| — | Versión 2.3.0, porque cambia el formato de la copia (nuevos campos opcionales). | `claude-artifact/campana-control.html` | — |

**Archivos nuevos:**
- `herramientas/pruebas/ejecutar.js`: banco de pruebas;
- `docs/ARQUITECTURA_MULTIUSUARIO.md`: fase 4, solo diseño;
- este informe.

**Documentación actualizada:** `CLAUDE.md`, `docs/PLAN.md`, `docs/DATOS.md` y `.gitignore` (resultados de pruebas y `windows/dist-*/`). `www/index.html` se regeneró con `construir_www.py` y nunca se editó a mano.

**No se ha cambiado:**
- el formato de los datos;
- los cálculos;
- las tecnologías;
- el diseño de las pantallas existentes.

Las copias de versiones anteriores se siguen importando; se comprueba en `fotos-migracion` y en la importación de copias sin campos nuevos.

## 3. Estado de la PWA

| Aspecto | Estado | Evidencia |
| --- | --- | --- |
| Rutas relativas y subcarpeta `/campana-control/` | Correcto | `carga`, `sin-conexion` (alcance `…/campana-control/`) |
| Manifiesto: `id`, `start_url`, `scope`, iconos 192, 512 y maskable 512 | Correcto | Revisado; tamaños de los PNG comprobados |
| Metadatos de iPhone: `apple-touch-icon` 180×180, `apple-mobile-web-app-capable`, título «Campaña», barra de estado y márgenes seguros | Correcto en el código | Revisado. **No probado en un iPhone.** |
| Sin conexión: reabrir, librerías, fuentes, PDF y Excel | Correcto (ejecutado) | `sin-conexion`: servidor apagado, la app reabre y genera un PDF |
| Caché y actualización | Correcto (ejecutado) | `actualizacion`: aviso de versión nueva y limpieza de la caché antigua |
| Sin dependencias externas | Correcto (ejecutado) | `carga`: 0 peticiones a otros dominios. Búsqueda en `www/`: ninguna URL externa fuera del texto interno de las librerías (espacios de nombres XML y licencias) |
| Instalación en iPhone (Safari) | Instrucciones paso a paso: Compartir → Añadir a pantalla de inicio → Abrir como app web → Añadir. **No hay instalación automática**, porque iOS no la permite. | `instalacion` (simulado con la identificación de un iPhone) |
| Instalación en Android (Chrome) | Botón «Instalar la app» si Chrome ofrece `beforeinstallprompt`; si no, instrucciones del menú ⋮ | `instalacion`: simulado; probado el caso sin aviso de instalación |
| Instalación en Windows (Chrome o Edge) | Botón si el navegador lo ofrece; si no, instrucciones; en Firefox se explica que no se puede | `instalacion` (simulado) |
| No insistir si ya está instalada | El aviso de Inicio se oculta y Ajustes dice «ya está instalada» (modo `standalone`, APK o Windows) | `instalacion`, `plataformas` |
| Enlace al APK o al `.exe` | **Sin enlace**: no hay ninguna versión publicada y verificada. `DESCARGAS` está vacío a propósito. | Revisado |
| Móvil (390 px) y ordenador (1280 px) | Sin desbordes horizontales en las 7 secciones; menú inferior en móvil y lateral en ordenador | `responsive` |
| claude.ai | Arranca, no ofrece instalar y no registra el service worker (ese código solo va en `www/`) | `plataformas` (simulado) |

**Importante:** la web en internet **no sincroniza datos** entre dispositivos. Cada instalación guarda los suyos, y la sección de instalación lo explica. No se ha hecho ninguna sincronización improvisada.

## 4. Estado del APK de Android

**Generado en local con la versión 2.3.0:** `CAMPAÑA CONTROL\instaladores\CampanaControl-2.3.0.apk`, con el mismo proceso de siempre (Capacitor 8.6, Gradle, firma propia).

**Ejecutado (comprobado con las herramientas del SDK):**
- `versionName` 2.3.0 y `versionCode` 20300000;
- firmado (esquema v2) con la clave propia (CN=Campana Control, SHA-256 `2ec5f7c9…b9d5`);
- dentro va la web 2.3.0;
- no contiene archivos sensibles.

**Simulado:** en el APK, la sección de instalación dice que ya está instalada, y `guardarArchivo()` usa Filesystem y Share de Capacitor (`plataformas`).

**Pendiente en un móvil real:**
- instalar el APK;
- abrir la app;
- hacer una foto con la cámara;
- usar la hoja de compartir;
- actualizar el APK encima de otro y comprobar que se conservan los datos.

**No se ha probado en ningún Android.**

**Compilación en GitHub** (`.github/workflows/android.yml`): sin ejecutar, porque todavía no hay repositorio.

## 5. Estado del instalador de Windows

**Generado en local con la versión 2.3.0:** `CAMPAÑA CONTROL\instaladores\CampanaControl-Setup-2.3.0.exe` (116 MB).

**Ejecutado:**
- el paquete lleva la web 2.3.0 y la versión 2.3.0;
- no incluye `sw.js`, porque no lo necesita;
- el programa (Electron) arranca, se reconoce como «programa de Windows» y carga las librerías de PDF y Excel;
- en la sesión anterior se comprobó que los datos sobreviven a cerrar y reabrir.

**Sin probar:** ejecutar el instalador `.exe` en sí (instalar y desinstalar), para no modificar la instalación de este ordenador.

**Compilación en GitHub** (`windows.yml`): sin ejecutar.

## 6. Resultados de pruebas con evidencias

**Ejecución final** (`herramientas/pruebas/resultado-final.json`, Electron 45.2.3 / Chrome 156): **15 correctas, 0 con fallos, sin errores en la consola.**

| Prueba | Tipo | Resultado y evidencia |
| --- | --- | --- |
| `carga` | Ejecutada | Librerías locales cargadas (jsPDF, autotable, SheetJS 0.18.5). 0 peticiones externas. |
| `calculos` | Ejecutada | Caso de control de `docs/ENCARGO-MOVILES.md`, creado **por pantalla**. Coinciden todos los importes esperados. La ficha del dueño muestra «LE FALTA PAGAR 72,00 €» en la 2.ª quincena. |
| `crud` | Ejecutada | Alta, cambio y baja de un trabajador. Kilos «2.350» → 2350. Tractor + 2 sopladoras = 60 €, mano de obra 90 € y total 150 €. Comprobado leyendo `localStorage`. |
| `persistencia` | Ejecutada | Datos idénticos tras recargar y tras cerrar y abrir la ventana. |
| `informes` | Ejecutada | Los 4 tipos en PDF y Excel (de 11 a 25 KB cada uno). Excel de dueños, 1.ª quincena: pendiente 60. Excel de trabajadores: le queda 55. Los PDF contienen esos importes. |
| `fotos-migracion` | Ejecutada | Foto antigua → IndexedDB. El documento se conserva tras dos recargas reales y la foto no está duplicada. |
| `fotos-copia` | Ejecutada | Foto de 3000×2000 → 1600×1067. Exportada (19 KB, 1 foto) e importada en un perfil vacío. Partes, pagos, saldos (115 € y 132 €) y foto correctos. El PDF del documento lleva la imagen. |
| `copia-incompleta` | Ejecutada | La copia lleva `fotosFaltan: 1` y aparece la ventana «Copia incompleta». |
| `multipestana` | Ejecutada | Con dos ventanas del mismo perfil se conservan los dos trabajadores. |
| `datos-danados` | Ejecutada | El JSON dañado se conserva en otra clave después de guardar. |
| `sin-conexion` | Ejecutada | Servidor apagado: la app reabre controlada por el service worker, con 4 fuentes, los datos y un PDF generado. |
| `responsive` | Ejecutada | 390 px y 1280 px, 7 secciones: 0 px de desborde y menú visible. |
| `actualizacion` | Ejecutada | Al llegar un `sw.js` nuevo aparece «Hay una versión nueva de la app» y se borra `cc-2.0.1`. |
| `instalacion` | Simulada (identificación del navegador) | Instrucciones correctas para iPhone con Safari, Android con Chrome y Windows con Edge. Instalada: sin aviso en Inicio y «ya está instalada» en Ajustes. |
| `plataformas` | Simulada | APK: sección correcta, se escribe en la caché y se abre la hoja de compartir. claude.ai: arranca y no ofrece instalar. |

**Otras comprobaciones ejecutadas:**
- construcción repetible (mismo SHA-256 al repetir);
- búsqueda estática de URLs externas;
- APK y paquete de Windows (§ 4 y § 5);
- revisión de lo que se publicaría (§ 8).

**Cómo repetir las pruebas:** `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js`

## 7. Riesgos pendientes

1. **Dispositivos reales sin probar**: iPhone (Safari, app en pantalla de inicio, modo avión) y Android (Chrome, instalación de la web, APK, cámara, hoja de compartir). Es lo más importante antes de usar la app en el campo.
2. **Datos separados por instalación.** En iPhone, la app de la pantalla de inicio no ve lo guardado en Safari, y el APK no ve lo de Chrome. Hay que pasar los datos con la copia, y al importar se sustituye todo. Riesgo de confusión: la app lo explica, pero conviene probar el flujo con el encargado.
3. **Borrado de datos por el sistema.** Safari puede borrar los datos de una web que no se abre en semanas si no está añadida a la pantalla de inicio. Desinstalar el APK borra sus datos. Mitigación: copia de seguridad frecuente. Un aviso automático de copia queda propuesto, no implementado.
4. **Dos pestañas a la vez**: la corrección cubre el uso normal. Si las dos guardan en el mismo instante (milisegundos), la última sigue ganando.
5. **Borrar un dueño** borra sus partes, pero sus pagos y documentos (con fotos) quedan sin dueño. No se pierde nada, pero aparecen como «(dueño borrado)». Queda sin cambiar porque no es un fallo de estabilidad.
6. **`windows/dist` bloqueado** por otro proceso del sistema (probablemente el antivirus o el indexador). El instalador 2.3.0 se generó en `windows/dist-2.3.0`. No afecta a GitHub Actions.
7. **Flujos de GitHub Actions** (APK, `.exe`, Pages) sin ejecutar nunca, porque no hay repositorio. La primera ejecución puede necesitar ajustes.
8. **`CAMPAÑA CONTROL\instaladores\CampanaControl-web.zip`** apareció fuera de esta sesión. No se ha revisado ni usado; está fuera del repositorio.
9. **Cambios externos**: `www/sw.js` y los archivos nuevos que hizo otra herramienta se revisaron y se mantienen, con las correcciones de P4 y de la versión automática.

## 8. Instrucciones exactas para publicar la web en GitHub (solo con autorización)

> No hacer nada de esto sin la autorización expresa del dueño del proyecto.

**Antes de publicar:**
1. Ejecutar las pruebas. Deben salir 15 correctas: `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js`
2. Regenerar la web: `python herramientas\construir_www.py`
3. Revisar lo que se va a publicar: `git status --short --untracked-files=all`. No debe aparecer nada de esto:
   - archivos `.jks` o `.keystore`;
   - `local.properties`;
   - copias `CampanaControl-copia-*.json`;
   - `resultado*.json`;
   - las carpetas `node_modules`, `dist` o `clave-android`.

   Esta revisión se hizo el 6-11-2026: 130 archivos, 3,6 MB, sin claves, copias ni datos personales. El único DNI que aparece es el ejemplo ficticio `12345678A` de un campo del formulario.

**Publicar:**
1. Crear la cuenta de GitHub y un repositorio **público** vacío llamado `campana-control`. GitHub Pages gratis exige que sea público: **todo el código queda a la vista**, aunque no los datos, que viven en cada dispositivo.
2. En esta carpeta del proyecto:
   ```
   git config user.name "NOMBRE"
   git config user.email "ID+USUARIO@users.noreply.github.com"
   git add .
   git status
   git commit -m "CAMPAÑA CONTROL 2.3.0"
   git remote add origin https://github.com/USUARIO/campana-control.git
   git push -u origin main
   ```
3. En el repositorio:
   - **Settings → Pages → Source: GitHub Actions**.
   - Para el APK firmado: **Settings → Secrets and variables → Actions**, con los 4 secretos de `CAMPAÑA CONTROL\clave-android\LEEME-CLAVE.txt`.
4. **Actions → «Web (GitHub Pages)» → Run workflow.** La dirección será `https://USUARIO.github.io/campana-control/`.

**Comprobar después de publicar:**
1. Abrir la dirección. En Ajustes debe verse la versión 2.3.0.
2. Instalar en un iPhone desde Safari y en un Android desde Chrome.
3. Abrir con conexión, cerrar, poner el modo avión y volver a abrir.
4. Crear un parte de prueba, exportar la copia e importarla en otro dispositivo.

**Enlaces de descarga en la app:** solo cuando exista una «Release» firmada y comprobada, poner su URL en `DESCARGAS.apk` y `DESCARGAS.exe` del código fuente, regenerar la web y volver a publicar.

## 9. Recomendación

**La versión 2.3.0 está estable y lista para publicarse como piloto, pero no para darla por terminada en el campo** hasta pasar la prueba en dispositivos reales (§ 7.1).

- **A favor:** las 15 pruebas automáticas pasan. Los dos fallos con pérdida de datos están corregidos y tienen pruebas que los detectan. Los cálculos coinciden con el caso de control. Funciona sin conexión y no depende de servicios externos.
- **Recomendación:**
  1. Autorizar la publicación de la web y del APK en GitHub.
  2. Hacer una prueba piloto de una semana: un iPhone y un Android reales, con datos ficticios y luego reales, y copia de seguridad diaria.
  3. Solo después, usarla como herramienta principal de la campaña.
- **Multiusuario:** no implementado. El diseño está en `docs/ARQUITECTURA_MULTIUSUARIO.md`, para decidir el proveedor y las etapas.
