# Documento de Viabilidad

**Card / Proyecto:** AS-NSP-004 — Asignación Automática de Lotes en Orden de Traslado  
**País:** No especificado (sin implicaciones fiscales directas)  
**Fecha de evaluación:** 2026-06-17  
**Evaluado por:** Claude — Analista de Viabilidad NetSuite  

---

## Resumen ejecutivo

El requerimiento consiste en agregar un botón "Asignar Lotes" en el modo vista de la Orden de Traslado que, al ejecutarse, asigne automáticamente el detalle de inventario (lotes y cantidades) a las líneas que aún no hayan sido despachadas y no tengan asignación completa. La solución es técnicamente viable mediante desarrollo SuiteScript 2.x, sin riesgos fiscales ni contables significativos. Todos los puntos de alcance han sido definidos. **El documento está listo para avanzar al funcional.**

---

## Contexto del requerimiento

El cliente necesita agilizar el proceso de asignación de lotes en las Órdenes de Traslado. Actualmente, los usuarios deben asignar manualmente el detalle de inventario (número de lote + cantidad) en cada línea. El requerimiento pide automatizar este proceso mediante un botón en la vista del registro que detecte las líneas sin detalle de inventario y las complete, considerando que algunos artículos pueden no usar lotes (en cuyo caso solo se asigna cantidad).

---

## Análisis técnico

**Enfoque recomendado:** Desarrollo SuiteScript 2.x — Mixto (URET + STLT + LBRY)

### Objetos involucrados

| Objeto NetSuite | Relevancia |
|-----------------|-----------|
| `transferorder` | Record principal donde se agrega el botón y se aplica el detalle de inventario |
| `inventorydetail` (subrecord) | Subrecord de cada línea que contiene la asignación de lote + cantidad |
| `inventoryitem` / `lotnumberedinventoryitem` | Items con y sin lote que pueden coexistir en la misma OT |
| `location` | Ubicación origen de la OT, necesaria para buscar stock disponible |

### Arquitectura propuesta

#### Script 1 — UserEventScript (URET) en `transferorder`

- **Trigger:** `beforeLoad`  
- **Propósito:** Agregar el botón "Asignar Lotes" únicamente cuando el modo es `VIEW`  
- **Lógica:** `context.type === context.UserEventType.VIEW` → `form.addButton({...})`  
- **El botón llama:** URL del Suitelet con el ID interno de la OT como parámetro

```javascript
// Ejemplo conceptual
if (context.type === context.UserEventType.VIEW) {
    var form = context.form;
    form.addButton({
        id: 'custpage_btn_asignar_lotes',
        label: 'Asignar Lotes',
        functionName: 'asignarLotes(' + context.newRecord.id + ')'
    });
}
```

#### Script 2 — Suitelet (STLT) — Procesador de asignación

- **Propósito:** Recibe el ID de la OT, itera las líneas sin detalle de inventario y asigna lotes
- **Flujo:**
  1. Cargar la OT con `record.load({ type: 'transferorder', id: toId, isDynamic: true })`
  2. Iterar líneas del sublist `item`
  3. Por cada línea: verificar si `inventorydetail` ya tiene registros
  4. Si la línea no tiene detalle:
     - Si el ítem es `lotnumberedinventoryitem`: buscar lotes disponibles en la ubicación origen (ver lógica de selección en LBRY)
     - Si el ítem es `inventoryitem` sin lote: asignar solo la cantidad
  5. Guardar la OT y redirigir al usuario de vuelta al registro

#### Script 3 — Library (LBRY) — Consulta de inventario disponible

- **Propósito:** Centralizar la lógica de consulta de lotes disponibles
- **Consulta clave:** `search.create` sobre `inventorydetail` o sobre el registro de inventario para obtener lotes con stock > 0 en la ubicación origen
- **Retorna:** Lista ordenada de lotes con cantidad disponible (criterio de orden: ver punto de alcance #1)

### Limitaciones técnicas identificadas

- El subrecord `inventorydetail` en modo dinámico requiere manejo cuidadoso: se debe usar `record.getSublistSubrecord()` para acceder y modificar el detalle línea por línea.
- Si la OT tiene muchas líneas (>50) con múltiples lotes cada una, el governance del Suitelet (1,000 units) puede ser un riesgo. Mitigación: evaluar el volumen real de líneas y, si supera este umbral, migrar el procesamiento a un **MapReduceScript**.
- NetSuite no permite modificar el `inventorydetail` de una OT que ya tenga un Item Fulfillment o Item Receipt parcial generado. Se debe validar el estado antes de proceder.

---

## Análisis de riesgos

| Tipo de riesgo | Score | Nivel | Descripción |
|---|---|---|---|
| Desarrollo | 3 | Medio | El subrecord `inventorydetail` es complejo de manipular vía SuiteScript en modo dinámico. Requiere testing exhaustivo con items con y sin lote. |
| Legal/Fiscal | 1 | Muy bajo | No se generan asientos contables ni documentos fiscales. Es una operación de inventario operativa. |
| Contable | 2 | Bajo | Afecta el movimiento de inventario pero es el comportamiento esperado de la OT. No genera asientos adicionales. |
| Deadline | 2 | Bajo | Sin fecha regulatoria. Complejidad media-baja, estimación manejable. |
| Alcance | 3 | Medio | Cinco puntos de alcance requieren definición antes de iniciar el funcional (ver sección siguiente). |

**Score promedio: 2.2** — Dentro del umbral de aprobación.

---

## Definición de alcance — Respuestas del cliente

### 1. Criterio de selección de lotes ✅ DEFINIDO

**FEFO** (First Expired, First Out). Los lotes se ordenan por fecha de expiración ascendente. Los lotes sin fecha de expiración se ubican **al final** de la cola (se consumen después de los que sí tienen fecha). Si dos lotes tienen la misma fecha de expiración, se aplica **FIFO** como criterio de desempate (fecha de ingreso más antigua primero).

### 2. Manejo de stock insuficiente ✅ DEFINIDO

Se asignan líneas completas en orden de aparición hasta agotar el stock. La última línea que no pueda cubrirse totalmente recibe una **asignación parcial** (lo que quede disponible). Las líneas subsiguientes quedan sin asignación.

**Regla crítica — artículo duplicado en múltiples líneas:** El stock disponible por ítem se calcula **una sola vez al inicio** del proceso y se descuenta globalmente conforme se asignan líneas. Esto evita doble conteo cuando el mismo ítem aparece en varias líneas de la misma OT.

Ejemplo:
- Ítem A, Lote 001: 10 unidades disponibles
- Línea 1: Ítem A, qty 7 → asignar Lote 001 × 7 → stock restante: 3
- Línea 3: Ítem A, qty 7 → asignar Lote 001 × 3 → asignación parcial, stock restante: 0

### 3. Uso de bins ✅ DEFINIDO

No utilizan Bin Management. El `inventorydetail` solo requiere **número de lote + cantidad**. No se asigna bin.

### 4. Estados donde aplica el botón ✅ DEFINIDO

| Estado OT | Mostrar botón |
|-----------|:---:|
| Pending Fulfillment | ✅ |
| Partially Fulfilled | ✅ |
| Fulfilled | ❌ |
| Closed / Cancelled | ❌ |

### 5. Líneas con detalle parcial ✅ DEFINIDO

El botón **completa el faltante**. Antes de asignar un lote nuevo, verifica si los lotes ya asignados en esa línea tienen stock residual disponible y los prioriza. Solo si el stock residual de lotes ya asignados no alcanza, se incorporan lotes nuevos.

### 6. Lotes sin fecha de expiración en FEFO ✅ DEFINIDO

Los lotes sin fecha de expiración se ubican **al final** de la cola FEFO. Se consumen después de todos los lotes que sí tienen fecha, independientemente de su fecha de ingreso.

### 7. Prioridad entre líneas con artículo duplicado ✅ DEFINIDO

Cuando el mismo ítem aparece en múltiples líneas y el stock no alcanza para todas, se atienden **en orden de aparición en la OT** (línea de menor índice primero). El stock global por ítem se descuenta secuencialmente conforme se procesan las líneas.

### 8. Reintento tras asignación parcial ✅ DEFINIDO

El botón permanece visible mientras la OT esté en `Pending Fulfillment` o `Partially Fulfilled`. El usuario puede volver a presionarlo cuando haya más stock disponible para completar las líneas pendientes.

### 9. Líneas ya despachadas ✅ DEFINIDO — REGLA CRÍTICA

Las líneas donde `quantityfulfilled > 0` (es decir, ya se generó un Item Fulfillment para esa línea) deben **excluirse completamente** del proceso. Estas líneas ya tienen un lote comprometido en la ejecución del despacho y no deben ser modificadas.

El LBRY debe verificar `quantityfulfilled` por línea antes de incluirla en el conjunto a procesar. Una línea con despacho parcial (`quantityfulfilled > 0` pero `quantityfulfilled < quantity`) tampoco debe tocarse.

---

## Propuesta de experiencia de usuario (UX)

### Arquitectura UX recomendada: Modal asíncrono con Restlet

En lugar del patrón clásico de "botón → redirección a Suitelet → redirección de vuelta", se propone una experiencia **sin salir de la página**, más fluida y profesional:

```
Usuario presiona "Asignar Lotes"
        ↓
ClientScript muestra overlay de carga (spinner)
        ↓
ClientScript llama al Restlet vía fetch() (async)
        ↓
Restlet procesa la asignación en el servidor
        ↓
ClientScript recibe respuesta JSON con el resultado
        ↓
Se cierra el spinner y aparece Modal de Resultados
        ↓
Usuario presiona "Cerrar" → página se recarga para reflejar cambios
```

**Por qué Restlet y no Suitelet:** El Restlet tiene 5,000 governance units (vs 1,000 del Suitelet), lo que da más margen para OTs con muchas líneas y lotes. Además permite comunicación async limpia desde el ClientScript.

### Scripts involucrados

| Script | Tipo | Rol |
|--------|------|-----|
| `AS_NSP_004_TO_UE.js` | UserEventScript | Agrega el botón en view mode; inyecta el ClientScript |
| `AS_NSP_004_AsignLotes_CS.js` | ClientScript | Maneja el clic: overlay → fetch al Restlet → modal resultado |
| `AS_NSP_004_AsignLotes_RL.js` | Restlet | Recibe el TO ID, ejecuta la lógica de asignación, retorna JSON |
| `AS_NSP_004_LoteMgr_LIB.js` | Library | Consulta stock por ítem/lote/ubicación; aplica FEFO/FIFO; descuenta stock global |

### Flujo visual detallado

**Paso 1 — Clic en botón:** Aparece un overlay semitransparente sobre toda la página con un spinner y el texto _"Asignando lotes, por favor espere..."_. El botón se deshabilita para evitar doble clic.

**Paso 2 — Procesamiento:** El Restlet procesa en silencio. El usuario no es redirigido; permanece en la misma OT.

**Paso 3 — Modal de resultados:** Al terminar, desaparece el spinner y aparece un modal con tres secciones:

```
┌─────────────────────────────────────────────────────┐
│  ✅  Asignación de Lotes Completada                  │
├─────────────────────────────────────────────────────┤
│  ASIGNADAS COMPLETAMENTE (6 líneas)                 │
│  · Línea 1 — Artículo ABC → Lote L001 × 10         │
│  · Línea 2 — Artículo DEF → Lote L004 × 5          │
│  · ...                                              │
├─────────────────────────────────────────────────────┤
│  ⚠️  ASIGNACIÓN PARCIAL (1 línea)                   │
│  · Línea 4 — Artículo GHI → Lote L002 × 3 de 8    │
│    Stock disponible insuficiente.                   │
├─────────────────────────────────────────────────────┤
│  ❌  SIN STOCK DISPONIBLE (1 línea)                 │
│  · Línea 7 — Artículo XYZ → Sin lotes en ubicación │
├─────────────────────────────────────────────────────┤
│                            [ Cerrar y recargar ]    │
└─────────────────────────────────────────────────────┘
```

**Paso 4 — Cierre:** Al presionar "Cerrar y recargar", la página se recarga mostrando el `inventorydetail` actualizado en cada línea.

### Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| Error de red / timeout | Modal de error con mensaje "No se pudo completar la asignación. Intente nuevamente." y botón Reintentar |
| OT en estado no permitido | Modal de error: "Esta orden de traslado no permite asignación en su estado actual." |
| Error inesperado del servidor | Modal de error con código de referencia para soporte |

## Custom Record — Log de Asignación de Lotes

**Nombre del record:** Log Asignación Lotes OT  
**ID interno:** `customrecord_lmry_to_lot_assign_log`  
**Propósito:** Registrar cada ejecución del proceso de asignación automática de lotes. Un solo registro por ejecución; el detalle de líneas se almacena en texto estructurado para minimizar carga operativa.  
**Acceso:** Solo lectura para usuarios finales. Creación exclusiva vía script (RLET).

---

### Campos

| Campo | ID | Tipo | Obligatorio | Descripción |
|-------|----|------|:-----------:|-------------|
| Orden de Traslado | `custrecord_lmry_tola_transfer_order` | SELECT → `transferorder` | ✅ | OT sobre la que se ejecutó el proceso |
| Fecha de ejecución | `custrecord_lmry_tola_exec_date` | DATETIME | ✅ | Fecha y hora exacta de la ejecución |
| Usuario | `custrecord_lmry_tola_user` | SELECT → `employee` | ✅ | Usuario que presionó el botón |
| Estado general | `custrecord_lmry_tola_status` | SELECT (lista custom) | ✅ | Ver valores abajo |
| Total líneas evaluadas | `custrecord_lmry_tola_total_lines` | INTEGER | ✅ | Líneas candidatas (excluye despachadas) |
| Líneas asignadas completo | `custrecord_lmry_tola_lines_complete` | INTEGER | ✅ | Líneas con cantidad 100% cubierta |
| Líneas asignación parcial | `custrecord_lmry_tola_lines_partial` | INTEGER | ✅ | Líneas cubiertas parcialmente |
| Líneas sin stock | `custrecord_lmry_tola_lines_no_stock` | INTEGER | ✅ | Líneas donde no había ningún lote disponible |
| Líneas omitidas (despachadas) | `custrecord_lmry_tola_lines_skipped` | INTEGER | ✅ | Líneas excluidas por `quantityfulfilled > 0` |
| Detalle de líneas | `custrecord_lmry_tola_lines_detail` | LONG TEXT | ✅ | Detalle estructurado por línea (ver formato abajo) |
| Error | `custrecord_lmry_tola_error` | LONG TEXT | ❌ | Mensaje de error si `estado = ERROR` |

**Valores de la lista "Estado general":**

| Valor | Descripción |
|-------|-------------|
| `COMPLETE` | Todas las líneas evaluadas fueron asignadas completamente |
| `PARTIAL` | Al menos una línea quedó con asignación parcial o sin stock |
| `NO_STOCK` | Ninguna línea pudo ser asignada por falta de stock |
| `ERROR` | El proceso falló por un error inesperado |

---

### Formato del campo Detalle de líneas

El RLET construye este texto al finalizar el proceso, una línea por ítem evaluado:

```
[COMPLETE]  L01 | Artículo ABC        | Req: 10 | Prev: 0 | Asig: 10 | Lotes: L001×7, L002×3
[COMPLETE]  L02 | Artículo DEF        | Req: 5  | Prev: 2 | Asig: 3  | Lotes: L001×3
[PARTIAL]   L04 | Artículo GHI        | Req: 8  | Prev: 0 | Asig: 3  | Lotes: L002×3
[NO_STOCK]  L07 | Artículo XYZ        | Req: 6  | Prev: 0 | Asig: 0  | Lotes: -
[SKIPPED]   L05 | Artículo JKL        | Req: 4  | Despachada, omitida
[NO_LOT]    L06 | Artículo MNO        | Req: 2  | Sin lote, cantidad asignada directamente
```

Columnas: estado, número de línea en OT, nombre del ítem, cantidad requerida, cantidad previa (ya tenía asignada), cantidad asignada en esta ejecución, lotes utilizados.

---

### Notas de implementación

- El record se crea **al finalizar el proceso**, antes de retornar el JSON al ClientScript.
- Si el RLET falla con error inesperado, un `try/catch` externo intenta guardar el log con `estado = ERROR` y el mensaje en `custrecord_lmry_tola_error`.
- La saved search recomendada sobre este record: filtrable por OT, fecha, usuario y estado general.

---

## Estimación preliminar

| Parámetro | Valor |
|-----------|-------|
| **Complejidad** | Media |
| **Rango estimado** | 24 — 38 horas de desarrollo |
| **POC recomendada** | Sí — validar manipulación de `inventorydetail` en sandbox antes de estimar definitivamente |
| **Scripts a crear** | 1 URET + 1 CLNT + 1 RLET + 1 LBRY |
| **Custom Records** | 1 (`customrecord_lmry_to_lot_assign_log`) |
| **Custom Lists** | 1 (Estado general del log) |
| **Despliegue** | 1 deploy URET en `transferorder`, 1 deploy RLET |

El rango puede ajustarse a la baja (20h) si el cliente no usa bins y el criterio de selección de lotes es simple; o al alza (35h+) si se requiere FEFO con bins y manejo de asignación parcial compleja.

---

## Conclusión

**Estado:** `APROBADO`

**Motivo:** El requerimiento es técnicamente viable en NetSuite con SuiteScript 2.x. No presenta riesgos fiscales ni contables. Los riesgos de desarrollo y alcance son manejables (ninguno en zona crítica). La solución tiene un patrón arquitectónico claro (URET + CLNT + RLET + LBRY) y todos los puntos de alcance han sido definidos, incluyendo la regla crítica de exclusión de líneas despachadas (`quantityfulfilled > 0`).

**Próximo paso recomendado:** Activar la skill **Analista de Requerimientos** para redactar el documento funcional.

---

*Este documento requiere firma/aprobación del arquitecto antes de avanzar al documento funcional.*

**Firma del arquitecto:** _________________________ **Fecha:** _____________
