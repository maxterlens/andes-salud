# Guía de usuario — AS_NSP_018 Préstamo, Devolución y Merma

## Para qué sirve

Este módulo permite registrar y procesar tres movimientos de inventario desde una sola pantalla:

| Tipo | Resultado al procesar | Estado final inmediato | PDF |
|---|---|---|---|
| Préstamo | Traslado desde el origen hacia la bodega de préstamos | `Pendiente de Devolucion` | Sí |
| Devolución | Traslado desde la bodega de préstamos hacia el origen del préstamo | `Procesado` | Sí |
| Merma | Ajuste de inventario negativo en la misma ubicación | `Procesado` | Sí |

El formulario cambia según el **Tipo de Movimiento**. Ese campo define los datos, productos y
acciones que verá el usuario.

## Alcance

El módulo cubre:

- Préstamos de uno o varios artículos, con o sin lote.
- Devoluciones totales o parciales vinculadas a un préstamo pendiente.
- Varias devoluciones para un préstamo, mientras exista cantidad pendiente.
- Mermas por vencimiento, deterioro, cuarentena u otro motivo.
- Selección controlada de la cuenta contable de Merma según la subsidiaria.
- Validación de stock antes de crear la transacción de inventario.
- Bloqueo del botón durante el procesamiento para evitar varios clics.
- Comprobante PDF para los tres tipos de movimiento.

No permite revertir desde el módulo una devolución o Merma ya procesada.

## Quién lo usa

Los usuarios pueden consultar movimientos y descargar comprobantes. Para crear, editar,
procesar o anular se requiere uno de los roles autorizados por el módulo.

Actualmente el código autoriza los roles internos `3` y `1371`. El nombre asociado a estos
identificadores debe verificarse en cada cuenta de NetSuite.

## Dónde se usa

El acceso funcional se publica en:

```text
Transacciones > Inventario > Movimiento de Inventario
```

El formulario se llama **Registro de Movimiento de Inventario**. Al abrir un movimiento guardado,
NetSuite muestra su cabecera, detalle, estado y las acciones disponibles.

## Requisitos previos

Antes de operar, deben estar configurados:

1. Las ubicaciones y su relación con la subsidiaria.
2. Una sola bodega de préstamos por subsidiaria.
3. La disponibilidad de inventario y los lotes correspondientes.
4. Las entidades receptoras permitidas, si se utilizará ese dato.
5. Para Merma, al menos una cuenta activa en **AS Cuenta de Merma por Subsidiaria**.
6. Un rol autorizado para guardar y procesar.

## Cómo usarlo

### Crear un Préstamo

1. Ingresar a **Movimiento de Inventario** y seleccionar `Prestamo`.
2. Elegir la subsidiaria, el servicio y la ubicación de origen.
3. Verificar la ubicación de destino. El sistema propone la bodega de préstamos de la subsidiaria.
4. Completar fecha, responsable, entidad receptora si corresponde y comentarios.
5. Agregar los artículos, lote cuando aplique y cantidad prestada.
6. Presionar **Guardar Movimiento**.
7. Revisar el registro y presionar **Procesar Prestamo**.

Al procesar se crea un `Inventory Transfer` desde el origen hacia la bodega de préstamos. El
movimiento queda en `Pendiente de Devolucion`.

### Crear una Devolución

1. Seleccionar `Devolucion`.
2. Elegir primero la subsidiaria.
3. Seleccionar el **Prestamo Relacionado**. La lista muestra préstamos de esa subsidiaria con
   cantidades pendientes.
4. Completar fecha, responsable y comentarios.
5. Indicar la cantidad que vuelve en cada línea. Puede ser menor al pendiente, pero nunca mayor.
6. Presionar **Guardar Movimiento**.
7. Revisar el registro y presionar **Procesar Devolucion**.

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
7. Presionar **Guardar Movimiento**.
8. Revisar el registro y presionar **Procesar Merma**.

Al procesar se crea un `Inventory Adjustment` con cantidades negativas en la ubicación elegida,
usando la cuenta contable guardada. El movimiento queda en `Procesado`.

### Imprimir un comprobante

Abrir el movimiento y presionar **Imprimir Comprobante**. El módulo selecciona automáticamente
la plantilla de Préstamo, Devolución o Merma.

El comprobante puede imprimirse antes o después del procesamiento, incluso si el movimiento fue
anulado. En una devolución sin saldo pendiente el botón puede no mostrarse.

### Anular un movimiento

La acción **Anular Movimiento** está disponible mientras el registro se encuentre en
`Pendiente de Procesar`. La anulación cambia el estado; no revierte una transacción de
inventario ya creada.

## Qué ocurre durante el proceso

Al presionar un botón de procesamiento, este queda deshabilitado y se muestra el aviso
**Procesando el movimiento**. No se debe cerrar ni recargar la página.

El servidor vuelve a validar el estado antes de crear una transacción. Esta segunda validación
evita generar otra transacción si el usuario hace doble clic o repite la URL.

También se verifica:

- Que exista detalle y que las cantidades sean mayores que cero.
- Que haya stock suficiente para el artículo o lote.
- Que una devolución no exceda la cantidad pendiente.
- Que la Merma tenga una cuenta de ajuste guardada.
- Que el movimiento siga en `Pendiente de Procesar`.

## Configuración funcional

### Bodega de préstamos

Ruta habitual:

```text
Listas > Contabilidad > Ubicaciones > editar la ubicación
```

En cada subsidiaria debe existir una sola ubicación con:

- **AS Bodega de Prestamos y Devoluciones**: marcado.
- **Make Inventory Available**: desmarcado.

Esa ubicación recibe los préstamos y es el origen de sus devoluciones. Si falta, **Ubicación
Destino** queda vacía y no se puede guardar el préstamo.

### Relación subsidiaria y ubicación

Cada ubicación utilizada debe tener asignada la subsidiaria correspondiente. Una ubicación sin
esa relación no aparece en el formulario.

### Entidades receptoras

Ruta habitual:

```text
Personalización > Listas, Registros y Campos > Tipos de registro
> AS Entidad Receptora por Subsidiaria > Nuevo
```

Registrar una fila por pareja **Subsidiaria + Entidad**. El campo es opcional en el préstamo;
si no existen filas activas, el selector queda vacío.

### Cuentas permitidas para Merma

Ruta habitual:

```text
Personalización > Listas, Registros y Campos > Tipos de registro
> AS Cuenta de Merma por Subsidiaria > Nuevo
```

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

### Listas del módulo

| Lista | Valores actuales | Regla de mantenimiento |
|---|---|---|
| Tipo de Movimiento | `Prestamo`, `Devolucion`, `Merma` | No renombrar; el código compara estos textos |
| Estado de Movimiento | `Pendiente de Procesar`, `Pendiente de Devolucion`, `Devuelto Parcial`, `Devuelto Total`, `Procesado`, `Anulado` | No renombrar |
| Motivo de Baja | `Vencimiento`, `Deterioro`, `Cuarentena`, `Otro` | Se pueden agregar otros motivos |

Los nombres de Tipo y Estado están intencionalmente sin tilde. Cambiarlos rompe las reglas del
módulo.

## Pendiente de configurar en una cuenta nueva

1. Marcar una bodega de préstamos por subsidiaria y desactivar *Make Inventory Available*.
2. Verificar las relaciones entre subsidiarias y ubicaciones.
3. Cargar las entidades receptoras que se utilizarán.
4. Cargar al menos una cuenta activa de Merma por subsidiaria.
5. Verificar los identificadores de los roles autorizados en la cuenta destino.
6. Probar un movimiento de cada tipo en Sandbox antes del despliegue productivo.

## Restricciones

- La devolución debe usar el mismo lote que salió en el préstamo.
- El préstamo mueve la cantidad completa registrada; no existe entrega parcial al procesar.
- Una devolución procesada no tiene reverso automático.
- La Merma reduce inventario en la misma ubicación; no utiliza ubicación destino.
- El préstamo valida cantidad disponible. La devolución valida existencia física en la bodega.
- Los estados `Bloqueado`, `En Inspección` y `Damaged` no se utilizan para asignar lotes.
- Sin lote elegido, el orden automático usa la última modificación del balance; no es FEFO.

## Errores y solución

| Mensaje o síntoma | Significado | Acción recomendada |
|---|---|---|
| `AS_ROL_NO_AUTORIZADO` | El rol no puede escribir | Solicitar un rol autorizado |
| `AS_MOVIMIENTO_SIN_DETALLE` | No hay productos | Agregar al menos una línea |
| `AS_CANTIDAD_INVALIDA` | Existe una cantidad cero o negativa | Corregir la cantidad |
| `AS_DEVOLUCION_SIN_CANTIDAD` | Todas las cantidades devueltas son cero | Ingresar una cantidad en una línea |
| `AS_MOVIMIENTO_YA_PROCESADO` | El movimiento ya cambió de estado | Refrescar y revisar la transacción generada |
| `AS_STOCK_INSUFICIENTE` | No alcanza el stock del artículo o lote | Revisar ubicación, lote y cantidad |
| `AS_DEVOLUCION_EXCEDE_PENDIENTE` | La devolución supera el pendiente | Reducir la cantidad |
| `AS_MOVIMIENTO_NO_EDITABLE` | El detalle ya no admite cambios | Revisar el estado y editar solo los datos permitidos |
| Cuenta de Ajuste vacía | No hay relación activa para la subsidiaria | Crear o activar una fila en **AS Cuenta de Merma por Subsidiaria** |
| Ubicación Destino vacía | Falta la bodega de préstamos | Marcar una ubicación para la subsidiaria |
| Lote vacío en una devolución pendiente | El lote se asigna al procesar | Procesar y volver a revisar |

## Resultado esperado

- Un Préstamo procesado tiene un `Inventory Transfer`, queda en `Pendiente de Devolucion` y el
  material se encuentra en la bodega de préstamos.
- Una Devolución procesada tiene un traslado inverso, queda en `Procesado` y disminuye el
  pendiente del préstamo relacionado.
- Una Merma procesada tiene un `Inventory Adjustment` negativo, usa la cuenta configurada y
  queda en `Procesado`.
- Cada movimiento dispone de su comprobante PDF y conserva la referencia a la transacción.

Para préstamos abiertos, el saldo físico de la bodega de préstamos debe coincidir con la suma
de las cantidades pendientes. Una diferencia indica un movimiento manual fuera del módulo o un
proceso incompleto.
