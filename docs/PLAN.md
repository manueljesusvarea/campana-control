# Plan para móvil y ordenador (sin coste)

| Plataforma | Cómo se instala | Coste |
| --- | --- | --- |
| Android | Archivo **APK** que se descarga y se instala. Se acepta «instalar apps de origen desconocido» una vez. | Gratis |
| Windows | Instalador **.exe**. Windows avisa de «editor desconocido» porque no está firmado: «Más información → Ejecutar de todas formas». | Gratis |
| iPhone | App web instalable: abrir el enlace en Safari → Compartir → **Añadir a pantalla de inicio**. Apple no permite instalar archivos de apps sin cuenta de pago. | Gratis |
| Navegador | El mismo enlace, en cualquier ordenador o móvil. | Gratis |

## Pasos (para hacer con Claude Code)

### 1. Librerías en local ✔ Hecho (5-11-2026)
La app instalable (`www/`) ya no descarga nada de internet:
- `www/vendor/jspdf/2.5.1/`, `www/vendor/jspdf-autotable/3.8.2/` y `www/vendor/xlsx/0.18.5/`: los `.min.js` de los paquetes npm, iguales byte a byte a los de cdnjs, con su licencia.
- `www/fonts/`: Barlow Condensed (600, 700) y Source Sans 3 (400, 600, 700), juegos `latin` y `latin-ext`, de `@fontsource/barlow-condensed` 5.3.0 y `@fontsource/source-sans-3` 5.3.1 (licencia OFL). `fonts.css` tiene los `@font-face`.
- El código fuente sigue con cdnjs y Google Fonts para claude.ai; `construir_www.py` los cambia por los locales solo en `www/`.
- `sw.js` (versión `cc-2.0.1`) guarda todo esto al instalarse y lo sirve primero desde la caché.

### 2. Fotos de documentos en IndexedDB ✔ Hecho (6-11-2026, versión 2.1.0)
- Las fotos del papel van a IndexedDB y en `localStorage` solo queda su id. Se guardan a 1600 px en lugar de 1000 px.
- Las fotos antiguas (dataURL) se migran solas al abrir la app.
- La copia de seguridad incluye las fotos. Si no caben, se exporta sin ellas y avisa.
- Si `localStorage` se llena, ahora avisa en vez de fallar sin decir nada.
- La app pide al navegador almacenamiento persistente (`navigator.storage.persist()`).
- Detalles en `docs/DATOS.md`.

### 3. APK de Android ✔ Hecho (6-11-2026, versión 2.2.0)
- Capacitor 8.6 (`package.json`, `capacitor.config.json`, carpeta `android/`), con `@capacitor/filesystem` y `@capacitor/share`.
- `guardarArchivo()`: dentro del APK guarda el archivo en la caché de la app y abre la hoja de compartir de Android (Drive, WhatsApp, correo, «Guardar en Archivos»…).
- En el APK no se registra el service worker: los archivos ya van dentro.
- Iconos y pantalla de inicio generados con `@capacitor/assets` desde `assets/`. Bajo el icono pone «Campaña».
- `android/app/build.gradle`: `versionName` = `APP_VERSION` del código fuente; `versionCode` = versión × 1000 + número de ejecución de GitHub Actions (desde la 2.3.0; 2.3.0 en local → 20300000). Se firma con la clave propia si existen las variables `ANDROID_KEYSTORE_*`.
- `.github/workflows/android.yml`: Java 21 (lo pide Capacitor 8), `npx cap sync android` y `assembleRelease` firmado, o `assembleDebug` si no hay secretos. Sube el APK a la ejecución y, si está firmado, a «Releases».
- Clave propia creada en `CAMPAÑA CONTROL\clave-android\`, fuera del repositorio. Las contraseñas y los secretos de GitHub están en `LEEME-CLAVE.txt`.
- Primer APK compilado en local y comprobado (firma v2, versión, contenido): `CAMPAÑA CONTROL\instaladores\CampanaControl-2.2.0.apk`.

### 4. Instalador de Windows ✔ Hecho (6-11-2026)
- Electron 45 + electron-builder 26 (NSIS), en la carpeta `windows/`. Se eligió Electron porque no necesita Rust. El instalador ocupa unos 115 MB.
- `windows/main.js`: una ventana sin menú que abre `www/index.html`. Las descargas abren «Guardar como» en la carpeta Descargas. Los datos quedan en `%APPDATA%\CAMPAÑA CONTROL` y no se borran al desinstalar.
- `windows/construir.js` genera `windows/dist/CampanaControl-Setup-<versión>.exe` con la versión de `APP_VERSION`.
- `.github/workflows/windows.yml`: lo compila en `windows-latest` y lo sube a la misma «Release» que el APK.
- Primer instalador compilado en local: `CAMPAÑA CONTROL\instaladores\CampanaControl-Setup-2.2.0.exe`.

### 5. iPhone y enlace web ✔ Preparado (6-11-2026)
- `.github/workflows/web.yml` publica `www/` en GitHub Pages en cada cambio: `https://USUARIO.github.io/campana-control/`.
- Comprobado que la app funciona bajo esa subcarpeta (service worker, manifiesto, librerías y fuentes).
- Falta lo que solo puede hacer el dueño: crear la cuenta de GitHub, subir el proyecto y activar Pages (ver README).

### 6. Estabilización y web instalable ✔ Hecho (6-11-2026, versión 2.3.0)
Detalle, pruebas y riesgos en `docs/INFORME_ESTABILIZACION_WEB.md`. En resumen:
- banco de pruebas automático (`herramientas/pruebas/ejecutar.js`, 15 pruebas);
- corregida la pérdida de datos con dos pestañas abiertas y al leer datos dañados;
- las copias con fotos que faltan quedan marcadas y avisan;
- la versión de caché es automática, hay aviso de versión nueva y se limpian las cachés antiguas;
- sección «Instalar la app» adaptada al dispositivo;
- `versionCode` del APK siempre creciente.

### 7. Multiusuario (solo diseño)
`docs/ARQUITECTURA_MULTIUSUARIO.md`. No implementar sin decisión expresa del dueño del proyecto.

### 8. Verificación final de publicación ✔ Hecho (6-11-2026)
`docs/GUIA_PUBLICACION_PILOTO.md` recoge:
- el estado real y las 20 pruebas automáticas;
- los almacenes de cada instalación;
- la instalación por plataforma, las copias, la actualización y la vuelta atrás;
- las pruebas en teléfonos reales y los criterios para el piloto.

Falta que el dueño cree la cuenta de GitHub y autorice publicar.



## Más adelante (no hacer sin pedirlo)
- Usuarios, contraseñas y roles (administrador, creador, lector para dueños y trabajadores). El dueño del proyecto lo ha aparcado.
- Sincronización automática entre dispositivos. Necesitaría un servidor; de momento se usa la copia de seguridad.

### 9. Publicación piloto ✔ Hecho (7-11-2026)
- Web: https://manueljesusvarea.github.io/campana-control/
- Repositorio: https://github.com/manueljesusvarea/campana-control
- Release v2.3.0 con el APK firmado y el `.exe`.
- Resultado y comprobaciones en `docs/GUIA_PUBLICACION_PILOTO.md` § 0.
- Pendiente: pruebas en teléfonos reales.
