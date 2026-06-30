# Documentación Técnica Detallada — Autopicking
## `customscript_2win_ss_autopicking` y su ecosistema completo

**Plataforma:** NetSuite SuiteScript 2.1  
**Fecha:** 2026-06-30  

---

## Tabla de Contenidos

1. [Qué es el Autopicking](#1-qué-es-el-autopicking)
2. [Arquitectura del Sistema de Autopicking](#2-arquitectura-del-sistema-de-autopicking)
3. [Generadores de Input — ¿Quién produce los datos de entrada?](#3-generadores-de-input--quién-produce-los-datos-de-entrada)
4. [Registro de Cola: `customrecord_2win_autopicking_queue`](#4-registro-de-cola-customrecord_2win_autopicking_queue)
5. [DAO de la Cola: `2win_dao_autopicking_queue.js`](#5-dao-de-la-cola-2win_dao_autopicking_queuejs)
6. [Trigger disparador: `2win_ue_andes_salud_orden_venta.js`](#6-trigger-disparador-2win_ue_andes_salud_orden_ventajs)
7. [Scheduled Script principal: `2win_ss_autopicking_processor.js`](#7-scheduled-script-principal-2win_ss_autopicking_processorjs)
8. [Dominio de Autopicking: `2win_dom_autopicking.js`](#8-dominio-de-autopicking-2win_dom_autopickingjs)
9. [DAO de Item Fulfillment: `2win_dao_itemfullfilment.js`](#9-dao-de-item-fulfillment-2win_dao_itemfullfilmentjs)
10. [Script alternativo: Map/Reduce `2win_mr_andes_salud_autopicking_processor.js`](#10-script-alternativo-mapreduce-2win_mr_andes_salud_autopicking_processorjs)
11. [Suitelet de gestión: `2win_sl_andes_salud_autopicking.js`](#11-suitelet-de-gestión-2win_sl_andes_salud_autopickingjs)
12. [Flujo completo de ejecución (end-to-end)](#12-flujo-completo-de-ejecución-end-to-end)
13. [Registros involucrados](#13-registros-involucrados)
14. [Reglas de negocio del autopicking](#14-reglas-de-negocio-del-autopicking)
15. [Manejo de errores y reintentos](#15-manejo-de-errores-y-reintentos)
16. [Escenarios posibles](#16-escenarios-posibles)
17. [Diagrama de estados de la cola](#17-diagrama-de-estados-de-la-cola)

---

## 1. Qué es el Autopicking

El **autopicking** es el proceso que crea y sincroniza automáticamente los **Item Fulfillments** (despachos) de una Orden de Venta en NetSuite. Cuando el HIS agrega, modifica o elimina líneas de una OV (ingreso ambulatorio, hospitalización), el sistema debe reflejar esos cambios en los despachos de inventario correspondientes.

**Problema que resuelve:** Los Item Fulfillments en NetSuite no se crean solos al guardar una OV con líneas de inventario. El sistema de autopicking detecta los cambios en las líneas y genera/actualiza los despachos correspondientes de forma asíncrona, diferenciando si cada bodega soporta autopicking automático o requiere picking manual.

**Concepto central:** Cada OV puede tener líneas en múltiples bodegas, y cada bodega puede ser de tipo autopicking (despacho automático) o manual (despacho requiere intervención). El sistema agrupa las líneas por `{bodega}_{tipo}` y crea un Item Fulfillment por grupo.

---

## 2. Arquitectura del Sistema de Autopicking

```
┌─────────────────────────────────────────────────────────────────┐
│                    GENERADORES DE INPUT                         │
│                                                                 │
│  HIS → Restlet agregar_lineas → dom_orden_venta                 │
│  Usuario NetSuite → edita OV directamente                       │
│  Restlet actualizacion_estado → dom_orden_venta                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ Guarda OV (salesorder)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         UE TRIGGER: 2win_ue_andes_salud_orden_venta.js          │
│                     afterSubmit                                  │
│  • validarCambiosLineas(oldRecord, newRecord)                    │
│  • daoAutopickingQueue.addToQueue(ovId, estadoActualizacion)    │
│  • Si SS no activo → task.create(customscript_2win_ss_autopicking│
└────────────────────────┬────────────────────────────────────────┘
                         │ encola OV
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│          COLA: customrecord_2win_autopicking_queue               │
│  Estado: PENDIENTE(1) / PROCESADO(2) / ERROR(3)                 │
│  Campos: salesOrderId, estadoActualizacion, reintentos          │
└────────────────────────┬────────────────────────────────────────┘
                         │ consume (batch 20)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│    SS: customscript_2win_ss_autopicking                         │
│    2win_ss_autopicking_processor.js                             │
│  • getPending(20)                                               │
│  • record.load(salesorder)                                      │
│  • AutoPickingManager.syncronize()                              │
│  • markAsProcessed() / handleError()                            │
│  • [Si quedan] auto-relanza                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ delega
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         DOMAIN: 2win_dom_autopicking.js                         │
│         Clase AutoPickingManager.syncronize()                   │
│  • Lee líneas OV (solo inventariables, sin provisionales)       │
│  • Lee IFs existentes via SuiteQL                               │
│  • Consulta flag autopicking por bodega                         │
│  • Agrupa por {ubicación}_{auto|manual}                         │
│  • Por grupo: updateLines / createPartialFulfillment            │
│  • Huérfanos: deleteById                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │ opera sobre
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         DAO: 2win_dao_itemfullfilment.js                        │
│  • prepararContextoAsignacion()  [1 SQL para toda la OV]        │
│  • createPartialFulfillment()    [crea IF nuevo]                │
│  • updateLines()                 [actualiza IF existente]       │
│  • deleteById()                  [elimina IF huérfano]          │
│  • removeLine()                  [elimina 1 línea del IF]       │
└────────────────────────┬────────────────────────────────────────┘
                         │ crea/actualiza/elimina
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│         RECORD: itemfulfillment (ItemShip)                      │
│  Vinculado a salesorder via NextTransactionLineLink             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Generadores de Input — ¿Quién produce los datos de entrada?

El input del sistema de autopicking es siempre **una Orden de Venta modificada**. Los generadores son:

### 3.1 HIS via Restlet de Agregar Líneas

**Archivo:** `interfaces/2win_rl_andes_salud_ov_agregar_lineas.js`

Cuando el HIS envía un cargo ambulatorio (`SEND^IN`):

```
HIS → POST /ov_agregar_lineas (JSON con detallePrestaciones)
  → Restlet → dom_orden_venta.recepcionDatos()
    → Crea archivo JSON en File Cabinet (uuid.json)
    → daoAgregarLineasQueue.addToQueue(archivoInfo)
    → [Si no hay MR activo] task.create(MR ov_agregar_lineas)

  Map/Reduce ov_agregar_lineas
    → dom_orden_venta.validarMapearDatosSendIn()
      → búsqueda masiva de productos por UPC (1 SQL)
      → mapea líneas a campos de OV
    → dom_orden_venta.agregarLineasRegistroNetsuite()
      → dao_orden_venta.agregarLineasRegistro()
        → [N/record] salesOrder.setSublistValue() por cada línea
        → salesOrder.save()
          → [Dispara UE afterSubmit → cola autopicking]
```

### 3.2 HIS via Restlet de Eliminar Líneas

**Archivo:** `interfaces/2win_rl_andes_salud_ov_eliminar_lineas.js`

Similar al anterior con `SEND^REV`: elimina líneas de la OV. Al guardar la OV sin esas líneas, el UE detecta cambios y encola para autopicking.

### 3.3 HIS via Restlet de Actualización de Estado

**Archivo:** `interfaces/2win_rl_andes_salud_actualizacion_estado.js` (PUT)

```
HIS → PUT /actualizacion_estado (JSON gestionCuenta)
  → Restlet → dom_orden_venta.actualizacionMasivaRegistros()
    → Crea archivo JSON en File Cabinet
    → task.create(MR customscript_2win_mr_andes_salud_ov_a_v)

  Map/Reduce ov_actualizar_valores
    → Actualiza campos de estado en OVs
    → [Al guardar cada OV → UE afterSubmit → cola autopicking]
```

### 3.4 Usuario Guarda OV Manualmente (UI NetSuite)

Un usuario del ERP que edita directamente una Orden de Venta (agrega/edita/elimina líneas de inventario) también dispara el flujo via `afterSubmit`.

### 3.5 Suitelet de Autopicking Manual

**Archivo:** `suitelets/2win_sl_andes_salud_autopicking.js`

Permite a un operador ejecutar el autopicking de una OV específica de forma manual (sin pasar por la cola), útil para correcciones o debugging.

### 3.6 Creación de Admisión (ADT^A01)

**Archivo:** `interfaces/2win_rl_andes_salud_crear_admision.js`

Cuando se crea una admisión hospitalaria (OV nueva), al guardarse por primera vez también dispara el `afterSubmit` del UE, que detecta el estado `CREATE` y encola para autopicking inicial.

---

## 4. Registro de Cola: `customrecord_2win_autopicking_queue`

Este Custom Record actúa como buffer asíncrono entre el trigger y el procesamiento efectivo.

### Campos

| Campo | ID | Tipo | Descripción |
|---|---|---|---|
| Orden de Venta | `custrecord_2win_apq_sales_order` | Record (salesorder) | ID de la OV a procesar |
| Estado | `custrecord_2win_apq_estado` | List/Record | 1=PENDIENTE, 2=PROCESADO, 3=ERROR |
| Reintentos | `custrecord_2win_apq_reintentos` | Integer | Contador de intentos fallidos (máx. 3) |
| Estado Actualización | `custrecord_2win_apq_estado_actualizacion` | Free Text | "CREATE" o "UPDATE" |
| Error | `custrecord_2win_apq_error` | Long Text | Mensaje del último error |
| Fecha Procesado | `custrecord_2win_apq_fecha_procesado` | Date/Time | Cuándo fue procesado exitosamente |

### Ciclo de vida de un registro en cola

```
[OV modificada]
      ↓
   addToQueue()  →  PENDIENTE (1)
      ↓
   getPending()  →  Scheduled Script toma el registro
      ↓
 [Procesamiento exitoso]         [Procesamiento fallido]
      ↓                                   ↓
 markAsProcessed()               handleError()
      ↓                            ↓              ↓
  PROCESADO (2)           reintentos < 3    reintentos >= 3
                                ↓                  ↓
                          PENDIENTE (1)       ERROR (3)
                          (para reintento)   (permanente)
```

### Garantías de idempotencia

Antes de insertar, `addToQueue()` verifica si la OV ya tiene un registro PENDIENTE (`getPendingBySalesOrder()`). Si ya existe, devuelve el registro existente sin crear duplicado. Esto evita que múltiples disparos del UE (por guardados rápidos sucesivos) generen entradas duplicadas.

---

## 5. DAO de la Cola: `2win_dao_autopicking_queue.js`

**Archivo:** `dao/2win_dao_autopicking_queue.js`  
**Record type:** `customrecord_2win_autopicking_queue` (constante `QUEUE_RECORD_TYPE`)

### Funciones

#### `addToQueue(salesOrderId, estadoActualizacion = "CREATE")`

```javascript
// 1. Verifica duplicado pendiente
const existingPending = getPendingBySalesOrder(salesOrderId);
if (existingPending) return { success: true, id: existingPending.id, isNew: false };

// 2. Crea registro nuevo
queueRecord.setValue("custrecord_2win_apq_sales_order", salesOrderId);
queueRecord.setValue("custrecord_2win_apq_estado", ESTADOS.PENDIENTE);  // 1
queueRecord.setValue("custrecord_2win_apq_reintentos", 0);
queueRecord.setValue("custrecord_2win_apq_estado_actualizacion", estadoActualizacion);
recordId = queueRecord.save();
return { success: true, id: recordId, isNew: true };
```

#### `getPending(limit = 50)`

Búsqueda N/search con filtros:
- `custrecord_2win_apq_estado = PENDIENTE (1)`
- `custrecord_2win_apq_reintentos <= 3`
- `isinactive = F`

Retorna array con `{ id, salesOrderId, estado, reintentos, estadoActualizacion, fechaCreacion }`.

#### `markAsProcessed(queueRecordId)`

`record.submitFields()` con `custrecord_2win_apq_estado = PROCESADO (2)` y `custrecord_2win_apq_fecha_procesado = new Date()`.

#### `handleError(queueRecordId, errorMessage)`

1. `search.lookupFields()` → obtiene reintentos actuales
2. `newRetries = currentRetries + 1`
3. Si `newRetries >= MAX_RETRIES (3)` → estado = ERROR (3); sino → estado = PENDIENTE (1)
4. `record.submitFields()` con nuevo estado, reintentos y mensaje de error

#### `verificarScheduledScriptActivo(deployId)`

```javascript
search.create({
    type: "scheduledscriptinstance",
    filters: [
        ["formulatext: {scriptdeployment.scriptid}", "is", deployId],
        "AND",
        ["status", "anyof", "PENDING", "PROCESSING"]
    ]
})
```

Retorna `true` si hay alguna instancia del SS en estado PENDING o PROCESSING.

#### `getQueueStats()`

Tres búsquedas separadas con `search.createColumn({ name: "internalid", summary: "COUNT" })`:
- Una por PENDIENTE, una por PROCESADO, una por ERROR.

Retorna `{ pendientes, procesados, errores, total }`.

#### `cleanOldProcessed(daysOld = 30)`

Elimina físicamente registros PROCESADO con `custrecord_2win_apq_fecha_procesado` anterior a N días. Limpieza de mantenimiento.

---

## 6. Trigger disparador: `2win_ue_andes_salud_orden_venta.js`

**Archivo:** `triggers/2win_ue_andes_salud_orden_venta.js`  
**Script Type:** UserEventScript  
**Registro:** `salesorder`

El corazón del disparo asíncrono está en `afterSubmit`:

```javascript
const afterSubmit = (context) => {
    const newRecord = context.newRecord;
    const oldRecord = context.oldRecord;

    if (newRecord.type === "salesorder") {
        if (context.type !== context.UserEventType.DELETE && newRecord.id) {

            // 1. Detectar si hay cambios relevantes en líneas
            const { hayCambios, estadoActualizacion } = 
                businessModule.validarCambiosLineas(oldRecord, newRecord);

            if (!hayCambios) return;  // Nada que hacer

            // 2. Agregar a la cola
            const result = daoAutopickingQueue.addToQueue(
                newRecord.id, 
                estadoActualizacion  // "CREATE" o "UPDATE"
            );

            if (result.success) {
                // 3. Verificar si ya hay SS activo
                const isRunning = daoAutopickingQueue
                    .verificarScheduledScriptActivo(DEPLOY_ID);

                if (!isRunning) {
                    // 4. Lanzar SS inmediatamente
                    const scheduledTask = task.create({
                        taskType: task.TaskType.SCHEDULED_SCRIPT,
                        scriptId: "customscript_2win_ss_autopicking",
                        deploymentId: "customdeploy_2win_ss_autopicking"
                    });
                    scheduledTask.submit();
                }
            }
        }
    }
};
```

### `businessModule.validarCambiosLineas(oldRecord, newRecord)`

**Archivo:** `triggers/ue/2win_ue_ov_business.js`

Esta función determina:

1. Si la OV es nueva (CREATE) → `hayCambios = true`, `estadoActualizacion = "CREATE"`
2. Si la OV ya existía (oldRecord no null):
   - Compara el conteo de líneas entre `oldRecord` y `newRecord`
   - Compara items y cantidades por línea usando `custcol_2win_as_identificador_fila`
   - Si detecta cualquier diferencia (líneas agregadas, eliminadas o modificadas): `hayCambios = true`, `estadoActualizacion = "UPDATE"`
   - Si no hay diferencias relevantes: `hayCambios = false` → no encola

### `beforeSubmit` — Caso DELETE

```javascript
if (context.type === context.UserEventType.DELETE) {
    const autoPickingManager = new AutoPickingManager();
    autoPickingManager.deleteFulfillment(newRecord);
}
```

Cuando una OV se elimina, `deleteFulfillment()` obtiene todos los IFs vinculados via SuiteQL y los elimina uno por uno (`daoItemFulfillment.deleteById()`).

---

## 7. Scheduled Script principal: `2win_ss_autopicking_processor.js`

**Archivo:** `scheduled/2win_ss_autopicking_processor.js`  
**Script Type:** ScheduledScript  
**Script ID:** `customscript_2win_ss_autopicking`  
**Deploy ID:** `customdeploy_2win_ss_autopicking`  
**Batch size:** 20

### Función `execute(context)`

```javascript
function execute(context) {

    // 1. Estadísticas iniciales (para logging)
    const initialStats = daoAutopickingQueue.getQueueStats();

    // 2. Obtener batch de pendientes
    const pendingRecords = daoAutopickingQueue.getPending(BATCH_SIZE);  // máx 20

    if (!pendingRecords || pendingRecords.length === 0) {
        nLog.audit("FIN", "No hay registros pendientes");
        return;
    }

    const autoPickingManager = new AutoPickingManager();
    let processedCount = 0;
    let errorCount = 0;

    // 3. Procesar cada OV en el batch
    pendingRecords.forEach(function (queueRecord) {
        const salesOrderId = queueRecord.salesOrderId;
        const estadoActualizacion = queueRecord.estadoActualizacion || "CREATE";

        try {
            // Cargar OV completa (isDynamic: false para eficiencia)
            const salesOrderRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            // Ejecutar sincronización
            autoPickingManager.syncronize(
                salesOrderRecord,
                "afterSubmit",
                estadoActualizacion
            );

            daoAutopickingQueue.markAsProcessed(queueRecord.id);
            processedCount++;

        } catch (processingError) {
            errorCount++;
            daoAutopickingQueue.handleError(
                queueRecord.id, 
                processingError.message
            );
        }
    });

    // 4. Verificar si quedan pendientes y relanzar
    const finalStats = daoAutopickingQueue.getQueueStats();

    if (finalStats.pendientes > 0) {
        const isRunning = daoAutopickingQueue
            .verificarScheduledScriptActivo(DEPLOY_ID);

        if (!isRunning) {
            const scheduledTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: SCRIPT_ID,
                deploymentId: DEPLOY_ID
            });
            scheduledTask.submit();
        }
    }
}
```

### Por qué Scheduled Script y no Map/Reduce

El SS permite:
- Control fino del batch (20 registros, no la totalidad)
- Auto-relanzamiento controlado (solo si no hay ya otro activo)
- Procesamiento secuencial garantizado (evita conflictos en lotes de un mismo IF)
- Menor complejidad que el ciclo MR para este volumen de datos

---

## 8. Dominio de Autopicking: `2win_dom_autopicking.js`

**Archivo:** `domain/2win_dom_autopicking.js`  
**Clase:** `AutoPickingManager`

Este es el núcleo de la lógica de negocio del autopicking.

### Método `syncronize(newRecord, triggerContext, estadoActualizacion, forceStatusDowngrade)`

#### Parámetros

| Parámetro | Tipo | Descripción |
|---|---|---|
| `newRecord` | Record | Registro cargado de la OV (salesorder) |
| `triggerContext` | string | `"beforeSubmit"` o `"afterSubmit"` (solo procesa `afterSubmit`) |
| `estadoActualizacion` | string | `"CREATE"` o `"UPDATE"` |
| `forceStatusDowngrade` | boolean | Fuerza cambio de estado Shipped → Packed en actualizaciones in-place |

#### Paso 1: Leer líneas de la OV

```javascript
// Método privado #getSaleOrderLines(salesOrderRecord)
const inventoryItemTypes = ["InvtPart", "Assembly", "Kit"];

for (let i = 0; i < lineCount; i++) {
    const itemType = record.getSublistValue("itemtype", i);
    const isProvisional = record.getSublistValue("custcol_2win_flag_item_provisional", i);

    if (isProvisional) continue;          // Excluir provisionales
    if (!inventoryItemTypes.includes(itemType)) continue;  // Solo inventariables

    lineasOrdenVenta.push({
        line, lineuniquekey, item, quantity,
        inventorylocation, inventoryDetail,
        custcol_2win_as_identificador_fila,
        itemType
    });
}
```

#### Paso 2: Leer IFs existentes via SuiteQL

```javascript
// Método privado #getItemFulfillmentLines(idSalesOrder)
query.runSuiteQL({
    query: `
        SELECT
            tran.id AS transactionId,
            tran.tranid,
            tran.custbody_2win_auto_seleccion AS isautopicking,
            tl.item,
            tl.quantity * -1 AS quantity,
            tl.inventorylocation,
            ntll.previousline,
            ntll.previousdoc AS salesOrderId
        FROM transaction AS tran
        INNER JOIN transactionline AS tl ON tl.transaction = tran.id
        INNER JOIN NextTransactionLineLink AS ntll ON ntll.nextdoc = tran.id
            AND ntll.nextLine = tl.id
        WHERE tran.type = 'ItemShip'
            AND ntll.previousdoc = ?`,
    params: [idSalesOrder]
})
```

La tabla `NextTransactionLineLink` es clave: vincula el IF (nextdoc/ItemShip) con la línea original de la OV (previousdoc/previousline).

#### Paso 3: Consultar flag autopicking por bodega

```javascript
// Método privado #getLocationDetails(uniqueLocations)
search.create({
    type: "location",
    filters: [["internalid", "anyof", uniqueLocations]],
    columns: ["internalid", "custrecord_2win_is_autopicking"]
})
```

Retorna mapa `{ locationId → { id, isAutopicking: true/false } }`.

#### Paso 4: Preparar contexto de asignación

```javascript
const ctxItemIds = [...new Set(lineasConInfoLocacion.map(l => Number(l.item)))];
const ctxLocationIds = [...new Set(lineasConInfoLocacion.map(l => Number(l.inventorylocation)))];
const ctxAsignacion = this.itemFulfillmentDao.prepararContextoAsignacion(
    ctxItemIds, 
    ctxLocationIds
);
```

Este contexto contiene el stock disponible por ítem/lote/ubicación consultado en **1 sola SQL**. Se comparte entre todos los IFs que se crean/actualizan en esta sincronización para evitar sobreconsumo de lotes.

#### Paso 5: Agrupar líneas por clave `{ubicación}_{tipo}`

```javascript
const linesGroupedByKey = lineasConInfoLocacion.reduce((acc, line) => {
    const isAuto = line.locationInfo?.isAutopicking ? "auto" : "manual";
    const key = `${line.inventorylocation}_${isAuto}`;

    if (!acc[key]) {
        acc[key] = { isAutoPicking: isAuto === "auto", locationId: loc, lines: [] };
    }
    acc[key].lines.push(line);
    return acc;
}, {});
```

Ejemplo de grupos resultantes:
- `"101_auto"` → Bodega 101, autopicking automático
- `"102_manual"` → Bodega 102, picking manual
- `"101_manual"` → Bodega 101, picking manual (si la bodega tiene mixed)

#### Paso 6: Ejecutar operaciones por grupo

```javascript
for (const key in linesGroupedByKey) {
    const group = linesGroupedByKey[key];
    const existingFulfillmentIds = existingFulfillmentsMap[key];

    if (existingFulfillmentIds && existingFulfillmentIds.size > 0) {
        // CASO A: Ya existen IFs para este grupo → actualizar
        for (const ifId of [...existingFulfillmentIds]) {
            const res = this.itemFulfillmentDao.updateLines(
                ifId, group.lines, newRecord.id, 
                group.isAutoPicking, forceStatusDowngrade, ctxAsignacion
            );
            // Si updateLines retorna null → IF eliminado (sin líneas válidas)
        }

        // Si además hay líneas nuevas en el grupo → crear IF parcial adicional
        if (tieneLineasNuevasElGrupo) {
            const lineasNuevas = group.lines.filter(l => l.fulfillments.length === 0);
            this.itemFulfillmentDao.createPartialFulfillment(
                newRecord.id, lineasNuevas, group.isAutoPicking, ctxAsignacion
            );
        }

    } else {
        // CASO B: No hay IFs para este grupo → crear nuevo
        this.itemFulfillmentDao.createPartialFulfillment(
            newRecord.id, group.lines, group.isAutoPicking, ctxAsignacion
        );
    }

    delete existingFulfillmentsMap[key];  // Marcar como procesado
}

// CASO C: Grupos restantes en existingFulfillmentsMap = IFs huérfanos → eliminar
for (const key in existingFulfillmentsMap) {
    existingFulfillmentsMap[key].forEach(fulfillmentId => {
        this.itemFulfillmentDao.deleteById(fulfillmentId);
    });
}
```

#### Resultado registrado en log

```
AutoPickingManager - syncronize: Sincronización completada.
OV {id} | Líneas OV: {N} | Grupos: {G} 
| IFs actualizados: {A} [{ids}]
| IFs creados: {C} [{ids}]  
| IFs eliminados: {E} [{ids}]
```

### Método `deleteFulfillment(salesOrderRecord)`

Obtiene todos los IFs vinculados via `#getItemFulfillmentLines()`, extrae IDs únicos, y llama `daoItemFulfillment.deleteById()` por cada uno.

### Método `deleteLineOnFulfillments(orderId, orderLine)`

Busca el IF que contiene la línea específica (`previousline = orderLine`) y llama `daoItemFulfillment.removeLine(ifId, orderLine)`.

---

## 9. DAO de Item Fulfillment: `2win_dao_itemfullfilment.js`

**Archivo:** `dao/2win_dao_itemfullfilment.js`

Este DAO opera directamente sobre los registros `itemfulfillment` de NetSuite.

### `prepararContextoAsignacion(itemIds, locationIds)`

Ejecuta **1 consulta SQL** para obtener stock disponible (inventario + números de serie/lote) para todos los ítems y ubicaciones de la OV. El resultado se guarda en un objeto de contexto:

```javascript
{
    stockPorItemUbicacion: {
        "{itemId}_{locationId}": { disponible, lotes: [...] }
    },
    consumido: {}  // tracker de lo ya asignado en este ciclo
}
```

### `createPartialFulfillment(salesOrderId, lines, isAutoPicking, ctxAsignacion)`

1. Carga la OV en modo dinámico (`isDynamic: true`)
2. Crea un Item Fulfillment nuevo desde la OV (`record.transform`)
3. Itera las líneas del IF:
   - Si la línea no está en el grupo actual → la desmarca (`closed = true`)
   - Si está en el grupo → asigna cantidad y lotes desde `ctxAsignacion`
4. Establece `custbody_2win_auto_seleccion = isAutoPicking`
5. Guarda el IF
6. Actualiza el tracker de consumo en `ctxAsignacion` para que otros IFs no sobreconsuман

### `updateLines(ifId, lines, salesOrderId, isAutoPicking, forceStatusDowngrade, ctxAsignacion)`

1. Carga el IF existente (`record.load`)
2. Para cada línea del IF:
   - Si la línea existe en el grupo → actualiza cantidad y lotes
   - Si la línea ya no existe en la OV → la desmarca del IF
3. Si quedan 0 líneas válidas → `deleteById(ifId)` y retorna `null`
4. Si quedaron líneas → guarda y retorna `{ updated: ifId }`
5. `forceStatusDowngrade`: si el IF está en estado "Shipped" y se debe actualizar, lo regresa a "Packed" primero

### `deleteById(fulfillmentId)`

`record.delete({ type: "itemfulfillment", id: fulfillmentId })`

### `removeLine(ifId, orderLine)`

Carga el IF, busca la línea que corresponde a `orderLine`, la desmarca (`closed = true`), guarda. Si quedan 0 líneas activas, elimina el IF.

---

## 10. Script alternativo: Map/Reduce `2win_mr_andes_salud_autopicking_processor.js`

**Archivo:** `map_reduce/2win_mr_andes_salud_autopicking_processor.js`

Existe también una versión Map/Reduce del autopicking (alternativa al SS). Su lógica es similar pero distribuida en fases MR:

- **`getInputData`:** Consulta la cola de autopicking para obtener OVs pendientes.
- **`map`:** Emite una entrada por `salesOrderId` (clave).
- **`reduce`:** Clave = `salesOrderId` → procesa 1 vez por OV (aunque haya múltiples entradas en cola para la misma OV). Carga la OV, llama `AutoPickingManager.syncronize()`.
- **`summarize`:** Registra resultados globales.

La versión SS (`customscript_2win_ss_autopicking`) es la **principal y en producción**. El MR existe como alternativa para procesar grandes volúmenes de forma paralela.

---

## 11. Suitelet de gestión: `2win_sl_andes_salud_autopicking.js`

**Archivo:** `suitelets/2win_sl_andes_salud_autopicking.js`

Permite ejecutar y gestionar el autopicking desde la UI de NetSuite.

### GET sin parámetros — Formulario de búsqueda

Renderiza un `serverWidget.Form` con campo de búsqueda de OV. El usuario ingresa el ID de la OV y envía el formulario.

### GET con parámetros (ID de OV)

```javascript
// 1. Cargar OV
const salesOrderRecord = record.load({ type: "salesorder", id: ovId });

// 2. Ejecutar sincronización directa (sin pasar por la cola)
const manager = new AutoPickingManager();
manager.syncronize(salesOrderRecord, "afterSubmit", "UPDATE");

// 3. Retornar resultado JSON
return JSON.stringify({ success: true, message: "Autopicking ejecutado", ovId });
```

### POST — API directa

Acepta JSON con `{ salesOrderId }`, ejecuta autopicking y retorna resultado.

**Casos de uso:**
- Ejecutar autopicking manual sobre una OV con error en la cola
- Debugging de problemas de sincronización de IFs
- Reprocesar una OV sin esperar al SS

---

## 12. Flujo completo de ejecución (end-to-end)

```
CASO 1: HIS agrega líneas a una OV ambulatoria

HIS → POST /rl_ov_agregar_lineas
        │
        ▼
dom_orden_venta.recepcionDatos()
  → crea archivo JSON en File Cabinet (uuid.json)
  → daoAgregarLineasQueue.addToQueue()
  → [Si no hay MR activo] task.create(MR_ov_agregar_lineas)
        │
        ▼
Map/Reduce: 2win_mr_andes_salud_ov_agregar_lineas
  → getInputData: cola de agregar líneas
  → map: carga archivo JSON, valida, mapea líneas
  → reduce: dom_orden_venta.agregarLineasRegistroNetsuite()
              → dao_orden_venta.agregarLineasRegistro()
                  → N/record: salesOrder.setSublistValue() × N líneas
                  → salesOrder.save()   ←──────────────────────────────────┐
        │                                                                    │
        ▼                                                         UE afterSubmit dispara
UE afterSubmit: 2win_ue_andes_salud_orden_venta                              │
  businessModule.validarCambiosLineas()                                      │
  → hayCambios = true, estadoActualizacion = "UPDATE"                        │
  daoAutopickingQueue.addToQueue(ovId, "UPDATE")                             │
  → Crea customrecord_2win_autopicking_queue (PENDIENTE)                     │
  daoAutopickingQueue.verificarScheduledScriptActivo(DEPLOY_ID)              │
  → isRunning = false                                                        │
  task.create(customscript_2win_ss_autopicking).submit()  ──────────────────┘
        │
        ▼ (ejecución asíncrona, segundos después)
Scheduled Script: 2win_ss_autopicking_processor.js
  daoAutopickingQueue.getPending(20)
  → [{ id: X, salesOrderId: Y, estadoActualizacion: "UPDATE" }]

  record.load({ type: "salesorder", id: Y, isDynamic: false })

  AutoPickingManager.syncronize(record, "afterSubmit", "UPDATE")
    #getSaleOrderLines():
      → Lee sublista "item": solo InvtPart/Assembly/Kit, sin provisionales
      → Extrae: line, item, quantity, inventorylocation, inventoryDetail,
                custcol_2win_as_identificador_fila

    #getItemFulfillmentLines(Y):
      → SuiteQL via NextTransactionLineLink
      → Obtiene IFs existentes: [{ id: IF1, item, quantity, line, ... }]

    #getLocationDetails([101, 102]):
      → N/search location: flag custrecord_2win_is_autopicking
      → { 101: { isAutopicking: true }, 102: { isAutopicking: false } }

    itemFulfillmentDao.prepararContextoAsignacion([itemA, itemB], [101, 102])
      → 1 SQL: stock disponible por ítem/lote/ubicación

    Agrupación:
      Línea 1 (item A, bodega 101, auto) → grupo "101_auto"
      Línea 2 (item B, bodega 101, auto) → grupo "101_auto"
      Línea 3 (item C, bodega 102, manual) → grupo "102_manual"

    existingFulfillmentsMap:
      "101_auto" → {IF1}   (IF1 ya existía para el grupo auto de bodega 101)
      (no hay IF para "102_manual")

    Iteración grupo "101_auto":
      → existingFulfillmentIds = {IF1}
      → itemFulfillmentDao.updateLines(IF1, [línea1, línea2], Y, true, false, ctx)
        → Carga IF1, actualiza cantidades y lotes, guarda
        → resultado.ifsActualizados.push(IF1)
      → No hay líneas nuevas en el grupo

    Iteración grupo "102_manual":
      → existingFulfillmentIds = undefined (no hay IF)
      → itemFulfillmentDao.createPartialFulfillment(Y, [línea3], false, ctx)
        → Crea nuevo IF2 para bodega 102, tipo manual
        → resultado.ifsCreados.push(IF2)

    Huérfanos: existingFulfillmentsMap está vacío → ninguno

    Log: "OV Y | Líneas OV: 3 | Grupos: 2 | IFs actualizados: 1 [IF1] | IFs creados: 1 [IF2] | IFs eliminados: 0"

  daoAutopickingQueue.markAsProcessed(X)
  → customrecord_2win_autopicking_queue: estado = PROCESADO (2)

  finalStats.pendientes = 0 → NO relanza SS
        │
        ▼
RESULTADO: OV Y tiene IF1 (bodega 101, auto) actualizado + IF2 (bodega 102, manual) nuevo
```

---

## 13. Registros involucrados

### Registros de NetSuite estándar

| Record Type | Nombre interno | Uso en autopicking |
|---|---|---|
| `salesorder` | Orden de Venta | Record origen; sus líneas determinan qué fulfillments crear |
| `itemfulfillment` | Item Fulfillment (ItemShip) | Record destino; creado/actualizado/eliminado por el proceso |
| `location` | Ubicación / Bodega | Consultada por flag `custrecord_2win_is_autopicking` |

### Registros custom

| Record Type | Uso |
|---|---|
| `customrecord_2win_autopicking_queue` | Cola de procesamiento asíncrono |

### Transacciones/Links de NetSuite (SuiteQL)

| Tabla | Uso |
|---|---|
| `transaction` | OVs (type='SalesOrd') e IFs (type='ItemShip') |
| `transactionline` | Líneas de OV e IF |
| `NextTransactionLineLink` | Vincula IF.línea → OV.línea (nextdoc, nextLine, previousdoc, previousLine) |
| `scheduledscriptinstance` | Verificar si el SS está activo (status PENDING/PROCESSING) |

### Campos custom relevantes

| Campo | Record | Significado |
|---|---|---|
| `custrecord_2win_is_autopicking` | `location` | Si la bodega tiene autopicking automático |
| `custbody_2win_auto_seleccion` | `itemfulfillment` | Si el IF fue generado por autopicking (vs. manual) |
| `custcol_2win_as_identificador_fila` | `transactionline` | Correlativo único de línea (CrgCorrel del HIS) |
| `custcol_2win_flag_item_provisional` | `transactionline` | Marca la línea como provisional (excluida del autopicking) |

---

## 14. Reglas de negocio del autopicking

### R1. Solo ítems inventariables

Solo se procesan líneas cuyo `itemtype` sea `InvtPart` (Ítem de Inventario), `Assembly` (Ensamble) o `Kit`. Los ítems de servicio (`Service`), descuentos, subtotales y otros tipos no generan fulfillments.

### R2. Exclusión de ítems provisionales

Las líneas con `custcol_2win_flag_item_provisional = true` se omiten completamente. Esto permite agregar líneas temporales a la OV sin que disparen fulfillments.

### R3. Un fulfillment por bodega+tipo

Por cada combinación única de `{ubicación}_{autopicking|manual}` se mantiene un solo Item Fulfillment. Si una OV tiene ítems en 3 bodegas (2 auto + 1 manual), habrá 3 IFs.

### R4. Idempotencia de la cola

Si la misma OV se guarda múltiples veces en rápida sucesión (ej: el MR de agregar líneas lanza varios guardados), solo el primer encolamiento genera una entrada PENDIENTE. Los siguientes detectan el registro existente y no duplican.

### R5. Sin sobreconsumo de lotes

El contexto de asignación (`ctxAsignacion`) se prepara **1 sola vez** al inicio de `syncronize()` y es compartido por todos los IFs que se crean/actualizan en ese ciclo. Esto garantiza que si 2 IFs necesitan el mismo lote de un ítem, el sistema distribuye correctamente sin asignar el mismo stock dos veces.

### R6. Cascade delete

Al eliminar una OV (`beforeSubmit DELETE`), se eliminan todos sus IFs automáticamente via `AutoPickingManager.deleteFulfillment()`.

### R7. Reintentos limitados

Máximo 3 reintentos por registro en cola. Al 4to fallo, el estado cambia a ERROR permanente y requiere intervención manual (o ejecución desde el Suitelet).

### R8. Auto-relanzamiento sin solapamiento

El SS verifica al inicio de cada ejecución si quedan pendientes y al final se auto-relanza solo si:
1. Hay pendientes en la cola
2. No hay otra instancia del SS ya activa (PENDING o PROCESSING)

Esto garantiza que nunca haya dos instancias procesando simultáneamente.

---

## 15. Manejo de errores y reintentos

### Error en procesamiento de una OV

```
SS procesa OV Y → AutoPickingManager lanza excepción
  → daoAutopickingQueue.handleError(queueId, errorMessage)
    → search.lookupFields(): reintentos actuales = 1
    → newRetries = 2
    → 2 < MAX_RETRIES (3) → newState = PENDIENTE (1)
    → record.submitFields({ estado: 1, reintentos: 2, error: mensaje })

Próxima ejecución del SS:
  → getPending() incluye este registro (reintentos 2 <= 3)
  → Intenta de nuevo...

3er fallo:
  → newRetries = 3
  → 3 >= MAX_RETRIES → newState = ERROR (3)
  → record.submitFields({ estado: 3, reintentos: 3, error: mensaje })

Registro NO aparece más en getPending():
  filtro: custrecord_2win_apq_reintentos <= 3
  reintentos = 3 → excluido
```

### Error en createPartialFulfillment

Si la creación del IF falla (ej: stock insuficiente, error de NetSuite), el error se captura dentro del bloque `try/catch` del grupo en `syncronize()`:

```javascript
try {
    const creados = this.itemFulfillmentDao.createPartialFulfillment(...);
    if (creados) resultado.ifsCreados.push(...creados);
} catch (e) {
    nLog.error("Sincronización", `Error creando IF en grupo ${key}: ${e.message}`);
    // El error NO relanza → la sincronización continúa con otros grupos
}
```

El error se registra en el log pero el procesamiento continúa con los demás grupos. El registro de cola sí se marca como error (desde `execute()` en el SS que captura la excepción de `syncronize()`).

### Error en updateLines → IF sin líneas válidas

Si `updateLines()` determina que todas las líneas del IF quedaron inválidas:
1. Llama `deleteById()` internamente
2. Retorna `null` (no `{ updated: id }`)
3. `syncronize()` lo registra en `resultado.ifsEliminados`

---

## 16. Escenarios posibles

### Escenario 1: OV nueva con 2 bodegas auto

```
OV creada con:
  - Ítem A, Bodega 101 (auto), cantidad 5
  - Ítem B, Bodega 101 (auto), cantidad 3
  - Ítem C, Bodega 102 (auto), cantidad 2

Resultado autopicking:
  Grupo "101_auto" → crea IF1 { ítem A: 5, ítem B: 3 }
  Grupo "102_auto" → crea IF2 { ítem C: 2 }
```

### Escenario 2: OV con bodega mixta (auto + manual)

```
OV con:
  - Ítem A, Bodega 101 (auto=true), cantidad 5
  - Ítem B, Bodega 102 (auto=false), cantidad 3

Resultado:
  Grupo "101_auto"   → crea IF1 { ítem A: 5 }
  Grupo "102_manual" → crea IF2 { ítem B: 3 }  (picking manual)
```

### Escenario 3: Agregar línea nueva a OV existente

```
OV existente con IF1 { ítem A: 5, bodega 101 auto }

HIS agrega: Ítem B, Bodega 101, cantidad 3

Estado después:
  IFs existentes: IF1 { ítem A: 5 }
  Líneas OV: [ítem A (fulfillments: [IF1]), ítem B (fulfillments: [])]
  
  Grupo "101_auto":
    existingFulfillmentIds = {IF1}
    → updateLines(IF1, [ítem A, ítem B], ...) → IF1 actualizado con ambas líneas
    → tieneLineasNuevas = true (ítem B sin fulfillment)
    → createPartialFulfillment con [ítem B] → NO, ya se actualizó IF1 con ítem B

  (La lógica de líneas nuevas crea un IF parcial adicional SOLO si
   el grupo ya tenía IFs existentes Y hay líneas sin fulfillment previo)
```

### Escenario 4: Eliminar línea de OV con IF

```
OV con IF1 { ítem A: 5, ítem B: 3, bodega 101 auto }

HIS elimina: Ítem B

Estado después:
  Líneas OV: [ítem A]
  IFs: [IF1 con ítem A e ítem B]
  
  Grupo "101_auto":
    updateLines(IF1, [ítem A], ...)
    → IF cargado: itera líneas, desmarca ítem B (closed=true), mantiene ítem A
    → Guarda → IF1 queda con solo ítem A
```

### Escenario 5: Eliminar OV completa

```
Usuario elimina OV Y → UE beforeSubmit DELETE
  → AutoPickingManager.deleteFulfillment(newRecord)
    → #getItemFulfillmentLines(Y) → [IF1, IF2]
    → daoItemFulfillment.deleteById(IF1)
    → daoItemFulfillment.deleteById(IF2)
```

### Escenario 6: Error en 3 intentos → estado ERROR

```
Intento 1: AutoPickingManager.syncronize() → excepción "Stock insuficiente"
  → handleError(): reintentos=1, estado=PENDIENTE

Intento 2: misma excepción
  → handleError(): reintentos=2, estado=PENDIENTE

Intento 3: misma excepción
  → handleError(): reintentos=3, estado=ERROR (permanente)

Ahora: getPending() excluye este registro (reintentos > 3 NO, pero el filtro es <=3, y 3<=3 pasa... 
esperar: el código dice: "custrecord_2win_apq_reintentos", "lessthanorequalto", MAX_RETRIES(3))
→ Con reintentos=3, el registro SÍ aparece una vez más en getPending()
→ 4to intento: handleError(): reintentos=4, estado=ERROR
→ Con reintentos=4 > 3: excluido de getPending()

Acción manual: Suitelet autopicking o cleanOldProcessed() para limpiar
```

### Escenario 7: SS ya activo cuando se guarda la OV

```
OV guardada → UE afterSubmit:
  addToQueue() → agrega OV a cola
  verificarScheduledScriptActivo() → isRunning = true
  → NO se lanza nuevo SS
  
  El SS ya activo, al terminar su batch actual:
  finalStats.pendientes > 0 → verifica si está activo:
  → isRunning = false (ya terminó)
  → Relanza SS → procesa la OV encolada
```

---

## 17. Diagrama de estados de la cola

```
                          ┌─────────────────────────────┐
                          │     OV modificada/creada    │
                          └──────────────┬──────────────┘
                                         │
                                  addToQueue()
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │   PENDIENTE  (1)    │◄─────────────────────┐
                              └──────────┬──────────┘                       │
                                         │                                   │
                              getPending() + SS.execute()                    │
                                         │                                   │
                    ┌────────────────────▼──────────────────────┐           │
                    │ AutoPickingManager.syncronize()            │           │
                    └────────────────────┬──────────────────────┘           │
                                         │                                   │
              ┌──────────────────────────▼──────────────────────────┐       │
              │                    ¿Éxito?                          │       │
              └────────────┬───────────────────────────┬────────────┘       │
                           │ SÍ                        │ NO                 │
                           ▼                           ▼                    │
               ┌───────────────────┐      ┌───────────────────────┐        │
               │ PROCESADO  (2)    │      │   reintentos < 3?     │        │
               │ markAsProcessed() │      └───────────┬───────────┘        │
               └───────────────────┘                  │           │         │
                                                 SÍ   │     NO   │         │
                                                      ▼           ▼         │
                                           PENDIENTE(1)   ERROR(3)│         │
                                           reintentos++    (permanente)     │
                                                 │                          │
                                                 └──────────────────────────┘
                                                 (reintento en próxima
                                                  ejecución del SS)
```

---

*Documento generado desde el código fuente de 2WIN_INTEG. Cubre el ecosistema completo del autopicking desde la generación del input hasta la creación final de Item Fulfillments.*
