# Estado actual de CAMPAÑA CONTROL 3.0 (multiusuario)

Revisión del 18-11-2026, al retomar el desarrollo tras la pausa del 7-11-2026. Todo lo que aquí figura como «verificado» se ha comprobado ejecutando pruebas ese día; lo que no se ha podido ejecutar figura como «sin probar».

## 1. Estado exacto del proyecto al retomarlo

- **Versión pública:** 2.3.0, sin cambios y funcionando.
  - Web: https://manueljesusvarea.github.io/campana-control/ (`APP_VERSION = "2.3.0"`; `config-nube.js` no existe allí, así que la web no conoce Supabase).
  - Release `v2.3.0`: APK y `.exe`, 2 descargas de cada uno.
  - Los tres flujos de GitHub solo se ejecutaron el 7-11 con `main`; subir la rama de desarrollo no ha publicado nada.
- **Rama `desarrollo/multiusuario-v3`:** sincronizada con GitHub en `fa97c2d` (etapa B: base de datos verificada 14/14).
- **Trabajo sin guardar del 7-11 (12:19–12:40):** 6 archivos modificados más `www/vendor/supabase-js/`, con la interfaz del modo con cuenta (unas 430 líneas) escrita pero nunca ejecutada.
  - `herramientas/pruebas/ejecutar.js` tenía un error de sintaxis (una cadena partida en dos líneas) que impedía pasar las pruebas.
  - Copia de seguridad hecha antes de tocar nada: `CAMPAÑA CONTROL/respaldos/2026-11-18-antes-retomar-v3/` (archivos y `cambios-sin-guardar.patch`).
- **Proyecto Supabase de pruebas** (`campana-control-pruebas`, organización «Campana Control», plan Free): **pausado por inactividad**. La dirección del proyecto no resolvía.
  - Reactivado el 18-11 con autorización del dueño («Resume project»; los datos se conservan y no tiene coste).
  - La sesión del panel había caducado: el dueño volvió a iniciar sesión con GitHub.

## 2. Último commit y rama de trabajo

- **Rama:** `desarrollo/multiusuario-v3` (GitHub: `origin/desarrollo/multiusuario-v3`).
- **`main`:** `f4c9c1e`, con las etiquetas `v2.3.0` y `v2.3.0-publica`. No se ha tocado.
- **Commits de esta sesión** (ver la sección 8):
  - `f21e5f5`: modo con cuenta, migración segura desde 2.3.0, cuentas de prueba por uuid.
  - `ccbf086`: carrera en recargas corregida, prueba real con 5 sesiones y este documento.

## 3. Funcionalidades terminadas

| Funcionalidad | Estado | Cómo se ha verificado |
| --- | --- | --- |
| App 2.3.0 completa (partes, pagos, cuentas, informes PDF/Excel, fotos, copias, sin conexión, APK, Windows, iPhone) | ✔ Verificada | 20 pruebas de regresión en Electron, 18-11 |
| Esquema 3.0: 22 tablas, RLS activada y forzada, funciones y auditoría | ✔ Verificado | 16/16 en PostgreSQL local (PGlite) el 18-11; 14/14 contra Supabase real el 7-11 |
| Roles en la base de datos: superadministrador, creador, administrador (solo lectura), jefe (solo su equipo y fechas), trabajador, dueño; varias campañas y varios roles por persona | ✔ Verificados en la base de datos | Mismas pruebas |
| Control de conflictos (`version` + error `PT409`) | ✔ Verificado | Prueba local y real |
| Invitaciones con código de un solo uso (huella SHA-256, caducidad) | ✔ Verificadas | Prueba local y real |
| Migración segura al instalar la 3.0: un dispositivo con datos de la 2.3.0 sigue abriendo sus datos en modo local | ✔ Verificada | Prueba `migracion-v3` (nueva) |
| `construir_www.py`: supabase-js en local y `config-nube.js` solo con clave pública (rechaza claves secretas) | ✔ Verificado | Compilación y prueba `carga` |
| App con cuenta: crear cuenta, entrar, crear campaña, fichas de trabajadores y dueños, invitaciones por código, unirse con código, equipos, parte diario, vistas de administrador, trabajador y jefe | ✔ Verificada contra el proyecto real | Prueba `nube-sesiones` (5 sesiones), 18-11 |
| Sincronización en tiempo real entre dispositivos (sin recargar) | ✔ Verificada | ~1,2 s desde guardar hasta verlo en otra sesión |
| Conflictos en la app: aviso, recarga y sin pisar datos | ✔ Verificado | Mismo creador en dos dispositivos |

## 4. Funcionalidades pendientes

| Funcionalidad | Estado |
| --- | --- |
| Partes de la interfaz con cuenta aún sin prueba en la app: pagos y entregas, vista del dueño («Mi cuenta»), pantalla «Cuentas», maquinaria en el parte, quitar acceso, terminar asignación, panel global del superadministrador, cerrar sesión, sin conexión | Programadas; la base de datos sí está probada para todas ellas (`real.test.mjs`). Falta ampliar `nube-sesiones` |
| **Alta controlada** antes de usar personas reales | Pendiente (obligatorio). Ahora cualquiera puede crear una cuenta, aunque sin código no ve nada |
| Restablecer contraseña olvidada | Pendiente |
| Fotos de documentos en Storage privado | Migración SQL escrita (`…000002_almacenamiento.sql`); falta la interfaz y probarla |
| Documentos, plantillas y gráficas por quincena en modo cuenta | Pendiente: en modo cuenta aún no hay pantalla de documentos ni gráficas |
| PDF y Excel desde los datos compartidos | Pendiente. Se generarán en el dispositivo, sin guardarlos en Supabase |
| Asistente de migración de una copia `.json` de la 2.3.0 a una campaña con cuenta | Pendiente (tabla `importaciones` ya creada) |
| Maquinaria en el parte con cuenta | Programada (se guarda con el parte); sin prueba de interfaz |
| Funcionamiento sin conexión con cuenta | Solo lectura de lo ya cargado y aviso «Sin conexión»; no hay cola de cambios pendientes (decisión: evita conflictos) |
| Paginación y carga por fechas para campañas grandes | Pendiente (ahora se carga la campaña entera) |
| Proyecto Supabase de producción | No existe. Se creará solo con autorización |
| Alojamiento web 3.0 (Cloudflare Pages u otra opción) | Por decidir en la etapa F |

## 5. Estado real de Supabase

Comprobado el 18-11-2026 sobre el proyecto real (no simulado):

| Comprobación | Resultado |
| --- | --- |
| Proyecto | `campana-control-pruebas` (región Frankfurt, Nano, plan Free). Pausado por inactividad → reactivado con autorización; disponible en unos 3 minutos |
| Organización | «Campana Control» (Free). No existe proyecto de producción |
| URL y clave pública en este ordenador | `supabase/config-app.local.json` y `supabase/pruebas/.env.pruebas` (ignorados por git). Ninguna clave secreta en el ordenador ni en el repositorio |
| Migraciones aplicadas | 000001 (22 tablas con RLS activada y **forzada**; 73 políticas, 35 claves foráneas, 26 comprobaciones), 000002 (bucket privado `fotos` existe), 000003 (`guardar_parte` con `PT409`) |
| Disparadores en `auth.users` | Solo `al_registrarse` (crea el perfil). El disparador por correo **eliminado** (SQL ejecutado y verificado: 0) |
| Superadministrador | Una cuenta ficticia fija designada por uuid. Las cuentas recién creadas se comprobaron **sin** permisos antes de designarlas |
| Permiso de crear campañas | Solo las 2 cuentas ficticias creadoras fijas (se retiró a 9 cuentas de pruebas anteriores) |
| Cuentas | Unas 75, todas ficticias `@pruebas.example.com`, de las pruebas automáticas |
| «Confirm email» | Desactivado solo en este proyecto de pruebas (temporal) |
| Coste | 0 €. Sin facturación ni servicios de pago |

SQL ejecutado el 18-11 en el editor del panel: `supabase/pruebas/solo_proyecto_pruebas.sql` (marcado por Supabase como «destructivo» por `drop trigger`/`drop function`; ejecutado con autorización expresa; no borra datos) y `CAMPAÑA CONTROL/supabase-sql/03-designar-cuentas-prueba.sql` (fuera del repositorio).

## 6. Estado de autenticación y permisos

- **Contraseñas:** las gestiona Supabase Auth (bcrypt en el servidor). La app nunca las guarda.
  - La sesión se guarda en el dispositivo con la clave `campana-control-sesion`.
  - Solo se usan la URL y la clave pública `sb_publishable_…`; `construir_www.py` rechaza claves secretas.
- **Superadministrador:**
  - Una sola fila en la tabla `superadmin`, sin políticas de escritura: no se puede obtener desde la app, un formulario ni una petición.
  - Lo fija el propietario del proyecto con SQL, por el uuid de una cuenta concreta.
  - Lo confirma la prueba «Nadie puede hacerse superadministrador…».
- **Corrección del 18-11:** se ha eliminado el disparador `zz_preparar_prueba`. En el proyecto de pruebas daba superadministrador o permiso de crear campañas a quien se registrase con un correo `superadmin…@pruebas.example.com` o `creador…@`. Como el repositorio es público, cualquiera podía hacerlo.
  - Ahora hay 3 cuentas ficticias fijas: superadmin, creadorA y creadorB.
  - Las crea `node real.test.mjs --preparar`, con contraseñas aleatorias guardadas solo en `supabase/pruebas/.cuentas-pruebas.json`, ignorado por git.
  - Sus permisos los da el propietario por uuid (`supabase-sql/03-designar-cuentas-prueba.sql`, fuera del repositorio).
  - Una prueba nueva comprueba que registrarse con un correo «superadmin…» ya no da nada.
- **Confirmación de correo:** desactivada **solo en el proyecto de pruebas** y solo para cuentas ficticias `@pruebas.example.com`.
  - Antes de usar personas reales hace falta un alta controlada (ver la sección 10).
- **Permisos por rol:** se aplican en PostgreSQL (RLS y funciones `security definer` en el esquema `cc_priv`). La interfaz solo oculta lo que el rol no puede hacer; si se fuerza una petición, la base de datos la rechaza.

## 7. Pruebas ejecutadas y resultados

| Fecha | Prueba | Dónde | Resultado |
| --- | --- | --- | --- |
| 18-11 | Permisos (`supabase/pruebas`, `npm test`) | PostgreSQL 18.6 local (PGlite) | **16/16** |
| 18-11 | Regresión de la app (`ejecutar.js`): 20 pruebas de la 2.3.0 + `migracion-v3` | Electron, perfiles aislados | **21/21** |

| 18-11 | Seguridad contra Supabase real (`node real.test.mjs`): anónimo, intruso con correo «superadmin…», diagnóstico RLS, invitaciones, 8 h vistas por el administrador, trabajador 8 h · 80 €, jefe de otro equipo, nadie se eleva, solo lectura por rol, cuentas de dueños, campañas ajenas, conflicto, auditoría | Proyecto de pruebas real | **15/15** |
| 18-11 | **Prueba real en la app con 5 sesiones independientes** (`ejecutar.js nube`): ver abajo | Electron + proyecto de pruebas real + Realtime | **OK 4 de 4** tras corregir una condición de carrera (antes: 1 fallo y 1 correcta) |

**Detalle de `nube-sesiones`.** Cada ventana es un dispositivo con su propio almacenamiento y su propia sesión; todo se hace pulsando la interfaz de la app, contra la base de datos real.
1. **Creador, móvil de 390 px («Android»):** entra con su cuenta, crea la campaña (8 h/día, 10 €/h trabajador, 12 €/h dueño), da de alta 2 trabajadores y 1 dueño, y genera 3 códigos de invitación.
2. **Administrador («Windows», 1280 px), trabajador («iPhone») y jefe:** crean su cuenta en la app y se unen con su código. El creador asigna el trabajador Dos al jefe.
3. **El creador guarda el parte:** 2 trabajadores, día normal, kilos «2.350».
4. **Sin recargar, en ~1,2 s (tiempo real):**
   - el **administrador** ve 16 h y no tiene botón para editar; si fuerza el cambio por la API, se rechaza;
   - el **trabajador Uno** ve **8 h y 80,00 €** y nada de los demás;
   - el **jefe del otro equipo** ve solo al trabajador Dos, no el registro del trabajador Uno.
5. **Conflicto:** el mismo creador tiene el parte abierto en el móvil y en el ordenador. Guarda primero el móvil (2.400 kg). El ordenador intenta guardar 9.999 kg con la versión antigua: recibe «Otra persona ha cambiado esto…», se recarga con 2.400 kg y no pisa nada.

Capturas de cada pantalla, con datos ficticios: se generan con `CAPTURAS=<carpeta>` y no se guardan en el repositorio.

## 8. Cambios realizados durante esta sesión

1. Copia de seguridad del trabajo sin guardar, fuera del repositorio.
2. `ejecutar.js`: arreglado el error de sintaxis.
3. **Migración segura desde 2.3.0.** `prefLocal()` considera local un dispositivo con datos de la 2.3.0 (`campana-control-v1`) que aún no ha elegido modo. «Entrar con mi cuenta» guarda la elección `cuenta`. Antes, quien actualizase vería la pantalla de entrar en lugar de sus datos.
4. **Pruebas.**
   - En las páginas `file://` (programa de Windows) se simula un `www/` sin cuenta, como lo compila GitHub Actions.
   - Prueba nueva `migracion-v3`.
   - Prueba real nueva `nube-sesiones`: solo se ejecuta pidiéndola (`… ejecutar.js nube`).
5. **Seguridad del proyecto de pruebas.**
   - Fuera el disparador por correo.
   - Cuentas fijas designadas por uuid.
   - `real.test.mjs --preparar` y una prueba contra el «intruso».
6. Commit `f21e5f5` en la rama de desarrollo, tras revisar que no lleva secretos.
7. **Supabase:**
   - proyecto de pruebas reactivado;
   - SQL de seguridad aplicado y verificado;
   - 3 cuentas fijas creadas y designadas por uuid;
   - 15/15 pruebas reales.
8. **Prueba real de la app con 5 sesiones:** encontró una condición de carrera. Una recarga por tiempo real que empezaba antes de guardar algo y terminaba después pisaba los datos nuevos en pantalla; lo guardado sí estaba en la base de datos.
   - Corregido: en `nubeCargar()` solo se aplica la carga más reciente.
   - Después, 4 de 4 ejecuciones correctas.
9. Documentación: este archivo, `PLAN_VERSION_3.md` (etapas y nota sobre la confirmación de correo) y `CLAUDE.md`.

## 9. Problemas encontrados

- **El proyecto Supabase Free se pausa tras una semana sin uso.** Esto afectará también a producción fuera de campaña.
  - Mitigación propuesta: aviso en la app cuando no se pueda conectar, y que el superadministrador lo reactive desde el panel (gratis).
  - Una tarea programada que «despierte» el proyecto no es recomendable: va contra el espíritu del plan gratuito.
- **La 3.0 con cuenta configurada ocultaba los datos de la 2.3.0 al actualizar.** Corregido (sección 8.3).
- **El disparador de preparación por correo era un acceso administrativo basado en un correo ficticio.** Eliminado (sección 6).
- `ejecutar.js` quedó con un error de sintaxis al interrumpirse la sesión anterior. Corregido.
- **Condición de carrera en la app con cuenta** (recarga en tiempo real antigua que pisaba datos nuevos en pantalla). La encontró la prueba real; corregida y comprobada (sección 8.8).
- Detalles menores vistos en las capturas, sin corregir:
  - la barra inferior del trabajador y del jefe tiene una sola pestaña;
  - el enlace «Campañas» del menú usa el mismo icono que «Inicio».
- La sesión del panel de Supabase en el navegador integrado caduca. Para volver a entrar hace falta que el dueño inicie sesión en GitHub.

## 10. Próximas tareas recomendadas

1. **Alta controlada (obligatoria antes de usar personas reales).**
   - Propuesta: que solo se pueda crear una cuenta con un código de invitación válido, comprobado en el servidor con el *hook* de Supabase Auth «antes de crear usuario». No necesita correo; hay que confirmar antes que ese *hook* está incluido en el plan Free.
   - Alternativa: activar la confirmación por correo con un SMTP gratuito.
   - Las cuentas del creador las autoriza el superadministrador (`puede_crear_campanas`).
2. **Ampliar la prueba real de la app**: pagos y entregas, vista del dueño, «Cuentas», maquinaria, quitar acceso, panel global y comportamiento sin conexión.
3. **Restablecer contraseña** sin correo: el creador o el superadministrador genera un código de un solo uso de restablecimiento (función en el servidor). Nunca se envían contraseñas.
4. Documentos y fotos en Storage privado (interfaz y pruebas reales con la política ya escrita).
5. Informes PDF y Excel y gráficas por quincena en modo cuenta, reutilizando las funciones de la 2.3.0 (mismas fórmulas).
6. Asistente de migración de la copia `.json` de la 2.3.0 a una campaña con cuenta. Primero con datos ficticios; con datos reales, solo con autorización.
7. Paginación y carga por fechas, y medición del consumo frente a los límites Free.
8. Etapa F:
   - revisión de seguridad completa;
   - pruebas en Android, iPhone y Windows reales;
   - versión candidata 3.0.0-beta en la rama de desarrollo;
   - proyecto de producción y publicación, solo con autorización.

## 11. Información que ChatGPT necesita para dirigir correctamente la continuación

- **Código fuente único:** `claude-artifact/campana-control.html`. Después de editarlo se ejecuta `python herramientas/construir_www.py`.
  - El modo con cuenta está en el bloque «Modo cuenta (3.0 · Supabase)»: funciones `nube*`, vistas `vN*`, acciones `n*`.
  - Solo se activa si `www/config-nube.js` tiene URL y clave pública. GitHub Actions lo genera con `null`, porque `supabase/config-app.json` (producción) no existe. Por eso, aunque se fusionase, la web pública seguiría sin cuenta.
- **Esquema:** `supabase/migrations/` (000001 esquema, 000002 Storage, 000003 conflictos PT409). Si cambia, deben seguir todas correctas las pruebas `supabase/pruebas` (`npm test`, local) y `node real.test.mjs` (proyecto de pruebas).
- **Pruebas de la app:**
  - `windows\node_modules\electron\dist\electron.exe herramientas\pruebas\ejecutar.js` (21 pruebas, sin red).
  - La prueba real con varias sesiones: `… ejecutar.js nube`.
- **Archivos locales que nunca van a GitHub:** `supabase/config-app.local.json`, `supabase/pruebas/.env.pruebas`, `supabase/pruebas/.cuentas-pruebas.json`, `www/config-nube.js` y la carpeta `CAMPAÑA CONTROL/supabase-sql/`.
- **Reglas que siguen en vigor:**
  - nada a `main`, ninguna Release ni web nueva sin autorización expresa;
  - coste 0 €;
  - sin claves secretas en la app ni en el chat;
  - solo datos ficticios;
  - ningún proyecto u organización nuevos sin autorización;
  - nada de SQL destructivo;
  - sin firmas;
  - APK sin Google Play, `.exe` sin firmar, iPhone como app web.
- **Decisiones de diseño 3.0:**
  - Dinero en céntimos enteros.
  - Las cuentas de dueño y trabajador las calcula el servidor con las reglas de la 2.3.0.
  - Sin cola de cambios sin conexión: con cuenta, sin red solo se consulta.
  - Invitaciones por código, no por correo.
  - Un único superadministrador.
