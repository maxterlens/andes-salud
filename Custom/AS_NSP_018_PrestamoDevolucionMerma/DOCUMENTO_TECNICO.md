# Documento técnico — AS_NSP_018 Préstamo, Devolución y Merma

## Objetivo técnico

Custom record de cabecera + detalle que representa un movimiento de inventario. Al procesar
un Préstamo o una Devolución genera un **Inventory Transfer**; al procesar una Merma genera
un **Inventory Adjustment** negativo.

La captura **no** usa el formulario nativo del custom record: el User Event redirige `CREATE` y
`EDIT` a un Suitelet propio, porque el detalle es un child record y NetSuite no lo pinta junto
a la cabecera.

Los tres tipos están implementados: `Prestamo`, `Devolucion` y `Merma`. Comparten cabecera,
detalle y formulario; cada procesamiento tiene su propio handler y repositorio transaccional.

### El modelo de la bodega de préstamos

No es una bodega espejo. Es **una sola Location por subsidiaria**, marcada con el checkbox
`custrecord_as_es_bodega_prestamo`, que representa todo el material que está fuera de la
clínica sin distinguir de qué farmacia salió ni a quién se prestó. El help del propio campo lo
fija: *"Debe haber una sola marcada por subsidiaria"*, y el Client Script toma la primera que
encuentra con `filter(...)[0]`, así que una segunda marcada quedaría ignorada en silencio.

Funciona como una ubicación "exterior": el stock sigue siendo de la subsidiaria y por eso sigue
trazado por artículo y lote, pero con *Make Inventory Available* apagado no cuenta como
disponible. **El saldo de esa Location es el pendiente de devolución del módulo**, y por eso el
pendiente no se administra: se refleja.

## Arquitectura

Cuatro responsabilidades: entry points → UI/handlers → repositories. **No hay capa `services/`**,
por decisión: la lógica de negocio vive en los handlers de cada operación y la construcción
del formulario en `ui/`.

```
Client Script  →  Suitelet  →  Handlers  →  Repositories  →  N/record, N/search, N/query
                     ↑
                User Event (vista del registro y bloqueo de edición)
```

Las dependencias van en una sola dirección: ningún handler importa otro handler, ningún
repository importa un handler. `Constants` no importa nada y lo importan todos.

## Estructura de archivos

Todo bajo
`src/FileCabinet/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/`.

| Archivo | Responsabilidad |
|---|---|
| `AS_MovimientoInventario_STLT_2.1.js` | Router. Arma `operacion`, llama al handler, y en el `catch` emite el único `MOVIMIENTO ERROR` |
| `AS_MovimientoInventario_UE_2.1.js` | Router de los dos hooks del User Event |
| `AS_MovimientoInventario_CS_2.1.js` | Comportamiento de las dos pantallas: recarga, combos, topes, y las funciones de los botones |
| `ui/AS_MovimientoInventarioForm.js` | Arma la pantalla de captura y el modo edición. Solo pinta, no escribe |
| `ui/AS_ConsultaStockForm.js` | Arma la pantalla auxiliar de consulta de stock para desarrollo y QA |
| `handlers/AS_MovimientoInventarioHandler.js` | Guardar, anular, disponibilidad y el control de rol |
| `handlers/AS_MovimientoInventarioUEHandler.js` | Vista del registro: campos por tipo, tab de detalle, botones, y el bloqueo de edición |
| `handlers/AS_MovimientoInventarioPrestamoHandler.js` | Solo generar el traslado de un préstamo |
| `handlers/AS_MovimientoInventarioDevolucionHandler.js` | Solo generar el traslado inverso y descontar del préstamo |
| `handlers/AS_MovimientoInventarioMermaHandler.js` | Valida y genera el ajuste de inventario de una merma |
| `handlers/AS_MovimientoInventarioImpresionHandler.js` | Payload del PDF y render contra el FTL del tipo |
| `repositories/AS_MovimientoInventarioRepository.js` | Datos del módulo: cabecera, detalle y customlists |
| `repositories/AS_MovimientoInventarioTransferenciaRepository.js` | Crea el traslado nativo y lee sus asignaciones de lote |
| `repositories/AS_MovimientoInventarioAjusteRepository.js` | Crea el ajuste de inventario utilizado por Merma |
| `repositories/AS_ConsultaStockRepository.js` | Centraliza las consultas de stock, ubicaciones y lotes disponibles |
| `lib/AS_MovimientoInventarioConstants.js` | Contrato compartido: tipos, estados, records, operaciones, roles, plantillas |
| `templates/AS.FTL.PrestamoPDF.ftl` | Comprobante de préstamo |
| `templates/AS.FTL.DevolucionPDF.ftl` | Comprobante de devolución |
| `templates/AS.FTL.MermaPDF.ftl` | Comprobante de Merma |

Merma tiene su propio handler y repositorio de ajuste. El Suitelet conserva un único router
para Préstamo, Devolución y Merma.

### Migración de nombres internos

SDF carga los archivos nuevos, pero no elimina los nombres anteriores del File Cabinet. Después
de desplegar esta versión se deben borrar manualmente los archivos de la columna **Anterior**.

| Anterior | Nuevo |
|---|---|
| `handlers/MovimientoInventarioForm.js` | `ui/AS_MovimientoInventarioForm.js` |
| `handlers/AS_ConsultaStockHandler.js` | `ui/AS_ConsultaStockForm.js` |
| `handlers/MovimientoInventarioHandler.js` | `handlers/AS_MovimientoInventarioHandler.js` |
| `handlers/MovimientoInventarioUEHandler.js` | `handlers/AS_MovimientoInventarioUEHandler.js` |
| `handlers/PrestamoHandler.js` | `handlers/AS_MovimientoInventarioPrestamoHandler.js` |
| `handlers/DevolucionHandler.js` | `handlers/AS_MovimientoInventarioDevolucionHandler.js` |
| `handlers/AS_MermaHandler.js` | `handlers/AS_MovimientoInventarioMermaHandler.js` |
| `handlers/ImpresionHandler.js` | `handlers/AS_MovimientoInventarioImpresionHandler.js` |
| `repositories/MovimientoInventarioRepository.js` | `repositories/AS_MovimientoInventarioRepository.js` |
| `repositories/InventoryTransferRepository.js` | `repositories/AS_MovimientoInventarioTransferenciaRepository.js` |
| `repositories/AS_InventoryAdjustmentRepository.js` | `repositories/AS_MovimientoInventarioAjusteRepository.js` |
| `lib/MovimientoInventarioConstants.js` | `lib/AS_MovimientoInventarioConstants.js` |

## Flujo de ejecución

### Guardado (POST al Suitelet) — los tres tipos

```
STLT onRequest → validarPermisoEscritura() → guardarMovimiento()
    obtenerParametrosGuardado(request)
    rehaceDetalle = !idMovimiento || !movimiento.custrecord_as_mov_transfer
    if (rehaceDetalle) → valida: sin lineas / cantidad <= 0 / devolucion toda en cero
    alta      → crearMovimiento(), estado Pendiente de Procesar
    edicion   → actualizarDatosMovimiento() y, si rehaceDetalle, eliminarLineasMovimiento()
    bucle     → guardarLineaSalida() (Prestamo y Merma) o guardarLineaDevolucion()
    log MOVIMIENTO REGISTRADO → redirect al registro
```

> **El guardado no es transaccional.** Crea la cabecera y después las líneas. Si una línea
> falla queda una cabecera huérfana sin detalle. Se tapó el disparador conocido (cantidad ≤ 0)
> validando antes de crear, pero la estructura sigue igual.

### Préstamo — `op=procesar`

```
corta si estado != Pendiente de Procesar          → AS_MOVIMIENTO_YA_PROCESADO
buscarStockPorArticulo() para todas las lineas
por linea: si tiene lote → valida contra ese lote; si no → contra disponible del articulo
faltantes                                          → AS_STOCK_INSUFICIENTE
crearTransferenciaInventario(origen → destino)
actualizarProcesoMovimiento(): transfer, estado Pendiente de Devolucion, procesadoPor, fecha
log MOVIMIENTO PROCESADO
```

### Devolución — `op=devolver`

```
corta si estado != Pendiente de Procesar          → AS_MOVIMIENTO_YA_PROCESADO
excedidas: cantidad > pendiente de su linea       → AS_DEVOLUCION_EXCEDE_PENDIENTE
buscarLotesDelTraslado(transfer del prestamo)     → plan de lotes por articulo
yaDevuelto por articulo = suma de devuelta de las lineas del prestamo
tomarLotesDelPrestamo(plan, saltar, cantidad)     → linea.lotes
valida stock lote por lote en la bodega           → AS_STOCK_INSUFICIENTE
crearTransferenciaInventario(bodega → origen del prestamo)
sella el lote en cada linea de la devolucion
descuenta linea por linea del prestamo
estado del prestamo: Devuelto Total si TODAS las lineas quedan en pendiente 0, si no Parcial
log MOVIMIENTO PROCESADO
```

### Merma — `op=mermar`

```
corta si estado != Pendiente de Procesar          → AS_MOVIMIENTO_YA_PROCESADO
lee ubicación, subsidiaria, servicio y Cuenta de Ajuste de la cabecera
buscarStockPorArticulo() para todas las líneas
por línea: si tiene lote → valida existencia física; si no → valida disponible del artículo
faltantes                                          → AS_STOCK_INSUFICIENTE
crearAjusteInventario() con adjustqtyby negativo y la cuenta configurada
actualizarProcesoMovimiento(): transacción, estado Procesado, misma ubicación, usuario, fecha
log MOVIMIENTO PROCESADO
```

La Merma no crea traslado ni pendiente. El identificador del `Inventory Adjustment` se guarda
en `custrecord_as_mov_transfer`, campo histórico que funciona como referencia a la transacción
generada aunque su etiqueta mencione traslado.

### Impresión — `op=imprimir`

```
AS_MovimientoInventarioImpresionHandler → payload { cabecera, lineas, totales }
alias 'jsonString', & escapado, mismo contrato que AS_NSP_008
render.create() + templateContent del FTL segun el tipo
```

Motor propio, **no** el de `APIGlobales/ImpresionPDF`, para no compartir archivos con
2WIN_SOLICITUD_CONSUMO. Préstamo, Devolución y Merma tienen una plantilla independiente.

## Componentes

**Suitelet `customscript_as_stlt_movimiento_inv`** — entry point `onRequest`. Es el router de
todo el módulo. Las operaciones se resuelven por el parámetro `op`:

| `op` | Handler | Escribe |
|---|---|---|
| *(POST)* | `guardarMovimiento` | Sí |
| `procesar` | `AS_MovimientoInventarioPrestamoHandler` | Sí |
| `devolver` | `AS_MovimientoInventarioDevolucionHandler` | Sí |
| `mermar` | `AS_MovimientoInventarioMermaHandler` | Sí |
| `anular` | `anularMovimientoInventario` | Sí |
| `disponible` | `consultarDisponible` | No |
| `imprimir` | `AS_MovimientoInventarioImpresionHandler` | No |
| *(GET sin op)* | `renderizarFormulario` | No |

Las cinco operaciones que escriben pasan antes por `validarPermisoEscritura()`.

**User Event `customscript_as_ue_movimiento_inv`** — dos hooks: redirige `CREATE`/`EDIT` al
Suitelet, y en `VIEW` arma la vista del registro con su tab de detalle y sus botones.

**Client Script** — combos encadenados, tope de cantidades, preselección de la bodega destino y
las funciones que llaman a cada `op`.

## Objetos de NetSuite

| Objeto | Script ID |
|---|---|
| Suitelet | `customscript_as_stlt_movimiento_inv` / `customdeploy_as_stlt_movimiento_inv` |
| Suitelet auxiliar de stock | `customscript_as_stlt_consulta_stock` / `customdeploy_as_stlt_consulta_stock` |
| User Event | `customscript_as_ue_movimiento_inv` / `customdeploy_as_ue_movimiento_inv` |
| Cabecera | `customrecord_as_movimiento_inventario` |
| Detalle | `customrecord_as_mov_inventario_det` |
| Entidad receptora | `customrecord_as_receptor_subsidiaria` |
| Cuenta de Merma por subsidiaria | `customrecord_as_cuenta_merma_subsidiaria` |
| Checkbox en Location | `custrecord_as_es_bodega_prestamo` (`rectype -103`) |
| Formulario | `custform_as_movimiento_inventario` |
| Listas | `customlist_as_tipo_movimiento`, `customlist_as_estado_movimiento`, `customlist_as_motivo_baja` |

**Suitelet:** `allemployees T`, `allroles F`, `runasrole ADMINISTRATOR`, `status RELEASED`,
`loglevel DEBUG`.
**Suitelet auxiliar de stock:** audiencia `ADMINISTRATOR`, `runasrole ADMINISTRATOR`,
`status RELEASED`, `loglevel DEBUG`; es una herramienta de solo lectura para desarrollo y QA.
**User Event:** sobre `customrecord_as_movimiento_inventario`, `executioncontext USERINTERFACE`,
`allroles T`, `allemployees T`, `runasrole ADMINISTRATOR`, `loglevel DEBUG`.

> `runasrole = ADMINISTRATOR` **no tapa el rol real**: `runtime.getCurrentUser().role` devuelve
> el rol del usuario logueado. El runasrole solo cambia con qué permisos se ejecuta.

**Features del manifest:** `SERVERSIDESCRIPTING`, `CUSTOMRECORDS`, `SUBSIDIARIES`,
`UNITSOFMEASURE`, `LOCATIONS`, `DEPARTMENTS` como requeridas; `MULTILANGUAGE`, `MATRIXITEMS`,
`CUSTOMSEGMENTS`, `EXTREMELIST`, `MAILMERGE` como opcionales.

## Datos utilizados

| Field | Rol |
|---|---|
| `custrecord_as_mov_estado` | **Marca principal de que el proceso ya se ejecutó.** Es lo que corta el doble proceso |
| `custrecord_as_mov_transfer` | Referencia a la transacción generada: Inventory Transfer o Inventory Adjustment. Su presencia bloquea el detalle |
| `custrecord_as_mov_cuenta_ajuste` | Cuenta contable elegida para el `Inventory Adjustment` de Merma |
| `custrecord_as_mov_ubicacion_dest` | Destino del préstamo. **El origen de la devolución sale de acá**, no del checkbox |
| `custrecord_as_mov_det_linea_ref` | Apunta de la línea de devolución a la línea de préstamo. **Nunca cuadrar por artículo**: con el mismo artículo en dos líneas descuenta de más |
| `custrecord_as_mov_det_cant_pendiente` | Nace igual a la cantidad prestada, no en cero |
| `custrecord_as_mov_det_lote` | TEXT con el **nombre** del lote, no el id. El id se resuelve al procesar |
| `custrecord_as_es_bodega_prestamo` | Checkbox en Location que identifica la bodega de préstamos de la subsidiaria |
| `custrecord_as_cuenta_merma_subsidiaria` | Subsidiaria de una relación activa del maestro de cuentas de Merma |
| `custrecord_as_cuenta_merma_cuenta` | Cuenta contable permitida para esa subsidiaria |

### Valores de lista, exactos

El código compara por **nombre**, y los valores están **sin tilde**:

- Tipos: `Prestamo`, `Devolucion`, `Merma`
- Estados: `Pendiente de Procesar`, `Pendiente de Devolucion`, `Devuelto Parcial`,
  `Devuelto Total`, `Procesado`, `Anulado`
- Motivos iniciales de baja: `Vencimiento`, `Deterioro`, `Cuarentena`, `Otro`

Agregarle una tilde a cualquiera de estos valores en NetSuite rompe el módulo.

## Lógica de negocio

- **Prestar y mover son el mismo acto.** Si se prestan 5, el traslado mueve 5. No existe
  entrega parcial.
- **El pendiente no se administra**: es el reflejo del saldo de la bodega de préstamos.
- **Devuelto Total se calcula con `every(pendiente === 0)`**, nunca con la suma total, que se
  compensa entre líneas.
- **La devolución no elige lote**: reconstruye el plan del traslado del préstamo y consume en
  orden, salteando lo ya devuelto.
- **El origen de una devolución sale del destino del préstamo**, no del checkbox: mover el
  check no debe romper préstamos ya hechos.
- **Prestada se muestra en la devolución y Pendiente no**: Prestada es inmutable, Pendiente se
  mueve con cada devolución posterior.
- **La cuenta de Merma no se consulta desde el plan completo de cuentas**: el formulario carga
  únicamente filas activas de `customrecord_as_cuenta_merma_subsidiaria` y el Client Script las
  filtra por la subsidiaria seleccionada.
- **Subsidiaria + configuración activa = cuentas disponibles en Cuenta de Ajuste.** Cambiar una
  cuenta requiere mantener el maestro, no editar código.
- **La Merma se procesa en la misma ubicación**: crea cantidades negativas, queda `Procesado` y
  no genera saldo pendiente.

### Botones — `agregarBotones`, orden exacto

El orden importa: hay un `return` en el medio.

```
1. Nuevo Movimiento     si rolAutorizado (cualquier estado, incluido Anulado)
2. Imprimir Comprobante si tipo IN (Prestamo, Devolucion, Merma) y no es devolucionSinPendiente
                        → NO depende del rol ni del estado. Se imprime hasta un Anulado
3. return               si !rolAutorizado o estado == Anulado
4. Anular Movimiento    si estado == Pendiente de Procesar
5. Procesar Prestamo    si tipo == Prestamo y estado == Pendiente de Procesar
6. Procesar Devolucion  si tipo == Devolucion, estado == Pendiente de Procesar y hay pendiente
7. Procesar Merma       si tipo == Merma y estado == Pendiente de Procesar
```

`devolucionSinPendiente` hace un `lookupFields` sobre el préstamo relacionado, y solo se evalúa
si los dos primeros términos del `&&` son verdaderos.

## Consultas

### N/search

| Archivo → función | Fuente | Filtros | Dato | Uso |
|---|---|---|---|---|
| `AS_MovimientoInventarioRepository → obtenerEstadoMovimiento` | lookupFields sobre la cabecera | por id | texto del estado | Saber cómo quedó el préstamo de una devolución, sin cargar el record |
| `AS_MovimientoInventarioRepository → buscarLineasPorMovimiento` | `customrecord_as_mov_inventario_det` | `custrecord_as_mov_det_ref anyof id` | artículo, unidad, lote, cantidad, devuelta, pendiente, línea de préstamo | Todo el módulo. Es la consulta más usada |
| `AS_MovimientoInventarioRepository → obtenerIdEstadoMovimiento` | `customlist_as_estado_movimiento` | `name is <nombre>` | id interno | Traducir nombre → id. **Por eso los ids de las listas pueden diferir entre cuentas sin romper nada** |
| `AS_MovimientoInventarioRepository → buscarOpcionesCustomList` | la customlist que reciba | ninguno | id + nombre | Poblar los combos de Tipo y Motivo |
| `AS_MovimientoInventarioTransferenciaRepository → crearTransferenciaInventario` | lookupFields sobre `inventorytransfer` | por id recién guardado | `tranid` | El número legible para el log |

### SuiteQL

| Archivo → función | Fuente | Filtros | Dato | Uso |
|---|---|---|---|---|
| `AS_ConsultaStockRepository → buscarLotesDisponibles` | `InventoryBalance` + `InventoryNumberLocation` | item, location, ambos `quantityonhand > 0`, estado NOT IN (Bloqueado, En Inspección, Damaged) | lote, nombre, bin, en mano | Asignar lotes, poblar el combo Lote y validar stock por lote |
| `AS_ConsultaStockRepository → buscarStockPorArticulo` | `item` LEFT JOIN `AggregateItemLocation` | `i.id IN (...)`, location | unidad, disponible, en mano | Columna Disponible y validación de stock de los procesos |
| `AS_MovimientoInventarioRepository → listarUbicacionesPorSubsidiaria` | `location` + `LocationSubsidiaryMap` | `isinactive = F` | subsidiaria, id, nombre, es bodega préstamo | Combos de ubicación, filtrados en el cliente |
| `AS_MovimientoInventarioRepository → listarPrestamosPendientes` | cabecera + detalle + las dos customlists + location | tipo = Prestamo, estado IN (Pendiente de Devolucion, Devuelto Parcial), `HAVING SUM(pendiente) > 0` | id, nombre, subsidiaria, ubicación, pendiente | Combo Préstamo Relacionado. **Une por nombre contra las listas para no depender de ids internos** |
| `AS_MovimientoInventarioRepository → listarEntidadesPorSubsidiaria` | `customrecord_as_receptor_subsidiaria` | `isinactive = F` | subsidiaria, entidad, nombre | Combo Entidad Receptora |
| `AS_MovimientoInventarioRepository → listarCuentasAjuste` | `customrecord_as_cuenta_merma_subsidiaria` | `isinactive = F` | subsidiaria, cuenta y nombre de cuenta | Combo Cuenta de Ajuste, filtrado por subsidiaria en el cliente |

`buscarLotesDisponibles` y `buscarStockPorArticulo` están centralizadas en
`AS_ConsultaStockRepository`; los handlers y la UI consumen el mismo criterio de disponibilidad.

## Hardcodes

| Dónde | Valor | Riesgo |
|---|---|---|
| `Constants` | `ROLES_AUTORIZADOS = [3, 1371]` | Ids internos. Si en Producción el 1371 fuera otro rol, **falla abierto**: escribe sin error y sin log |
| `AS_ConsultaStockRepository` | `'Bloqueado'`, `'En Inspección'`, `'Damaged'` | Nombres de Inventory Status. Si se renombran en NetSuite, dejan de excluirse |
| `AS_ConsultaStockRepository` | `ORDER BY ib.lastmodifieddate ASC` | **No es antigüedad ni vencimiento.** El precedente de Andes (`2win_dao_numero_inventario.js`) usa FEFO |
| `Constants` | los seis nombres de estado y los tres de tipo | El código compara por nombre. Renombrar un valor rompe el módulo |
| `Constants` | `CLIENT_SCRIPT` y las tres rutas de `PLANTILLAS` | Rutas absolutas del File Cabinet. Mover la carpeta las rompe |
| `Objects` | `selectrecordtype -2` en Entidad Receptora | Inferido: `-3` Vendedor y `-4` Employee están confirmados en el repo, `-2` no. Falta validar en NetSuite |

## Configuración

### Configurable

| Configuración | Efecto si falta |
|---|---|
| Checkbox `custrecord_as_es_bodega_prestamo` en una Location | El combo Ubicación Destino queda vacío y no se puede guardar un préstamo |
| **Make Inventory Available apagado** en esa bodega | Si se enciende, el material prestado vuelve a contar como stock usable |
| Filas en `customrecord_as_receptor_subsidiaria` | El combo Entidad Receptora sale vacío (no bloquea: el campo es opcional) |
| Filas activas en `customrecord_as_cuenta_merma_subsidiaria` | Cuenta de Ajuste queda vacía y no se puede guardar una Merma para esa subsidiaria |
| `LocationSubsidiaryMap` | Una ubicación sin subsidiaria no aparece en ningún combo |
| Valores de `customlist_as_motivo_baja` | Incluye Vencimiento, Deterioro, Cuarentena y Otro; se pueden agregar valores |

### Requiere código

Los roles autorizados, los nombres de tipo y estado, los estados de inventario excluidos, el
orden de asignación de lotes, el layout de los PDF y cualquier cosa de la tabla de Hardcodes.

## Despliegue

```bash
cd andes-salud/Custom/AS_NSP_018_PrestamoDevolucionMerma
suitecloud project:validate --server
suitecloud project:deploy
```

`project.json` fija `defaultAuthId: "AndesSaludQa"`: un `project:deploy` sin argumentos va a
**QA**, no a producción.

> **SDF no borra links de menú que dejaron de declararse.** Si aparecen entradas duplicadas en
> el menú, se eliminan a mano desde el subtab **Links** del centro correspondiente.

## Restricciones técnicas

| Restricción | Detalle |
|---|---|
| **Una bodega por subsidiaria** | El CS toma `filter(...)[0]`. Una segunda Location marcada se ignora sin aviso |
| **Solo interfaz de usuario** | El User Event es `USERINTERFACE`: no corre en importación CSV ni Web Services |
| **Sin reverso** | Una devolución procesada no se puede revertir desde el módulo |
| **Sin entrega parcial** | El traslado mueve exactamente lo registrado |
| **Lote idéntico en la devolución** | Vuelve el mismo lote que salió; no admite reemplazo |
| **Guardado no transaccional** | Cabecera y líneas se crean por separado |
| **Cuenta de Merma obligatoria** | Debe existir una configuración activa para la subsidiaria y quedar guardada en la cabecera |

## Manejo de errores

Errores que lanza el módulo, todos con `notifyOff: true`:

`AS_ROL_NO_AUTORIZADO` · `AS_MOVIMIENTO_SIN_DETALLE` · `AS_CANTIDAD_INVALIDA` ·
`AS_DEVOLUCION_SIN_CANTIDAD` · `AS_MOVIMIENTO_YA_PROCESADO` · `AS_STOCK_INSUFICIENTE` ·
`AS_DEVOLUCION_EXCEDE_PENDIENTE` · `AS_MOVIMIENTO_NO_EDITABLE`

**Los handlers no loguean errores**: lanzan y el router registra. Un handler nuevo queda
cubierto solo.

## Logs y diagnóstico

El flujo de movimientos usa tres títulos y la herramienta auxiliar usa uno adicional:

| Título | Nivel | Dónde | Contenido |
|---|---|---|---|
| `MOVIMIENTO REGISTRADO` | audit | `AS_MovimientoInventarioHandler` | id, tipo, origen, destino, artículos con cantidades |
| `MOVIMIENTO PROCESADO` | audit | handlers de Préstamo, Devolución y Merma | id, tipo, artículos procesados, transacción, usuario |
| `MOVIMIENTO ERROR` | error | los dos entry points | id, operación, motivo |
| `CONSULTA STOCK ERROR` | error | `AS_ConsultaStock_STLT_2.1.js` | ubicación y motivo |

Los deployments SDF están en `loglevel DEBUG`. Para Producción conviene evaluar `AUDIT` en los
scripts operativos; con AUDIT el log queda en una línea por operación, que es el diseño buscado.

### Troubleshooting

| Síntoma | Causa |
|---|---|
| Un movimiento de Merma no tiene botón para procesar | Debe estar en `Pendiente de Procesar` y el usuario debe tener un rol autorizado |
| Cuenta de Ajuste vacía | No existen filas activas en `AS Cuenta de Merma por Subsidiaria` para la subsidiaria seleccionada |
| Combo Ubicación Destino vacío en un préstamo | La subsidiaria no tiene ninguna Location con el checkbox |
| `AS_STOCK_INSUFICIENTE` con stock a la vista | El préstamo mira *disponible*; la devolución mira *en mano*. Además valida **por lote** |
| El traslado se guarda sin inventory detail | El artículo no maneja lotes, o todos sus lotes están en estado excluido |
| Un movimiento no se puede abrir | Cabecera sin líneas (guardado a medias). Ya cubierto: `buscarStockPorArticulo` devuelve vacío en vez de armar un `IN ()` inválido |
| Columna Lote vacía en una devolución | El lote se sella **al procesar** |
| Alerta que se repite sin fin en el cliente | Escribir desde `fieldChanged` el mismo campo que lo disparó. Por eso el cero se corta en `saveRecord` |
| El título del PDF no aparece | `font-weight` numérico en el FTL |
| Tres entradas en el menú en vez de una | SDF no borra links que dejaron de declararse |

## Dependencias

**Internas:** ninguna en tiempo de ejecución. El módulo no importa nada de `APIGlobales/`.

**De NetSuite:** `N/record`, `N/search`, `N/query`, `N/render`, `N/runtime`, `N/redirect`,
`N/ui/serverWidget`, `N/url`.

**Del entorno:** el tipo de transacción nativo `inventorytransfer` y la funcionalidad de lotes.

## Riesgos de modificación

**Renombrar un valor de `customlist_as_tipo_movimiento` o `customlist_as_estado_movimiento`**
rompe el módulo entero: todas las comparaciones son por nombre.

**Cambiar `ROLES_AUTORIZADOS`** sin verificar los ids en la cuenta destino falla abierto: si el
id no corresponde al rol esperado, el usuario escribe igual y no queda rastro.

**Tocar `custrecord_as_mov_det_linea_ref` o cuadrar por artículo** en vez de por línea rompe el
descuento cuando el mismo artículo aparece en dos líneas de un préstamo.

**Mover la carpeta del proyecto** rompe `CLIENT_SCRIPT` y las tres rutas de plantilla, que son
absolutas.

**Cambiar el checkbox de bodega a otra Location** no afecta préstamos ya procesados — la
devolución usa el destino guardado en el préstamo — pero sí cambia el destino de los préstamos
nuevos de esa subsidiaria.

## Decisiones de implementación

### Suitelet propio en vez del formulario nativo

El detalle es un child record y NetSuite no lo pinta junto a la cabecera en el formulario
estándar. El User Event redirige `CREATE` y `EDIT` al Suitelet, que arma cabecera y detalle en
una sola pantalla.

### Tres capas sin `services/`

Entry point → handler → repository, y la lógica de negocio en el handler de cada operación.
Fue una decisión explícita del proyecto, no una omisión.
(Fuente: documentación previa del proyecto)

### El control de rol por lista blanca en el código

`ROLES_AUTORIZADOS = [3, 1371]` por id interno, verificado con
`runtime.getCurrentUser().role`. El `runasrole = ADMINISTRATOR` de los deployments no interfiere:
solo cambia los permisos de ejecución, no el rol reportado. Se comprobó contra el precedente de
Solicitud de Consumo. (Fuente: documentación previa del proyecto)

### El pendiente se refleja, no se administra

No hay un proceso que abra o cierre el pendiente: sale de restar lo devuelto a lo prestado,
línea por línea, y su contraparte física es el saldo de la bodega de préstamos. Por eso
*Devuelto Total* se calcula con `every(pendiente === 0)` y no con la suma, que se compensaría
entre líneas.

### Los joins de listas van por nombre, no por id

`listarPrestamosPendientes` y `obtenerIdEstadoMovimiento` traducen nombre → id en tiempo de
ejecución. Así los ids internos de las customlists pueden diferir entre QA y Producción sin
romper nada. El precio es que renombrar un valor sí rompe.

### Motor de PDF propio

No usa `APIGlobales/ImpresionPDF` para no compartir archivos con 2WIN_SOLICITUD_CONSUMO. Mismo
contrato de payload que AS_NSP_008 (alias `jsonString`, `&` escapado), pero copiado.

> BFO no resuelve fuentes con `font-weight` numérico y **descarta el texto sin avisar**. Usar
> `bold` y `<span style="font-size: Npt;">` inline. `linklabel` de un link de menú admite
> **máximo 30 caracteres**.

### Estados de inventario excluidos

`Bloqueado`, `En Inspección`, `Damaged` no se asignan al traslado. Mismo criterio que
`2win_dao_assign_inv_details.js`.

### Maestro de cuentas de Merma

`customrecord_as_cuenta_merma_subsidiaria` evita exponer todas las cuentas contables en el
formulario. Cada fila relaciona `custrecord_as_cuenta_merma_subsidiaria` con
`custrecord_as_cuenta_merma_cuenta`. El estado activo/inactivo es el campo estándar
`isinactive`; `listarCuentasAjuste()` solo devuelve filas con `isinactive = F`.

No se hardcodea la cuenta `5113001` ni ninguna subsidiaria. Puerto Montt + `5113001 Costo
medicamentos e insumos` es un ejemplo de datos de configuración, no una regla del código.

## Pendientes o deuda técnica

- **Reverso de devolución procesada** — no existe.
- **FEFO** — el orden de lote cuando el usuario no elige uno es
  `ORDER BY ib.lastmodifieddate ASC`, que no es ni antigüedad ni vencimiento.
- **Guardado no transaccional** — cabecera huérfana si falla una línea.
- **QF CASCH (1566)** — fuera de `ROLES_AUTORIZADOS`. Falta validar en NetSuite si el módulo se
  usa en Chillán.
- **`selectrecordtype -2`** en Entidad Receptora — inferido, falta validar en NetSuite.
- **`loglevel DEBUG`** en los deployments — evaluar AUDIT para los scripts operativos en Producción.
- **Duplicidad en el maestro de cuentas de Merma** — el Custom Record no impone unicidad sobre
  subsidiaria + cuenta; filas repetidas se ocultan en el selector por el `SELECT DISTINCT`, pero
  conviene evitar duplicarlas para mantener el maestro limpio.
