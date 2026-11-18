# Estado actual de CAMPAÑA CONTROL 3.0 (multiusuario)

Revisión del 18-11-2026. Lo que figura como «verificado» se ha comprobado ejecutando pruebas ese día. Lo que no se ha podido ejecutar figura como «sin probar». El historial completo está en git (rama `desarrollo/multiusuario-v3`).

## 1. Estado exacto del proyecto

- **Versión pública 2.3.0:** sin cambios.
  - Web: https://manueljesusvarea.github.io/campana-control/
  - Release `v2.3.0`: APK y `.exe`.
  - `main` no se ha tocado.
- **3.0 en desarrollo:** cuentas privadas con **usuario y contraseña, sin correo y sin registro público** (decisión del dueño del 18-11-2026).
  - Sustituye a la invitación por código (000004) y a la confirmación del correo (000005), sin borrar datos ni cuentas.
- **Proyecto Supabase de pruebas** (`campana-control-pruebas`, plan Free, Frankfurt):
  - activo, con las migraciones 000001 a 000008 aplicadas;
  - Edge Function `gestion-usuarios` desplegada;
  - registro público desactivado.
- No existe proyecto de producción. Coste: 0 €.

## 2. Último commit y rama de trabajo

- **Rama:** `desarrollo/multiusuario-v3`.
- **`main`:** `f4c9c1e`, con las etiquetas `v2.3.0` y `v2.3.0-publica`.
- **Commits del 18-11:**

  | Commit | Contenido |
  | --- | --- |
  | `f21e5f5` | Modo con cuenta |
  | `ccbf086` | Carrera en recargas |
  | `f3a82d8` | Alta por código |
  | `9b280ab` | Correo con código |
  | `b04c0a1` | Script de correo |
  | `f145d0b` | **Cuentas privadas: base de datos, Edge Function y pruebas reales** |
  | `8bd6a02` | **App con usuario y contraseña y «Gestión de usuarios»** |
  | (siguiente) | Documentación al día y retirada de lo del correo |

## 3. Funcionalidades terminadas

| Funcionalidad | Cómo se ha verificado |
| --- | --- |
| App 2.3.0 completa (partes, pagos, cuentas, informes PDF/Excel, fotos, copias, sin conexión, APK, Windows, iPhone) | 21/21 pruebas de regresión tras los cambios del 18-11 |
| Migración segura: un dispositivo con datos de la 2.3.0 sigue abriendo sus datos | Prueba `migracion-v3` |
| Esquema con RLS activada y forzada en 24 tablas; roles: superadministrador, creador, administrador (lector o editor), jefe, trabajador y dueño; varias campañas y roles por persona | 25/25 locales (PGlite) y 12/12 reales |
| **Cuentas privadas:** inicio con usuario y contraseña; identificador técnico `usuario@usuarios.campana-control.invalid` (no recibe correo, no autoriza nada) | Real: API y app |
| **Altas solo desde «Gestión de usuarios»** (Edge Function + `preparar_alta`): superadministrador → creadores; creador → administradores, jefes, trabajadores y dueños de sus campañas | Real: 11 altas indebidas y 5 accesos directos rechazados; registro público rechazado |
| Contraseña temporal (12 caracteres, mostrada una vez, no guardada); sin acceso hasta poner una propia; cambiarla por fuera no habilita la cuenta | Real y app |
| Administrador editor (jornadas y pagos) y administrador lector | Real y app (el lector, ni por la API) |
| Restablecer contraseña por quien gestiona a esa persona; la antigua y sus sesiones dejan de valer | Real y app |
| Bloqueo: sin datos al momento y sin inicio de sesión; ni restablecer ni cambiar contraseña lo levantan | Real y app |
| Identificador técnico fijo (nadie ocupa el de otro usuario) | Local |
| Partes, pagos, cuentas, equipos y vistas por rol; tiempo real y conflictos de versión | Real: aviso en 0,7 s (API) y unos 2,6 s (app); sin fuga a otra campaña |

## 4. Funcionalidades pendientes

| Funcionalidad | Estado |
| --- | --- |
| Prueba con dispositivos físicos (Android, iPhone, Windows) con cuentas distintas | Preparada en las pruebas automáticas; falta hacerla con el dueño |
| Pantallas con cuenta sin prueba en la app: pagos y entregas, vista del dueño, «Cuentas», maquinaria, panel global | La base de datos sí está probada |
| Fotos de documentos en Storage privado | Política escrita (000002); falta interfaz |
| Documentos, plantillas, gráficas, PDF y Excel con datos compartidos (generados en el dispositivo, sin guardarlos en la nube) | Pendiente |
| Asistente para pasar una copia `.json` de la 2.3.0 a una campaña con cuenta | Pendiente |
| Paginación y carga por fechas | Pendiente |
| Proyecto de producción y cuenta del superadministrador real | Solo con autorización (procedimiento en la sección 6) |
| APK, `.exe` y web 3.0 por GitHub Actions | Cuando el multiusuario esté completo y con autorización |

## 5. Estado real de Supabase (proyecto de pruebas)

| Comprobación | Resultado |
| --- | --- |
| Migraciones | 000001-000008 aplicadas (huella SHA-256 comprobada antes de ejecutar cada una) |
| Registro público | Desactivado. Además, el hook «Before User Created» y el disparador de alta exigen un alta autorizada |
| Inicio anónimo, teléfono y proveedores sociales | Desactivados |
| «Confirm email» | Desactivado: ya no se usa el correo para nada |
| SMTP | No configurado (no hace falta) |
| Edge Function | `gestion-usuarios`, con verificación de JWT activa. La clave secreta solo está en el entorno de Supabase |
| Rol de servidor | Sin acceso a tablas; solo tres funciones concretas |
| Superadministrador de pruebas | `propietario.pruebas` (ficticio). Contraseña solo en `supabase/pruebas/.cuentas-pruebas.json`, ignorado por git |
| Datos | Todos ficticios (cuentas y campañas de las pruebas automáticas) |

## 6. Autenticación y permisos

- **Cómo entra una persona.**
  1. Recibe en persona su usuario y una contraseña temporal.
  2. Al entrar, la app la obliga a poner una propia. La Edge Function comprueba la temporal.
  3. Después vuelve a entrar con la nueva, porque Supabase cierra las sesiones anteriores.
- **Cuenta habilitada:**
  - creada por un alta autorizada;
  - con identidad en Supabase Auth;
  - no bloqueada;
  - con contraseña propia;
  - y con sus pertenencias a campañas.

  Todo lo comprueba la base de datos (`perfiles.activo` y RLS).
- **Primer superadministrador en producción:**
  1. El propietario ejecuta en el editor SQL `select cc_priv.autorizar_alta_propietario('su.usuario', 'Su nombre');`.
  2. En los 10 minutos siguientes, crea el usuario en Authentication → Users → Add user, con el identificador que devuelve el SQL y su contraseña.
  3. Queda como superadministrador. Nadie más puede hacerlo: la función no se puede llamar desde la app.
- **Matriz de permisos y piezas:** `docs/PERMISOS_Y_SEGURIDAD.md`.

## 7. Pruebas ejecutadas y resultados (18-11-2026)

| Prueba | Dónde | Resultado |
| --- | --- | --- |
| Permisos (`supabase/pruebas`, `npm test`) | PostgreSQL local (PGlite) | **25/25** |
| Seguridad y los 15 casos pedidos (`node real.test.mjs`) | Proyecto real, API directa y Edge Function | **12/12** |
| App con 6 sesiones (`ejecutar.js nube`) | Electron + proyecto real | **Correcta** |
| Regresión de la app (`ejecutar.js`) | Electron, sin red | **21/21** |

**Qué hace la prueba de la app con 6 sesiones**, todo pulsando la interfaz contra la base de datos real:
1. El superadministrador crea un creador en «Gestión de usuarios».
2. El creador, en un móvil, entra con la temporal, pone la suya y crea la campaña, dos trabajadores y un dueño.
3. Crea un administrador lector, uno editor, un jefe y un trabajador. Cada uno entra en su dispositivo y pone su contraseña.
4. El editor cambia una jornada (día con 1 h de más). El trabajador lo ve en unos 2,6 s: 9 h y 90 €.
5. El lector lo ve, no tiene botón para editar y la API le rechaza el cambio.
6. El jefe solo ve a su equipo.
7. El superadministrador bloquea al trabajador: al reabrir la app ve «Cuenta bloqueada» y no puede volver a entrar.
8. El creador restablece la contraseña del lector: la antigua ya no sirve y, con la temporal, tiene que poner otra.

## 8. Cambios realizados el 18-11-2026

1. Recuperación del trabajo sin guardar (con copia previa en `respaldos/`) y arreglo de las pruebas.
2. Migración segura desde la 2.3.0 y condición de carrera en las recargas en tiempo real (corregidas).
3. Proyecto de pruebas reactivado; eliminado un disparador que daba superadministrador por el correo.
4. Alta por código (000004) y correo con código (000005). **Sustituidos** ese mismo día por decisión del dueño.
5. **Cuentas privadas:**
   - migraciones 000006 (altas autorizadas, contraseña temporal, editor, restablecer y bloquear), 000007 (identificador fijo) y 000008 (funciones del servidor);
   - Edge Function `gestion-usuarios`;
   - registro público desactivado.
6. **App:**
   - inicio con usuario y contraseña;
   - contraseña propia obligatoria;
   - pantalla de cuenta bloqueada;
   - «Gestión de usuarios»;
   - el editor puede abrir Parte y Pagos;
   - fuera el registro, los códigos y el correo.
7. **Pruebas reescritas:** reales por API, app con 6 sesiones y locales.
8. **Retirados:** `docs/GUIA_CORREO_SMTP.md`, `supabase/plantillas-correo/` y `supabase/pruebas/correo.real.mjs`, que ya no aplican (siguen en el historial de git).

## 9. Problemas encontrados

- **El proyecto Free se pausa tras una semana sin uso.** Se reactiva gratis desde el panel; durante la campaña el uso diario lo evita.
- **Al cambiar la contraseña, Supabase cierra las sesiones anteriores.** La app vuelve a entrar sola con la nueva.
- **Cambiar el identificador de una cuenta fue posible** hasta la 000007. Cerrado.
- **El rol de servidor no tiene acceso a tablas.** Se mantiene así y se usan funciones concretas (000008).
- **El panel de Supabase pide confirmar** al desplegar la Edge Function; sin esa confirmación no se despliega.
- **Detalles menores de diseño:** la barra inferior con una sola pestaña para el trabajador y el jefe, y el icono repetido en «Campañas».

## 10. Próximas tareas recomendadas

1. **Prueba con dos dispositivos físicos.** Con el dueño, en el proyecto de pruebas:
   - el dueño entra como superadministrador de pruebas y crea un creador;
   - el creador crea la campaña y las cuentas;
   - se comprueban las consultas por rol y la sincronización.

   Para el móvil se puede servir la app en la red local o compilar un APK de pruebas desde esta rama, sin publicar nada.
2. **Probar en la app** las pantallas que aún no tienen prueba: pagos, dueño, «Cuentas» y panel global.
3. **PDF, Excel y gráficas** con los datos compartidos, generados en el dispositivo y con las mismas fórmulas.
4. **Fotos y documentos** en Storage privado.
5. **Asistente de migración** desde una copia de la 2.3.0.
6. **Etapa F:**
   - revisión de seguridad;
   - proyecto de producción y cuenta del superadministrador real (con autorización);
   - versión candidata;
   - APK, `.exe` y web por GitHub Actions (con autorización).

## 11. Información para dirigir la continuación

- **Código fuente único:** `claude-artifact/campana-control.html`. Después de editarlo se ejecuta `python herramientas/construir_www.py`.
  - El modo con cuenta solo se activa si `www/config-nube.js` tiene configuración.
  - GitHub Actions lo genera vacío: la web pública sigue sin cuenta aunque se fusionara.
- **Backend:**
  - `supabase/migrations/000001-000008`.
  - `supabase/functions/gestion-usuarios/index.ts`. Se despliega desde el panel (Edge Functions → Code → Deploy updates → confirmar).
- **Pruebas:**
  - `cd supabase/pruebas && npm test` (local);
  - `node real.test.mjs` (proyecto real);
  - `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js` (regresión), y con `nube` (app real con varias sesiones).
- **Archivos locales que nunca van a GitHub:** `supabase/config-app.local.json`, `supabase/pruebas/.env.pruebas`, `supabase/pruebas/.cuentas-pruebas.json` y `www/config-nube.js`.
- **Reglas que siguen en vigor:**
  - nada a `main` ni a Releases sin autorización;
  - coste 0 €;
  - sin claves secretas en la app ni en el chat;
  - solo datos ficticios;
  - sin correo;
  - sin SQL destructivo;
  - sin firmas.
