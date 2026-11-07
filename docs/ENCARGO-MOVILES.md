# Encargo para Claude Code · instalación en móviles

Abre la carpeta del proyecto que contiene CLAUDE.md y ejecuta esta revisión.

1. Lee CLAUDE.md y docs/PLAN.md. Sirve www/ en una subcarpeta como /campana-control/ con un perfil de prueba vacío. Comprueba el manifiesto, las rutas de iconos, fuentes y librerías, y el alcance del service worker. Espera a que termine la primera instalación, desconecta la red, cierra y vuelve a abrir la app desde su URL de inicio.
2. Con datos ficticios, crea una campaña, un trabajador, un dueño, un parte y un documento con foto. Exporta la copia. Impórtala en una instalación vacía, comprueba las horas, el importe y la foto, y abre un PDF y un Excel sin conexión.
3. Si tienes dispositivos conectados, prueba Safari en iPhone desde el icono de inicio y Chrome en Android. En Android prueba además el APK firmado y la hoja de compartir. Anota por separado qué has comprobado en cada teléfono y qué has simulado.
4. Corrige únicamente los fallos reproducibles de esta revisión. Regenera www/ si cambias el código fuente y actualiza la versión de caché si cambian los archivos publicados. Conserva el formato de copias y la identidad de instalación.
5. Trabaja únicamente en local y con un perfil de prueba independiente. Excluye las claves de firma y las copias personales de la revisión. Devuelve el resultado por plataforma, el fallo reproducido, el cambio y la prueba posterior.

## Caso de control para las cuentas

Usa un dueño y un trabajador ficticios, con tarifas de 12 €/h al dueño y 10 €/h al trabajador, IVA del 0 % y partes sin maquinaria. Registra 7,5 horas el día 15 y 6 horas el 16. El día 15 entrega 20 € al trabajador y registra un pago del dueño de 30 €.

| Periodo | Horas | Ganado | Pendiente de cobrar por el trabajador | Pendiente de pagar por el dueño |
| --- | ---: | ---: | ---: | ---: |
| Primera quincena | 7,5 | 75 € | 55 € | 60 € |
| Segunda quincena | 6 | 60 € | 60 € | 72 € |
| Mes completo | 13,5 | 135 € | 115 € | 132 € |

Comprueba estos importes en la app y en los informes correspondientes. Después de importar la copia en el segundo perfil, vuelve a comprobar los partes, los pagos y la foto.
