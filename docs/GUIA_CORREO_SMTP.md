# Guía: correo para confirmar cuentas (3.0)

Objetivo: que Supabase envíe el **código de un solo uso** con el que cada persona confirma su correo al crear la cuenta, y el de «He olvidado mi contraseña». Coste: **0 €**.

> **Estado (18-11-2026).** La app y la base de datos ya están preparadas y probadas sin correo real. **El envío real de correos NO está probado**: hace falta que el dueño haga los pasos 1 y 2 (credenciales suyas). Claude no crea cuentas, no escribe contraseñas y no guarda secretos.

## Qué servicio usar (evaluación del 18-11-2026)

| Opción | Coste | ¿Sirve sin dominio propio? | Valoración |
| --- | --- | --- | --- |
| Correo integrado de Supabase | 0 € | — | **No.** Solo envía a miembros del equipo del proyecto y unos 2 correos por hora ([Supabase, SMTP](https://supabase.com/docs/guides/auth/auth-smtp)) |
| **Gmail por SMTP con «contraseña de aplicación»** | 0 € | Sí | **Recomendada para pruebas y piloto.** El correo sale firmado por Google desde la propia dirección de Gmail, así que llega bien a la bandeja de entrada |
| Brevo (plan gratuito) | 0 € | Con reservas | 300 correos al día según su página de SMTP gratuito ([Brevo/Sendinblue](https://www.sendinblue.com/free-smtp-server/), sin confirmar hoy). Sin dominio propio, enviar «como» una dirección de Gmail no queda alineado con DMARC: riesgo alto de spam |
| Resend, MailerSend, Postmark… | 0 € en sus planes gratuitos | Necesitan dominio propio verificado | Muy fiables **si algún día hay dominio** (de pago, unos 10 €/año): entonces pasar a Brevo o Resend |
| SMS | De pago | — | Descartado |

**Límites de Gmail.**
- **Por día:** las fuentes consultadas (blogs, no la documentación de Google) hablan de unos 500 destinatarios al día en cuentas gratuitas. Para una cuadrilla (decenas de personas) sobra.
- **Por hora:** Supabase limita además a 30 correos por hora con SMTP propio (ajustable en Authentication → Rate Limits).

**Contraseñas de aplicación de Google.**
- Exigen tener activada la verificación en dos pasos.
- Google las revoca si cambias la contraseña de la cuenta.
- No aparecen si la cuenta usa Protección Avanzada ([ayuda de Google](https://support.google.com/accounts/answer/185833?hl=es)).

**Recomendación: una cuenta de Gmail nueva solo para la app** (por ejemplo, «campanacontrol.avisos@gmail.com»), no la personal:
- si algo falla, no afecta a tu correo;
- la contraseña de aplicación se puede anular en cualquier momento.

## Pasos (los hace el dueño del proyecto)

1. **Cuenta de Gmail para la app**
   1. Crea la cuenta y activa la **verificación en dos pasos**.
   2. En https://myaccount.google.com/apppasswords crea una contraseña de aplicación llamada «Supabase CAMPAÑA CONTROL».
   3. Cópiala. **No la envíes por chat ni la guardes en el proyecto.**
2. **Supabase (proyecto de PRUEBAS primero) → Authentication → Emails → SMTP Settings → Enable custom SMTP**

   | Campo | Valor |
   | --- | --- |
   | Sender email | la dirección de Gmail de la app |
   | Sender name | `CAMPAÑA CONTROL` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | la dirección de Gmail de la app |
   | Password | la contraseña de aplicación (16 letras) |

   Guarda. El secreto queda solo en Supabase.
3. **Plantillas** (Authentication → Emails → Templates). Pega el contenido de:
   - «Confirm signup»: `supabase/plantillas-correo/confirmar-registro.html`, con el asunto «Tu código de CAMPAÑA CONTROL».
   - «Reset Password»: `supabase/plantillas-correo/recuperar-contrasena.html`, con el asunto «Código para cambiar tu contraseña de CAMPAÑA CONTROL».

   Las dos usan `{{ .Token }}` (código de 6 cifras) en lugar de un enlace. Así funciona igual en el APK, en Windows y en el iPhone.
4. **Activar la confirmación** (Authentication → Sign In / Providers):
   - activa **Confirm email**;
   - en *Email* deja **Email OTP expiration** en `3600` (1 hora).
5. Avisa a Claude: hará la prueba real de extremo a extremo y la documentará.

## Cómo se probará el envío real (cuando estén hechos los pasos 1–4)

- **Varias personas con un solo buzón.** Gmail entrega en el mismo buzón las direcciones con «+», y Supabase las trata como cuentas distintas.
  - Ejemplo: `tucorreo+trabajador1@gmail.com` o `tucorreo+jefe@gmail.com`.
  - Solo con tu permiso y con un buzón que tú elijas.
- **Comprobaciones:**
  - el código llega (y si va a spam);
  - un código incorrecto se rechaza;
  - un código caducado o ya usado no vale;
  - «Pedir otro código» respeta los 60 s;
  - sin confirmar no se ve nada y, al confirmar, la persona entra en su campaña con su rol;
  - «He olvidado mi contraseña» funciona.
- **Dispositivos:** Android (APK), iPhone (web instalada) y Windows (.exe), cada uno con su cuenta.

## Qué ya está hecho y probado sin correo real

- **Base de datos (migración 000005).**
  - Una cuenta sin el correo confirmado nunca está activa: no ve ni hace nada aunque su invitación sea válida.
  - Al confirmarlo se activa sola, salvo que el superadministrador la haya bloqueado.
  - Nadie puede activarla a mano.
  - Probado en PostgreSQL local.
- **App:**
  - pantalla «Confirma tu correo»;
  - «Pedir otro código», con espera de 60 s y cuenta atrás;
  - como mucho 5 intentos por código; además, Supabase limita los intentos en el servidor;
  - al entrar con una cuenta sin confirmar, va directo a la pantalla del código;
  - «He olvidado mi contraseña» y «Cambiar contraseña» en Ajustes;
  - mensajes claros en español para cada error.
- **Pruebas de la app:**
  - con respuestas de Supabase **simuladas** (prueba `correo-codigo`);
  - contra el proyecto real: un código incorrecto se rechaza en el servidor.
