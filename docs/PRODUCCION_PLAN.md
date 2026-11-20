# Plan para activar la producción de Campaña Control 3.0

**Estado (20-11-2026): PRODUCCIÓN ACTIVADA** con la autorización del dueño, pasos 1 a 9 hechos:

| Pieza | Dato |
| --- | --- |
| Web de producción | **https://campana-control-app.pages.dev** (Cloudflare Pages `campana-control-app`; solo se despliega desde `produccion/v3`; vistas previas: None) |
| Supabase de producción | Proyecto `campana-control` (`voxhvqysgzgpuvvsgecz`), plan Free, UE (Irlanda). URL pública `https://voxhvqysgzgpuvvsgecz.supabase.co` |
| Esquema | `instalacion_completa.sql`, huella `82a00575811c`, comprobada antes de ejecutar. 24 tablas con RLS forzada, bucket `fotos` privado, clave de sello creada |
| Authentication | Registro público desactivado; Confirm email desactivado; hook «Before User Created» → `public.hook_alta_con_codigo` |
| Edge Function | `gestion-usuarios`, huella `cd734de212bd` (la misma que en pruebas); «Verify JWT» activado |
| Superadministrador | `manuel.varea`. Su contraseña la puso el dueño y nadie más la conoce. Es la única cuenta y el único superadministrador; sin altas pendientes |
| Verificación | `verificar_proyecto.mjs`: 10/10 sin sesión. Web: modo cuenta, sin etiqueta PRUEBAS; `nube-pwa` correcta |
| Primera versión | `produccion/v3` = `d51e4d8` (la misma probada en la beta) |

**Pendiente del dueño:**
- entrar con `manuel.varea` en la web de producción;
- configurar las copias diarias con la URL de producción (paso 10).

Lo que sigue es el procedimiento que se siguió, y sirve para rehacerlo.

El proyecto Supabase actual (`campana-control-pruebas`) y la beta (https://campana-control-v3-pruebas.pages.dev) quedan **solo para desarrollo y pruebas**. La 2.3.0 (GitHub Pages, rama `main`) no se toca.

## Qué se crea (todo en plan gratuito, sin tarjeta)

| Pieza | Nombre propuesto | Plan |
| --- | --- | --- |
| Proyecto Supabase de producción | `campana-control` (región Frankfurt, como el de pruebas) | Free: 2 proyectos activos gratis por cuenta. Pruebas + producción = 2 |
| Web de producción | Cloudflare Pages `campana-control-app`, que da `https://campana-control-app.pages.dev` (u otro nombre libre) | Free |
| Rama de producción | `produccion/v3` | Solo recibe versiones aprobadas |

**Ojo con el límite:** el plan Free de Supabase admite 2 proyectos activos. Con pruebas y producción se llega al máximo: no se podría crear un tercero sin pausar uno.

## Pasos (con tu autorización; en los marcados con 👤 intervienes tú)

1. 👤 **Crear el proyecto Supabase** `campana-control` en tu organización.
   - Plan Free, región Frankfurt.
   - Tú eliges y guardas la contraseña de la base de datos: nunca me la pases.
   - Si en algún momento aparece una pantalla de pago, se cancela.
2. **Instalar el esquema.** Editor SQL → `supabase/produccion/instalacion_completa.sql`.
   - Antes de ejecutarlo se compara su huella SHA-256 con la de `supabase/produccion/instalacion_completa.sha256`.
   - Es una sola transacción: o se aplica todo o nada.
   - No lleva ni un dato, ni una cuenta, ni una contraseña. Probado en una base vacía: 24 tablas vacías con RLS forzada.
   - **No** se ejecuta `supabase/pruebas/solo_proyecto_pruebas.sql`.
3. **Configurar Authentication** (en el panel, como en pruebas):
   - Sign-ups: **desactivado**;
   - Anonymous, Phone, Manual linking y Confirm email: desactivados;
   - Hooks → «Before User Created» → `public.hook_alta_con_codigo`;
   - sin SMTP.
4. **Edge Function `gestion-usuarios`.** Se despliega desde el panel con `supabase/functions/gestion-usuarios/index.ts` (comprobando su huella). «Verify JWT» activado. La clave secreta la pone Supabase sola en el entorno de la función: nunca en la app ni en git.
5. **Storage.** El bucket privado `fotos` lo crea el paso 2 (2 MB por foto, solo imágenes). Se comprueba que no es público.
6. 👤 **Tu superadministrador real:**
   - **a.** En el editor SQL: `select cc_priv.autorizar_alta_propietario('tu.usuario', 'Tu nombre');`
   - **b.** En los 10 minutos siguientes, Authentication → Users → **Add user**:
     - correo técnico `tu.usuario@usuarios.campana-control.invalid`;
     - contraseña que escribes tú;
     - «Auto confirm user».

     Ese correo no existe ni recibe nada: solo identifica la cuenta.
   - **c.** Entras en la web de producción con `tu.usuario` y tu contraseña.

   Nadie más puede hacerse superadministrador: la función solo la puede ejecutar el propietario desde el editor SQL.
7. **Verificación no destructiva.**

   ```
   CC_URL=… CC_CLAVE_PUBLICA=… node supabase/pruebas/verificar_proyecto.mjs
   ```

   Con tus credenciales en variables de la misma sesión, también comprueba que eres superadministrador. Debe salir «Todo correcto»; con el proyecto de pruebas sale así: 13 de 13.
8. **Web de producción** en Cloudflare Pages (proyecto nuevo, del mismo repositorio):
   - Rama de producción `produccion/v3`. **Preview branches: None**.
   - Comando: `bash herramientas/despliegue_produccion.sh`. Carpeta: `www`.
   - Variables:
     - `CC_NUBE_URL` y `CC_NUBE_CLAVE`: la URL y la clave **pública** del proyecto de producción;
     - `CC_ENTORNO=produccion`.
   - El script se niega a construir si falta `CC_ENTORNO=produccion`, si la rama no es `produccion/v3` o si la URL es la del proyecto de pruebas.
   - La web de producción **no** lleva la etiqueta PRUEBAS.
9. **Primera publicación.** `git push origin desarrollo/multiusuario-v3:produccion/v3`. Solo cuando lo apruebes: es un avance rápido de una versión ya probada en la beta.
10. 👤 **Copias diarias.** En tu ordenador: `herramientas/respaldo/respaldo_diario.ps1 -Configurar`, con la URL de producción y una cuenta de respaldo. Ver `docs/COPIAS_Y_RECUPERACION.md`.
11. **APK y EXE de producción.** Igual que los de pruebas, pero con la configuración de producción y su propio identificador, cuando decidas cómo distribuirlos.

**Después:** las versiones nuevas se prueban en la beta y **solo** pasan a producción con tu aprobación, con el avance rápido del paso 9. La rama `produccion/v3` no se actualiza sola.

## Lo que nunca va a producción

- Las más de 300 cuentas ficticias.
- Las campañas de prueba.
- `propietario.pruebas` y su contraseña.
- `.cuentas-pruebas.json`.
- La clave del sello de pruebas: cada proyecto crea la suya al instalarse. Por eso una copia de pruebas no se puede validar en producción: la app lo advierte.
- Cuentas reales de terceros: no se crean hasta que tú lo decidas.

## Volver atrás

- **Web:** Cloudflare → Deployments → «Rollback».
- **Datos:** restaurar una copia de campaña en una campaña nueva, o la copia completa con `pg_restore` en un proyecto aparte.
- **Retirar producción:** pausar o borrar el proyecto. Solo con tu autorización.
