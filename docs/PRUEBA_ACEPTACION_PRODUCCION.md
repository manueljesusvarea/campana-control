# Prueba de aceptación en PRODUCCIÓN · CAMPAÑA CONTROL 3.0

Web: **https://campana-control-app.pages.dev** · Solo datos **ficticios**, con nombres que lo dejan claro.
No me envíes contraseñas. Las temporales se muestran una sola vez: apúntalas en papel.

Necesitas tres sesiones independientes:
- **S1 · Ordenador, ventana normal:** `manuel.varea` (superadministrador).
- **S2 · Ordenador, ventana privada** (Ctrl+Mayús+N) u otro navegador: el gestor.
- **S3 · Móvil:** el trabajador.

## Pasos

1. **S1 · crear el gestor.** Entra como `manuel.varea` → **Usuarios** → crea un **creador de campañas**:
   usuario `gestor.aceptacion`, nombre «Gestor Ficticio». Apunta la contraseña temporal.
2. **S2 · el gestor prepara la campaña.**
   1. Entra con `gestor.aceptacion` y la temporal; pon una contraseña propia y vuelve a entrar.
   2. Crea la campaña **«PRUEBA ACEPTACIÓN (ficticia)»**.
   3. Añade los trabajadores «Ana Ficticia» y «Luis Ficticio» y el dueño «Dueño Ficticio».
   4. **Usuarios** → crea `trabajador.aceptacion`, rol **trabajador**, vinculado a la ficha de **Ana Ficticia**. Apunta la temporal.
3. **S3 · el trabajador entra.** En el móvil, entra con `trabajador.aceptacion`, pon una contraseña propia y vuelve a entrar.
4. **S2 · jornadas.** Haz dos partes para «Dueño Ficticio»:
   - día 1: Ana día completo, Luis día completo, kilos **2.350**;
   - día 2: Ana día completo.
   - **S3:** sin recargar, en pocos segundos deben aparecer las horas e importe de Ana. **No** deben verse Luis ni el dinero del dueño.
5. **S2 · pagos.** Registra una **entrega de 20 €** a Ana y un **pago del dueño** de cualquier importe.
   - **S3:** Ana ve su entrega y lo que le queda por cobrar.
6. **S2 · fotografía.** En **Documentos**, añade un documento con **una foto** (cualquier foto sin datos personales).
7. **S2 · informes.** En **Informes**, genera los 4 tipos en **PDF** y al menos uno en **Excel**. Comprueba que se abren y que las cifras cuadran con lo que has metido.
8. **S2 · cambio.** Cambia el parte del día 2: Ana **media jornada**. **S3:** se actualiza sin recargar.
9. **S3 · permisos.** Como trabajador, intenta abrir **Usuarios**, crear un parte o cambiar un pago: no debe poder.
10. **S1 · superadministrador.** `manuel.varea` ve la campaña ficticia y las dos cuentas en Usuarios.

## Qué contarme

Para cada paso: **bien** o **mal**. Si algo va mal, qué esperabas y qué viste (una captura ayuda). Nada de contraseñas.

## Después (lo hago yo, sin modificar nada)

- Compruebo en la base de datos lo que se ha guardado y simulo los permisos de cada cuenta en transacciones que se deshacen.
- Lanzo la copia real y compruebo la restauración aislada: base de datos, fotos (huella) y sellos de la copia de campaña.

Los datos ficticios no se borran sin tu autorización. Al terminar, decide si bloqueas las dos cuentas ficticias desde Usuarios.
