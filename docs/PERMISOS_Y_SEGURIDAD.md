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

**Pendiente:**
- repetir las pruebas contra el proyecto Supabase real, incluidas las de Storage (fotos);
- pruebas de la app con sesiones simultáneas desde varios dispositivos (etapas B a D).
