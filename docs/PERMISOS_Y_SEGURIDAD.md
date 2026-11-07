# Permisos y seguridad (3.0)

Los permisos los aplica **la base de datos** con políticas RLS en todas las tablas (`enable` y `force row level security`). La interfaz solo oculta botones por comodidad; aunque alguien manipule la app o haga peticiones directas a la API, la base de datos no le devuelve ni le deja cambiar lo que no le corresponde.

## Matriz por rol

L = leer · E = crear, cambiar y borrar · — = sin acceso · «propio» = solo lo vinculado a su ficha o equipo.

| Recurso | Superadministrador | Creador | Administrador | Jefe | Trabajador | Dueño |
| --- | --- | --- | --- | --- | --- | --- |
| Campañas (todas) | L E (y borrar) | L E las suyas | L la suya | L la suya | L la suya | L la suya |
| Economía de la campaña (precios, IVA) | L E | L E | L | — | — (su precio le llega en su resumen) | — (su precio, en su cuenta) |
| Usuarios: activar, bloquear, permitir crear campañas | L E | — | — | — | — | — |
| Miembros y roles | L E (incluido «creador») | L; invitaciones; quitar y cambiar (salvo creadores) | L | — | — | — |
| Fichas de trabajadores | L E | L E | L | L propio (su equipo) | L propia | — |
| Datos personales (DNI, NSS…) | L E | L E | L | — | L propios | L propios |
| Fichas de dueños | L E | L E | L | — (nombre y finca en su panel) | — (nombre en su resumen) | L propia |
| Equipos (asignaciones) | L E | L E | L | L las suyas | — | — |
| Maquinaria | L E | L E | L | — | — | en su cuenta |
| Partes y jornadas | L E | L E | L | L propio (fechas de asignación) | L sus filas | L sus partes |
| Pagos y entregas | L E | L E | L | — | L sus entregas | L sus pagos |
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

**Migraciones aplicadas:** `…000001`, `…000002`, `…000003` y `supabase/pruebas/solo_proyecto_pruebas.sql`.

La URL y la clave pública de ese proyecto **no están en el repositorio**: van en `supabase/pruebas/.env.pruebas`, ignorado por git. Motivo: el proyecto de pruebas tiene una regla que hace superadministrador a quien se registre como `superadmin…@pruebas.example.com`.

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
