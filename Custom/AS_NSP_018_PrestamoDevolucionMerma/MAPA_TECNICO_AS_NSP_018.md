# Mapa técnico — AS_NSP_018 Movimientos de Inventario

Documentación interna. Leer esto antes de abrir los scripts.

## Resumen

Custom record de cabecera + detalle que representa un movimiento de material. Al procesarlo genera un **Inventory Transfer** nativo, que es lo único que mueve inventario de verdad.

La captura **no** usa el formulario nativo del custom record: el User Event redirige `CREATE` y `EDIT` a un Suitelet propio, porque el detalle es un child record y NetSuite no lo pinta junto a la cabecera.

**Tres tipos declarados, dos implementados.** `Merma` existe en la customlist, en `ORDEN_TIPOS` y en el formulario de captura (con su campo Motivo), pero **no tiene handler de proceso, ni `op` en el router, ni botón**. Se registra y queda en *Pendiente de Procesar* para siempre. Fuera de alcance por decisión.

## Arquitectura

```
Client Script  →  Suitelet  →  Handlers  →  Repositories  →  N/record, N/search, N/query
                     ↑
                User Event (vista del registro y bloqueo de edición)
```

Las dependencias van en una sola dirección: ningún handler importa otro handler, ningún repository importa un handler. `Constants` no importa nada y lo importan todos.

## Responsabilidad por archivo

| Archivo | Responsabilidad |
|---|---|
| `AS_MovimientoInventario_STLT_2.1.js` | Router. Arma `operacion`, llama al handler, y en el `catch` emite el único `MOVIMIENTO ERROR` |
| `AS_MovimientoInventario_UE_2.1.js` | Router de los dos hooks del User Event |
| `AS_MovimientoInventario_CS_2.1.js` | Comportamiento de las dos pantallas: recarga, combos, topes, y las funciones de los botones |
| `handlers/MovimientoInventarioForm.js` | Arma la pantalla de captura y el modo edición. Solo pinta, no escribe |
| `handlers/MovimientoInventarioHandler.js` | Guardar, anular, disponibilidad y el control de rol |
| `handlers/MovimientoInventarioUEHandler.js` | Vista del registro: campos por tipo, tab de detalle, botones, y el bloqueo de edición |
| `handlers/PrestamoHandler.js` | Solo generar el traslado de un préstamo |
| `handlers/DevolucionHandler.js` | Solo generar el traslado inverso y descontar del préstamo |
| `handlers/ImpresionHandler.js` | Payload del PDF y render contra el FTL del tipo |
| `repositories/MovimientoInventarioRepository.js` | Datos del módulo: cabecera, detalle y customlists |
| `repositories/InventoryTransferRepository.js` | El traslado nativo, la asignación de lotes y las consultas de stock |
| `lib/MovimientoInventarioConstants.js` | Contrato compartido: tipos, estados, records, operaciones, roles, plantillas |

**No hay `MermaHandler.js`.** Si algún día se implementa, es un handler nuevo + un `else if` en el router + un botón en `agregarBotones`. El formulario y el guardado ya lo cubren por el camino de salida.

## Flujo técnico

### Guardado (POST al Suitelet) — los tres tipos

```
STLT onRequest → validarPermisoEscritura() → guardarMovimiento()
    obtenerParametrosGuardado(request)
    rehaceDetalle = !idMovimiento || !movimiento.custrecord_as_mov_transfer
    if (rehaceDetalle) → valida: sin líneas / cantidad <= 0 / devolución toda en cero
    alta      → crearMovimiento(), estado Pendiente de Procesar
    edición   → actualizarDatosMovimiento() y, si rehaceDetalle, eliminarLineasMovimiento()
    bucle     → guardarLineaSalida() (Préstamo y Merma) o guardarLineaDevolucion()
    log MOVIMIENTO REGISTRADO → redirect al registro
```

> **El guardado no es transaccional.** Crea la cabecera y después las líneas. Si una línea falla queda una cabecera huérfana sin detalle. Se tapó el disparador conocido (cantidad ≤ 0) validando antes de crear, pero la estructura sigue igual.

### Préstamo — `op=procesar`

```
corta si estado != Pendiente de Procesar          → AS_MOVIMIENTO_YA_PROCESADO
buscarStockPorArticulo() para todas las líneas
por línea: si tiene lote → valida contra ese lote; si no → contra disponible del artículo
faltantes                                          → AS_STOCK_INSUFICIENTE
crearInventoryTransfer(origen → destino)
actualizarProcesoMovimiento(): transfer, estado Pendiente de Devolución, procesadoPor, fechaProceso
log MOVIMIENTO PROCESADO
```

### Devolución — `op=devolver`

```
corta si estado != Pendiente de Procesar          → AS_MOVIMIENTO_YA_PROCESADO
excedidas: cantidad > pendiente de su línea       → AS_DEVOLUCION_EXCEDE_PENDIENTE
buscarLotesDelTraslado(transfer del préstamo)     → plan de lotes por artículo
yaDevuelto por artículo = suma de devuelta de las líneas del préstamo
tomarLotesDelPrestamo(plan, saltar, cantidad)     → linea.lotes
valida stock lote por lote en la bodega           → AS_STOCK_INSUFICIENTE
crearInventoryTransfer(bodega → origen del préstamo)
sella el lote en cada línea de la devolución
descuenta línea por línea del préstamo
estado del préstamo: Devuelto Total si TODAS las líneas quedan en pendiente 0, si no Parcial
log MOVIMIENTO PROCESADO
```

### Impresión — `op=imprimir`

```
ImpresionHandler → payload { cabecera, lineas, totales }
alias 'jsonString', & escapado, mismo contrato que AS_NSP_008
render.create() + templateContent del FTL según el tipo
```

Motor propio, **no** el de `APIGlobales/ImpresionPDF`, para no compartir archivos con 2WIN_SOLICITUD_CONSUMO. Solo Préstamo y Devolución tienen plantilla.

## Records y fields críticos

| Field | Rol |
|---|---|
| `custrecord_as_mov_estado` | **Única marca de que el traslado ya se generó.** Es lo que corta el doble proceso |
| `custrecord_as_mov_transfer` | El Inventory Transfer generado. Su presencia bloquea el detalle |
| `custrecord_as_mov_det_linea_ref` | Apunta de la línea de devolución a la línea de préstamo. **Nunca cuadrar por artículo**: con el mismo artículo en dos líneas descuenta de más |
| `custrecord_as_mov_det_cant_pendiente` | Nace igual a la cantidad prestada, no en cero |
| `custrecord_as_mov_det_lote` | TEXT con el **nombre** del lote, no el id. El id se resuelve al procesar |
| `custrecord_as_es_bodega_prestamo` | Checkbox en Location (`rectype -103`) que identifica la bodega espejo |

## Reglas de negocio

- **Prestar y mover son el mismo acto.** Si se prestan 5, el traslado mueve 5. No existe entrega parcial.
- **El pendiente no se administra**: es el reflejo del saldo de la bodega de préstamos.
- **Devuelto Total se calcula con `every(pendiente === 0)`**, nunca con la suma total, que se compensa entre líneas.
- **La devolución no elige lote**: reconstruye el plan del traslado del préstamo y consume en orden, salteando lo ya devuelto.
- **El origen de una devolución sale del destino del préstamo**, no del checkbox: mover el check no debe romper préstamos ya hechos.
- **Prestada se muestra en la devolución y Pendiente no**: Prestada es inmutable, Pendiente se mueve con cada devolución posterior.

## Consultas

### N/search

| Archivo → función | Fuente | Filtros | Dato | Uso |
|---|---|---|---|---|
| `MovimientoInventarioRepository → obtenerEstadoMovimiento` | lookupFields sobre la cabecera | por id | texto del estado | Saber cómo quedó el préstamo de una devolución, sin cargar el record |
| `MovimientoInventarioRepository → buscarLineasPorMovimiento` | `customrecord_as_mov_inventario_det` | `custrecord_as_mov_det_ref anyof id` | artículo, unidad, lote, cantidad, devuelta, pendiente, línea de préstamo | Todo el módulo. Es la consulta más usada |
| `MovimientoInventarioRepository → obtenerIdEstadoMovimiento` | `customlist_as_estado_movimiento` | `name is <nombre>` | id interno | Traducir nombre → id. **Por eso los ids de las listas pueden diferir entre cuentas sin romper nada** |
| `MovimientoInventarioRepository → buscarOpcionesCustomList` | la customlist que reciba | ninguno | id + nombre | Poblar los combos de Tipo y Motivo |
| `InventoryTransferRepository → crearInventoryTransfer` | lookupFields sobre `inventorytransfer` | por id recién guardado | `tranid` | El número legible para el log |

### SuiteQL

| Archivo → función | Fuente | Filtros | Dato | Uso |
|---|---|---|---|---|
| `InventoryTransferRepository → buscarLotesDisponibles` | `InventoryBalance` + `InventoryNumberLocation` | item, location, ambos `quantityonhand > 0`, estado NOT IN (Bloqueado, En Inspección, Damaged) | lote, nombre, bin, en mano | Asignar lotes al traslado, poblar el combo Lote y validar stock por lote |
| `InventoryTransferRepository → buscarStockPorArticulo` | `item` LEFT JOIN `AggregateItemLocation` | `i.id IN (...)`, location | unidad, disponible, en mano | Columna Disponible y validación de stock del préstamo |
| `MovimientoInventarioRepository → listarUbicacionesPorSubsidiaria` | `location` + `LocationSubsidiaryMap` | `isinactive = F` | subsidiaria, id, nombre, es bodega préstamo | Combos de ubicación, filtrados en el cliente |
| `MovimientoInventarioRepository → listarPrestamosPendientes` | cabecera + detalle + las dos customlists + location | tipo = Préstamo, estado IN (Pendiente de Devolución, Devuelto Parcial), `HAVING SUM(pendiente) > 0` | id, nombre, subsidiaria, ubicación, pendiente | Combo Préstamo Relacionado. **Une por nombre contra las listas para no depender de ids internos** |
| `MovimientoInventarioRepository → listarEntidadesPorSubsidiaria` | `customrecord_as_receptor_subsidiaria` | `isinactive = F` | subsidiaria, entidad, nombre | Combo Entidad Receptora |

`buscarLotesDisponibles` y `buscarStockPorArticulo` viven en `InventoryTransferRepository` pero **no son del traslado**: cuatro de sus seis usos son de pantalla. Es el punto más discutible del módulo.

## Hardcodes

| Dónde | Valor | Riesgo |
|---|---|---|
| `Constants` | `ROLES_AUTORIZADOS = [3, 1371]` | Ids internos. Si en Producción el 1371 fuera otro rol, **falla abierto**: escribe sin error y sin log |
| `InventoryTransferRepository` | `'Bloqueado'`, `'En Inspección'`, `'Damaged'` | Nombres de Inventory Status. Si se renombran en NetSuite, dejan de excluirse |
| `InventoryTransferRepository` | `ORDER BY ib.lastmodifieddate ASC` | **No es antigüedad ni vencimiento.** El precedente de Andes (`2win_dao_numero_inventario.js`) usa FEFO |
| `Constants` | los seis nombres de estado y los tres de tipo | El código compara por nombre. Renombrar un valor rompe el módulo |
| `Objects` | `selectrecordtype -2` en Entidad Receptora | Inferido: `-3` Vendedor y `-4` Employee están confirmados en el repo, `-2` no. `Falta validar en NetSuite` |

## Script IDs y deployments

| Objeto | Script ID | Deployment |
|---|---|---|
| Suitelet | `customscript_as_stlt_movimiento_inv` | `customdeploy_as_stlt_movimiento_inv` |
| User Event | `customscript_as_ue_movimiento_inv` | `customdeploy_as_ue_movimiento_inv` |

**Suitelet:** `allemployees = T`, `allroles = F`, `runasrole = ADMINISTRATOR`, `status = RELEASED`, `loglevel = DEBUG`.
**User Event:** sobre `customrecord_as_movimiento_inventario`, `executioncontext = USERINTERFACE`, `allroles = T`, `runasrole = ADMINISTRATOR`.

> `runasrole = ADMINISTRATOR` **no tapa el rol real**: `runtime.getCurrentUser().role` devuelve el rol del usuario logueado. El runasrole solo cambia con qué permisos se ejecuta.

> `loglevel = DEBUG` en los dos. Para Producción conviene `AUDIT`.

## Operaciones del Suitelet

| `op` | Handler | Escribe |
|---|---|---|
| *(POST)* | `guardarMovimiento` | Sí |
| `procesar` | `PrestamoHandler` | Sí |
| `devolver` | `DevolucionHandler` | Sí |
| `anular` | `anularMovimientoInventario` | Sí |
| `disponible` | `consultarDisponible` | No |
| `imprimir` | `ImpresionHandler` | No |
| *(GET sin op)* | `renderizarFormulario` | No |

Las cuatro que escriben pasan antes por `validarPermisoEscritura()`. **No hay op de Merma.**

## Botones — `agregarBotones`, orden exacto

El orden importa: hay un `return` en el medio.

```
1. Nuevo Movimiento     si rolAutorizado (cualquier estado, incluido Anulado)
2. Imprimir Comprobante si tipo IN (Prestamo, Devolucion) y no es devolucionSinPendiente
                        → NO depende del rol ni del estado. Se imprime hasta un Anulado
3. return               si !rolAutorizado o estado == Anulado
4. Anular Movimiento    si estado == Pendiente de Procesar
5. Procesar Prestamo    si tipo == Prestamo y estado == Pendiente de Procesar
6. Procesar Devolucion  si tipo == Devolucion, estado == Pendiente de Procesar y hay pendiente
```

`devolucionSinPendiente` hace un `lookupFields` sobre el préstamo relacionado, y solo se evalúa si los dos primeros términos del `&&` son verdaderos.

**Merma no aparece en 5 ni en 6**: por eso no se puede procesar.

## Templates

```
/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/
    AS.FTL.PrestamoPDF.ftl
    AS.FTL.DevolucionPDF.ftl
```

Dos plantillas separadas, no una con condicionales. Payload: `doc.cabecera`, `doc.lineas`, `doc.totales`.

> BFO no resuelve fuentes con `font-weight` numérico y **descarta el texto sin avisar**. Usar `bold` y `<span style="font-size: Npt;">` inline. `linklabel` de un link de menú admite **máximo 30 caracteres**.

## Estados de inventario excluidos

`Bloqueado`, `En Inspección`, `Damaged` — no se asignan al traslado. Mismo criterio que `2win_dao_assign_inv_details.js`.

## Configuraciones externas que afectan al código

| Configuración | Efecto si falta |
|---|---|
| Checkbox `custrecord_as_es_bodega_prestamo` en una Location | El combo Ubicación Destino queda vacío y no se puede guardar un préstamo |
| **Make Inventory Available apagado** en esa bodega | Si se enciende, el material prestado vuelve a contar como stock usable |
| Filas en `customrecord_as_receptor_subsidiaria` | El combo Entidad Receptora sale vacío (no bloquea: el campo es opcional) |
| `LocationSubsidiaryMap` | Una ubicación sin subsidiaria no aparece en ningún combo |

## Logs

Solo tres títulos en todo el módulo:

| Título | Nivel | Dónde | Contenido |
|---|---|---|---|
| `MOVIMIENTO REGISTRADO` | audit | `MovimientoInventarioHandler` | id, tipo, origen, destino, artículos con cantidades |
| `MOVIMIENTO PROCESADO` | audit | `PrestamoHandler`, `DevolucionHandler` | id, tipo, artículos movidos, traslado, usuario |
| `MOVIMIENTO ERROR` | error | los dos entry points | id, operación, motivo |

**Los handlers no loguean errores**: lanzan y el router registra. Un handler nuevo queda cubierto solo.

## Errores que lanza el módulo

`AS_ROL_NO_AUTORIZADO` · `AS_MOVIMIENTO_SIN_DETALLE` · `AS_CANTIDAD_INVALIDA` · `AS_DEVOLUCION_SIN_CANTIDAD` · `AS_MOVIMIENTO_YA_PROCESADO` · `AS_STOCK_INSUFICIENTE` · `AS_DEVOLUCION_EXCEDE_PENDIENTE` · `AS_MOVIMIENTO_NO_EDITABLE`

Todos con `notifyOff: true`.

## Troubleshooting rápido

| Síntoma | Causa |
|---|---|
| Un movimiento de Merma no tiene botón para procesar | Correcto: no está implementado |
| Combo Ubicación Destino vacío en un préstamo | La subsidiaria no tiene ninguna Location con el checkbox de bodega de préstamos |
| Combo Entidad Receptora vacío | Falta cargar filas en `AS Entidad Receptora por Subsidiaria` para esa subsidiaria |
| `AS_STOCK_INSUFICIENTE` con stock a la vista | El préstamo mira *disponible*; la devolución mira *en mano*. Además valida **por lote**, no por artículo |
| El traslado se guarda sin inventory detail | El artículo no maneja lotes, o todos sus lotes están en estado excluido |
| Un movimiento no se puede abrir | Cabecera sin líneas (guardado a medias). Ya cubierto: `buscarStockPorArticulo` devuelve vacío en vez de armar un `IN ()` inválido |
| Columna Lote vacía en una devolución | El lote se sella **al procesar**. Una devolución pendiente todavía no lo tiene |
| Alerta que se repite sin fin en el cliente | Escribir desde `fieldChanged` el mismo campo que lo disparó. Por eso el cero se corta en `saveRecord` |
| El título del PDF no aparece | `font-weight` numérico en el FTL |
| Tres entradas en el menú en vez de una | SDF no borra links que dejaron de declararse. Se eliminan a mano desde el subtab **Links** |

## Pendientes conocidos

- **Merma** — se registra pero no se procesa. Falta handler, `op` y botón.
- **Reverso de devolución procesada** — no existe.
- **FEFO** — el orden de lote cuando el usuario no elige uno.
- **`custrecord_as_mov_fecha_devolucion`** — se escribe pero está oculto en los tres tipos. O se elimina o se llena.
- **Guardado no transaccional** — ver arriba.
- **QF CASCH (1566)** — fuera de `ROLES_AUTORIZADOS`. `Falta validar en NetSuite` si el módulo se usa en Chillán.
