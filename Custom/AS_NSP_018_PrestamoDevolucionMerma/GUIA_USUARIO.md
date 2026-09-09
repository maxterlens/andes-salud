# Guía de usuario — Movimientos de Inventario

## Para qué sirve

Registra el material que **sale físicamente de la clínica** y controla que vuelva.

Cuando un servicio se lleva material prestado a otra institución, el stock desaparecía del
control: nadie sabía cuánto salió, a quién, ni cuánto falta que devuelvan. Este módulo deja
esa salida registrada y con comprobante firmado, y mantiene el saldo de lo que está afuera.

### La bodega de préstamos

Es la pieza que hay que entender para usar el módulo.

Cada subsidiaria tiene **una sola ubicación marcada como bodega de préstamos**. No es una
bodega espejo de la farmacia ni una copia de otra ubicación: es **una ubicación única por
subsidiaria que representa todo lo que está fuera de la clínica**, sin importar de qué
farmacia salió ni a quién se le prestó.

Funciona como una ubicación "exterior": el material sigue perteneciendo a la subsidiaria y
por eso **sigue trazado** — se sabe qué artículo, qué lote y qué cantidad está afuera — pero
ya no cuenta como stock disponible para consumo, porque tiene *Make Inventory Available*
apagado.

**El saldo de esa bodega es exactamente lo que falta que devuelvan.**

Un préstamo mueve el stock desde la farmacia hacia ahí. Una devolución lo saca de ahí y lo
regresa a la ubicación de donde salió.

## Alcance

| Tipo | Se registra | Se procesa | Genera traslado | Comprobante |
|---|---|---|---|---|
| **Prestamo** | Sí | Sí | Sí | Sí |
| **Devolucion** | Sí | Sí | Sí | Sí |
| **Merma** | Sí | **No** | **No** | No |

> **La Merma está a medias.** Aparece en el combo y se puede registrar con su motivo de baja,
> pero **no tiene botón para procesarla**: no existe el flujo que genera el traslado. Un
> movimiento de tipo Merma queda en *Pendiente de Procesar* indefinidamente y lo único que se
> puede hacer con él es anularlo. Quedó fuera de alcance a propósito.

Lo que sigue aplica a **Prestamo y Devolucion**.

**Lo que el módulo no hace:**

- No procesa Mermas.
- No registra préstamos que la clínica **recibe** de terceros.
- No cierra automáticamente un préstamo que nunca vuelve completo.
- No revierte una devolución ya procesada.
- No permite prestar una parte de lo registrado: prestar y mover son el mismo acto.

## Quién lo usa

| Rol | Puede |
|---|---|
| Administrator (3), QF CASPM (1371) | Registrar, editar, procesar, devolver y anular |
| Cualquier otro | Ver la lista, abrir un movimiento con su detalle e **imprimir el comprobante** |

Un rol no autorizado no ve los botones que escriben, y si llega por URL el sistema lo rechaza.

> QF CASCH (Chillán) **no está incluido**. Si el módulo se usa allá hay que agregarlo.

## Dónde se usa

```
Transactions > Inventory > Movimiento de Inventario         → la lista de movimientos
Transactions > Inventory > Movimiento de Inventario > New   → la pantalla de registro
```

Desde un movimiento abierto hay botones: **Nuevo Movimiento**, **Imprimir Comprobante**,
**Anular Movimiento** y el de procesar según el tipo.

## Requisitos previos

Sin esto el módulo no funciona. Ver el detalle en **Configuración funcional**.

- Una ubicación marcada como bodega de préstamos en cada subsidiaria que use el módulo.
- Las ubicaciones asignadas a su subsidiaria.
- Stock disponible del artículo y del lote en la ubicación de origen.
- Un rol autorizado, para todo lo que no sea consultar o imprimir.

## Cómo usarlo

### Préstamo

1. **Registrar.** Tipo, fecha, subsidiaria, servicio, entidad receptora, ubicación origen,
   responsable y el detalle de artículos con su lote. Queda en *Pendiente de Procesar*.
2. **Procesar.** Botón **Procesar Prestamo**. Genera el traslado y mueve el stock a la bodega
   de préstamos. Pasa a *Pendiente de Devolucion*.
3. **Devolver.** Se registra una Devolución aparte, contra ese préstamo. El préstamo pasa a
   *Devuelto Parcial* o *Devuelto Total*.

Mientras está en *Pendiente de Procesar* el movimiento se puede corregir entero o anular. Una
vez procesado, **el detalle queda bloqueado** y solo se corrigen fecha, responsable y
comentarios.

### Devolución

1. Elegir subsidiaria y préstamo relacionado. El servicio, las dos ubicaciones y la entidad se
   cargan solos del préstamo.
2. Indicar cuánto vuelve de cada línea. Viene propuesto lo pendiente; se puede devolver menos.
3. Botón **Procesar Devolucion**. Genera el traslado inverso y descuenta del préstamo.

**El lote no se elige en la devolución**: vuelve automáticamente el mismo que salió en el
préstamo, respetando lo que ya se devolvió antes.

## Qué ocurre durante el proceso

Al procesar un préstamo, el sistema valida que haya stock del artículo — y del lote, si se
eligió uno — en la ubicación de origen. Si falta, corta y no genera nada. Si pasa, crea un
**Inventory Transfer** que es lo que mueve el inventario de verdad, y deja el número del
traslado en el movimiento.

Al procesar una devolución, reconstruye qué lotes salieron en el préstamo y devuelve esos
mismos, en orden, salteando lo ya devuelto. Después descuenta línea por línea del préstamo y
recalcula su estado.

## Estados

| Estado | Cuándo | Editar | Anular | Procesar |
|---|---|---|---|---|
| Pendiente de Procesar | recién registrado | Todo | Sí | Sí |
| Pendiente de Devolucion | préstamo ya procesado | Solo cabecera | No | — |
| Devuelto Parcial | volvió una parte | Solo cabecera | No | — |
| Devuelto Total | volvió todo | No | No | — |
| Procesado | devolución ya procesada | No | No | — |
| Anulado | anulado antes de procesar | No | No | No |

Un movimiento anulado **no movió inventario**, por eso no hay nada que revertir.

## Configuración funcional

### 1. Bodega de préstamos — obligatorio

```
Lists > Accounting > Locations > la bodega
   AS Bodega de Prestamos y Devoluciones  →  marcado
   Make Inventory Available               →  DESMARCADO
```

**Una sola por subsidiaria.** Es el destino automático de todo préstamo de esa subsidiaria y
el origen de sus devoluciones. Si una subsidiaria no tiene ninguna marcada, el combo Ubicación
Destino queda vacío y **no se puede guardar un préstamo**.

*Make Inventory Available* apagado es lo que hace que el material prestado no cuente como
stock usable de la clínica. Si se enciende, el material que está afuera vuelve a aparecer como
disponible.

### 2. Relación subsidiaria — ubicación

```
Lists > Accounting > Locations > la ubicación > Subsidiaria asignada
```

Una ubicación sin subsidiaria no aparece en ningún combo. Una ubicación puede pertenecer a más
de una subsidiaria y aparece en todas.

### 3. Entidades receptoras — opcional

```
Customization > Lists, Records & Fields > Record Types
   > AS Entidad Receptora por Subsidiaria > New
   → Subsidiaria + Entidad (Customer)
```

Es una **lista blanca corta**, cargada a mano: diez o veinte filas. No se puede ofrecer "todos
los customers" porque en la cuenta son mayoritariamente pacientes. El campo Entidad Receptora
**no es obligatorio**, así que se puede desplegar y cargar la lista después.

### 4. Listas que el cliente mantiene

| Lista | Valores | Se puede modificar |
|---|---|---|
| Tipo de Movimiento | Prestamo, Devolucion, Merma | **No** — el código compara por estos nombres |
| Estado de Movimiento | los seis de la tabla de arriba | **No** — el código compara por estos nombres |
| Motivo de Baja | Vencimiento, Deterioro, Otro | **Sí**, se pueden agregar los que hagan falta |

> Renombrar un valor de Tipo o Estado rompe el módulo, incluso agregarle una tilde. Agregar
> motivos de baja es seguro. (Motivo de Baja solo se usa en Merma, que hoy no se procesa.)

## Pendiente de configurar en NetSuite

En una cuenta nueva, antes de usarlo:

1. Marcar la bodega de préstamos de cada subsidiaria y apagarle *Make Inventory Available*.
2. Verificar que las ubicaciones tengan su subsidiaria asignada.
3. Cargar las filas de **AS Entidad Receptora por Subsidiaria** (opcional).
4. Confirmar qué roles van autorizados: hoy son Administrator y QF CASPM.

## Restricciones y consideraciones

**El material tiene que volver con el mismo lote.** Si el servicio devuelve una caja distinta
a la que se llevó, el sistema lo rechaza. La salida es anular la devolución y corregirlo a
mano.

**Disponible y stock físico no son lo mismo.** El préstamo valida contra lo *disponible*
(descuenta lo comprometido en otros documentos); la devolución valida contra lo que hay
*físicamente* en la bodega de préstamos, porque esa bodega no publica disponibilidad. Por eso
los números de una pantalla y otra pueden no coincidir.

**Una devolución sin pendiente ya no se puede procesar.** Si se registran dos devoluciones del
mismo préstamo y la primera lo deja en *Devuelto Total*, la segunda solo se puede anular. El
sistema avisa al abrirla.

**El comprobante se puede imprimir en cualquier estado, incluido Anulado.** Es a propósito: el
papel se lleva a firmar antes de procesar tanto como después. La única excepción es una
devolución sin pendiente.

**No hay entrega parcial.** Si se registran 5, el traslado mueve 5. Para prestar menos hay que
corregir el movimiento antes de procesarlo.

## Qué soporta

- **Lotes.** En un préstamo se elige el lote que se entrega, entre los que tienen stock en la
  ubicación de origen. La devolución retorna ese mismo lote.
- **Devoluciones parciales**, y varias devoluciones del mismo préstamo. El pendiente se
  actualiza solo.
- **Varios artículos** por movimiento, y el mismo artículo en varias líneas si sale de lotes
  distintos.
- **Comprobante en PDF** para préstamo y devolución, con bloque de firma para quien recibe.
- **Artículos sin control de lote**: la columna Lote queda vacía y el traslado se genera igual.

## Errores y solución

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| `AS_ROL_NO_AUTORIZADO` | El rol no puede escribir en el módulo | Usar un rol autorizado, o pedir que lo agreguen |
| `AS_MOVIMIENTO_SIN_DETALLE` | Se intentó guardar sin líneas | Agregar al menos un artículo |
| `AS_CANTIDAD_INVALIDA` | Una línea quedó en cero o negativo | Corregir la cantidad |
| `AS_DEVOLUCION_SIN_CANTIDAD` | Todas las líneas de la devolución están en cero | Indicar cuánto vuelve en al menos una |
| `AS_MOVIMIENTO_YA_PROCESADO` | Se intentó procesar algo que ya se procesó | Refrescar la pantalla: el traslado ya existe |
| `AS_STOCK_INSUFICIENTE` | No alcanza el stock del artículo o del lote | Ver la nota de *Disponible y stock físico* |
| `AS_DEVOLUCION_EXCEDE_PENDIENTE` | Se quiere devolver más de lo que falta | Bajar la cantidad a lo pendiente |
| `AS_MOVIMIENTO_NO_EDITABLE` | El movimiento ya no admite cambios en el detalle | Solo se pueden cambiar fecha, responsable y comentarios |

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| Un movimiento de Merma no tiene botón para procesar | Correcto: no está implementado |
| Combo Ubicación Destino vacío en un préstamo | La subsidiaria no tiene ninguna ubicación con el checkbox de bodega de préstamos |
| Combo Entidad Receptora vacío | Falta cargar filas de esa subsidiaria en AS Entidad Receptora por Subsidiaria |
| `AS_STOCK_INSUFICIENTE` con stock a la vista | El préstamo mira *disponible*, la devolución mira *en mano*, y valida **por lote** |
| El traslado se guarda sin lote | El artículo no maneja lotes, o todos sus lotes están en estado Bloqueado, En Inspección o Damaged |
| Columna Lote vacía en una devolución | El lote se sella **al procesar**. Una devolución pendiente todavía no lo tiene |

## Resultado esperado

Un préstamo bien procesado queda en *Pendiente de Devolucion*, con el número de traslado
registrado, y su material aparece en la bodega de préstamos de la subsidiaria.

Una devolución bien procesada queda en *Procesado*, y el préstamo del que descuenta pasa a
*Devuelto Parcial* o *Devuelto Total*.

La comprobación de fondo: **el saldo de la bodega de préstamos tiene que ser igual a la suma
de lo pendiente de todos los préstamos abiertos.** Si no cuadra, hubo un movimiento manual
sobre esa bodega por fuera del módulo.
