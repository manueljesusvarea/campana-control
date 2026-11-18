# Permisos y seguridad (3.0)

Los permisos los aplica **la base de datos** con políticas RLS en todas las tablas (`enable` y `force row level security`). La interfaz solo oculta botones por comodidad; aunque alguien manipule la app o haga peticiones directas a la API, la base de datos no le devuelve ni le deja cambiar lo que no le corresponde.

## Matriz por rol

L = leer · E = crear, cambiar y borrar · — = sin acceso · «propio» = solo lo vinculado a su ficha o equipo.

| Recurso | Superadministrador | Creador | Administrador | Jefe | Trabajador | Dueño |
| --- | --- | --- | --- | --- | --- | --- |
| Campañas (todas) | L E (y borrar) | L E las suyas | L la suya | L la suya | L la suya | L la suya |
| Economía de la campaña (precios, IVA) | L E | L E | L | — | — (su precio le llega en su resumen) | — (su precio, en su cuenta) |
| Cuentas: crear, restablecer contraseña, bloquear | L E (todas; crea creadores) | L E las personas de sus campañas | — | — | — | — |
| Miembros y roles | L E (incluido «creador») | L; crear cuentas con su rol; quitar; dar o quitar edición a administradores (salvo creadores) | L | — | — | — |
| Fichas de trabajadores | L E | L E | L | L propio (su equipo) | L propia | — |
| Datos personales (DNI, NSS…) | L E | L E | L | — | L propios | L propios |
| Fichas de dueños | L E | L E | L | — (nombre y finca en su panel) | — (nombre en su resumen) | L propia |
| Equipos (asignaciones) | L E | L E | L | L las suyas | — | — |
| Maquinaria | L E | L E | L | — | — | en su cuenta |
| Partes y jornadas | L E | L E | L (E si tiene edición) | L propio (fechas de asignación) | L sus filas | L sus partes |
| Pagos y entregas | L E | L E | L (E si tiene edición) | — | L sus entregas | L sus pagos |
| Documentos y fotos | L E | L E | L | — | — | L los suyos |
| Auditoría | L | L | L | — | — | — |

Si el jefe también trabaja, recibe además el rol de trabajador con su ficha, y entonces ve sus propias jornadas.

## Cómo se aplica

- **Funciones de comprobación** (esquema privado `cc_priv`, `security definer`, solo responden sí o no sobre el usuario actual):
  - `es_superadmin()`;
  - `gestiona(c)`: creador o superadministrador;
  - `consulta(c)`: además el administrador;
  - `es_miembro(c)`;
  - `es_mi_trabajador`, `es_mi_dueno`, `jefe_ve(c, trabajador, fecha)`.

  Todas exigen además que la cuenta esté **activa**.
- **Escritura de datos de campaña:** solo `gestiona(campana_id)`, en alta, cambio y borrado. El administrador queda en solo lectura hasta que se definan permisos adicionales.
- **Roles de solo lectura:** jefe, trabajador y dueño consultan con funciones que devuelven solo lo suyo (`resumen_trabajador`, `cuenta_dueno`, `jornadas_equipo`). Sus políticas de lectura directa también están limitadas a lo propio.
- **Superadministrador:**
  - Es una fila en `superadmin`, sin políticas de escritura.
  - Se fija una sola vez con SQL del propietario del proyecto, asociada a su cuenta, después de registrarse.
  - Ninguna petición desde la app puede crearla ni cambiarla.
  - `perfiles.activo` y `perfiles.puede_crear_campanas` están protegidos por un disparador.
  - El rol «creador» solo lo asigna el superadministrador.
- **Anónimos:** sin acceso a tablas ni funciones.
- **Invitaciones:**
  - código aleatorio de 64 bits;
  - se guarda solo su huella SHA-256;
  - un solo uso, caduca en 1 a 30 días y se puede revocar;
  - una ficha solo se vincula a una cuenta.
- **Integridad:** claves foráneas compuestas por campaña, comprobaciones de valores (horas 0–24, importes mayores que 0…) y un parte por dueño y día.
- **Concurrencia:** control de versión optimista; la segunda edición sobre una versión vieja recibe `CONFLICTO`.
- **Auditoría:** disparadores en campañas, economía, miembros, fichas, maquinaria, asignaciones, partes, filas, pagos, documentos, fotos e invitaciones.
- **Fotos:** bucket privado; leer exige poder ver la fila en `fotos`, y subir o borrar exige `gestiona`. Máximo 2 MB y solo JPEG, PNG o WebP.
- **Claves:** la app solo lleva la clave pública (`anon`) del proyecto. La clave `service_role` nunca va en la app ni en el repositorio.

## Pruebas de seguridad (etapa A)

`supabase/pruebas/permisos.test.mjs`: **16 de 16 correctas** (7-11-2026) en PostgreSQL 18.6 local. Cada prueba es una petición directa con el JWT del usuario, como haría la API de Supabase.

| Comprobado | Resultado |
| --- | --- |
| Un trabajador no puede cambiar sus horas, pagos ni partes, y no ve datos de otros | ✅ |
| Un jefe no puede crear ni modificar jornadas, días, trabajadores o maquinaria; no ve otros equipos, pagos ni DNI; el historial de asignaciones limita sus fechas | ✅ |
| Un dueño solo ve sus partes, pagos y cuenta; no modifica nada | ✅ |
| Un administrador lee toda su campaña (con auditoría), no modifica nada y no entra en campañas ajenas | ✅ |
| Un creador no accede a campañas ajenas ni puede enlazar datos de otra campaña | ✅ |
| Un creador no puede hacerse superadministrador, darse permisos, nombrar creadores ni crear campañas sin autorización | ✅ |
| Anónimos sin acceso | ✅ |
| Invitaciones de un solo uso, caducadas rechazadas, códigos no guardados en claro | ✅ |
| Cuenta bloqueada pierde el acceso al momento | ✅ |
| Dos ediciones simultáneas: la antigua recibe `CONFLICTO` y no pisa la reciente | ✅ |
| La auditoría registra quién cambió horas y pagos, y nadie puede borrarla ni falsearla | ✅ |
| Cuentas exactas (caso de control 2.3.0) en trabajador y dueño | ✅ |

## Pruebas contra Supabase real (etapa B, 7-11-2026)

**Proyecto de pruebas:** `campana-control-pruebas`, en la organización Free «Campana Control», región Europa. Configuración:
- Data API activa;
- «exponer tablas nuevas automáticamente» desactivado;
- RLS automática activada;
- «Confirm email» desactivado **solo en este proyecto y temporalmente**.

**Migraciones aplicadas:** `…000001`, `…000002`, `…000003`, `…000004` (18-11) y `supabase/pruebas/solo_proyecto_pruebas.sql`.

La URL y la clave pública de ese proyecto **no están en el repositorio**: van en `supabase/pruebas/.env.pruebas`, ignorado por git.
- Hasta el 18-11-2026 el proyecto tenía una regla que hacía superadministrador a quien se registrase como `superadmin…@pruebas.example.com`.
- Se **eliminó** ese día: ahora los permisos de las cuentas fijas de prueba se dan por uuid, con SQL del propietario (ver `docs/ESTADO_ACTUAL_V3.md`).

`supabase/pruebas/real.test.mjs`: **14 de 14 correctas**. Son peticiones directas a la API de Supabase, con 11 cuentas ficticias y una sesión independiente para cada una:

| Comprobado contra Supabase real | Resultado |
| --- | --- |
| Las 22 tablas existen; un anónimo no lee ninguna | ✅ |
| Diagnóstico interno: RLS activada y forzada en las 22; 73 políticas, 35 claves foráneas, 26 comprobaciones | ✅ |
| Creador autorizado: campaña, fichas, asignaciones y 7 invitaciones canjeadas | ✅ |
| Dos sesiones: el creador registra 8 h y el administrador las ve al instante | ✅ |
| El trabajador ve sus 8 h y 80 € y nada más; el jefe de otro equipo no ve el registro | ✅ |
| Nadie se hace superadministrador, creador ni administrador por su cuenta | ✅ |
| Un usuario sin campaña no ve ningún dato privado | ✅ |
| Jefe, trabajador, dueño y administrador: 7 intentos de escritura cada uno, todos rechazados | ✅ |
| Cuenta del dueño: 8 h × 12 € = 96 €; otro dueño no la ve | ✅ |
| Campañas separadas, también al intentar enlazar fichas ajenas | ✅ |
| Conflicto entre dos sesiones: la edición antigua recibe `CONFLICTO` (HTTP 409) | ✅ |
| Auditoría con el autor de las jornadas; el trabajador no la lee | ✅ |

**Incidencia encontrada y corregida:** el código `40001` de los conflictos hacía que la API de Supabase reintentara hasta agotar el tiempo. Ahora es `PT409` (HTTP 409), en la migración `…000003`. En PostgreSQL local no se veía.

**Pendiente:**
- probar Storage (fotos) con la app;
- pruebas de la interfaz con sesiones en varios dispositivos (etapas B a D).

## Cuentas privadas (18-11-2026, migraciones 000006-000008)

Sustituye al alta por invitación (000004) y a la confirmación del correo (000005), decisión del dueño del proyecto del 18-11-2026. No hay registro público, ni correo, ni códigos.

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Inicio de sesión | Supabase Auth (contraseñas y sesiones) | Usuario + contraseña. Internamente, `usuario@usuarios.campana-control.invalid`: dominio reservado que no recibe correo; no autoriza nada |
| Crear cuentas | Edge Function `gestion-usuarios` → `preparar_alta()` con la sesión de quien crea | Superadministrador: creadores. Creador: administradores (lector o editor), jefes, trabajadores y dueños solo en sus campañas. Después la función crea la identidad con la clave secreta (solo en el servidor) |
| Ninguna otra vía | Disparador `al_registrarse` + hook «Before User Created» | Sin un alta autorizada de los últimos 10 minutos no se crea ninguna cuenta: ni registro público (además desactivado), ni panel, ni inserción directa |
| Contraseña temporal | 12 caracteres, generada en el servidor, mostrada una vez | La cuenta no está habilitada (`activo = false`) hasta que la persona pone la suya con `cambiar_clave` (comprueba la actual). Cambiarla por fuera (Auth directo) no la habilita |
| Restablecer | `preparar_restablecer()` + Edge Function | Solo el superadministrador o el creador que gestiona a esa persona (todas sus campañas son suyas). Nueva temporal; la anterior y sus sesiones dejan de valer |
| Bloquear | `preparar_bloqueo()` + Edge Function (también bloquea en Auth) | Sin datos al momento, sin inicio de sesión; ni restablecer ni cambiar la contraseña lo levantan |
| Editor | `miembros.puede_editar` + `cc_priv.edita()` | Partes, filas, máquinas del parte y pagos. Nunca usuarios, fichas, maquinaria ni permisos |
| Identificador fijo (000007) | Disparador en `auth.users` | Nadie cambia su identificador técnico por el de otro usuario |
| Servidor sin tablas (000008) | `cuenta_bloqueada_servidor`, `descartar_alta_servidor`, `clave_cambiada_servidor` | El rol de servidor no lee tablas; solo puede llamar a estas funciones |
| Primer superadministrador | Editor SQL del propietario | `select cc_priv.autorizar_alta_propietario('usuario', 'Nombre');` y, en 10 minutos, Authentication → Users → Add user con ese identificador y su contraseña |

**Pruebas (18-11-2026):**
- Locales: 25/25 (`npm test`).
- Contra el proyecto real: 12/12 (`node real.test.mjs`), que cubren los 15 casos pedidos por el dueño. Incluyen:
  - registro público rechazado;
  - 11 altas indebidas y 5 accesos directos rechazados;
  - editor y lector;
  - aislamiento entre campañas;
  - restablecer y bloquear;
  - tiempo real en 0,7 s, sin fuga a otra campaña.
- App con 6 sesiones contra el proyecto real (`ejecutar.js nube`): correcta.
