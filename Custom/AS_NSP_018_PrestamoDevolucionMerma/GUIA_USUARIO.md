# Guía de usuario — Registro de Solicitud de Inventario

## Para qué sirve

El Registro de Solicitud de Inventario permite registrar y procesar tres tipos de solicitud
desde una sola pantalla:

| Tipo | Resultado al procesar | Estado final inmediato | PDF |
|---|---|---|---|
| Préstamo | Traslado desde el origen hacia la bodega de préstamos | `Pendiente de Devolucion` | Sí |
| Devolución | Traslado desde la bodega de préstamos hacia el origen del préstamo | `Procesado` | Sí |
| Merma | Ajuste de inventario negativo en la misma ubicación | `Procesado` | Sí |

El formulario cambia según el **Tipo de Movimiento**. Ese campo define los datos, productos y
acciones que verá el usuario.

Cada solicitud pasa por dos pasos: primero se guarda y queda `Pendiente de Procesar`, sin mover
inventario; después se procesa con el botón de su tipo, y recién ahí se genera el movimiento de
inventario.

## Alcance

El registro cubre:

- Préstamos de uno o varios artículos, con o sin lote, siempre asociados a una entidad receptora.
- Devoluciones totales o parciales vinculadas a un préstamo pendiente, con búsqueda del préstamo
  por entidad receptora.
- Varias devoluciones para un préstamo, mientras exista cantidad pendiente.
- Cantidades con decimales, con un máximo de 2 decimales, en los tres tipos de solicitud.
- Mermas por vencimiento, deterioro, cuarentena u otro motivo.
- Selección controlada de la cuenta contable de Merma según la subsidiaria.
- Validación de stock antes de crear la transacción de inventario.
- Bloqueo del botón durante el procesamiento para evitar varios clics.
- Corrección y anulación de una solicitud mientras está `Pendiente de Procesar`.
- Comprobante PDF para los tres tipos de solicitud.

No permite editar una solicitud ya procesada ni revertir una devolución o Merma ya procesada.

## Quién lo usa

Cualquier usuario puede consultar solicitudes y descargar comprobantes. Para crear, editar,
procesar o anular se requiere uno de los roles autorizados.

Actualmente están autorizados los roles `Administrator` (id interno `3`) y `QF CASPM` (id
interno `1371`). Un rol distinto ve las solicitudes en modo consulta.

## Dónde se usa

Todo el registro está en un mismo menú:

```text
Transacciones > Gestion de Movimientos
```

| Opción del menú | Para qué se usa |
|---|---|
| **Solicitudes de Inventario** | Registrar, consultar, procesar e imprimir préstamos, devoluciones y mermas |
| **Entidades Receptoras** | Cargar las instituciones a las que cada subsidiaria puede prestar |
| **Cuentas de Merma** | Cargar las cuentas contables permitidas para la Merma de cada subsidiaria |

Si NetSuite está en inglés, el menú aparece como `Transactions > Gestion de Movimientos`.

El formulario de registro se llama **Registro de Solicitud de Inventario**, y el de corrección,
**Edicion de Solicitud de Inventario**. Al abrir una solicitud guardada, NetSuite muestra su
cabecera, detalle, estado y las acciones disponibles.

## Requisitos previos

Antes de operar, deben estar configurados:

1. Las ubicaciones y su relación con la subsidiaria.
2. Una sola bodega de préstamos por subsidiaria.
3. La disponibilidad de inventario y los lotes correspondientes.
4. Las entidades receptoras permitidas para la subsidiaria. Sin ellas no se puede guardar un
   Préstamo, porque la entidad es obligatoria.
5. Para Merma, al menos una cuenta activa para la subsidiaria en **Cuentas de Merma**. Sin ella
   **Cuenta de Ajuste** queda vacía y la Merma no se puede guardar.
6. Un rol autorizado para guardar y procesar.

## Cómo usarlo

### Crear un Préstamo

1. Ingresar a **Transacciones > Gestion de Movimientos > Solicitudes de Inventario**, crear una
   nueva y seleccionar `Prestamo`.
2. Elegir la subsidiaria, el servicio y la ubicación de origen.
3. Verificar la ubicación de destino. El sistema propone la bodega de préstamos de la subsidiaria.
4. Elegir la **Entidad Receptora del Prestamo**: la institución a la que se entrega el material.
   Es obligatoria y es el dato que después permite saber quién tiene el material.
5. Completar fecha, responsable y comentarios. El **Responsable del Prestamo** es la persona de
   Andes que entrega el material; la entidad es quien lo recibe.
6. Agregar los artículos, lote cuando aplique y cantidad prestada.
7. Presionar **Guardar Solicitud**.
8. Revisar el registro y presionar **Procesar Prestamo**.

Al procesar se crea un `Inventory Transfer` desde el origen hacia la bodega de préstamos. La
solicitud queda en `Pendiente de Devolucion`.

### Crear una Devolución

1. Seleccionar `Devolucion`.
2. Elegir primero la subsidiaria.
3. Opcional: elegir la **Entidad Receptora** para ver solo los préstamos de esa institución. La
   lista muestra únicamente entidades con préstamos pendientes en la subsidiaria. Si se deja
   vacía, se ven todos los préstamos pendientes.
4. Seleccionar el **Prestamo Relacionado**. Cada opción muestra el número del préstamo, a quién
   se prestó, de qué ubicación salió y cuánto queda pendiente:

   ```text
   MOV#000007 - HOSPITAL XX - CARDIOLOGIA CEM CASPM - pendiente 10
   ```

   Los préstamos registrados antes de que la entidad fuera obligatoria aparecen como
   `SIN ENTIDAD`.
5. Completar fecha, responsable y comentarios.
6. Indicar la cantidad que vuelve en cada línea. Viene precargada con el pendiente; puede ser
   menor, pero nunca mayor.
7. Presionar **Guardar Solicitud**.
8. Revisar el registro y presionar **Procesar Devolucion**.

La devolución utiliza la ubicación y los lotes del préstamo relacionado. Al procesarla crea el
traslado inverso y actualiza el préstamo a `Devuelto Parcial` o `Devuelto Total`.

### Crear una Merma

1. Seleccionar `Merma`.
2. Elegir la subsidiaria. **Cuenta de Ajuste** mostrará únicamente las cuentas activas configuradas
   para esa subsidiaria.
3. Completar ubicación de la Merma, servicio y fecha.
4. Elegir el motivo: `Vencimiento`, `Deterioro`, `Cuarentena` u `Otro`.
5. Elegir la cuenta de ajuste, responsable y comentarios.
6. Agregar los artículos, lote cuando aplique y cantidad a dar de baja.
7. Presionar **Guardar Solicitud**.
8. Revisar el registro y presionar **Procesar Merma**.

Al procesar se crea un `Inventory Adjustment` con cantidades negativas en la ubicación elegida,
usando la cuenta contable guardada. La solicitud queda en `Procesado`.

### Cantidades con decimales

Los tres tipos aceptan cantidades con decimales, con un máximo de **2 decimales**:

| Situación | Qué hace el formulario |
|---|---|
| Se escribe `1,25` o `3,4` | Se mantiene igual |
| Se escribe `0,666` | Se redondea a `0,67` |
| Con un lote elegido, la cantidad supera lo que hay de ese lote | Avisa con «No hay tanto del lote …» y la ajusta a lo que hay, cortado a 2 decimales hacia abajo: `7,566666` queda en `7,56` |
| Sin lote elegido, la cantidad supera lo disponible | No la ajusta: al presionar **Guardar Solicitud** avisa «La linea [n] pide [cantidad] y solo hay [disponible].» y no guarda |
| En una devolución, la cantidad supera lo pendiente | Avisa y la ajusta al pendiente, cortado a 2 decimales hacia abajo |
| Cantidad a Devolver precargada | Se muestra el pendiente cortado a 2 decimales: `0,43333` queda en `0,43` |

El ajuste hacia abajo evita pedir más de lo que existe. Por eso, un saldo con más de 2
decimales no se puede mover completo: de `7,566666` se pueden prestar o dar de baja como
máximo `7,56`.

### Corregir una solicitud

Una solicitud se puede corregir solo mientras está en `Pendiente de Procesar`:

1. Abrir la solicitud y presionar **Editar**, o usar **Editar** desde la lista.
2. Corregir la fecha, el responsable, los comentarios o los artículos. En una Merma también se
   puede cambiar la cuenta de ajuste.
3. Presionar **Actualizar Solicitud**.

El tipo, la subsidiaria, el servicio, las ubicaciones, la entidad receptora, el motivo de la
Merma y el préstamo relacionado de una Devolución aparecen bloqueados. Si alguno de esos datos
está mal, se anula la solicitud y se registra una nueva.

Una solicitud procesada ya no se edita: el botón **Editar** no aparece y, si se usa **Editar**
desde la lista, NetSuite vuelve a la solicitud con el aviso **Este movimiento ya no se puede
editar**.

### Imprimir un comprobante

Abrir la solicitud y presionar **Imprimir Comprobante**. El registro selecciona automáticamente
la plantilla de Préstamo, Devolución o Merma.

El comprobante puede imprimirse antes o después del procesamiento, incluso si la solicitud fue
anulada. En una devolución sin saldo pendiente el botón puede no mostrarse.

### Anular una solicitud

La acción **Anular Movimiento** está disponible mientras el registro se encuentre en
`Pendiente de Procesar`. Pide confirmación con «Se anulara el movimiento. Confirma?». La
anulación cambia el estado a `Anulado`; no revierte una transacción de inventario ya creada.

## Qué ocurre durante el proceso

Al presionar un botón de procesamiento, este queda deshabilitado y se muestra el aviso
**Procesando el movimiento**. No se debe cerrar ni recargar la página.

El servidor vuelve a validar el estado antes de crear una transacción. Esta segunda validación
evita generar otra transacción si el usuario hace doble clic o repite la URL.

También se verifica:

- Que exista detalle y que las cantidades sean mayores que cero.
- Que haya stock suficiente para el artículo o lote.
- Que una devolución no exceda la cantidad pendiente.
- Que la solicitud siga en `Pendiente de Procesar`.

## Configuración funcional

### Bodega de préstamos

Ruta:

```text
Listas > Contabilidad > Ubicaciones > editar la ubicación
```

En inglés: `Lists > Accounting > Locations`.

En cada subsidiaria debe existir una sola ubicación con:

- **AS Bodega de Prestamos y Devoluciones**: marcado.
- **Make Inventory Available**: desmarcado.

Esa ubicación recibe los préstamos y es el origen de sus devoluciones. Si falta, **Ubicación
Destino** queda vacía y no se puede guardar el préstamo.

### Relación subsidiaria y ubicación

Cada ubicación utilizada debe tener asignada la subsidiaria correspondiente. Una ubicación sin
esa relación no aparece en el formulario.

### Entidades receptoras

Ruta:

```text
Transacciones > Gestion de Movimientos > Entidades Receptoras > Nuevo
```

El registro se llama **AS Entidad Receptora por Subsidiaria** y tiene dos campos obligatorios:

| Campo | Uso |
|---|---|
| Subsidiaria | La subsidiaria que presta |
| Entidad Receptora | La institución que recibe el préstamo |
| Inactivo | Al marcarlo, la entidad deja de aparecer al registrar un préstamo |

Registrar una fila por pareja **Subsidiaria + Entidad Receptora**: la entidad es la institución
(un cliente de NetSuite) a la que esa subsidiaria puede prestar. La entidad es **obligatoria en
el préstamo**: si la subsidiaria no tiene filas activas, el selector queda vacío y no se puede
guardar ningún préstamo.

Para dejar de prestarle a una entidad, se marca la fila como inactiva. Sus préstamos ya
registrados siguen apareciendo en Devolución mientras tengan pendiente.

### Cuentas permitidas para Merma

Ruta:

```text
Transacciones > Gestion de Movimientos > Cuentas de Merma > Nuevo
```

El registro se llama **AS Cuenta de Merma por Subsidiaria**:

| Campo | Uso |
|---|---|
| Subsidiaria | Define en qué subsidiaria estará disponible la cuenta |
| Cuenta Contable | Cuenta que aparecerá en **Cuenta de Ajuste** |
| Inactivo | Al marcarlo, la relación deja de aparecer en el formulario |

La regla funcional es:

```text
Subsidiaria seleccionada + configuración activa = cuentas disponibles en Cuenta de Ajuste
```

Ejemplo: Puerto Montt + `5113001 Costo medicamentos e insumos`. Es un ejemplo operativo; la
cuenta disponible depende de las filas activas en NetSuite.

Para cambiar una cuenta no se modifica el código. Se inactiva la relación anterior y se crea o
activa la nueva relación para la subsidiaria.

### Listas del registro

| Lista | Valores actuales | Regla de mantenimiento |
|---|---|---|
| Tipo de Movimiento | `Prestamo`, `Devolucion`, `Merma` | No renombrar; el sistema compara estos textos |
| Estado de Movimiento | `Pendiente de Procesar`, `Pendiente de Devolucion`, `Devuelto Parcial`, `Devuelto Total`, `Procesado`, `Anulado` | No renombrar |
| Motivo de Baja | `Vencimiento`, `Deterioro`, `Cuarentena`, `Otro` | Se pueden agregar otros motivos |

Los nombres de Tipo y Estado están intencionalmente sin tilde. Cambiarlos rompe las reglas del
registro.

## Pendiente de configurar en NetSuite

El despliegue crea los registros y las listas, pero **no carga los datos**. Antes de operar en
una cuenta, cada subsidiaria que use el registro necesita esto:

| Qué configurar | Dónde | Qué cargar | Si falta |
|---|---|---|---|
| Bodega de préstamos | `Listas > Contabilidad > Ubicaciones` | Una sola ubicación por subsidiaria con **AS Bodega de Prestamos y Devoluciones** marcado y *Make Inventory Available* desmarcado | **Ubicación Destino** queda vacía y no se puede guardar un Préstamo |
| Subsidiaria de cada ubicación | `Listas > Contabilidad > Ubicaciones` | La subsidiaria correspondiente en cada ubicación de origen y en la bodega de préstamos | La ubicación no aparece en el formulario |
| Entidades receptoras | `Transacciones > Gestion de Movimientos > Entidades Receptoras` | Una fila por **Subsidiaria + Entidad Receptora** para cada institución a la que se presta | No se puede guardar un Préstamo |
| Cuentas de Merma | `Transacciones > Gestion de Movimientos > Cuentas de Merma` | Al menos una fila activa por **Subsidiaria + Cuenta Contable** | **Cuenta de Ajuste** queda vacía y no se puede guardar una Merma |
| Motivos de baja | Lista **Motivo de Baja** | Viene con `Vencimiento`, `Deterioro`, `Cuarentena` y `Otro`; se pueden agregar otros | — |
| Roles autorizados | Configuración del registro | Verificar que los roles internos `3` y `1371` sean `Administrator` y `QF CASPM` en la cuenta | Un rol distinto podría registrar o no poder hacerlo |

Después de configurar, probar una solicitud de cada tipo en Sandbox antes del despliegue
productivo.

## Restricciones

- Una solicitud solo se edita mientras está en `Pendiente de Procesar`.
- Al editar no se cambian el tipo, la subsidiaria, el servicio, las ubicaciones ni la entidad
  receptora: si están mal, se anula y se registra otra solicitud.
- La devolución debe usar el mismo lote que salió en el préstamo.
- El préstamo mueve la cantidad completa registrada; no existe entrega parcial al procesar.
- Una devolución procesada no tiene reverso automático.
- La Merma reduce inventario en la misma ubicación; no utiliza ubicación destino.
- El préstamo valida cantidad disponible. La devolución valida existencia física en la bodega.
- Los estados `Bloqueado`, `En Inspección` y `Damaged` no se utilizan para asignar lotes.
- Sin lote elegido, el orden automático usa la última modificación del balance; no es FEFO.
- Las cantidades admiten como máximo 2 decimales. Un saldo con más decimales no se puede mover
  completo.
- La entidad receptora debe ser un cliente de NetSuite cargado en la lista de la subsidiaria.
  Un préstamo entre servicios internos de la misma clínica no tiene una entidad que lo
  represente.
- El filtro por entidad de la Devolución solo muestra entidades con préstamos pendientes; los
  préstamos antiguos sin entidad se encuentran dejando el filtro vacío.

## Errores y solución

| Mensaje o síntoma | Significado | Acción recomendada |
|---|---|---|
| `AS_ROL_NO_AUTORIZADO` | El rol no puede escribir | Solicitar un rol autorizado |
| `AS_MOVIMIENTO_SIN_DETALLE` | No hay productos | Agregar al menos una línea |
| `AS_CANTIDAD_INVALIDA` | Existe una cantidad cero o negativa | Corregir la cantidad |
| `AS_DEVOLUCION_SIN_CANTIDAD` | Todas las cantidades devueltas son cero | Ingresar una cantidad en una línea |
| `AS_MOVIMIENTO_YA_PROCESADO` | La solicitud ya cambió de estado | Refrescar y revisar la transacción generada |
| `AS_STOCK_INSUFICIENTE` | No alcanza el stock del artículo o lote | Revisar ubicación, lote y cantidad |
| `AS_DEVOLUCION_EXCEDE_PENDIENTE` | La devolución supera el pendiente | Reducir la cantidad |
| `AS_MOVIMIENTO_NO_EDITABLE` | Se intentó guardar cambios sobre una solicitud que ya no está en `Pendiente de Procesar` | No se edita: si hay un error, registrar una solicitud nueva |
| **Este movimiento ya no se puede editar** | Se intentó editar una solicitud que ya no está en `Pendiente de Procesar` | No se edita: si hay un error, registrar una solicitud nueva |
| «La linea [n] pide [cantidad] y solo hay [disponible].» | Sin lote elegido, la cantidad supera lo disponible | Bajar la cantidad o elegir un lote |
| Cuenta de Ajuste vacía | No hay relación activa para la subsidiaria | Crear o activar una fila en **Gestion de Movimientos > Cuentas de Merma** |
| Ubicación Destino vacía | Falta la bodega de préstamos | Marcar una ubicación para la subsidiaria |
| El Préstamo no se guarda y marca **Entidad Receptora del Prestamo** | El campo es obligatorio | Elegir la entidad |
| **Entidad Receptora del Prestamo** sin opciones | La subsidiaria no tiene filas activas en **AS Entidad Receptora por Subsidiaria** | Cargar las entidades en **Gestion de Movimientos > Entidades Receptoras** |
| La entidad receptora aparece bloqueada al editar | La entidad no se cambia en una corrección | Anular y registrar un préstamo nuevo con la entidad correcta |
| Una entidad no aparece en el filtro de Devolución | No tiene préstamos pendientes en la subsidiaria | Revisar el préstamo; si ya fue devuelto completo, no hay nada que devolver |
| Un préstamo muestra `SIN ENTIDAD` | Se registró antes de que la entidad fuera obligatoria | Dejar el filtro vacío para encontrarlo |
| La cantidad cambió sola al escribirla | Tenía más de 2 decimales o superaba lo que hay del lote o lo pendiente | Revisar el valor ajustado |
| Lote vacío en una devolución pendiente | El lote se asigna al procesar | Procesar y volver a revisar |

## Resultado esperado

- Un Préstamo procesado tiene un `Inventory Transfer`, queda en `Pendiente de Devolucion`, el
  material se encuentra en la bodega de préstamos y el registro indica a qué entidad se prestó.
- Una Devolución procesada tiene un traslado inverso, queda en `Procesado` y disminuye el
  pendiente del préstamo relacionado.
- Una Merma procesada tiene un `Inventory Adjustment` negativo, usa la cuenta configurada y
  queda en `Procesado`.
- Cada solicitud dispone de su comprobante PDF y conserva la referencia a la transacción.

Para préstamos abiertos, el saldo físico de la bodega de préstamos debe coincidir con la suma
de las cantidades pendientes. Una diferencia indica un movimiento manual fuera del registro o
un proceso incompleto.
