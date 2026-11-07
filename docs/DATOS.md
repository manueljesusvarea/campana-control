# Modelo de datos y cálculos

Todo se guarda como objetos JSON en `S[colección][id]`. En la app instalable va en `localStorage["campana-control-v1"] = { S }`; en claude.ai, en la base de datos del artefacto, con las mismas colecciones.

Otras claves de `localStorage` (desde la 2.3.0):
- `campana-control-v1-danado-<fecha>`: si `campana-control-v1` no se puede leer al arrancar, su texto original se aparta aquí antes de guardar nada. La app muestra un aviso con un botón para descargarlo. Si no se puede apartar, la app no guarda nada.
- `campana-control-aviso-instalar`: `"oculto"` si se cerró el aviso de instalar en Inicio. Es una preferencia de ese dispositivo, no un dato.

Si hay dos pestañas o ventanas de la app abiertas, cada una recarga `S` cuando la otra guarda (evento `storage`), para no pisarse los cambios.

| Colección | Documento | Campos principales |
| --- | --- | --- |
| `ajustes` | `general` | `campanaActiva`, `empresa: { nombre, nif, direccion, telefono, encargado, iban }` |
| `campanas` | id | `nombre`, `anio`, `inicio`, `horasDia` (7,5), `horaInicio`, `precioHoraTrab`, `precioHoraDueno`, `iva`, `maquinas: [{ id, nombre, precio, unidad }]` |
| `trabajadores` | id | `nombre`, `nif`, `telefono`, `nss`, `precioHora` (vacío = el de la campaña), `activo` |
| `duenos` | id | `campanaId`, `nombre`, `nif`, `direccion`, `telefono`, `finca`, `municipio`, `poligono`, `parcela`, `precioHora`, `kilosTotal`, `trabajadores: [ids]`, `num` |
| `partes` | `<duenoId>_<AAAA-MM-DD>` | `campanaId`, `duenoId`, `fecha`, `filas: { trabId: { tipo, horas, nota } }`, `maquinas: { maqId: cantidad }`, `kilos`, `notas` |
| `pagos` | id | `campanaId`, `tipo` («trabajador» = entrega de dinero, «dueno» = pago del dueño), `personaId`, `importe`, `fecha`, `hora`, `forma` (efectivo, transferencia, bizum, otro), `nota` |
| `plantillas` | id | `nombre`, `asesoria`, `titulo`, `cuerpo` con marcadores `{{dueno}}`, `{{finca}}`…, `campos: [{ clave, etiqueta, valor }]` |
| `documentos` | id | `campanaId`, `duenoId`, `plantillaId`, `fecha`, `campos`, `trabajadores`, `escaneos: [{ foto | asset | data }]` |

`tipo` de un día de trabajo puede ser `normal`, `mas`, `menos`, `especial` o `ausente`. En `normal` las horas son las de la campaña (`horasDia`). En `ausente` son 0 y cuenta como falta.

## Fotos del papel (`escaneos`)

Cada foto es uno de estos objetos:
- `{ foto: id }`: app instalable. La imagen está en IndexedDB (base de datos `campana-control`, almacén `fotos`, valor `{ t: tipo, b: ArrayBuffer }`). En `localStorage` solo queda el id.
- `{ asset: id }`: claude.ai con la nube; se ve en `/_blob/<id>`.
- `{ data: dataURL }`: versiones hasta la 2.0.0, o un navegador sin IndexedDB. Al arrancar, `migrarFotos()` las pasa a IndexedDB.

Al borrar un documento se borran sus fotos. Al importar una copia, `limpiarFotos()` quita de IndexedDB las fotos que no usa ningún documento.

Los datos antiguos pueden traer campos `firmado` o `firmas`. Se ignoran: las firmas se quitaron de la app.

## Cálculos

- **Ganado por un trabajador** = horas × su precio por hora, o el de la campaña si no tiene uno propio.
- **Le queda por cobrar** = ganado − entregas con fecha dentro del periodo elegido.
- **Cuenta del dueño** = horas × precio dueño + Σ (máquinas × precio) + IVA.
- **Le falta pagar** = cuenta − pagos con fecha dentro del periodo.
- **Quincenas:** del 1 al 15 y del 16 al último día del mes (`quincenasEntre`, `porQuincena`).
- **Copia de seguridad:** `{ app: "campana-control", version, fecha, S, fotos }`, y además `incompleta: true, fotosFaltan: n` si alguna foto no se pudo incluir (desde la 2.3.0). Al importar se sustituye todo lo del dispositivo; si la copia está incompleta, la confirmación lo dice.
  - `fotos` es `{ clave: dataURL }`, y en `S.documentos` cada foto queda como `{ foto: clave }`. Las fotos de la nube llevan la clave `a<assetId>`.
  - Si las fotos no caben en el archivo, se exporta sin `fotos` y se avisa.
  - Al importar, las fotos van a IndexedDB en la app instalable, o se suben como asset en claude.ai. Las copias antiguas, con `{ data }`, también se importan.
