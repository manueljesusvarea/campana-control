# Arquitectura futura multiusuario · CAMPAÑA CONTROL

> **Documento de diseño. No está implementado.** No hay pantallas de acceso, contraseñas, cuentas ni tablas creadas. La versión actual (2.3.0) guarda los datos en cada dispositivo y se mantiene así hasta que el dueño del proyecto decida empezar esta fase.

## 0. Punto de partida

- Hoy cada instalación (navegador, app web instalada, APK, Windows) tiene sus propios datos: `localStorage` (`campana-control-v1`) y las fotos en IndexedDB. Se pasan de un dispositivo a otro con la copia `.json` (ver `docs/DATOS.md`).
- Colecciones actuales: `ajustes`, `campanas`, `trabajadores` (comunes a todas las campañas), `duenos`, `partes` (con `filas` por trabajador y `maquinas`), `pagos`, `plantillas` y `documentos` (con `escaneos`).
- Los cálculos (`registros`, `resumenTrab`, `cuentaDueno`, `porQuincena`) se hacen en el cliente a partir de esos datos. Están cubiertos por el banco de pruebas (`herramientas/pruebas/ejecutar.js`), que habrá que mantener verde durante la migración.

## 1. Arquitectura recomendada

```
 App (web/PWA, APK, Windows)                       Servicio en la nube (backend gestionado)
 ┌──────────────────────────────┐                  ┌────────────────────────────────────────┐
 │ Interfaz actual (mismo código)│                  │ Autenticación (enlace o código por      │
 │  ├─ Capa de datos             │  HTTPS + token   │   correo / SMS; sin contraseñas propias)│
 │  │   ├─ caché local IndexedDB │◄───────────────►│ Base de datos PostgreSQL                │
 │  │   └─ cola de cambios       │                  │   + políticas por fila (RLS)            │
 │  └─ cálculos en el cliente    │                  │ Almacén de fotos (bucket privado)       │
 └──────────────────────────────┘                  │ Funciones: invitaciones, auditoría      │
                                                    └────────────────────────────────────────┘
```

1. **Un backend gestionado con base de datos relacional y permisos por fila** (recomendación: Supabase, ver § 5). Los permisos se comprueban **en la base de datos** con políticas RLS, no en la interfaz: aunque alguien manipule la app, la base de datos no le devuelve filas ajenas.
2. **La app sigue siendo la misma** (HTML/JS sin framework). Se sustituye la capa `put()/del()/loadLocal()` por una capa de datos con dos modos:
   - **local** (como ahora, sin cuenta), que se mantiene para quien no quiera nube;
   - **en la nube**, con caché local en IndexedDB y una **cola de cambios** para trabajar sin conexión en el campo y sincronizar al recuperar cobertura.
3. **Cada vista pide solo lo que el rol puede ver.** Un trabajador descarga sus filas de parte y sus entregas; nunca la campaña entera.
4. **Fotos** en un bucket privado. Se accede con URLs firmadas de corta duración que genera el backend tras comprobar el permiso.
5. **Auditoría**: cada cambio queda registrado (quién, cuándo, qué), lo que permite resolver disputas de horas o pagos.

## 2. Modelo de datos propuesto

Claves `uuid`. Todas las tablas llevan `creado_en`, `actualizado_en`, `actualizado_por` y `borrado_en`. El borrado es lógico, para la sincronización y la auditoría.

| Tabla | Campos principales | Notas |
| --- | --- | --- |
| `usuarios` | `id` (= id de autenticación), `nombre`, `telefono`, `email`, `es_admin_global` | `es_admin_global` solo se puede cambiar desde el backend, nunca desde la app. |
| `organizaciones` | `id`, `nombre`, `nif`, `direccion`, `telefono`, `iban`, `propietario_id` | Hoy son los «Datos de la empresa» de Ajustes. |
| `campanas` | `id`, `organizacion_id`, `nombre`, `anio`, `inicio`, `horas_dia`, `hora_inicio`, `precio_hora_trab`, `precio_hora_dueno`, `iva` | |
| `maquinas` | `id`, `campana_id`, `nombre`, `precio`, `unidad` | Hoy van dentro de `campanas.maquinas`. |
| `miembros_campana` | `campana_id`, `usuario_id`, `rol` (`creador`, `dueno`, `trabajador`), `dueno_id?`, `trabajador_id?`, `estado` | Relación N:M entre usuarios y campañas. Un usuario puede tener roles distintos en campañas distintas. |
| `trabajadores` | `id`, `organizacion_id`, `nombre`, `nif`, `nss`, `telefono`, `precio_hora`, `activo` | Ficha de la persona. Puede existir sin usuario. |
| `duenos` | `id`, `campana_id`, `nombre`, `nif`, `direccion`, `telefono`, `finca`, `municipio`, `poligono`, `parcela`, `precio_hora`, `kilos_total`, `num` | Puede existir sin usuario. |
| `duenos_trabajadores` | `dueno_id`, `trabajador_id` | Hoy es `duenos.trabajadores`, la asignación por defecto. |
| `partes` | `id`, `campana_id`, `dueno_id`, `fecha`, `kilos`, `notas` | Clave única (`dueno_id`, `fecha`), como hoy `<duenoId>_<fecha>`. |
| `partes_filas` | `parte_id`, `trabajador_id`, `tipo`, `horas`, `nota` | Una fila por trabajador y día. Es lo que verá el trabajador. |
| `partes_maquinas` | `parte_id`, `maquina_id`, `cantidad` | |
| `pagos` | `id`, `campana_id`, `tipo` (`trabajador`, `dueno`), `trabajador_id?`, `dueno_id?`, `importe`, `fecha`, `hora`, `forma`, `nota` | Con una restricción CHECK: exactamente uno de los dos ids. |
| `plantillas` | `id`, `organizacion_id`, `nombre`, `asesoria`, `titulo`, `cuerpo`, `campos` (jsonb) | |
| `documentos` | `id`, `campana_id`, `dueno_id`, `plantilla_id`, `fecha`, `desde`, `hasta`, `campos` (jsonb) | |
| `documentos_trabajadores` | `documento_id`, `trabajador_id` | |
| `fotos` | `id`, `documento_id`, `ruta_bucket`, `bytes`, `sha256` | El `sha256` permite comprobar copias y migraciones. |
| `invitaciones` | `id`, `campana_id`, `rol`, `dueno_id?`, `trabajador_id?`, `codigo_hash`, `caduca_en`, `usada_por?` | El código se guarda con hash y caduca. |
| `auditoria` | `id`, `usuario_id`, `tabla`, `fila_id`, `accion`, `antes`, `despues`, `en` | La escribe un trigger. Nadie salvo el administrador puede leerla entera. |

**Separación clave**: *usuario* (quien inicia sesión) ≠ *trabajador* o *dueño* (la ficha en la campaña). Se vinculan en `miembros_campana`. Así:
- se puede llevar la cuenta de un trabajador que nunca tendrá usuario;
- un mismo usuario puede ser trabajador en una campaña y dueño en otra;
- al quitar el acceso a alguien no se pierden sus horas ni sus pagos.

## 3. Relaciones entre campañas y usuarios

- **Organización 1 — N campañas.** El creador es el propietario de la organización. Podría añadirse otro creador a la misma organización más adelante.
- **Campaña N — M usuarios**, a través de `miembros_campana` con su rol en esa campaña.
- **Invitación**:
  1. El creador elige el rol y, si es dueño o trabajador, la ficha concreta.
  2. El sistema genera un enlace o código de un solo uso con caducidad.
  3. Quien lo acepta queda vinculado a esa ficha.
  4. El creador puede revocarlo.
- **El administrador global** no es miembro de las campañas. Su acceso viene de `usuarios.es_admin_global`, comprobado en las políticas, y todas sus acciones quedan en la auditoría.

## 4. Matriz de permisos por rol

L = leer · E = crear y editar · B = borrar · — = sin acceso. «Propio» = solo las filas vinculadas a su ficha.

| Recurso | Administrador global | Creador (sus campañas) | Dueño | Trabajador |
| --- | --- | --- | --- | --- |
| Usuarios y permisos globales | L E B | — | — | — |
| Organización (datos de empresa, IBAN) | L E | L E | L (nombre, NIF, IBAN para pagar) | L (nombre) |
| Campañas | L E B | L E B | L (nombre, fechas) | L (nombre, fechas) |
| Invitaciones y miembros | L E B | L E B | — | — |
| Fichas de trabajadores | L E B | L E B | L (solo nombre, en sus partes) | L E propio (teléfono) |
| DNI, NSS y teléfono de trabajadores | L | L E | — | L propio |
| Fichas de dueños | L E B | L E B | L E propio (contacto) | — |
| Partes: cabecera, máquinas y kilos | L E B | L E B | L propio (su finca) | — |
| Partes: filas por trabajador | L E B | L E B | L propio (horas por trabajador en su finca) | L propio (sus filas) |
| Precio por hora del trabajador | L | L E | — | L propio |
| Precio por hora del dueño y cuenta | L | L E | L propio | — |
| Pagos de dueños | L E B | L E B | L propio | — |
| Entregas a trabajadores | L E B | L E B | — | L propio |
| Documentos y fotos | L E B | L E B | L propio | L si figura en el documento |
| Informes PDF y Excel | todos | de sus campañas | su cuenta | su cuenta |
| Auditoría | L | L (sus campañas) | — | — |

La matriz se traduce en **políticas RLS**, por ejemplo:

```sql
-- Un trabajador solo ve sus filas de parte; un creador, las de sus campañas
create policy filas_lectura on partes_filas for select using (
  es_admin_global()
  or exists (select 1 from miembros_campana m join partes p on p.id = partes_filas.parte_id
             where m.campana_id = p.campana_id and m.usuario_id = auth.uid() and m.estado = 'activo'
               and (m.rol = 'creador'
                    or (m.rol = 'trabajador' and m.trabajador_id = partes_filas.trabajador_id)
                    or (m.rol = 'dueno' and m.dueno_id = p.dueno_id)))
);
```

Los importes se calculan en el cliente con las mismas funciones de hoy. Para dueños y trabajadores conviene **vistas en la base de datos** (`v_cuenta_dueno`, `v_cuenta_trabajador`) que ya filtran por usuario. Así nunca descargan datos que no deban ver, ni siquiera para calcular.

## 5. Opciones de backend gratuitas o de bajo coste

Los límites de los planes gratuitos cambian a menudo. **Antes de elegir hay que comprobar las condiciones vigentes en la web de cada proveedor.** Lo que sigue es una orientación, no una cotización.

| Opción | A favor | En contra | Encaje |
| --- | --- | --- | --- |
| **Supabase** (PostgreSQL + RLS + autenticación + almacenamiento) | Modelo relacional que encaja con las cuentas. Permisos por fila en SQL, auditables. Autenticación por enlace o código sin gestionar contraseñas. Región en la UE. Se puede exportar todo (es PostgreSQL estándar) o alojarlo uno mismo más adelante. | En el plan gratuito, los proyectos inactivos se pausan y la capacidad es limitada. La sincronización sin conexión hay que construirla (cola propia). | **Recomendada.** |
| **Firebase** (Firestore + Auth + Storage) | Muy buen soporte sin conexión en el SDK. Autenticación sencilla. | Base de datos de documentos: los informes con cruces (quincena × dueño × trabajador) son más incómodos. Las reglas de seguridad son más difíciles de auditar que SQL. Dependencia de un solo proveedor. Para el almacenamiento de archivos, Google pide un plan con facturación. | Alternativa. |
| **PocketBase** (un solo ejecutable, SQLite) | Muy simple, todo en un archivo y fácil de copiar. Reglas por colección. | Necesita un servidor encendido siempre: es un coste y alguien tiene que mantenerlo y hacer copias. | Solo si hay un servidor propio. |
| **Appwrite Cloud** | Autenticación, base de datos y almacenamiento integrados. Permisos por documento. | Menor comunidad en España. Los límites del plan gratuito pueden cambiar. | Alternativa. |
| **Cloudflare Workers + D1** | Plan gratuito generoso y rápido. | Autenticación y permisos a mano, en código: más riesgo de errores de seguridad. | No recomendada para empezar. |
| **Base de datos de artefactos de claude.ai** (la que ya usa la versión de Claude) | Ya existe en el código (`MODE === "nube"`). | Exige cuenta de Claude a cada usuario. No sirve para dueños ni trabajadores. Sin permisos por rol. | No sirve para multiusuario. |

**Recomendación:** Supabase en región de la UE. Si en algún momento el plan gratuito no basta o se pausa, el siguiente paso es su plan de pago más bajo, o alojarlo en un servidor propio. Al ser PostgreSQL estándar, se puede salir sin reescribir la app.

## 6. Estrategia de migración desde el almacenamiento local

Principio: **la migración nunca borra los datos locales.** Se puede repetir y siempre se puede volver atrás.

1. **Copia previa obligatoria.** El asistente de migración exige exportar antes una copia `.json` completa (con fotos) y comprueba que no está marcada como `incompleta`.
2. **Ensayo.** Se lee la copia y se genera un informe sin escribir nada: número de campañas, dueños, partes, filas, pagos y fotos, y los importes de control por dueño y por trabajador, calculados con las funciones actuales.
3. **Carga en la nube**, por pasos:
   - Cada registro conserva su id antiguo en una columna `id_local`. Esto permite repetir la carga sin duplicar.
   - `partes.filas` pasa a `partes_filas`, y `partes.maquinas` a `partes_maquinas`.
   - Las fotos se suben al bucket comprobando el `sha256`.
4. **Verificación.** Se vuelven a calcular los importes de control desde la nube y se comparan con los del ensayo. Si cambia un solo céntimo, la migración se marca como fallida y el dispositivo sigue en modo local.
5. **Cambio de modo.** Solo con la verificación correcta, el dispositivo pasa a modo nube. Los datos locales se conservan con otro nombre durante al menos una campaña.
6. **Varios dispositivos con datos distintos.** Se migra uno como principal. Los demás se comparan con él y las diferencias se presentan para resolverlas a mano; nunca se mezclan en silencio.

## 7. Riesgos de seguridad y protección de datos

- **Datos personales** (RGPD y LOPDGDD): nombres, DNI o NIE, número de la Seguridad Social, teléfonos, direcciones, IBAN, horas y pagos.
  - Hay que identificar al responsable del tratamiento (la organización) y la base legal (relación laboral o contractual).
  - Hay que firmar un contrato de encargo de tratamiento con el proveedor, alojar los datos en la UE y aplicar el principio de mínimos (no pedir el NSS si no hace falta).
  - Hay que informar a trabajadores y dueños.
- **Acceso indebido entre roles.** Es el riesgo principal. Se mitiga así:
  - RLS en todas las tablas, sin excepciones;
  - pruebas automáticas de permisos (un usuario de cada rol intenta leer y escribir lo ajeno);
  - vistas filtradas para dueños y trabajadores.
- **Invitaciones**: códigos de un solo uso, con caducidad, guardados con hash y revocables.
- **Cuentas**:
  - sin contraseñas propias (enlace o código por correo o SMS);
  - sesiones con caducidad y cierre de sesión remoto;
  - doble factor obligatorio para el administrador global y recomendado para los creadores.
- **Claves de servicio**: la clave con privilegios totales del backend nunca va en la app ni en el repositorio. Solo se usa en funciones del servidor.
- **Fotos**: bucket privado y URLs firmadas de corta duración.
- **Dispositivos perdidos**: la caché local guarda datos personales. Hace falta poder cerrar sesión de forma remota y borrar la caché al cerrar sesión.
- **Integridad de las cuentas**: auditoría de cambios en horas y pagos. Más adelante se puede añadir el bloqueo de quincenas ya liquidadas.
- **Copias de seguridad** del backend: automáticas del proveedor más una exportación periódica propia.
- **Repositorio público**: nunca subir datos reales, copias `.json`, claves de firma ni archivos `.env` (ya cubierto en `.gitignore` y en la revisión previa a publicar).

## 8. Etapas de implementación posteriores

1. **Decisiones previas** del dueño del proyecto:
   - proveedor;
   - si los trabajadores tendrán acceso desde el principio o solo creadores y dueños;
   - textos legales (información RGPD).
2. **Capa de datos intercambiable** (sin nube todavía): aislar `put/del/load` detrás de una interfaz y mantener verde el banco de pruebas.
3. **Esquema, políticas RLS y pruebas de permisos** en un proyecto de pruebas, con datos ficticios.
4. **Autenticación e invitaciones**, solo para creadores. Migración de datos (§ 6) desde la copia `.json`.
5. **Sincronización sin conexión**:
   - cola de cambios con reintentos;
   - conflictos por registro, donde gana el último cambio y queda registrado en la auditoría;
   - aviso cuando dos personas editan el mismo parte.
6. **Portal de dueño**: solo lectura de su cuenta, sus partes y sus pagos, y descarga de su PDF.
7. **Portal de trabajador**: sus jornadas, horas, ganado, entregas y saldo.
8. **Panel del administrador global** y auditoría.
9. **Revisión de seguridad y protección de datos** antes de invitar a usuarios reales. Lanzamiento por etapas: primero una campaña piloto.
