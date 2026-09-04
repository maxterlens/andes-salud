# Guía de usuario — Movimientos de Inventario (AS_NSP_018)

## Qué hace

Registra el material que **sale físicamente de la clínica** y controla que vuelva.

Un préstamo mueve el stock desde la farmacia hacia una bodega espejo llamada **Bodega de Préstamos**. Esa bodega no es un lugar real: es el reflejo de lo que está afuera. Cuando el material vuelve, una devolución lo saca de ahí y lo devuelve a su origen.

**El saldo de la Bodega de Préstamos es lo que falta que devuelvan.**

## Qué contempla hoy

| Tipo | Se registra | Se procesa | Genera traslado | Comprobante |
|---|---|---|---|---|
| **Préstamo** | Sí | Sí | Sí | Sí |
| **Devolución** | Sí | Sí | Sí | Sí |
| **Merma** | Sí | **No** | **No** | No |

> **La Merma está a medias.** Aparece en el combo y se puede registrar con su motivo de baja, pero **no tiene botón para procesarla**: no existe el flujo que genera el traslado. Un movimiento de tipo Merma queda en *Pendiente de Procesar* indefinidamente y lo único que se puede hacer con él es anularlo. Quedó fuera de alcance a propósito.

Lo que sigue de esta guía aplica a **Préstamo y Devolución**.

## Ruta de acceso

```
Transactions > Inventory > Movimiento de Inventario         → la lista de movimientos
Transactions > Inventory > Movimiento de Inventario > New   → la pantalla de registro
```

Desde un movimiento abierto hay botones: **Nuevo Movimiento**, **Imprimir Comprobante**, **Anular Movimiento** y el de procesar según el tipo.

## Flujo de un préstamo

```
1. Registrar   →  tipo, fecha, subsidiaria, servicio, entidad receptora,
                  ubicación origen, responsable y el detalle de artículos con su lote
                  Estado: Pendiente de Procesar

2. Procesar    →  botón Procesar Prestamo
                  Genera el Inventory Transfer y mueve el stock a la bodega espejo
                  Estado: Pendiente de Devolución

3. Devolver    →  se registra una Devolución aparte, contra este préstamo
                  Estado: Devuelto Parcial o Devuelto Total
```

Mientras está en **Pendiente de Procesar** el movimiento se puede corregir entero o anular. Una vez procesado, **el detalle queda bloqueado** y solo se corrigen fecha, responsable y comentarios.

## Flujo de una devolución

```
1. Elegir subsidiaria y préstamo relacionado
   El servicio, las dos ubicaciones y la entidad se cargan solos del préstamo

2. Indicar cuánto vuelve de cada línea
   Viene propuesto lo pendiente; se puede devolver menos

3. Procesar Devolucion
   Genera el traslado inverso y descuenta del préstamo
```

**El lote no se elige en la devolución**: vuelve automáticamente el mismo que salió en el préstamo, respetando lo que ya se devolvió antes.

## Estados

| Estado | Cuándo | Editar | Anular | Procesar |
|---|---|---|---|---|
| Pendiente de Procesar | recién registrado | Todo | Sí | Sí |
| Pendiente de Devolución | préstamo ya procesado | Solo cabecera | No | — |
| Devuelto Parcial | volvió una parte | Solo cabecera | No | — |
| Devuelto Total | volvió todo | No | No | — |
| Procesado | devolución ya procesada | No | No | — |
| Anulado | anulado antes de procesar | No | No | No |

Un movimiento anulado **no movió inventario**, por eso no hay nada que revertir.

## Roles

| Rol | Puede |
|---|---|
| Administrator (3), QF CASPM (1371) | Registrar, editar, procesar, devolver y anular |
| Cualquier otro | Ver la lista, abrir un movimiento con su detalle e **imprimir el comprobante** |

Un rol no autorizado no ve los botones que escriben, y si llega por URL el sistema lo rechaza.

> QF CASCH (Chillán) **no está incluido**. Si el módulo se usa allá hay que agregarlo. `Falta validar en NetSuite`

## Configuración necesaria

Sin esto el módulo no funciona.

### 1. Bodega de Préstamos — obligatorio

```
Lists > Accounting > Locations → la bodega → AS Bodega de Prestamos y Devoluciones → marcado
    → efecto: pasa a ser el destino automático de todo préstamo de esa subsidiaria
```

**Una por subsidiaria.** Si una subsidiaria no tiene ninguna marcada, el combo Ubicación Destino queda vacío y **no se puede guardar un préstamo**.

```
Lists > Accounting > Locations → esa bodega → Make Inventory Available → DESMARCADO
    → efecto: el material prestado no cuenta como stock usable de la clínica
```

### 2. Relación subsidiaria — location

```
Lists > Accounting > Locations → la ubicación → Subsidiaria asignada
    → efecto: aparece en los combos de Ubicación Origen y Destino de esa subsidiaria
```

Una ubicación puede pertenecer a más de una subsidiaria; aparece en todas.

### 3. Entidades receptoras — opcional

```
Customization > Lists, Records & Fields > Record Types > AS Entidad Receptora por Subsidiaria > New
    → Subsidiaria + Entidad (Customer) → efecto: esa entidad aparece en el combo del préstamo
```

Es una **lista blanca corta**, cargada a mano: diez o veinte filas. No se puede ofrecer "todos los customers" porque en la cuenta son mayoritariamente pacientes.

El campo Entidad Receptora **no es obligatorio**, así que se puede desplegar y cargar la lista después.

### 4. Listas que el cliente mantiene

| Lista | Valores | Se puede modificar |
|---|---|---|
| Tipo de Movimiento | Préstamo, Devolución, Merma | **No** — el código compara por estos nombres |
| Estado de Movimiento | los seis de la tabla de arriba | **No** — el código compara por estos nombres |
| Motivo de Baja | Vencimiento, Deterioro, Otro | **Sí**, se pueden agregar los que hagan falta |

> Renombrar un valor de Tipo o Estado rompe el módulo. Agregar motivos de baja es seguro. (Motivo de Baja solo se usa en Merma, que hoy no se procesa.)

## Qué soporta

- **Lotes.** En un préstamo se elige el lote que se entrega, entre los que tienen stock en la ubicación de origen. La devolución retorna ese mismo lote.
- **Devoluciones parciales**, y varias devoluciones del mismo préstamo. El pendiente se actualiza solo.
- **Varios artículos** por movimiento, y el mismo artículo en varias líneas si sale de lotes distintos.
- **Comprobante en PDF** para préstamo y devolución, con bloque de firma para quien recibe.
- **Artículos sin control de lote**: la columna Lote queda vacía y el traslado se genera igual.

## Consideraciones importantes

**El material tiene que volver con el mismo lote.** Si el servicio devuelve una caja distinta a la que se llevó, el sistema lo rechaza. La salida es anular la devolución y corregirlo a mano.

**Disponible y stock físico no son lo mismo.** El préstamo valida contra lo *disponible* (descuenta lo comprometido en otros documentos); la devolución valida contra lo que hay *físicamente* en la bodega de préstamos, porque esa bodega no publica disponibilidad. Por eso los números de una pantalla y otra pueden no coincidir.

**Una devolución sin pendiente ya no se puede procesar.** Si se registran dos devoluciones del mismo préstamo y la primera lo deja en Devuelto Total, la segunda solo se puede anular. El sistema avisa al abrirla.

**El comprobante se puede imprimir en cualquier estado, incluido Anulado.** Es a propósito: el papel se lleva a firmar antes de procesar tanto como después. La única excepción es una devolución sin pendiente.

## Lo que el módulo NO hace

- **No procesa Mermas.** Se registran pero no generan traslado.
- No registra préstamos que la clínica **recibe** de terceros.
- No cierra automáticamente un préstamo que nunca vuelve completo.
- No revierte una devolución ya procesada.
