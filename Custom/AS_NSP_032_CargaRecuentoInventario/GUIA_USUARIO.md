# Guía de usuario — Carga de Recuento de Inventario

## Para qué sirve

Crea un Recuento de inventario de NetSuite desde un archivo CSV, sin tener que agregar los artículos uno por uno. El archivo trae la ubicación, el artículo y su UPC. La pantalla valida cada fila contra NetSuite, muestra la lista de artículos y, con el botón `Generar`, crea el recuento ya iniciado y listo para contar.

Además, dentro del recuento solo Contabilidad puede aprobarlo o rechazarlo.

## Alcance

Qué hace:

- Lee un CSV con las columnas `UBICACION`, `ITEM` y `UPC`.
- Valida que cada artículo exista, que el UPC sea el de ese artículo y que la ubicación sea la elegida en la cabecera.
- Crea el Recuento de inventario con la cabecera de la pantalla y un artículo por línea, y lo deja en estado `Iniciado`.
- En el recuento, oculta los botones `Aprobar` y `Rechazar` a quien no sea Supervisor Contable o Administrador.

Qué no hace:

- No carga cantidades: el CSV no tiene columna de cantidad. Las cantidades se cuentan e ingresan en el recuento, como en cualquier recuento de NetSuite.
- No guarda el CSV en NetSuite.
- No modifica recuentos que ya existen.

## Quién lo usa

| Rol | Qué hace |
|---|---|
| Supervisor Contable CASPM | Carga el CSV, genera el recuento y lo aprueba o rechaza |
| Auxiliar de Farmacia CASPM | Cuenta los artículos del recuento y lo completa |
| Administrador | Puede hacer todo lo anterior y configura las cuentas de ajuste |

## Dónde se usa

- **Pantalla de carga:** `Transacciones > Inventario > Cargar recuento de inventario`. El título de la pantalla es `Carga de Recuento de Inventario`.
- **Conteo:** en el propio Recuento de inventario o desde la app móvil `SCM Mobile`, en `Tareas de recuento cíclico`.
- **Aprobación y rechazo:** en el propio Recuento de inventario que se genera.

## Requisitos previos

- Tener un rol con acceso a la pantalla de carga.
- Para contar desde `SCM Mobile`:
  - **El empleado tiene que pertenecer a la misma subsidiaria del rol.** Por ejemplo, Auxiliar de Farmacia CASPM solo funciona con empleados de la subsidiaria de Puerto Montt (CASPM).
  - La ubicación del recuento tiene que tener marcado `Usar gestión de almacenes`. Solo esas ubicaciones aparecen en `Seleccionar almacén`.
- Que en `AS Recuento Inventario Cuenta` haya al menos una cuenta activa para la subsidiaria. Si no hay ninguna, el campo `Cuenta` aparece vacío.
- Un CSV con este formato:
  - La primera fila es de títulos y no se lee: el sistema no mira los nombres de las columnas, solo su posición.
  - Tres columnas, **obligatoriamente en este orden**: `UBICACION` (columna A), `ITEM` (columna B), `UPC` (columna C). Si el orden cambia, todas las filas dan error.
  - Separadas por punto y coma (`;`) o por coma (`,`).
  - `UBICACION` es el nombre de la ubicación tal como está en NetSuite, sin la ubicación padre.
  - `ITEM` es el nombre del artículo en NetSuite. No importan las mayúsculas ni los espacios de más.
  - `UPC` es el código del artículo, exacto. Si se arma en Excel, la columna debe tener formato Texto; si no, Excel borra los ceros a la izquierda y el UPC deja de coincidir.

Ejemplo:

```
UBICACION;ITEM;UPC
BODEGA 1 URGENCIA (T1-T3) CASPM;SONDA VERSAFLEX;0012345678901
```

## Cómo usarlo

1. Entre a `Cargar recuento de inventario`.
2. Llene la cabecera del grupo `Recuento`:

   | Campo | Obligatorio | Nota |
   |---|---|---|
   | `Subsidiaria` | Sí | Al cambiarla, `Ubicacion` y `Cuenta` muestran solo las opciones de esa subsidiaria |
   | `Ubicacion` | Sí | Solo las ubicaciones activas de la subsidiaria |
   | `Departamento` | No | |
   | `Clase` | No | |
   | `Fecha` | Sí | Por defecto, la fecha de hoy |
   | `Cuenta` | Sí | Solo las cuentas configuradas para la subsidiaria |
   | `Nota` | No | Pasa a la nota del recuento |

3. En `Archivo CSV (UBICACION, ITEM, UPC)`, seleccione el archivo.
4. Presione `Cargar`. La pantalla se vuelve a mostrar con la cabecera que llenó y:
   - si hay filas con problemas, el campo `Errores del archivo (N)` con una línea por fila;
   - la lista `Articulos (N)` con los artículos válidos: `UPC`, `Articulo` y `Unidades`.
5. Si hubo errores, corrija el CSV y vuelva a presionar `Cargar`. El botón `Generar` solo aparece cuando hay artículos y no hay ningún error.
6. Presione `Generar` una sola vez. El botón se deshabilita y aparece el aviso `Generando recuento`: «Se esta creando el recuento de inventario. No cierre ni recargue la pagina.»
7. Al terminar, NetSuite abre el Recuento de inventario creado, en estado `Iniciado`.
8. Farmacia cuenta los artículos e ingresa las cantidades, en el recuento o desde `SCM Mobile`, y presiona `Completar recuento`. El recuento pasa a `Aprobación completada/pendiente`.
9. Contabilidad abre el recuento y presiona `Aprobar` o `Rechazar`.

## Qué ocurre durante el proceso

- **Al cargar:** si un artículo se repite en el CSV, aparece una sola vez en la lista.
- **Al generar:** el recuento se crea con la subsidiaria, la ubicación, el departamento, la clase, la fecha, la cuenta y la nota de la cabecera, y con un artículo por línea. Las unidades las completa NetSuite. El recuento queda marcado con el check `AS Recuento Inventario Carga`, para identificar los que se generaron desde esta pantalla. El número del recuento lo asigna NetSuite.
- **En `Aprobación completada/pendiente`:** solo el Supervisor Contable y el Administrador ven los botones `Aprobar` y `Rechazar`. Los demás roles, Farmacia incluida, no los ven, ni al ver el recuento ni al editarlo.
- **En `Iniciado`:** `Completar recuento` lo ven todos los roles.

## Configuración funcional

### Cuentas de ajuste por subsidiaria

Las cuentas que ofrece el campo `Cuenta` se configuran en el registro personalizado `AS Recuento Inventario Cuenta`, con una fila por cada par:

| Campo | Qué es |
|---|---|
| `Subsidiaria` | La subsidiaria donde se ofrece la cuenta |
| `Cuenta Contable` | La cuenta que aparece en el campo `Cuenta` |

Una fila marcada como Inactiva deja de aparecer en la pantalla.

## Pendiente de configurar en NetSuite

- Cargar en `AS Recuento Inventario Cuenta` las cuentas de cada subsidiaria que vaya a usar la pantalla.
- Revisar que cada empleado de Farmacia tenga como `Subsidiaria` la de CASPM en su ficha de empleado.
- Marcar `Usar gestión de almacenes` en las ubicaciones donde se va a contar con `SCM Mobile`.
- Si Farmacia también debe cargar recuentos, dar acceso a su rol en el despliegue de la pantalla de carga. Hoy la pantalla está habilitada solo para Administrador y para el rol de Contabilidad.

## Restricciones y consideraciones

- Todas las filas del CSV deben ser de la ubicación elegida en la cabecera.
- El artículo debe estar activo en NetSuite.
- El UPC debe ser exactamente el del artículo. Si dos artículos activos tienen el mismo nombre y el mismo UPC, la fila se rechaza.
- Si cambia la `Ubicacion` después de presionar `Cargar`, hay que volver a cargar el CSV antes de generar.
- NetSuite no permite que un artículo esté en dos recuentos sin cerrar de la misma ubicación. Si alguno de los artículos ya está en otro recuento abierto, el recuento no se crea.
- Después de un error al generar, la lista de artículos se borra: hay que volver a cargar el CSV.

## Errores y solución

| Mensaje o síntoma | Causa | Solución |
|---|---|---|
| `Seleccione el archivo CSV` | Se presionó `Cargar` sin archivo | Seleccione el archivo y vuelva a cargar |
| `Fila N: el ITEM "[item]" no existe en NetSuite` | No hay un artículo activo con ese nombre | Corrija el nombre en el CSV |
| Todas las filas con error, y en el mensaje aparece una ubicación o un nombre donde debería ir el UPC (por ejemplo `el UPC "BODEGA 1 URGENCIA (T1-T3) CASPM" no es el del ITEM ...`) | Las columnas del CSV no están en el orden `UBICACION`, `ITEM`, `UPC` | Reordene las columnas del archivo a `UBICACION`, `ITEM`, `UPC` y vuelva a cargar |
| `Fila N: el UPC "[upc]" no es el del ITEM "[item]"` | El UPC no coincide con el del artículo. Suele pasar cuando Excel borró los ceros a la izquierda | Corrija el UPC; en Excel, deje la columna en formato Texto |
| `Fila N: hay N articulos con el ITEM "[item]" y el UPC [upc]` | Hay más de un artículo activo con el mismo nombre y UPC | Revise los artículos en NetSuite con el área que los mantiene |
| `Fila N: la ubicacion "[ubicacion]" no es la seleccionada ([ubicacion elegida])` | La fila es de otra ubicación | Corrija el CSV o la `Ubicacion` de la cabecera |
| `La ubicacion [ubicacion] no pertenece a la subsidiaria seleccionada` | La ubicación elegida no es de la subsidiaria de la cabecera | Elija una ubicación de esa subsidiaria |
| `La ubicacion cambio despues de cargar el CSV: vuelva a cargarlo` | Cambió la `Ubicacion` entre `Cargar` y `Generar` | Presione `Cargar` de nuevo |
| Alerta roja `No se pudo generar el recuento`, con el mensaje de NetSuite. Por ejemplo, que el artículo no se puede agregar porque ya está en el recuento [número] | NetSuite rechazó el recuento; lo más común es un artículo que ya está en otro recuento sin cerrar de esa ubicación | Cierre o apruebe el otro recuento, o saque ese artículo del CSV, y vuelva a cargar |
| El campo `Cuenta` está vacío | No hay cuentas activas configuradas para la subsidiaria | Configure la cuenta en `AS Recuento Inventario Cuenta` |
| En `SCM Mobile`, al abrir la tarea de recuento: `Ha ingresado un valor de campo no válido [id] para el siguiente campo: custrecord_wmsse_user` | El empleado pertenece a otra subsidiaria que la del rol. WMS registra al usuario que está contando, y el rol solo acepta empleados de su subsidiaria. No es un problema de permisos: con Administrador funciona porque ese rol ve todas las subsidiarias | En la ficha del empleado, poner como `Subsidiaria` la del rol (CASPM). Luego cerrar sesión y volver a entrar |
| En `SCM Mobile`, la bodega no aparece en `Seleccionar almacén` | La ubicación no tiene marcado `Usar gestión de almacenes`, o es de otra subsidiaria que la del rol | Marcar el check en la ubicación, confirmándolo antes con el área |
| Farmacia no ve `Aprobar` ni `Rechazar` | Es lo esperado: solo aprueba o rechaza Contabilidad | Pida a Contabilidad que apruebe o rechace |

## Resultado esperado

- Después de `Generar`, se abre el Recuento de inventario nuevo, en estado `Iniciado`, con todos los artículos del CSV y el check `AS Recuento Inventario Carga` marcado.
- Cuando Farmacia completa el recuento, este queda en `Aprobación completada/pendiente`, y solo Contabilidad lo aprueba o lo rechaza.
