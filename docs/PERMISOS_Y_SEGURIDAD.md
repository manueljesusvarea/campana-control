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

## Alta controlada (18-11-2026, migración 000004)

**Regla:** solo se crea una cuenta con un código de invitación válido. Lo comprueba y lo gasta el servidor; la app no decide nada.

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Hook «Before User Created» (plan Free) | `public.hook_alta_con_codigo`, activado en Authentication → Hooks | Antes de crear la cuenta: sin código, o con uno inventado, caducado, anulado o usado → rechazo 403 con mensaje claro. No gasta el código. Solo lo puede ejecutar `supabase_auth_admin` |
| Disparador de alta | `cc_priv.nuevo_perfil` (`al_registrarse` en `auth.users`) | En la misma transacción que crea la cuenta: vuelve a comprobar el código, lo gasta (con bloqueo de fila) y da el acceso. Si falla, la cuenta no se crea. Funciona aunque el hook esté desactivado (comprobado: 17/17 con y sin hook) |
| Invitaciones a una campaña | `crear_invitacion` | Solo quien gestiona esa campaña (creador o superadministrador). Rol y ficha fijados en el código. Un solo uso, caducidad de 1 a 30 días, solo se guarda la huella SHA-256. Se pueden anular |
| Autorizaciones de creador | `autorizaciones_creador`, `crear_autorizacion_creador` | Solo el superadministrador. Un solo uso, caducan. Dan permiso de crear campañas y nada más |
| Primer superadministrador (producción) | Editor SQL del propietario | `select cc_priv.emitir_autorizacion_creador(7, null);` → crear la cuenta en la app con ese código → designar superadministrador por uuid |
| Cuenta existente | `canjear_invitacion` | Unirse a otra campaña o recibir permiso de creador con un código nuevo |

Además:
- El código gastado se quita de los datos de la cuenta.
- Las funciones internas (`cc_priv.*`) no se pueden llamar desde la app.
- En el proyecto están **desactivados** el inicio de sesión anónimo, el teléfono y los proveedores sociales.

### Comprobación de identidad (evaluación)

1. **El código ya identifica a la persona.**
   - El creador lo entrega en persona o por WhatsApp a alguien que conoce, y va ligado a una ficha concreta (por ejemplo, el trabajador X).
   - Quien lo usa demuestra que lo recibió de él. Es de un solo uso y caduca.
2. **Lo que falta es comprobar que el correo es suyo.** Sirve para que nadie use un correo ajeno o mal escrito, y para poder recuperar la contraseña. Requiere activar «Confirm email», y para eso hace falta enviar correos:

   | Opción | Coste | Valoración |
   | --- | --- | --- |
   | Correo integrado de Supabase | 0 € | Solo envía al equipo del proyecto y 2 correos por hora: **no sirve** para usuarios reales |
   | **SMTP de Gmail del dueño con «contraseña de aplicación»** | 0 € | **Recomendada.** Sin dominio propio; con el límite diario de envío de Gmail (unos cientos de correos, de sobra para una cuadrilla). La contraseña de aplicación la escribe el dueño directamente en Supabase (Authentication → SMTP), nunca en el chat ni en el repositorio |
   | Brevo (plan gratuito) | 0 € | Unos 300 correos al día según su web (comprobar antes); sin dominio propio, los correos desde una dirección de Gmail suelen acabar en spam |
   | SMS (teléfono) | De pago | Descartada |

   **Hecho el 18-11-2026:**
   - Migración 000005: sin correo confirmado la cuenta está inactiva (no ve ni hace nada aunque su invitación sea válida). Se activa sola cuando Supabase registra la confirmación; nadie la activa a mano; el bloqueo del superadministrador se respeta.
   - Pantallas de la app para el código de 6 cifras, reenvío y contraseña olvidada.
   - Plantillas en `supabase/plantillas-correo/`.

   **Falta (lo hace el dueño):** el SMTP de Gmail y activar «Confirm email». Pasos en `docs/GUIA_CORREO_SMTP.md`. **El envío real no está probado** hasta entonces.

   En el proyecto de pruebas sigue desactivada, solo para cuentas ficticias `@pruebas.example.com`.
