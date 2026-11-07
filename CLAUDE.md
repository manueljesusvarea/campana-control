# CAMPAÑA CONTROL · instrucciones para Claude Code

App para llevar la campaña de recolección de aceituna: partes diarios por dueño, horas de cada trabajador, maquinaria, kilos, entregas de dinero a trabajadores, pagos de los dueños, gráficas por quincena, documentos de la asesoría y cuentas en PDF y Excel.

Usuario: encargado de una cuadrilla en España. Toda la interfaz, los textos y los comentarios van en **español de España**.

## Decisiones del dueño del proyecto (no cambiar sin preguntar)

- **Sin usuarios ni contraseñas** por ahora. Cada dispositivo guarda sus datos. Para pasar datos entre dispositivos está «Ajustes → Copia de seguridad» (exportar e importar un `.json`).
- **Sin firmas de ningún tipo.** Se eliminaron a propósito: ni firma de trabajadores, ni hojas de firmas, ni casillas de firma en documentos o PDF.
- **Sin dominio propio y sin coste.** Plataformas objetivo:
  - **Android:** APK que se instala directamente, sin Google Play.
  - **Windows:** instalador `.exe`.
  - **iPhone:** la app web instalable («Añadir a pantalla de inicio»). No hay App Store.
- Nada de servicios de pago.

## Versión 3.0 (multiusuario) · reglas de trabajo

- Se desarrolla en la rama `desarrollo/multiusuario-v3`. **`main` conserva la 2.3.0 pública:** nunca fusionar con `main`, publicar una Release ni actualizar la web sin autorización expresa del dueño del proyecto. Los flujos de GitHub solo se ejecutan con `push` a `main`; subir la rama de desarrollo no publica nada.
- Backend: Supabase Free (sin facturación). Esquema y permisos en `supabase/migrations/`, pruebas de permisos en `supabase/pruebas/` (`npm test`, PostgreSQL local con PGlite). Si se cambia el esquema, **las pruebas de permisos deben seguir todas correctas**.
- Documentación: `docs/PLAN_VERSION_3.md` (decisiones y etapas), `docs/MODELO_MULTIUSUARIO.md`, `docs/PERMISOS_Y_SEGURIDAD.md`.
- Nunca subir claves de Supabase con privilegios (`service_role`), contraseñas, datos reales ni copias de seguridad. La clave pública `anon` sí puede ir en la app.
- Solo datos ficticios en pruebas. No migrar datos reales sin autorización.

## Estructura

```
claude-artifact/campana-control.html   ← CÓDIGO FUENTE ÚNICO de la app (HTML + CSS + JS en un archivo)
www/index.html                         ← generado: app instalable (no editar a mano)
www/manifest.webmanifest, www/sw.js    ← app instalable y funcionamiento sin conexión
www/icons/                             ← iconos (192, 512, maskable, apple-touch, favicon)
www/vendor/<librería>/<versión>/       ← jsPDF, jspdf-autotable y SheetJS en local (misma ruta que en cdnjs)
www/fonts/                             ← Barlow Condensed y Source Sans 3 en local (fonts.css + .woff2)
herramientas/construir_www.py          ← genera www/index.html desde el código fuente
package.json, capacitor.config.json    ← Capacitor (APK de Android)
android/                               ← proyecto Android de Capacitor (iconos, firma y versión en app/build.gradle)
assets/                                ← imágenes de origen para los iconos y la pantalla de inicio del APK
windows/                               ← app de Windows: Electron (main.js) e instalador (construir.js, electron-builder)
.github/workflows/                     ← android.yml (APK), windows.yml (.exe), web.yml (GitHub Pages)
docs/PLAN.md                           ← plan y estado de cada paso
docs/DATOS.md                          ← modelo de datos y cálculos
```

**Flujo de trabajo:** edita `claude-artifact/campana-control.html` y luego ejecuta `python herramientas/construir_www.py`. El script también escribe la `VERSION` de `www/sw.js`, que es una huella del contenido de todos los archivos que guarda el service worker: no la edites a mano. Si añades un archivo a `www/`, añádelo a la lista `APP` de `sw.js`.

**Pruebas:** `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js` (o con un filtro: `… ejecutar.js fotos`). Abre `www/` en `/campana-control/` con perfiles temporales aislados (nunca toca datos reales) y comprueba cálculos (caso de control de `docs/ENCARGO-MOVILES.md`), altas y bajas, persistencia, informes PDF/Excel, fotos y copias, varias pestañas, datos dañados, funcionamiento sin conexión, actualización, diseño en móvil y ordenador, instalación compatibilidad simulada con APK y claude.ai, rutas en `/campana-control/`, manifiesto e iconos, actualización con datos, almacenes independientes y traspaso de copias. Ejecútalas antes de dar algo por terminado. Para publicar, sigue `docs/GUIA_PUBLICACION_PILOTO.md`.

**Versión:** `APP_VERSION` del código fuente es la única. El APK (`versionName`), el instalador de Windows y las «Releases» de GitHub la leen de ahí. Súbela en cada versión que se publique.

**Publicación.** Repositorio público https://github.com/manueljesusvarea/campana-control; web https://manueljesusvarea.github.io/campana-control/. Cada `push` a `main` publica la web y compila el APK firmado y el `.exe` en la Release `v<APP_VERSION>`. Usa `[skip ci]` en commits solo de documentación. No hagas push sin autorización del dueño del proyecto.

**Plataformas.** Al subir a la rama `main` de GitHub, los tres flujos generan el APK, el `.exe` y la web. Para compilarlos en este ordenador:
- APK: `npx cap sync android` y después `gradlew assembleRelease` dentro de `android/`, con `JAVA_HOME` (JDK 21) y las variables `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD` (ver `..\..\clave-android\LEEME-CLAVE.txt`). **Gradle no compila en rutas con «Ñ»** («CAMPAÑA CONTROL»): copia el proyecto a una ruta solo ASCII y compila allí.
- Windows: `npm ci` y `node construir.js` dentro de `windows/`. Con Node 26 o posterior, npm no ejecuta los scripts de instalación: si falta `node_modules/electron/dist`, ejecuta `node node_modules/electron/install.js`.
- En el APK no hay service worker (`!window.Capacitor`) y `guardarArchivo()` usa `Capacitor.Plugins.Filesystem` y `Share`. En Windows la página se abre con `file://`, sin service worker.

El mismo archivo fuente también se publica como artefacto en claude.ai. Allí usa `window.claude` (base de datos en la nube, descargas). Fuera de Claude, `STANDALONE` vale `true`: usa `localStorage` y descarga los archivos directamente o con la hoja de compartir del móvil. Mantén las dos rutas funcionando.

## Cómo está hecho el código

- **Sin framework ni compilación.** Funciones `vInicio`, `vPartes`, `vDuenos`, `vTrabajadores`, `vInformes`, `vDocumentos` y `vAjustes` devuelven HTML como texto. `render()` repinta la sección según `location.hash`.
- **Acciones.** Los botones llevan `data-act="nombre"`; el objeto `A` contiene las acciones y un único listener de `click` las despacha.
- **Datos.**
  - `S[colección][id]` guarda todo en memoria.
  - `put(col, id, datos)` y `del(col, id)` escriben, en `localStorage` (clave `campana-control-v1`) o en la nube.
  - Colecciones: `ajustes`, `trabajadores`, `campanas`, `duenos`, `partes`, `plantillas`, `documentos` y `pagos`.
  - Las fotos del papel no van en `localStorage`: en la app instalable están en IndexedDB (`guardarFoto`, `blobDeFoto`, `pintarFotos`); ver `docs/DATOS.md`.
- **Cálculos.** Están en `registros()`, `resumenTrab()`, `cuentaDueno()`, `pagosDe()` y `porQuincena()`; ver `docs/DATOS.md`.
- **PDF y Excel.**
  - El PDF se hace con jsPDF 2.5.1 y jspdf-autotable 3.8.2; el Excel, con SheetJS 0.18.5.
  - El código fuente los carga desde cdnjs, y las fuentes desde Google Fonts, porque así lo necesita claude.ai. `construir_www.py` los cambia solo en `www/` por `vendor/…` y `fonts/fonts.css`, y se para si queda algún recurso externo o falta un archivo.
  - Para cambiar de versión una librería: cambia la URL de cdnjs en el código fuente, copia el `.min.js` en `www/vendor/<librería>/<versión>/` (desde `node_modules` o del registro de npm) y actualiza la lista `APP` de `www/sw.js`.
  - El service worker guarda en caché todo lo de la lista `APP` al instalarse. `construir_www.py` comprueba que existen todos esos archivos.
  - `guardarArchivo(nombre, blob)` es el único punto de descarga.
- **Gráficas.** `grafica()` dibuja un SVG en pantalla y `pdfChart()` la dibuja en el PDF. Son barras de horas por día, con un color por dueño (`--c1…--c6` / `PAL_RGB`).
- **Estilo.** Hay colores en variables CSS con tema claro y oscuro. Tipografías: Barlow Condensed para títulos y Source Sans 3 para texto. Verde oliva `#46561c` y oro aceite `#a87f12`.
- **Instalación.** `vInstalar()` (Ajustes) y `avisoInstalar()` (Inicio) se adaptan con `entorno()`: APK, Windows, app web ya instalada, aviso de instalación del navegador (`beforeinstallprompt`), iPhone con Safari o Chrome en Android. En claude.ai no se muestran. Los enlaces de descarga (`DESCARGAS.apk` y `DESCARGAS.exe`) están vacíos a propósito: solo se rellenan con la URL de una versión firmada, publicada y comprobada.
- **Actualizaciones de la web.** Al activarse un service worker nuevo aparece «Hay una versión nueva de la app · Actualizar» (código en `construir_www.py`). Nunca se recarga solo, para no perder un parte sin guardar.
- **Números en formato español.** `num()` entiende «2.350» como dos mil trescientos cincuenta y «7,5» como siete y medio.

## Comprobar cambios

1. Sirve la app con `python -m http.server 8000` dentro de `www/` y abre `http://localhost:8000`. El service worker solo funciona con `localhost` o `https`.
2. Si quieres datos de prueba, crea una campaña, 3 trabajadores, 2 dueños y varios partes. También puedes importar una copia `.json`.
3. Revisa al menos estas cosas:
   - parte diario: tipos de día, maquinaria, kilos «2.350» y guardar;
   - entregas y pagos: saldo pendiente;
   - periodo por quincena;
   - Informes: los 4 tipos, en PDF y en Excel;
   - exportar e importar la copia;
   - pantalla de móvil (390 px de ancho) y de ordenador.
4. Comprueba que no hay errores en la consola.

## Siguientes tareas

Ver `docs/PLAN.md`. En orden:
1. ~~Librerías en local.~~ Hecho.
2. ~~Fotos en IndexedDB.~~ Hecho.
3. ~~APK de Android con Capacitor y GitHub Actions.~~ Hecho.
4. ~~Instalador de Windows.~~ Hecho (Electron).
5. ~~Publicación gratuita en GitHub Pages para el iPhone.~~ Preparado; falta que el dueño suba el proyecto a GitHub.
