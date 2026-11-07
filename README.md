# CAMPAÑA CONTROL

Control de la campaña de aceituna: partes diarios, horas de cada trabajador, maquinaria, kilos, entregas de dinero, pagos de los dueños, gráficas por quincena, documentos de la asesoría y cuentas en PDF y Excel.

Los datos se guardan en cada dispositivo. Para pasarlos a otro, o guardar una copia, usa **Ajustes → Copia de seguridad → Exportar copia**, y en el otro dispositivo **Importar copia**. La copia lleva también las fotos de los documentos.

## Probar en local antes de publicar

En Windows, haz doble clic en **Abrir-web-local.cmd**. Se abre la app en el navegador de este PC. Usa siempre el mismo navegador y la dirección http://localhost:8000/ para recuperar la campaña. Cierra la ventana de la consola para apagar el servidor. La vista se sirve solo en este ordenador.

En Android puedes instalar directamente el APK de la carpeta de instaladores. El APK, la web y el programa de Windows guardan cada uno su campaña. Para trasladarla, exporta la copia desde la instalación de origen e impórtala en la de destino. Al importar se sustituyen los datos del destino.

Cuando decidas publicar, sigue los pasos de GitHub de más abajo. En iPhone abre la dirección HTTPS en Safari, pulsa **Compartir → Añadir a pantalla de inicio**, activa **Abrir como app web** si aparece y pulsa **Añadir**. Abre el icono con conexión la primera vez. En Android, Chrome también permite instalar la web desde su menú. Prueba a reabrirla en modo avión antes de llevarla al campo.

El encargo de revisión para Claude Code está en [docs/ENCARGO-MOVILES.md](docs/ENCARGO-MOVILES.md).

## Instalarla

Los instaladores ya hechos están en la carpeta `CAMPAÑA CONTROL\instaladores` (fuera de esta carpeta del proyecto). Cuando el proyecto esté en GitHub, las versiones nuevas saldrán en la página **Releases** del repositorio.

| Dónde | Cómo |
| --- | --- |
| **Android** | Pasa `CampanaControl-<versión>.apk` al móvil (WhatsApp, Drive, cable…) y ábrelo. La primera vez Android pide permitir «instalar apps de origen desconocido». Para actualizar, instala el APK nuevo encima: los datos se conservan. |
| **Windows** | Ejecuta `CampanaControl-Setup-<versión>.exe`. Windows avisa de «editor desconocido» porque el instalador no está firmado (un certificado cuesta dinero): pulsa **Más información → Ejecutar de todas formas**. |
| **iPhone** | Abre en Safari el enlace de GitHub Pages (`https://USUARIO.github.io/campana-control/`) → botón Compartir → **Añadir a pantalla de inicio**. |
| **Cualquier navegador** | El mismo enlace. |

⚠️ **Antes de desinstalar la app o cambiar de móvil, exporta una copia de seguridad.** Al desinstalar el APK, Android borra sus datos.

## Publicarla gratis en GitHub (una sola vez)

GitHub compila el APK y el `.exe` y publica la web cada vez que se sube un cambio. Es gratis.

Sigue los pasos de [docs/GUIA_PUBLICACION_PILOTO.md](docs/GUIA_PUBLICACION_PILOTO.md), apartado 7. El orden importa:
1. Crea la cuenta y un repositorio **público** y vacío llamado `campana-control`.
2. **Antes de subir nada**, configura el repositorio:
   - crea los 4 secretos de `CAMPAÑA CONTROL\clave-android\LEEME-CLAVE.txt`;
   - elige **Settings → Pages → Source: GitHub Actions**.
3. Sube el proyecto con tu dirección privada `…@users.noreply.github.com`.
4. Comprueba en **Actions** que los tres flujos terminan en verde.

Desde entonces, cada `git push` genera el APK y el `.exe` en **Releases** y actualiza la web.

🔑 **Guarda una copia de la carpeta `clave-android`** (pendrive, nube…). Sin esa clave no se pueden publicar actualizaciones del APK.

## Seguir desarrollándola con Claude Code

Abre esta carpeta con Claude Code. `CLAUDE.md` explica cómo está hecha la app, y `docs/PLAN.md` el estado de cada paso.

## Carpetas

- `claude-artifact/campana-control.html`: el código de la app. Es el mismo que la versión que tienes en Claude.
- `www/`: la app web lista para instalar. Se genera con `python herramientas/construir_www.py`.
- `android/`: el proyecto del APK (Capacitor).
- `windows/`: el programa de Windows (Electron).
- `.github/workflows/`: lo que GitHub ejecuta en cada cambio.
- `docs/`: plan de trabajo y explicación de los datos.
