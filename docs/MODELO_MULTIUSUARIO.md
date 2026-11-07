# Modelo de datos multiusuario (3.0)

Fuente: `supabase/migrations/20261107000001_esquema_v3.sql`. Este documento lo explica; si no coinciden, manda el SQL.

## Principios

1. **La identidad no es la ficha.**
   - `auth.users` y `perfiles` son las personas que inician sesión.
   - `trabajadores` y `duenos` son las fichas de la campaña.
   - `miembros` une una cuenta con una campaña, un rol y, si corresponde, su ficha.

   Así una ficha puede existir sin cuenta y vincularse después con un código, sin duplicarse.
2. **Todo pertenece a una campaña.** Cada tabla de datos lleva `campana_id`. Las relaciones usan claves foráneas compuestas (`id`, `campana_id`): es imposible, incluso con peticiones directas, enlazar un parte de la campaña B con un dueño de la campaña A.
3. **Importes exactos:**
   - el dinero, en céntimos enteros (`*_cent`, `int` o `bigint`);
   - horas, kilos e IVA, en `numeric`;
   - el redondeo se hace al céntimo solo al presentar cada cifra, igual que la 2.3.0.
4. **Versiones:** las tablas editables llevan `version`. Para guardar hay que enviar la versión leída + 1; si otro guardó antes, falla con `CONFLICTO`.
5. **Datos personales aparte:** DNI, NSS, teléfonos y direcciones van en `trabajadores_privado` y `duenos_privado`, que no ven jefes ni otros trabajadores o dueños.

## Tablas

| Tabla | Para qué | Notas |
| --- | --- | --- |
| `perfiles` | Una por cuenta (se crea sola al registrarse) | `activo` = falso bloquea la cuenta; `puede_crear_campanas` lo concede el superadministrador |
| `superadmin` | Una sola fila: la cuenta del superadministrador | Sin políticas de escritura: solo se fija con SQL del propietario del proyecto |
| `campanas` | Nombre, año, inicio, jornada (`horas_dia`), hora de entrada y datos de la empresa | La ven todos sus miembros |
| `campanas_economia` | Precio por hora del trabajador y del dueño, e IVA | Solo creador, administrador y superadministrador |
| `miembros` | Cuenta + campaña + rol (+ ficha) | Un usuario puede tener varios roles en una campaña y estar en varias campañas. Cada ficha se vincula a una sola cuenta. |
| `trabajadores`, `trabajadores_privado` | Ficha y datos personales | `precio_hora_cent` vacío = el de la campaña |
| `duenos`, `duenos_privado` | Ficha y datos personales | `precio_hora_cent` vacío = el de la campaña |
| `duenos_trabajadores` | Trabajadores que salen por defecto en los partes de un dueño | |
| `asignaciones_equipo` | Jefe → trabajador, con `desde` y `hasta` | Conserva el historial: el jefe ve cada jornada solo si esa fecha cae dentro de una asignación suya |
| `maquinas` | Maquinaria y precio por unidad | |
| `partes` | Un parte por dueño y día: kilos y notas | Clave única (`dueno_id`, `fecha`), como en la 2.3.0 |
| `partes_filas` | Una fila por trabajador y parte: tipo de día, horas y nota | `fecha` copiada del parte (se actualiza en cascada), para los permisos por fechas |
| `partes_maquinas` | Unidades de cada máquina en un parte | |
| `pagos` | Entregas a trabajadores (`tipo` trabajador) y pagos de dueños (`tipo` dueño) | `importe_cent` mayor que 0 |
| `plantillas`, `documentos`, `fotos` | Modelos de la asesoría, documentos rellenos y fotos del papel | Las fotos van en Storage (bucket privado), ruta `<campaña>/<foto>.jpg`. Sin duplicados (`documento_id`, `sha256`). |
| `invitaciones` | Códigos de un solo uso para unirse a una campaña con un rol | Solo se guarda la huella SHA-256 del código; caduca y se puede revocar |
| `auditoria` | Quién cambió qué y cuándo (antes y después) | La escriben disparadores; nadie puede escribirla ni borrarla desde la app |
| `importaciones` | Copias 2.3.0 ya importadas (huella del archivo) | Con `origen_id` en cada tabla impide importar dos veces lo mismo |

## Funciones de la API

| Función | Quién | Qué hace |
| --- | --- | --- |
| `mis_campanas()` | Cualquier cuenta | Campañas y roles del usuario (selector de campaña) |
| `crear_campana(…)` | Cuentas autorizadas y superadministrador | Crea la campaña, su economía y al creador como miembro, en una sola operación |
| `crear_invitacion(campaña, rol, ficha, días)` | Creador o superadministrador (el rol creador, solo el superadministrador) | Devuelve el código una sola vez |
| `canjear_invitacion(código)` | Cualquier cuenta activa | Une la cuenta a la campaña con ese rol y esa ficha |
| `guardar_parte(…)` | Creador o superadministrador (con los permisos del que llama) | Guarda cabecera, filas y máquinas a la vez, con control de versión |
| `resumen_trabajador(campaña, desde, hasta)` | El propio trabajador | Jornadas, horas, importe, entregas y pendiente, solo suyos |
| `cuenta_dueno(campaña, dueño, desde, hasta)` | El propio dueño; creador y administrador para cualquier dueño | Mano de obra, maquinaria, base, IVA, total, pagos y pendiente |
| `jornadas_equipo(campaña, desde, hasta)` | Jefe | Jornadas de su equipo (sin importes) dentro de las fechas de cada asignación |
| `admin_usuarios()`, `admin_estadisticas()` | Superadministrador | Panel global |

## Cálculos (iguales que en la 2.3.0)

- **Horas de una fila:**
  - falta = 0;
  - día normal, o sin horas = `horas_dia` de la campaña;
  - resto de tipos = las horas anotadas.
- **Ganado por un trabajador** = Σ horas × su precio (o el de la campaña).
- **Le queda por cobrar** = ganado − entregas del periodo.
- **Cuenta del dueño** = Σ horas × precio del dueño + Σ unidades × precio de la máquina; IVA sobre esa base.
- **Le falta pagar** = total − pagos del periodo.
- **Kilos** = los de los partes o, si no hay, los totales del dueño.

**Comprobado con el caso de control de `docs/ENCARGO-MOVILES.md`:**
- trabajador: 13,5 h, 135 € ganados, 115 € pendientes;
- dueño con un tractor: 202 € de cuenta y 172 € pendientes.
