# Estado actual de CAMPAÑA CONTROL 3.0 (multiusuario)

Revisión del 20-11-2026. Lo que figura como «verificado» se ha comprobado ejecutando pruebas ese día. El historial está en git, rama `desarrollo/multiusuario-v3`.

## 1. Estado exacto

- **Versión pública 2.3.0:** sin cambios.
  - Web: https://manueljesusvarea.github.io/campana-control/
  - `main` = `f4c9c1e`, sin tocar.
- **Beta 3.0 (pruebas):** https://campana-control-v3-pruebas.pages.dev, con la etiqueta «PRUEBAS» visible. Se actualiza sola con cada `push` a `desarrollo/multiusuario-v3` si pasan las comprobaciones.
- **Funciones completas con datos compartidos:**
  - cuentas y roles;
  - jornadas, maquinaria, kilos y pagos, que ahora se corrigen con historial;
  - informes PDF y Excel y gráficas;
  - documentos con modelos propios y fotos privadas;
  - copias selladas, restauración e importación desde la 2.3.0;
  - sincronización con reconciliación;
  - consulta sin conexión;
  - copias diarias cifradas fuera de Supabase.
- **APK y EXE de pruebas** compilados en GitHub Actions, como artefactos, sin Releases. El EXE también se ha compilado y comprobado en este ordenador. Se instalan aparte de la 2.3.0.
- **Producción ACTIVA (autorizada el 20-11-2026):**
  - web **https://campana-control-app.pages.dev**;
  - Supabase `campana-control` (`voxhvqysgzgpuvvsgecz`), limpio, con el superadministrador `manuel.varea` y la cuenta técnica de copias `respaldo.copias` (solo lectura); migraciones 000001-000017;
  - copias diarias automáticas operativas desde el 20-11-2026 (GitHub Actions privado, cifradas, con prueba de restauración): `docs/COPIAS_Y_RECUPERACION.md`;
  - se actualiza solo desde `produccion/v3`, con tu aprobación;
  - detalle en `docs/PRODUCCION_PLAN.md`.
- **Coste:** 0 €/mes.

## 2. Ramas y commits

- `desarrollo/multiusuario-v3`: la beta. El trabajo se hace en `trabajo/v3-completa` y pasa con avance rápido cuando todo está en verde.
- `compilar/v3-pruebas`: solo para compilar el APK y el EXE de pruebas.
- `produccion/v3`: la única rama que publica producción. Protegida (no se puede borrar ni forzar; los cambios entran solo por pull request) y solo con tu aprobación.
- **21-11-2026:** administrar campañas con cuenta (configuración, precios, maquinaria, personas, archivar, restaurar y eliminar definitivamente; migraciones 000018-000019). Ver `docs/PERMISOS_Y_SEGURIDAD.md`.
- **Commits del 20-11:**

  | Commit | Contenido |
  | --- | --- |
  | `d1e62d4` | Pagos con historial, modelos de documento, consulta sin conexión, copias selladas (000013-000014) |
  | `bdd1028` | Copias diarias cifradas, preparación de producción, etiqueta de entorno, APK y EXE de pruebas |
  | `36c7588` | Corrección del YAML del flujo de compilación |
  | (siguiente) | Documentación |

## 3. Funciones terminadas hoy (verificadas)

| Función | Verificación |
| --- | --- |
| **Corregir pagos sin borrarlos**, con historial (antes, después, quién y cuándo), control de versión y sin poder cambiar la persona | Local: 15 → 18 € con auditoría; cambio de persona rechazado; conflicto de versión; el lector no puede; el trabajador no lee la auditoría. App real: 7 → 8 €, el lector lo ve y el historial dice «Anotado» y «Corregido» |
| **Modelos de documento con cuenta**: nuevo, copiar uno incluido, editar los campos a rellenar y borrar (no si está en uso) | Local: solo quien gestiona, en uso no se borra, auditado. App real: crear un modelo con un campo, usarlo en un documento, borrado rechazado |
| **Consulta sin conexión**: copia privada cifrada, aviso con la fecha, sin poder guardar, caduca a los 7 días, se borra al cerrar sesión | App real: el lector reabre la app sin red y ve los pagos (incluida la corrección) con el aviso; guardar está bloqueado; al volver la red se recarga de la nube. Al cerrar sesión desaparece la base cifrada |
| **Copias con sello del servidor** (HMAC; la huella sola no basta) y **cuentas autorizadas** | Local y real: una copia manipulada con la huella recalculada se detecta y no se importa sin confirmación expresa. La clave no es legible por la API |
| **Restauración completa aislada**: jornadas, maquinaria, kilos, pagos, documentos, fotos, cuentas autorizadas y relaciones | Local: campaña nueva con los mismos recuentos y sumas; 3 cuentas con su rol y ficha; el dueño ve la misma cuenta. Real: restauración en otra campaña con el mismo importe por persona, el documento, la foto y el PDF |
| **Copias diarias cifradas fuera de Supabase** (`herramientas/respaldo`) | Proyecto de pruebas: 105 campañas en 46 s. La segunda ejecución no copió nada (sin cambios). Se descifra con la frase correcta; con una frase equivocada, nada |
| **Si los permisos cambian mientras se carga**, la app se recupera (antes se quedaba en «Cargando la campaña…») | App real: bloqueo durante la carga y la pantalla correcta |
| **APK de pruebas** (`es.campanacontrol.app.v3pruebas`, «CAMPAÑA CONTROL 3.0 PRUEBAS») y **EXE de pruebas** (otro appId, nombre, acceso directo, desinstalación y carpeta de datos) | GitHub Actions: los dos correctos (artefactos de 5 MB y 116 MB). EXE local: los archivos empaquetados entran con cuenta, muestran PRUEBAS, cargan la campaña y generan el PDF |
| **Producción preparada**: `instalacion_completa.sql`, verificador no destructivo, despliegue solo desde `produccion/v3`, protección contra usar el proyecto de pruebas | Instalación limpia en una base vacía: 14 migraciones, 24 tablas vacías con RLS forzada, anónimo sin lectura y 6 funciones administrativas rechazadas. Verificador contra el proyecto de pruebas: 13/13. Construir producción con la URL de pruebas: rechazado |

Lo anterior (informes, fotos, importación, sincronización, roles, PWA…) sigue verificado: ver la sección 7.

## 4. Pendiente

| Pendiente | Estado |
| --- | --- |
| **Activar producción** | Plan exacto en `docs/PRODUCCION_PLAN.md`. Espera tu autorización |
| **Programar las copias diarias** en tu ordenador | Hay que configurarlo una vez (`respaldo_diario.ps1 -Configurar`) y programar la tarea. Lo haces tú: guarda credenciales y crea una tarea del sistema |
| Copia completa de la base de datos (`pg_dump`) | Documentada; necesita la contraseña de la base de datos, que solo tienes tú |
| **Probar el APK y el EXE en tus dispositivos** | Se descargan desde la ejecución de GitHub Actions (artefactos, 14 días). No los he instalado en ningún dispositivo |
| APK firmado y EXE de producción | Cuando haya producción y decidas cómo distribuirlos |
| Copias diarias sin el ordenador encendido (GitHub Actions privado) | Opción documentada; necesita crear un repositorio privado, con tu autorización |

## 5. Supabase (proyecto de pruebas)

- Migraciones **000001-000014** aplicadas. Cada una se comprobó por su huella; ninguna borra datos.
- La 000014 se ejecutó con RLS en la tabla del sello: el panel avisaba de una tabla sin RLS y se añadió al archivo antes de ejecutarla.
- Comprobado en el proyecto real: `cc_priv.sello` tiene RLS, `anon` y `authenticated` no pueden leerla y hay una sola clave.
- Consumo: muy por debajo del plan Free (ver `docs/DESPLIEGUE_PRUEBAS_V3.md`).

## 6. Seguridad y datos personales

Resumen en `docs/PERMISOS_Y_SEGURIDAD.md` (secciones del 19 y 20-11):
- cada rol recibe solo lo que la base de datos le deja leer;
- las fotos son privadas;
- exportar e importar, solo quien gestiona;
- copias selladas, y las diarias además cifradas;
- caché sin conexión cifrada y que caduca;
- auditoría de pagos, partes y modelos, que nadie puede borrar.

**Límites conocidos:**
- la consulta sin conexión de una cuenta bloqueada sin cobertura dura como mucho 7 días;
- los registros de inicio de sesión del plan Free duran poco;
- las copias en claro (descargadas desde la app) llevan datos personales y hay que guardarlas con cuidado.

## 7. Pruebas ejecutadas el 20-11-2026

| Prueba | Resultado |
| --- | --- |
| Permisos en PGlite (`npm test`) | **33/33**. Nuevas: corregir pagos, modelos, copia sellada y restauración completa |
| Instalación limpia (`node instalacion.test.mjs`) | **Correcta** |
| Verificador de proyecto contra el de pruebas | **13/13** |
| `nube-sesiones`, contra la **web publicada** | **Correcta**, con la corrección de pagos, el historial, los modelos, la consulta sin conexión y el borrado de la caché al salir |
| `nube-migracion`, contra la **web publicada** | **Correcta**, con la copia sellada, la manipulación con la huella recalculada y las cuentas autorizadas |
| `nube-pwa`, contra la web publicada | **Correcta** |
| Regresión 2.3.0 | **21/21** |
| Seguridad por API (`real.test.mjs`) | Ver el informe de entrega |
| Copias diarias (proyecto de pruebas) | **Correctas** |
| APK y EXE en GitHub Actions; EXE local | **Correctos** |

## 8. Problemas encontrados hoy

- **YAML del flujo de compilación:** una orden con `": "` sin comillas. Corregido.
- **Atasco en «Cargando la campaña…»** si los permisos cambiaban durante la carga. Corregido.
- **Carrera en una prueba:** un aviso de un bloqueo anterior se tomaba por el nuevo. Corregido.
- **Aviso del panel de Supabase** por la tabla del sello sin RLS. Se añadió RLS al archivo antes de ejecutar.
- **No hay JDK** en este ordenador: el APK se compila en GitHub Actions, sin instalar nada aquí.

## 9. Próximas tareas

1. Tu autorización para activar producción, siguiendo `docs/PRODUCCION_PLAN.md`.
2. Programar las copias diarias contra producción.
3. Probar el APK y el EXE de pruebas en tus dispositivos.
4. Primera campaña real en producción: importar tu copia de la 2.3.0 en una campaña nueva, o empezar de cero.

## 10. Para continuar

- **Código fuente:** `claude-artifact/campana-control.html` → `python herramientas/construir_www.py`.
- **Pruebas:**
  - `cd supabase/pruebas && npm test && node instalacion.test.mjs`;
  - `node real.test.mjs`;
  - `node verificar_proyecto.mjs`;
  - Electron `ejecutar.js` (regresión), y con `nube`, más `URL_PUBLICADA` para la web publicada.

  Deja unos minutos entre ejecuciones por el límite de inicios de sesión.
- **Reglas en vigor:**
  - nada a `main` ni a Releases sin autorización;
  - coste 0 €;
  - sin secretos en la app, en git ni en el chat;
  - solo datos ficticios en pruebas;
  - sin correo;
  - sin SQL destructivo;
  - sin firmas en los documentos.
