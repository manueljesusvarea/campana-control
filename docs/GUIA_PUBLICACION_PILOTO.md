# Guía de publicación piloto · CAMPAÑA CONTROL 2.3.0

Verificación previa: 6-11-2026. **Publicada el 7-11-2026** (ver § 0). Los apartados 1 a 12 son la guía original; lo que dicen como «pendiente de GitHub» ya está resuelto en § 0.

**Cómo leer el estado de cada cosa:**
- ✅ **Comprobado**: probado de verdad en este ordenador o en GitHub.
- 🔶 **Simulado**: probado imitando el entorno (por ejemplo, la identificación del navegador de un iPhone).
- ⬜ **Pendiente**: necesita un teléfono real. **No se ha usado ningún iPhone ni ningún Android.**

---

## 0. Resultado real de la publicación (7-11-2026)

| Qué | Dónde / estado | Comprobado |
| --- | --- | --- |
| **Web (PWA)** | **https://manueljesusvarea.github.io/campana-control/** | ✅ |
| Repositorio (público) | https://github.com/manueljesusvarea/campana-control (commit `8643d93`, 133 archivos) | ✅ |
| APK Android | https://github.com/manueljesusvarea/campana-control/releases/download/v2.3.0/CampanaControl-2.3.0.apk | ✅ |
| Instalador Windows | https://github.com/manueljesusvarea/campana-control/releases/download/v2.3.0/CampanaControl-Setup-2.3.0.exe | ✅ |
| Página de la versión | https://github.com/manueljesusvarea/campana-control/releases/tag/v2.3.0 | ✅ |

**Flujos de GitHub Actions** (ejecución del primer `push`, 7-11-2026): los tres ✅ correctos.
- «Web (GitHub Pages)»: publicado con `deploy-pages`.
- «APK de Android»:
  - se ejecutó el paso **«Compilar APK firmado»** y el APK de pruebas se omitió;
  - el trabajo «publicar» subió el APK a la Release.
- «Instalador de Windows»: compilado y subido a la Release.

**Secretos:** `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`, configurados el 7-11-2026.
- Salen de los archivos originales de `clave-android`. No se generó ninguna clave nueva.
- Antes se comprobó que esa clave es la que firmó los APK 2.2.0 y 2.3.0 (certificado SHA-256 `2ec5f7c9…b9d5`).
- Los valores no se mostraron en ningún momento y no aparecen en los registros (comprobado en las 660 líneas del registro del APK).

**GitHub Pages:**
- origen «GitHub Actions» y HTTPS obligatorio;
- `http://…` y `/campana-control` sin barra redirigen (301) a la dirección HTTPS con barra.

**Comprobaciones hechas sobre lo publicado** (automáticas, desde este ordenador):

| Comprobación | Resultado |
| --- | --- |
| La web responde | ✅ HTTP 200. Certificado HTTPS válido (verificación estricta de `curl`). |
| Versión | ✅ «2.3.0» en `index.html`; caché `2.3.0-adc46213f6` |
| Archivos del service worker | ✅ Los 22 responden 200 con su tipo correcto (HTML, JS, CSS, manifiesto, PNG, WOFF2). |
| Contenido | ✅ Igual al comprobado en local, salvo los fines de línea y la huella de caché, que GitHub recalcula al reconstruir en Linux. |
| PWA en Chrome (perfil vacío) | ✅ Service worker activo con alcance `/campana-control/`. **0 errores de manifiesto y 0 de instalabilidad.** Iconos 192, 512, maskable 512 y 180 (iPhone) con su tamaño real. 0 peticiones externas, 0 errores de consola, fuentes y librerías cargadas. |
| Sin conexión | ✅ Con todas las peticiones de red bloqueadas, la app reabre desde la copia guardada **sin ninguna petición de red**. Funcionan la versión 2.3.0, el PDF y el Excel. |
| APK de la Release | ✅ `es.campanacontrol.app`, versión 2.3.0, `versionCode` **20300001** (mayor que el 20300000 local). Firmado con la **misma clave original**, así que se instala encima sin desinstalar. |
| EXE de la Release | ✅ Programa de Windows válido, versión 2.3.0 (116 MB) |
| Datos locales existentes | ✅ No se han tocado. La web publicada es otra dirección: sus datos empiezan vacíos y no afectan a `localhost:8000`, al APK ni al programa de Windows. Para pasarlos, usa la copia (§ 3.3). |

**Problemas encontrados y cómo se resolvieron:**
1. **Inicio de sesión de GitHub CLI**: varios intentos con códigos de dispositivo no llegaron a completarse. Se resolvió con **Git Credential Manager** (incluido en Git para Windows): ventana «Sign in with your browser» y autorización en el navegador. El acceso se guarda en el Administrador de credenciales de Windows; `gh` lo usa solo durante cada orden, sin guardarlo aparte.
2. **Seguridad de los flujos** (antes de usar los secretos):
   - la clave solo llega al paso de firma;
   - compilar tiene permiso de solo lectura y la Release se crea en otro trabajo sin la clave;
   - `npm ci --ignore-scripts` y `checkout` sin guardar credenciales;
   - `.gitattributes` para los fines de línea.

   Todo esto se probó compilando a partir de una copia exacta de los 133 archivos.
3. **Fines de línea** (sin efecto en la app): `construir_www.py` escribe CRLF en Windows y LF en Linux. Por eso la huella de caché de GitHub no coincide con la del PC. Propuesta para más adelante: que el script escriba siempre LF.

**Pendiente:**
- las pruebas en teléfonos reales del § 10: iPhone con Safari y desde el icono, Android con el APK y la PWA, cámara, hoja de compartir, modo avión y actualizar el APK encima;
- instalar el `.exe` en un Windows;
- decidir si se rellenan los enlaces de descarga dentro de la app (`DESCARGAS.apk` y `DESCARGAS.exe`, ahora vacíos) con las URL verificadas de arriba. Es un cambio de código: habría que hacer un commit y otra compilación.

**Actualizar en el futuro:** cada `git push` a `main` vuelve a publicar la web y a compilar el APK y el `.exe`. Para cambios que solo afectan a la documentación, pon `[skip ci]` en el mensaje del commit y no se recompila nada.

---

## 1. Estado real del proyecto

| Componente | Versión | Estado |
| --- | --- | --- |
| Código fuente (`claude-artifact/campana-control.html`) | 2.3.0 | ✅ |
| Web (`www/`), la que se publicará en GitHub Pages | 2.3.0, caché `2.3.0-f2bcc8fabf` | ✅ Al día con el código fuente: al reconstruirla no cambia nada. |
| APK Android (`CAMPAÑA CONTROL\instaladores\CampanaControl-2.3.0.apk`) | 2.3.0, `versionCode` 20300000 | ✅ Firmado con tu clave (certificado SHA-256 `2ec5f7c9…b9d5`). Lleva la misma web, byte a byte. ⬜ No instalado en ningún móvil. |
| Programa de Windows (`CAMPAÑA CONTROL\instaladores\CampanaControl-Setup-2.3.0.exe`) | 2.3.0 | ✅ Lleva la misma web, byte a byte, y el programa arranca. ⬜ El instalador no se ha ejecutado en este PC. |
| Flujos de GitHub (APK, `.exe`, web) | — | ✅ Revisados (§ 6). ⬜ Nunca ejecutados, porque no hay repositorio. |
| Multiusuario | — | Solo diseño (`docs/ARQUITECTURA_MULTIUSUARIO.md`). No implementado. |

**Desde la 2.3.0 no se ha cambiado el código de la app.** En esta verificación solo se han añadido 5 pruebas automáticas y se ha corregido una frase desfasada en `docs/PLAN.md`.

## 2. Pruebas verificadas

**Resultado:** 20 de 20 pruebas automáticas correctas (`herramientas/pruebas/resultado-publicacion.json`).

**Cómo se hicieron:**
- Con el motor de Chrome (Electron 45, Chrome 156) y la web servida en `/campana-control/`, igual que en `https://USUARIO.github.io/campana-control/`.
- Cada prueba usa perfiles temporales; ninguna toca tus datos.

**Cómo repetirlas:** `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js`

| Lo que pediste comprobar | Resultado | Prueba |
| --- | --- | --- |
| 1. Todas las rutas | ✅ `/campana-control` sin barra final lleva a la app (redirección como en GitHub Pages). Las 7 secciones se abren con enlace directo (`/`, `index.html` e `index.html?…`), con y sin conexión: 42 combinaciones. | `rutas` |
| 2. Librerías sin conexión | ✅ Con el servidor apagado, la app reabre y genera un PDF. Las fuentes y las librerías de PDF y Excel salen de la caché. 0 peticiones a otros dominios. | `sin-conexion`, `carga` |
| 3. Manifest válido | ✅ El propio Chrome lo valida: 0 errores de manifiesto y 0 errores de instalabilidad. `id`, `start_url` y `scope` quedan dentro de `/campana-control/`. | `manifest-iconos` |
| 4. Service worker | ✅ Se activa con alcance `/campana-control/` y sirve la app sin conexión. | `sin-conexion`, `rutas` |
| 5. La caché se actualiza al publicar | ✅ Se simula publicar una 2.3.1: aparece «Hay una versión nueva de la app», al pulsar «Actualizar» carga la versión nueva, la caché anterior se borra y la nueva versión funciona sin conexión. | `actualizacion-datos`, `actualizacion` |
| 6. Las actualizaciones no borran datos | ✅ Antes y después de actualizar, los datos son idénticos carácter a carácter y la foto se conserva. | `actualizacion-datos` |
| 7. Iconos de instalación | ✅ 192, 512, maskable 512, `apple-touch-icon` de 180 (iPhone) y favicon de 64: todos cargan y tienen el tamaño declarado. Metadatos de iPhone presentes. | `manifest-iconos` |
| 8. Sin archivos sensibles en lo público | ✅ La web publica 27 archivos (1,8 MB) sin claves ni datos personales. El repositorio subiría 133 archivos, sin claves, copias, carpeta de respaldos ni instaladores (§ 6.3). | revisión manual |
| 9. Instrucciones por dispositivo | 🔶 iPhone con Safari, iPhone con otro navegador, Android con Chrome, Windows con Edge o Chrome y Firefox. Si ya está instalada, no insiste. | `instalacion`, `plataformas` |
| Coherencia de versión | ✅ La web, el APK y el `.exe` llevan el mismo `index.html` (SHA-256 `c10ade51…`). | revisión manual |
| Cálculos (caso de control) | ✅ 1.ª quincena: 75 € / 55 € / 60 €. 2.ª quincena: 60 € / 60 € / 72 €. Mes: 135 € / 115 € / 132 €. Coinciden en pantalla, PDF y Excel. | `calculos`, `informes` |
| Datos y fotos | ✅ Altas, cambios y bajas, persistencia, varias pestañas, datos dañados, migración y copias con fotos. | `crud`, `persistencia`, `multipestana`, `datos-danados`, `fotos-*`, `copia-incompleta` |
| Cambio de instalación | ✅ Copia con foto de la web al programa de Windows y vuelta a una web vacía: importes, pagos y foto correctos. | `transferencia` |

## 3. Datos y cambio de dispositivo

### 3.1. Cada instalación tiene su propio almacén

**No hay sincronización entre instalaciones ni entre dispositivos.** Publicar la web en internet no cambia esto.

| Instalación | Dónde guarda los datos | ¿Comparte datos con…? |
| --- | --- | --- |
| Web publicada `https://USUARIO.github.io/campana-control/` en un navegador | Ese navegador, para la dirección `USUARIO.github.io` | Solo con otras pestañas o ventanas **del mismo navegador y perfil**. |
| PWA instalada en Windows (Chrome o Edge) | El mismo perfil del navegador que la instaló | Sí, con las pestañas de esa misma dirección en ese navegador. No con otro navegador. |
| PWA instalada en Android (Chrome) | Chrome, para esa dirección | Sí, con las pestañas de Chrome de esa dirección. No con el APK. |
| PWA en la pantalla de inicio del iPhone | Almacén **propio** de la app de inicio | **No** comparte con Safari: lo que hayas hecho en Safari no aparece en el icono, ni al revés. |
| APK de Android | Almacén privado de la app (WebView, dirección interna `https://localhost`) | **No**, con nada. |
| Programa de Windows (`.exe`) | `%APPDATA%\CAMPAÑA CONTROL` (dirección `file://`) | **No**, con ningún navegador. |
| Vista local `Abrir-web-local.cmd` (`http://localhost:8000/`) | El navegador, para `localhost:8000` | **No** con la web publicada: es otra dirección. |

**Comprobado** (prueba `almacenes`): con la campaña creada en un perfil,
- otra pestaña de la misma dirección y perfil ve los 5 registros;
- la misma app en otra dirección (`localhost` en lugar de `127.0.0.1`) ve 0;
- otro perfil o navegador ve 0;
- la página abierta como archivo (como el programa de Windows) ve 0.

**Sin probar en dispositivo:** la separación en el iPhone entre Safari y el icono de inicio, y la del APK. Es el comportamiento documentado de iOS y de Android.

**Atención si ya tienes datos en `http://localhost:8000/`** (la vista local de `Abrir-web-local.cmd`): **la web publicada no los verá.** Pásalos con una copia (§ 3.3).

### 3.2. Alcance real de la corrección «dos ventanas»

La app vuelve a leer los datos cuando otra ventana **del mismo almacén** guarda. Eso cubre:

| Caso | ¿Se protege? |
| --- | --- |
| Dos pestañas de la misma dirección en el mismo navegador y perfil | ✅ Comprobado (`multipestana`). |
| PWA instalada en el ordenador + pestaña del mismo navegador | Sí, por el mismo mecanismo (mismo almacén). No probado por separado. |
| Navegadores distintos (Chrome y Edge, por ejemplo) | ❌ No hay nada que proteger ni sincronizar: son almacenes distintos. |
| Programa de Windows y navegador | ❌ Almacenes distintos, sin sincronización. |
| APK y navegador | ❌ Almacenes distintos, sin sincronización. |
| Dos teléfonos u ordenadores | ❌ Nunca. Solo con copias de seguridad. |

### 3.3. Cómo pasar los datos de una instalación a otra (con fotos)

**Comprobado:** web → programa de Windows → web, con foto (prueba `transferencia`).
**Pendiente:** el mismo paso con el APK y con el iPhone. Usan el mismo código, pero el archivo se guarda y se elige con las pantallas del teléfono.

1. **En la instalación de origen:** **Ajustes → Copia de seguridad → Exportar copia.** Se genera `CampanaControl-copia-AAAA-MM-DD.json` con todos los datos y las fotos.
   - En Windows se pregunta dónde guardarla.
   - En el APK y en el iPhone se abre la hoja de compartir: elige **Guardar en Archivos** o **Drive**, o envíatela.
   - Si aparece la ventana **«Copia incompleta»**, falta alguna foto. No borres nada del origen hasta resolverlo.
2. **Lleva el archivo al otro dispositivo:** cable, Drive, correo o WhatsApp a ti mismo.
3. **En la instalación de destino:** **Ajustes → Copia de seguridad → Importar copia** y elige el archivo.
   - La confirmación dice cuántos registros y fotos trae, y si la copia está incompleta.
   - **Todo lo que hubiera en el destino se sustituye.**
4. **Comprueba en el destino:** un trabajador (lleva ganado / entregado / le queda), un dueño (le falta pagar) y la foto de un documento.
5. **Guarda la copia** hasta haberlo comprobado. No borres el origen hasta entonces.

**Regla de oro:** trabaja en **una sola instalación principal**. Si escribes en dos sitios, al importar una copia se pierde lo hecho en el otro.

## 4. Instalación por plataforma

### Android

**Opción A · APK (recomendada para el campo).**
1. Pasa `CampanaControl-2.3.0.apk` al móvil y ábrelo.
2. Acepta «instalar apps de origen desconocido» para la app con la que lo abriste (Archivos, Chrome…).
3. Abre la app «Campaña».

Estado: ⬜ pendiente en el móvil. ✅ Comprobados la firma, la versión y el contenido.

**Actualizar el APK sin perder datos:**
1. Instala el APK nuevo **encima**, sin desinstalar. Android conserva los datos si:
   - el nombre del paquete es el mismo (`es.campanacontrol.app`) ✅;
   - la clave de firma es la misma (`clave-android`) ✅;
   - el `versionCode` es mayor que el instalado ✅ (2.3.0 = 20300000; los APK de GitHub 2.3.0 serán 20300001, 20300002…).
2. **No mezcles**: tras instalar un APK de GitHub, no instales encima uno compilado en este PC de la misma versión. Tendría un número menor y Android lo rechazaría.
3. **Nunca instales un APK «de pruebas»** (los que se llaman `…-pruebas.apk`, que salen si faltan los secretos de la clave). Va firmado con otra clave: Android obligaría a desinstalar, **y desinstalar borra los datos**.
4. Exporta una copia **antes** de cada actualización.

**Opción B · PWA desde Chrome.**
1. Abre `https://USUARIO.github.io/campana-control/` en Chrome.
2. Pulsa «Instalar» en el aviso de Inicio o en **Ajustes → Instalar la app**. Si no aparece: menú **⋮ → Instalar aplicación** (o «Añadir a pantalla de inicio»).

Estado: 🔶 instrucciones simuladas, ⬜ pendiente en el móvil.

### iPhone (solo web; Apple no permite instalar archivos de apps)

1. Abre `https://USUARIO.github.io/campana-control/` en **Safari**.
2. Botón **Compartir** (cuadrado con flecha) → **Añadir a pantalla de inicio** → si aparece, deja activado **Abrir como app web** → **Añadir**.
3. Abre la app **desde el icono**, con conexión, y espera unos segundos: la primera vez descarga todo lo necesario para trabajar sin conexión.
4. **Prueba sin conexión:** cierra la app (deslizar hacia arriba), activa el modo avión y ábrela desde el icono. Debe abrirse con tus datos y poder hacer un PDF.

Estado: 🔶 instrucciones simuladas, ⬜ pendiente en el iPhone.

**Recuerda:** los datos del icono no son los de Safari (§ 3.1). Trabaja siempre desde el icono. Safari puede borrar los datos de una web que no se usa en semanas; los de la app de inicio están más protegidos, pero **haz copias igualmente**.

### Windows

- **Programa `.exe` (el actual):** ejecuta `CampanaControl-Setup-2.3.0.exe` → «Más información → Ejecutar de todas formas» (no está firmado). Para actualizar, ejecuta el instalador nuevo encima: los datos de `%APPDATA%\CAMPAÑA CONTROL` no se borran, ni siquiera al desinstalar.
  Estado: ⬜ el instalador no se ha ejecutado en este PC; ✅ el programa empaquetado arranca y funciona.
- **Web en el navegador:** abre la dirección en Chrome o Edge.
- **Instalarla como PWA:** en Chrome o Edge, pulsa el icono de instalar de la barra de direcciones, o el botón de **Ajustes → Instalar la app**. Firefox no instala apps web.
  Estado: 🔶 ✅ Chrome confirma que es instalable (0 errores); ⬜ no se ha instalado de verdad.
- **No uses a la vez el `.exe` y la web para la misma campaña:** son almacenes distintos (§ 3.1).

## 5. Copias de seguridad

- **Cuándo:**
  - al terminar cada jornada, o como mínimo cada semana;
  - siempre antes de actualizar, cambiar de móvil, desinstalar o importar.
- **Cómo:** **Ajustes → Exportar copia**. Guarda el archivo **fuera del teléfono** (Drive, correo, ordenador) y conserva varias fechas: no sobrescribas la anterior.
- **Comprobar una copia:** el archivo debe ocupar más que la anterior si has añadido fotos. Si al exportar aparece «Copia incompleta», revisa los documentos con fotos.
- **Recuperar:** **Ajustes → Importar copia** (sustituye todo lo que haya en esa instalación).
- **Si la app avisa de «datos dañados»:** pulsa «Descargar el contenido dañado», guarda ese archivo y luego importa tu última copia.

## 6. GitHub: revisión de los flujos

### 6.1. Qué hace cada flujo

Todos se ejecutan en cada `push` a la rama `main` o a mano desde la pestaña **Actions**.

- **`web.yml`**:
  1. regenera `www/` desde el código fuente;
  2. publica **solo la carpeta `www/`** en GitHub Pages.
- **`android.yml`**:
  1. Node 22 y Java 21;
  2. regenera la web, `npm ci` y `npx cap sync android`;
  3. con los 4 secretos, compila `assembleRelease` firmado con tu clave, sube el APK a la ejecución y a la «Release» `v<versión>`;
  4. sin los secretos, compila un APK **de pruebas** que solo queda en la ejecución y no se publica.
- **`windows.yml`**: en `windows-latest`, `npm ci` y electron-builder, y sube el `.exe` a la misma «Release».

### 6.2. Comprobaciones hechas

| Comprobación | Resultado |
| --- | --- |
| Sintaxis YAML de los 3 flujos | ✅ Válida (5-11-2026) |
| Existen en GitHub las acciones usadas (`checkout@v5`, `setup-node@v5`, `setup-java@v5`, `upload-artifact@v5`, `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4`) | ✅ Las 7 responden (HTTP 200) |
| `package-lock.json` coherente (lo que necesita `npm ci`), en la raíz y en `windows/` | ✅ «up to date» |
| La versión sale de un solo sitio (`APP_VERSION`) para la web, el APK, el `.exe` y el nombre de la «Release» | ✅ |
| Identidad de firma del APK | ✅ Los flujos usan la misma clave que el APK local (desde los secretos). El APK local verificado tiene el certificado `2ec5f7c9…b9d5`. ⬜ La firma en GitHub no se ha ejecutado. |
| `versionCode` | ✅ Versión × 1000 + número de ejecución: siempre crece. 2.3.0 en GitHub > 2.3.0 local > 2.2.0 local (1). |
| Eventos y permisos antes de usar los secretos | ✅ Solo `push` a `main` y ejecución manual, sin pull requests: el código de forks nunca recibe los secretos. La compilación tiene permiso de solo lectura y la «Release» se crea en otro trabajo sin la clave. La clave solo llega al paso de firma, después de `npm ci`. Las dependencias se instalan con `--ignore-scripts`. `checkout` no guarda credenciales. |
| Compilación a partir de una copia exacta de los 133 archivos del primer commit, sin scripts de paquetes | ✅ `npm ci --ignore-scripts` + `cap sync` + APK de pruebas con Gradle, y `npm ci --ignore-scripts` + instalador `.exe`: todo correcto en este PC |
| Ejecutar los flujos de verdad | ⬜ Imposible sin repositorio. La primera vez puede necesitar ajustes. |

### 6.3. Qué se sube al repositorio público

- **Se subirían 133 archivos (≈3,5 MB):** código, `www/`, el proyecto Android, la carpeta `windows/` (sin `node_modules` ni `dist`), los documentos y las pruebas.
- **No se sube nada de esto:**
  - claves (`*.jks`, `*.keystore`) ni `local.properties`;
  - copias `.json`;
  - resultados de pruebas;
  - `node_modules` ni carpetas de compilación.

  Las carpetas `clave-android`, `respaldos` e `instaladores` están **fuera** de la carpeta del repositorio, así que `git add .` nunca las incluye.
- **Lo que se publica en la web (GitHub Pages) es solo `www/`.**
- **El código será público**, porque Pages gratis lo exige. No contiene datos de tu campaña: esos viven en cada dispositivo.
- Si publicas otras webs en `USUARIO.github.io`, comparten dirección con esta. **No publiques ahí páginas de terceros** que no conozcas.

## 7. Publicar en GitHub, paso a paso (sin conocimientos técnicos)

**Antes de empezar:** comprueba que tienes la carpeta `CAMPAÑA CONTROL\clave-android` y una copia de ella en un pendrive o en tu nube.

### A. Cuenta y repositorio (en la web de GitHub)
1. Entra en <https://github.com> → **Sign up**. Crea la cuenta y confirma el correo. Apunta tu **nombre de usuario** (en esta guía, `USUARIO`).
2. Arriba a la derecha, **+ → New repository**:
   - nombre: `campana-control` (exactamente así);
   - **Public**;
   - **no** marques «Add a README» ni «.gitignore» ni licencia.
3. Pulsa **Create repository**.
4. Tu dirección privada para los commits: **foto de perfil → Settings → Emails**.
   - Marca **Keep my email addresses private**.
   - Copia la dirección que aparece, del tipo `12345678+USUARIO@users.noreply.github.com`.

### B. Preparar el repositorio *antes* de subir nada
5. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.
   - Crea los 4 secretos copiando nombre y valor de `CAMPAÑA CONTROL\clave-android\LEEME-CLAVE.txt`.
   - `ANDROID_KEYSTORE_BASE64` es el contenido **entero** de `ANDROID_KEYSTORE_BASE64.txt`.
6. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
7. Opcional: **Settings → Actions → General → Workflow permissions**. Si los flujos fallan al crear la «Release», elige «Read and write permissions».

### C. Subir el proyecto (en tu ordenador)
8. Abre la carpeta del proyecto `CAMPAÑA CONTROL\CampanaControl\CampanaControl` en el Explorador. Haz clic en la barra de direcciones, escribe `powershell` y pulsa Intro.
9. Copia y pega estas órdenes **una a una**, cambiando `TU NOMBRE`, el correo noreply y `USUARIO`:
   ```
   git config user.name "TU NOMBRE"
   git config user.email "12345678+USUARIO@users.noreply.github.com"
   git add .
   git status
   ```
10. Revisa la lista de `git status`. No deben aparecer `.jks`, `keystore`, `LEEME-CLAVE`, `local.properties`, `CampanaControl-copia`, `respaldos` ni `instaladores`. Si aparece alguno, **para** y pregunta.
11. Continúa:
    ```
    git commit -m "CAMPAÑA CONTROL 2.3.0"
    git remote add origin https://github.com/USUARIO/campana-control.git
    git push -u origin main
    ```
    La primera vez se abre el navegador para iniciar sesión en GitHub: acepta.

### D. Comprobar en GitHub
12. Pestaña **Actions**. Deben aparecer 3 flujos en marcha: «Web (GitHub Pages)», «APK de Android» e «Instalador de Windows». Espera a que los tres tengan ✅ verde (de 5 a 15 minutos).
    - Si «Web» falla la primera vez: comprueba el paso 6 y pulsa **Re-run jobs**.
13. **Settings → Pages** mostrará la dirección `https://USUARIO.github.io/campana-control/`. Ábrela: en **Ajustes** debe poner «Versión 2.3.0».
14. Pestaña **Releases → v2.3.0** debe tener `CampanaControl-2.3.0.apk` y `CampanaControl-Setup-2.3.0.exe`.
    - Si solo hay un APK `…-pruebas.apk` en Actions y ninguno en Releases, los secretos del paso 5 no están bien: **no lo instales**.

## 8. Cómo actualizar la aplicación (versiones futuras)

1. Antes de nada, **exporta una copia** en cada dispositivo que uses.
2. Quien desarrolle:
   - cambia el código y sube `APP_VERSION` (por ejemplo, 2.3.1);
   - ejecuta `python herramientas\construir_www.py` y las pruebas (todas correctas);
   - después, `git add .`, `git commit -m "…"` y `git push`.
3. **Web y PWA:** al abrir la app aparece «Hay una versión nueva de la app» → **Actualizar**. Comprobado que conserva datos y fotos. No recarga sola, para no perder un parte sin guardar.
4. **APK:** descarga el APK nuevo de **Releases** e instálalo **encima**.
5. **Windows:** descarga el `.exe` nuevo de **Releases** y ejecútalo encima.

## 9. Volver a una versión anterior sin perder datos

- **Regla:** primero **exporta una copia** desde la versión actual. Las copias de la 2.3.0 se pueden importar en versiones desde la 2.1.0: los campos nuevos son opcionales y las versiones antiguas los ignoran.
- **Web:** en GitHub, pestaña **Actions → «Web (GitHub Pages)»**, abre la ejecución de la versión buena y pulsa **Re-run jobs**. Otra opción: que quien desarrolle haga `git revert` del cambio y `git push`.
  - Los dispositivos verán «Hay una versión nueva» y cargarán la anterior. Los datos del navegador no se tocan.
  - ⬜ La vuelta atrás real en GitHub no se ha probado.
- **APK:** Android **no permite** instalar una versión con `versionCode` menor encima de otra mayor. Dos caminos:
  - (a) que quien desarrolle compile la versión anterior con un `versionCode` mayor;
  - (b) exportar la copia, desinstalar (**esto borra los datos del APK**), instalar la versión anterior e importar la copia.
- **Windows:** ejecuta el instalador de la versión anterior. Los datos de `%APPDATA%\CAMPAÑA CONTROL` se conservan. ⬜ No probado.

## 10. Pruebas manuales en teléfonos reales (obligatorias antes del piloto)

Hazlas con **datos ficticios**: el caso de control de `docs/ENCARGO-MOVILES.md`. Marca cada una como ✔ o ✘ y anota el modelo de teléfono.

**iPhone (Safari e icono de inicio)**
1. Abre la dirección en Safari e instala con **Añadir a pantalla de inicio**.
2. Abre desde el icono. Crea la campaña (12 €/h dueño, 10 €/h trabajador, IVA 0), un trabajador y un dueño, y partes del 15 (7,5 h) y del 16 (6 h).
3. Anota una entrega de 20 € y un pago del dueño de 30 €, los dos el día 15.
4. Comprueba la 2.ª quincena del dueño: «Le falta pagar 72,00 €». En el mes: 132 € (dueño) y 115 € (trabajador).
5. Crea un documento y añade una **foto con la cámara**. Comprueba que se ve la miniatura.
6. Genera el **PDF** de la cuenta y el **Excel**. Comprueba que se abren o comparten.
7. Cierra la app del todo, activa el **modo avión** y vuelve a abrirla: datos, foto y PDF deben funcionar.
8. **Exporta la copia** y guárdala en Archivos o Drive.
9. Borra la app de la pantalla de inicio, vuelve a instalarla (los datos estarán vacíos) e **importa la copia**. Comprueba los importes y la foto.
10. Rota el teléfono y revisa que ninguna pantalla se corta.

**Android (APK)**
11. Instala `CampanaControl-2.3.0.apk` y repite los pasos 2 a 8. Al exportar y generar PDF debe abrirse la **hoja de compartir**.
12. Instala **encima** el APK de GitHub `v2.3.0` (o uno más nuevo) y comprueba que **los datos siguen**.
13. Importa en el APK la copia hecha en el iPhone (paso 8) y comprueba importes y foto.

**Android (PWA en Chrome)**
14. Instálala desde Chrome (botón «Instalar» o menú ⋮) y repite los pasos 2, 5 y 7.

**Windows**
15. Instala el `.exe`, repite los pasos 2 a 6 y comprueba que el PDF y el Excel se guardan con «Guardar como».
16. Cierra y vuelve a abrir: los datos siguen.

## 11. Criterios para usar el piloto en una campaña real

**Se puede pasar a una campaña real (piloto) solo si se cumplen todos:**
1. Las 20 pruebas automáticas están correctas en la versión publicada.
2. Las pruebas manuales de § 10 dan ✔ en **al menos un iPhone y un Android reales** del tipo que se usará en el campo, incluido el modo avión.
3. Los importes del caso de control coinciden **al céntimo** en pantalla, PDF y Excel, en cada teléfono.
4. Una copia exportada en un teléfono se importa en otro con todos los partes, pagos y fotos (pasos 8–9 y 13).
5. Actualizar el APK encima conserva los datos (paso 12).
6. La web publicada abre en Ajustes con «Versión 2.3.0», y Releases tiene el APK **firmado**: no un `…-pruebas.apk`.
7. Hay un responsable de hacer **copia diaria** y guardarla fuera del teléfono, y una única instalación principal por campaña.

**No usar todavía si:**
- falla cualquier importe;
- se pierde una foto al importar;
- el APK no se actualiza encima;
- la app no abre en modo avión.

**Recomendación:** una semana de piloto con datos reales **en paralelo** con el método actual (libreta o Excel) antes de depender solo de la app.

## 12. Riesgos pendientes

1. ⬜ **Sin pruebas en teléfonos reales**: cámara, hoja de compartir, modo avión, instalación y actualización del APK.
2. ⬜ **Flujos de GitHub nunca ejecutados.** La primera ejecución puede necesitar algún ajuste.
3. **Almacenes separados** (§ 3): riesgo de trabajar en dos sitios y sobrescribir al importar. Mitigación: una sola instalación principal y copias.
4. **Pérdida del dispositivo o desinstalación** = pérdida de lo no copiado. Mitigación: copia diaria fuera del teléfono.
5. **Pérdida de la clave `clave-android`**: no se podrían publicar actualizaciones del APK sin desinstalar. Mitigación: dos copias en sitios distintos.
6. El `.exe` **no está firmado**: Windows mostrará el aviso de «editor desconocido».
7. **Dos ventanas guardando en el mismo milisegundo**: la última sigue ganando. Es poco probable en uso normal.
8. **Detalle visual sin corregir:** la confirmación de importar dice «y 1 fotos» en lugar de «y 1 foto». No afecta a los datos.
9. **Borrar un dueño** deja sus pagos y documentos como «(dueño borrado)». No se pierde nada.
