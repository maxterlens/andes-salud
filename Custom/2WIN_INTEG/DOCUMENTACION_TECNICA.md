# Documentación Técnica — 2WIN_INTEG
## Integración NetSuite ↔ Andes Salud HIS

**Versión:** 2.0 (incluye capa Domain)  
**Plataforma:** NetSuite SuiteScript 2.1  
**Tipo de proyecto:** Account Customization  
**Fecha de generación:** 2026-06-30  

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Arquitectura por Capas](#2-arquitectura-por-capas)
3. [Capa de Interfaces (Restlets)](#3-capa-de-interfaces-restlets)
4. [Capa de Dominio (Domain)](#4-capa-de-dominio-domain)
5. [Capa de Acceso a Datos (DAO)](#5-capa-de-acceso-a-datos-dao)
6. [Librerías Transversales (lib/)](#6-librerías-transversales-lib)
7. [Scripts de Trigger (User Event)](#7-scripts-de-trigger-user-event)
8. [Scripts Map/Reduce](#8-scripts-mapreduce)
9. [Scripts Programados (Scheduled)](#9-scripts-programados-scheduled)
10. [Suitelets](#10-suitelets)
11. [Client Scripts](#11-client-scripts)
12. [Registros Personalizados (Custom Records)](#12-registros-personalizados-custom-records)
13. [Flujos Principales de Ejecución](#13-flujos-principales-de-ejecución)
14. [Reglas de Negocio y Validaciones](#14-reglas-de-negocio-y-validaciones)
15. [Escenarios y Casos de Error](#15-escenarios-y-casos-de-error)
16. [Matriz de Relaciones](#16-matriz-de-relaciones)

---

## 1. Visión General

El proyecto **2WIN_INTEG** implementa una capa de integración bidireccional entre **NetSuite ERP** y el sistema **Andes Salud HIS** (Hospital Information System). La comunicación se realiza mediante:

- **Entrada (HIS → NetSuite):** Restlets que reciben mensajes HL7 v2.5 o JSON, los transforman y crean/modifican registros en NetSuite.
- **Salida (NetSuite → HIS):** Peticiones HTTP autenticadas con OAuth2 Client Credentials enviadas cuando ocurren eventos en NetSuite (creación de subsidiarias, ubicaciones, pagos, etc.).

El sistema gestiona:
- Admisiones hospitalarias (episodios de pacientes como Órdenes de Venta)
- Pacientes/clientes con validación de RUT chileno
- Órdenes de farmacia (RDE_O11 / RDE_O25)
- Pre-facturas y ciclo de facturación
- Autopicking de inventory fulfillments
- Ventas POS Farmacia con pagos múltiples y redondeo
- Catálogos maestros (subsidiarias, ubicaciones, centros de costo, productos, unidades, etc.)

---

## 2. Arquitectura por Capas

```
┌─────────────────────────────────────────────────────────────────────┐
│  HIS (Andes Salud)  <──── HTTP/HL7 ────>  NetSuite                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │       INTERFACES (Restlets)        │  Entry points HTTP
              │   2win_rl_andes_salud_*.js         │  desde HIS
              └─────────────────┬─────────────────┘
                                │ delega
              ┌─────────────────▼─────────────────┐
              │         DOMAIN (Dominio)           │  Lógica de negocio
              │       2win_dom_*.js                │  + auditoría + custodia
              └─────────────────┬─────────────────┘
                                │ accede
              ┌─────────────────▼─────────────────┐
              │          DAO (Data Access)         │  Operaciones CRUD
              │        2win_dao_*.js               │  SuiteQL, N/search
              └─────────────────┬─────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │       REGISTROS NETSUITE           │  Records estándar
              │   SalesOrder, Customer, Item,      │  y personalizados
              │   ItemFulfillment, Invoice...      │
              └───────────────────────────────────┘

  Transversal: lib/ → HL7, OAuth2, custodia, mapeo, validadores, caché
  Triggers: User Event Scripts → detectan cambios y disparan dominio
  Async: Map/Reduce + Scheduled Scripts → procesamiento por lotes
```

**Patrón base de cada operación:**
1. Interface recibe request → parsea HL7/JSON → llama dominio
2. Dominio inicializa `proceso` (auditoría) y `custodia` (trazabilidad)
3. Dominio valida reglas de negocio → llama DAO(s)
4. DAO opera sobre registros NetSuite
5. Dominio registra resultado en auditoría y custodia
6. Interface retorna respuesta HL7 ACK o JSON

---

## 3. Capa de Interfaces (Restlets)

Todos los Restlets residen en `src/FileCabinet/SuiteScripts/2win_andes_salud_interfases/interfaces/`.

### 3.1 Gestión de Pacientes / Clientes

| Archivo | Método HL7 | Operación | Delega a |
|---|---|---|---|
| `2win_rl_andes_salud_crear_cliente.js` | ADT^A04 | Crear paciente | `domCliente.crearRegistroNetsuite()` |
| `2win_rl_andes_salud_editar_cliente.js` | ADT^A08 | Editar paciente | `domCliente.editarRegistroNetsuite()` |
| `2win_rl_andes_salud_fusionar_cliente.js` | ADT^A40 | Fusionar registros duplicados | `domCliente.fusionarRegistroNetsuite()` |
| `2win_rl_andes_salud_carga_clientes.js` | Batch | Carga masiva clientes | Map/Reduce |
| `2win_rl_andes_salud_carga_masiva_pacientes.js` | Batch | Carga masiva pacientes | Map/Reduce |

### 3.2 Gestión de Admisiones (Episodios)

| Archivo | Método HL7 | Operación | Delega a |
|---|---|---|---|
| `2win_rl_andes_salud_crear_admision.js` | ADT^A01 | Crear admisión (OV) | `domAdmision.crear()` |
| `2win_rl_andes_salud_modificar_admision.js` | ADT^A08 | Modificar admisión | `domAdmision.modificar()` |
| `2win_rl_andes_salud_anular_episodio.js` | ADT^A23 | Anular episodio | `domAdmision.anular()` |
| `2win_rl_andes_salud_transferencia_A_H.js` | ADT^A31 | Transferir episodio | `domAdmision.transferir()` |

### 3.3 Gestión de Órdenes de Venta / Farmacia

| Archivo | Operación | Delega a |
|---|---|---|
| `2win_rl_andes_salud_crear_orden_farmacia.js` | RDE_O11 - Crear orden farmacia | dominio farmacia |
| `2win_rl_andes_salud_devolucion_farmacia.js` | RDE_O25 - Devolución farmacia | `domDevolucion` |
| `2win_rl_andes_salud_ov_agregar_lineas.js` | Agregar líneas a OV | `domOrdenVenta.recepcionDatos()` |
| `2win_rl_andes_salud_ov_eliminar_lineas.js` | Eliminar líneas de OV | `domOrdenVenta.recepcionDatos()` |
| `2win_rl_andes_salud_actualizacion_estado.js` (PUT) | Actualización masiva estados | `domOrdenVenta.actualizacionMasivaRegistros()` |

### 3.4 Gestión de Pre-factura

| Archivo | Operación | Delega a |
|---|---|---|
| `2win_rl_andes_salud_crear_prefactura.js` | Crear pre-factura | `domPrefactura.agendarTareaCrear()` |
| `2win_rl_andes_salud_editar_prefactura.js` | Editar pre-factura | `domPrefactura.agendarTareaEditar()` |
| `2win_rl_andes_salud_eliminar_prefactura.js` | Eliminar pre-factura | `domPrefactura.agendarTareaEliminar()` |

### 3.5 Catálogos e Inventario

| Archivo | Operación |
|---|---|
| `2win_rl_andes_salud_crear_item_servicio.js` | Crear ítem de servicio |
| `2win_rl_andes_salud_editar_item_servicio.js` | Editar ítem de servicio |
| `2win_rl_andes_salud_actualizar_precio_producto.js` | Actualizar precio producto |
| `2win_rl_andes_salud_consultar_stock_bodega.js` | Consultar stock por bodega |
| `2win_rl_andes_salud_consultar_stock_producto.js` | Consultar stock por producto |

### 3.6 POS Farmacia

| Archivo | Operación | Delega a |
|---|---|---|
| `interfaces/pos_farmacia/2win_rl_andes_salud_pos_farmacia_venta.js` | Venta en POS | `domVenta.procesoVenta()` |
| `interfaces/pos_farmacia/2win_rl_andes_salud_pos_farmacia_devolucion.js` | Devolución en POS | `domDevolucion.procesoDevolucion()` |

---

## 4. Capa de Dominio (Domain)

Reside en `domain/`. Cada módulo encapsula la lógica de negocio de un subdominio. **Patrón común:** inicializa objetos `proceso` y `custodia`, ejecuta lógica de negocio llamando a DAOs, registra en auditoría y custodia al terminar (éxito o error).

### 4.1 `2win_dom_admision.js` — Dominio de Admisiones

**Responsabilidad:** Gestionar el ciclo completo de admisiones hospitalarias como Órdenes de Venta.

**Funciones exportadas:**
- `crear(parametro)` — Parsea ADT^A01, verifica paciente por `PID-2.1`, valida episodio no existente (`PV1-19.1`), crea OV.
- `modificar(parametro)` — Parsea ADT^A08, busca OV por número de episodio, edita.
- `anular(parametro)` — Parsea ADT^A23, busca OV, anula.
- `transferir(parametro)` — Parsea ADT^A31, valida ambas OVs (hospitalaria + urgencia), transfiere.

**Dependencias:** `libAuditoria`, `libCustodia`, `daoCliente`, `daoOrdenVenta`, `hl7_dao`, `libMapeoAdmision`, `daoIngresos`

**Patrón interno:** `_inicializarContexto()` → lógica → `_manejarExito()` / `_manejarError()`

---

### 4.2 `2win_dom_autopicking.js` — Dominio de Autopicking

**Responsabilidad:** Sincronizar Item Fulfillments con las líneas de una OV, diferenciando bodegas autopicking vs. picking manual.

**Clase:** `AutoPickingManager`

**Método principal:** `syncronize(newRecord, triggerContext, estadoActualizacion, forceStatusDowngrade)`

Algoritmo:
1. Lee líneas inventariables de la OV (tipos `InvtPart`, `Assembly`, `Kit`; omite provisionales)
2. Obtiene IFs existentes asociados a la OV via SuiteQL
3. Consulta flag `custrecord_2win_is_autopicking` por bodega
4. Prepara contexto de asignación de stock (1 consulta para toda la OV)
5. Agrupa líneas por clave `{ubicación}_{auto|manual}`
6. Por cada grupo: actualiza IFs existentes, crea IFs parciales para líneas nuevas
7. Elimina IFs huérfanos (cuyos grupos desaparecieron)

**Otros métodos:**
- `deleteFulfillment(salesOrderRecord)` — Elimina todos los IFs de una OV
- `deleteLineOnFulfillments(orderId, orderLine)` — Elimina una línea específica de IFs

**Dependencias:** `daoItemFulfillment`, `N/query`, `N/search`, `N/log`

---

### 4.3 `2win_dom_cliente.js` — Dominio de Clientes / Pacientes

**Responsabilidad:** Crear, editar y fusionar pacientes desde mensajes HL7.

**Funciones exportadas:**
- `crearRegistroNetsuite(parametro)` — ADT^A04. Si ya existe cliente por RUT → actualiza (upsert). Retorna ACK HL7.
- `editarRegistroNetsuite(parametro)` — ADT^A08. Busca por `externalid`, edita.
- `fusionarRegistroNetsuite(parametro)` — ADT^A40. Obtiene maestro y duplicados, actualiza maestro con datos más recientes, fusiona.

Todas retornan un string de mensaje HL7 ACK (`AA`=éxito, `AE`=error).

---

### 4.4 `2win_dom_departamento.js` — Dominio de Centros de Costo

**Responsabilidad:** Notificar al HIS cambios en departamentos/centros de costo.

**Funciones exportadas:**
- `eventoCreacionRegistro(parametro)` — Envía `{tipoMensaje: "SEND^IN"}` al HIS (PUT `/creacion-centro-costo`). Valida respuesta HTTP 202.
- `eventoEdicionRegistro(parametro)` — `{tipoMensaje: "SEND^UPD"}` al endpoint `/upd-centro-costo`.
- `reprocesarEvento(custodiaRecord)` — Lee ID registro desde custodia, carga registro, reenvía.

---

### 4.5 `2win_dom_devolucion.js` — Dominio de Devoluciones POS

**Responsabilidad:** Gestionar devoluciones en POS Farmacia: Credit Memo, reembolsos y journal de redondeo.

**Función exportada:** `procesoDevolucion(datosContext)` — Crea Credit Memo desde factura original, genera reembolsos por forma de pago, calcula/crea journal de redondeo si diferencia EFECTIVO ≤ 5 CLP. En error, elimina el Credit Memo.

---

### 4.6 `2win_dom_evento.js` — Servicio de Eventos

**Responsabilidad:** Servicio genérico y desacoplado para registrar eventos en sistemas externos (patrón Adapter).

**Clase `EventService`:** Constructor recibe `{ externalAdapter }`. Método `registerEvent(options)` crea entidad `Evento` y la envía al adaptador externo de forma asíncrona (`async/await`).

**Clase `ExternalEventServiceAdapter`:** Implementa `sendEvent(evento)` usando `N/https`.

**Enum `NivelEvento`:** `INFO`, `WARNING`, `ERROR`, `DEBUG`.

---

### 4.7 `2win_dom_familia_producto.js` — Dominio de Familias de Producto

Mismo patrón que `domDepartamento`: `eventoCreacionRegistro()`, `eventoEdicionRegistro()`, `reprocesarEvento()`. Notifica HIS cambios en grupos/familias de ítems.

---

### 4.8 `2win_dom_farmacia.js` — Dominio de Farmacia

**Responsabilidad:** Gestionar órdenes de farmacia entrantes (RDE_O11) y devoluciones (RDE_O25), creando los registros correspondientes en NetSuite.

---

### 4.9 `2win_dom_item_servicio.js` — Dominio de Ítems de Servicio

**Responsabilidad:** Crear y editar ítems de servicio en NetSuite desde peticiones del HIS.

---

### 4.10 `2win_dom_operaciones_masivas.js` — Base para Operaciones Masivas

**Responsabilidad:** Clase base reutilizable para procesamiento asíncrono en batch via Map/Reduce.

**Clase `OperacionMasiva`:** Constructor `{ nombre, tipoMensaje, scriptIdMapReduce, deploymentIdMapReduce, folderId, mapReduceParameter }`.

**Método `procesar(parametro)`:**
1. Genera UUID
2. Crea archivo JSON en File Cabinet con los datos
3. Crea y envía tarea `MAP_REDUCE` con ID del archivo como parámetro

---

### 4.11 `2win_dom_orden_venta.js` — Dominio de Órdenes de Venta (v1)

**Responsabilidad:** Gestionar operaciones en lote sobre OVs (ambulatorias/hospitalarias) y actualización masiva de estados.

**Funciones exportadas:**
- `recepcionDatos(parametro)` — Valida `tipoMensaje` (`SEND^IN`/`SEND^REV`), crea archivo JSON en File Cabinet, encola, lanza MR si no hay uno activo.
- `validarMapearDatosSendIn(parametro)` — Valida propiedades obligatorias, búsqueda masiva de productos por UPC (1 SQL), mapea campos.
- `validarMapearDatosSendRev(parametro)` — Similar para reversiones.
- `agregarLineasRegistroNetsuite(parametro)` — Delega a `daoOrdenVenta.agregarLineasRegistro()`.
- `eliminarLineasRegistroNetsuite(parametro)` — Delega a `daoOrdenVenta.eliminarLineasRegistro()`.
- `actualizarLineaRegistroNetsuite(parametro)` — Actualiza valores de una línea específica.
- `actualizacionMasivaRegistros(parametro)` — Crea archivo con payload de `gestionCuenta`, lanza MR `customscript_2win_mr_andes_salud_ov_a_v`.

---

### 4.12 `2win_dom_orden_venta_v2.js` — Dominio de Órdenes de Venta (v2)

Versión refactorizada con mejoras de rendimiento. Mismo propósito que v1.

---

### 4.13 `2win_dom_pago.js` — Dominio de Pagos

Notifica al HIS cuando se registran pagos en NetSuite. Funciones: `eventoCreacionRegistro()`, `reprocesarEvento()`.

---

### 4.14 `2win_dom_precargas.js` — Dominio de Precargas (Cache Warmup)

**Responsabilidad:** Proveer funciones de carga masiva de catálogos para alimentar el cache `N/cache` del POS Farmacia.

**Funciones exportadas:** `getAllSubsidiarias()`, `getAllUbicaciones()`, `getAllTiposDTE()`, `getAllCuentasFormaPago()`, `getAllParametros()`, `getAllCentrosCosto()`, `getAllTaxCodes()`, `getAllDiscounts()`.

Cada función llama al DAO de búsqueda masiva correspondiente. Usadas exclusivamente por `2win_ss_precarga_pos_farmacia.js`.

---

### 4.15 `2win_dom_prefactura.js` — Dominio de Pre-factura

**Responsabilidad:** Gestionar el ciclo completo de pre-facturas: recepción, encolamiento, creación, edición, eliminación y notificación al HIS.

**Constantes:** `TIPO_MENSAJE_CREAR = "SEND^IN"`, `"SEND^UPD"`, `"SEND^DEL"`.

**Funciones exportadas:**
- `agendarTareaCrear(request)` — Valida request, crea archivo JSON en File Cabinet, encola en `customrecord_2win_as_prefactura_queue`, lanza MR si no está activo. Retorna `{ id_proceso: uuid }`.
- `agendarTareaEditar(request)` / `agendarTareaEliminar(request)` — Igual para edición/eliminación.
- `crear(request)` — Lógica efectiva: valida OV, crea `customrecord_2w_as_prefactura` y líneas `customrecord_2w_as_prefactura_detalles`.
- `editar(request)` / `eliminar(request)` — Operaciones equivalentes.
- `notificarResultados(idProceso, resultado)` — PUT al HIS con resultado de procesamiento por línea.

---

### 4.16 `2win_dom_producto.js` — Dominio de Productos

Notifica al HIS creación/edición de productos. Mismo patrón: `eventoCreacionRegistro()`, `eventoEdicionRegistro()`, `reprocesarEvento()`.

---

### 4.17 `2win_dom_subsidiaria.js` — Dominio de Subsidiarias

**Responsabilidad:** Notificar al HIS cambios en subsidiarias (empresas del holding).

**Funciones exportadas:**
- `eventoCreacionRegistro(parametro)` — Recupera campos del registro, valida propiedades obligatorias, envía PUT `/creacion-empresa` con `{tipoMensaje: "SEND^IN"}`. Espera HTTP 202 con `estado.success === true`.
- `eventoEdicionRegistro(parametro)` — `tipoMensaje: "SEND^UPD"`, endpoint `/upd-empresa`.
- `reprocesarEvento(custodiaRecord)` — Lee ID desde custodia, carga registro, determina tipo de evento, reenvía.

**Propiedades validadas:** `RutEmpresa`, `RutEmpresaPadre`, `RazonSocial`, `Giro`, `Region`, `Comuna`, `Ciudad`, `Pais`, `FechaInicioVigencia`, `ActividadEconomica`, `CodActividadEconomica`, `Clinica`.

---

### 4.18 `2win_dom_ubicacion.js` — Dominio de Ubicaciones / Bodegas

Notifica al HIS cambios en ubicaciones/bodegas. Mismo patrón que departamento con `reprocesarEvento()`.

---

### 4.19 `2win_dom_unidad_producto.js` — Dominio de Unidades de Medida

Notifica al HIS cambios en unidades de medida de productos.

---

### 4.20 `2win_dom_venta.js` — Dominio de Venta POS Farmacia

**Responsabilidad:** Orquestar el proceso completo de venta en POS Farmacia.

**Función exportada:** `procesoVenta(context)`

**Flujo interno:**
1. Obtener ID subsidiaria desde `libCache.getSubsidiariaByRut()`
2. Verificar folio no duplicado (`daoSearchInvoice`)
3. Obtener ID ubicación y tipo DTE desde `libCache`
4. Buscar cliente por External ID; si no existe, usar cliente genérico
5. Construir líneas de productos (+ líneas de descuento si `descuento != 0`)
6. Crear factura (`daoCreateInvoice.createInvoice()`)
7. Calcular diferencia redondeo en pago EFECTIVO; si ≤ 5 CLP → crear journal
8. Crear pagos por cada forma de pago
9. Si error en journal o pagos → eliminar factura (rollback) y lanzar excepción

---

## 5. Capa de Acceso a Datos (DAO)

Reside en `dao/`. Encapsula operaciones CRUD usando `N/record`, `N/search`, `N/query` (SuiteQL).

### 5.1 DAOs de Cola (Queue)

#### `2win_dao_autopicking_queue.js`
**Registro:** `customrecord_2win_autopicking_queue`

| Función | Descripción |
|---|---|
| `addToQueue(salesOrderId, estadoActualizacion)` | Verifica duplicado antes de insertar. Guarda estado `CREATE` o `UPDATE`. |
| `getPending(limit=50)` | Estado=PENDIENTE, reintentos ≤ 3, activos. |
| `getPendingBySalesOrder(salesOrderId)` | Verifica si OV ya está en cola. |
| `markAsProcessed(queueRecordId)` | Estado → PROCESADO + fecha. |
| `handleError(queueRecordId, errorMessage)` | Incrementa reintentos. Si ≥ 3 → ERROR permanente. |
| `getQueueStats()` | Tres búsquedas con `summary: "COUNT"` por estado. |
| `verificarScheduledScriptActivo(deployId)` | Busca en `scheduledscriptinstance` con status PENDING/PROCESSING. |
| `cleanOldProcessed(daysOld=30)` | Elimina PROCESADOS con más de N días. |

**Estados:** `PENDIENTE=1`, `PROCESADO=2`, `ERROR=3` | **MAX_RETRIES:** 3

#### `2win_dao_prefactura_queue.js`
**Registro:** `customrecord_2win_as_prefactura_queue`. Similar al anterior pero filtra también por `tipoMensaje`.

### 5.2 DAOs Principales

| Archivo | Record Type | Operaciones clave |
|---|---|---|
| `2win_dao_cliente.js` | `customer` | `busquedaRegistroPorRut()`, `busquedaRegistroPorIdExterno()`, `creaRegistro()`, `editarRegistro()`, `fusionarRegistros()`, `busquedaRegistrosDuplicados()` |
| `2win_dao_orden_venta.js` | `salesorder` | `crear()`, `editar()`, `anular()`, `transferir()`, `buscar()`, `agregarLineasRegistro()`, `eliminarLineasRegistro()` |
| `2win_dao_itemfullfilment.js` | `itemfulfillment` | `prepararContextoAsignacion()`, `createPartialFulfillment()`, `updateLines()`, `deleteById()`, `removeLine()` |
| `2win_dao_prefactura.js` | `customrecord_2w_as_prefactura` | CRUD completo |
| `2win_dao_producto.js` | `inventoryitem`/`serviceitem` | `busquedaMasivaPorUpcCode()` — 1 SQL para N productos |
| `2win_dao_subsidiaria.js` | `subsidiary` | `recuperarCamposRegistro()`, `getRecord()` |
| `2win_dao_file.js` | File Cabinet | `crearArchivo()`, `buscarArchivoPorNombre()` |
| `2win_dao_hl7.js` | — | `getMessageFromRawMessage()` — parsea string HL7 |
| `2win_dao_replay_config.js` | `customrecord_2win_andes_salud_replay_con` | `getRetryLimits()`, `getRetryLimitForFlow()` |
| `2win_dao_static_params_operacion.js` | custom record | `getParam(nombre)` — URL base HIS, IDs carpetas, etc. |

### 5.3 DAOs de Búsqueda Masiva (`dao/2win_dao_search_all_*.js`)

Cargan todos los registros de un catálogo en memoria para alimentar el cache POS:

`subsidiarias`, `ubicaciones`, `tipos_dte`, `cuentas_forma_pago`, `parametros`, `centros_costo`, `tax_codes`, `discounts`.

### 5.4 DAOs POS Farmacia (`dao/pos_farmacia/`)

22 DAOs especializados incluyendo: `create_invoice`, `create_cash_sale`, `create_credit_memo`, `create_customer_payment`, `create_journal_rounding`, `customer_refund`, `delete_invoice`, `auditoria` (con `crearReportesAuditoriaBatch()`), `mapping` (`getItemMapping()`), `search_invoice`, `search_customer`, `search_cuenta_redondeo`.

---

## 6. Librerías Transversales (lib/)

### 6.1 `2win_lib_peticion.js` — HTTP / OAuth2

- `generarToken()` — POST a `amh.andessalud.cl/hc/oauth2/token` con client credentials.
- `ejecutarPeticion(tipo, url, token, body)` — `N/https.request()` con Bearer token.
- `ejecutarPeticionAutenticada(tipo, url, body)` — Combina ambas.

### 6.2 `2win_lib_custodia.js` — Trazabilidad

Upsert de `customrecord_2win_andessalud_custodia`. Funciones: `guardarOActualizarRegistro()`, `crearRegistro()`, `actualizarRegistro()`, `busquedaRegistrosPorCodigoError(codigo)`, `busquedaRegistroPorExternalid()`. Datos de entrada truncados a 1.000.000 chars, respuesta a 300 chars.

### 6.3 `2win_lib_auditoria.js` — Auditoría Interna

`obtenerToken()` (UUID), `crearRegistro(proceso)`, `buscarRegistro(token)`.

### 6.4 `2win_lib_error.js` — Manejo de Errores

`errorHandler(err)` — Traduce códigos de error NetSuite a español. Siempre establece `notifyOff: true`.

### 6.5 `2win_lib_cache.js` — Cache POS Farmacia

Wrapper `N/cache` con TTL 1200s (20 min). Cache protegido `"2win_pos_farmacia_cache"`.

Funciones: `getSubsidiariaByRut()`, `getUbicacionByCodigo()`, `getTipoDTEByCodigo()`, `getCuentaByFormaPagoVenta()`, `getCentroCostoByUbicacionId()`, `getParametroByNombre()`, `getAllDiscounts()`.

### 6.6 `lib/2win_lib_hl7/` — Parser/Builder HL7 v2.5

- `hl7parser.js` — Parsea strings HL7 raw en objetos por segmentos
- `hl7builder.js` — Construye mensajes HL7 (`Message`, `Segment`)
- `models/` — `Hl7Message`, `Segment`, `Field`, `SubField`, `RepeatingField`, `Element`, `FieldDefinition`

### 6.7 `2win_lib_mapeo.js` — Mapeo HL7 → NetSuite

`mapearCampos()` — Traduce segmentos HL7 a campos NetSuite usando SuiteQL (resuelve nacionalidad, comuna, región, ciudad). `mapearCamposAck()`, `mapearCamposCustodia()`.

### 6.8 `lib/mapeo/2win_lib_mapeo_admision.js`

Mapeo específico para admisiones: extrae `MSH`, `PID`, `PV1`, `AL1`, `GT1`, `IN1` → campos OV.

### 6.9 `2win_lib_mapeo_json.js` / `_v2.js` — Mapeo JSON

`mapearCamposCuerpoIngresoAmbulatorio()`, `mapearCamposLineaIngresoAmbulatorio(detalle, cacheProductos)` — resuelve producto por UPC code desde cache masivo.

### 6.10 Otras Librerías

| Archivo | Función |
|---|---|
| `2win_lib_normalizacion.js` | `normalizarTexto()` (uppercase, trim, sin especiales) |
| `2win_lib_validadores.js` | `buscarSubsidiariaPorRUT()`, `buscarClientePorRUT()`, `buscarClientePorFicha()`, `validaReporteCaja()` |
| `2win_lib_validacion_duplicidad.js` | `validarDuplicado({ recordType, fieldId, value, internalId })` |
| `2win_lib_formato.js` | `formatearFecha()`, `formatearMonto()`, `verificarPropiedades()` |
| `2win_lib_cliente.js` | Resolución de datos de cliente para eventos salientes |
| `2win_lib_code_generator.js` | Generación de códigos únicos |
| `2win_ui_helper.js` | `hideNativeFields()`, `setFieldValues()` |
| `moment.js` | Moment.js incluida localmente |

---

## 7. Scripts de Trigger (User Event)

### 7.1 `2win_ue_andes_salud_orden_venta.js` — OV (Principal para Autopicking)

**Registro:** `salesorder`

**`beforeLoad`** (solo UI): Configura campos obligatorios, construye pestañas (Admisión, Cobertura, Auditoría, Docs relacionados), carga sublistas (Garantías, Journals), carga valores custom en campos.

**`beforeSubmit`:** En CREATE → valida cuenta única (`nroCuentaPaciente + subsidiaria`). En DELETE → `AutoPickingManager.deleteFulfillment()`.

**`afterSubmit`:**
- `businessModule.validarCambiosLineas(oldRecord, newRecord)` — detecta cambios relevantes
- `daoAutopickingQueue.addToQueue(newRecord.id, estadoActualizacion)`
- Si SS no activo: lanza `customscript_2win_ss_autopicking`

### 7.2 `2win_ue_andes_salud_subsidiaria.js`

`afterSubmit` → `domSubsidiaria.eventoCreacionRegistro()` o `eventoEdicionRegistro()`. `beforeSubmit` → valida fechas y país.

### 7.3 `2win_ue_andes_salud_departamento.js` / `_ubicacion.js` / `_pago.js`

`afterSubmit` → notifican al HIS cambios en centros de costo / ubicaciones / pagos.

### 7.4 `2win_ue_andes_salud_producto.js`

`beforeSubmit` → valida duplicados por `itemid` y `upccode`. `afterSubmit` → notifica HIS.

### 7.5 `2win_ue_andes_salud_factura.js`

En DELETE → busca y elimina asientos contables asociados via SuiteQL.

### 7.6 `2win_ue_entity_rut_validation.js`

`beforeSubmit` → valida formato RUT chileno (módulo 11) y unicidad. Omite si el registro pasa a inactivo.

### 7.7 Módulos Auxiliares (`triggers/ue/`)

- `2win_ue_ov_ui.js` — Construcción de pestañas y sublistas de la OV
- `2win_ue_ov_business.js` — `setMandatoryFields()`, `validateUniqueAccount()`, `validarCambiosLineas()`
- `2win_ue_ov_search.js` — Búsquedas para poblar la UI de la OV

---

## 8. Scripts Map/Reduce

### 8.1 `2win_mr_andes_salud_autopicking_processor.js`

`getInputData` → OVs pendientes de cola; `map` → agrupa por `salesOrderId`; `reduce` → 1 ejecución por OV, llama `AutoPickingManager.syncronize()`; `summarize` → registra resultados.

### 8.2 `2win_mr_andes_salud_crear_prefactura.js` / `_editar` / `_eliminar`

`getInputData` → `getPending(limit, tipoMensaje)`; `map` → carga archivo JSON de File Cabinet; `reduce` → `domPrefactura.crear/editar/eliminar()` + notifica HIS; `summarize` → si quedan pendientes, auto-relanza.

### 8.3 `2win_mr_andes_salud_ov_agregar_lineas.js` / `_v2` / `_eliminar_lineas`

Procesa cola de líneas: valida, mapea, agrega/elimina líneas en OVs. Búsqueda masiva de productos por UPC (1 SQL).

### 8.4 `2win_mr_andes_salud_ov_actualizar_valores.js`

Lee archivo JSON de `gestionCuenta`, actualiza estados de OVs.

### 8.5 `2win_mr_andes_salud_carga_clientes.js` / `_carga_masiva_pacientes.js`

Carga masiva de clientes/pacientes desde batch del HIS.

### 8.6 `2win_mr_andes_salud_reenvio_producto.js` / `_reenvio_familia_producto.js`

Re-envío de eventos de producto/familia fallidos al HIS.

---

## 9. Scripts Programados (Scheduled)

### 9.1 `2win_ss_autopicking_processor.js` — Procesador Principal de Autopicking

**Script ID:** `customscript_2win_ss_autopicking`  
**Deploy ID:** `customdeploy_2win_ss_autopicking`  
**Batch:** 20 registros por ejecución

**Flujo:**
1. `getQueueStats()` — estadísticas iniciales
2. `getPending(20)` — obtiene hasta 20 OVs
3. Por cada OV: `record.load(salesorder)` → `AutoPickingManager.syncronize(record, "afterSubmit", estadoActualizacion)`
4. `markAsProcessed()` o `handleError()` según resultado
5. Si quedan pendientes Y no hay otra ejecución activa → `task.create(SCHEDULED_SCRIPT)` → auto-relanza

### 9.2 `2win_ss_andes_salud_interfaces_custodia.js` — Motor de Reintentos Global

Busca `customrecord_2win_andessalud_custodia` con `codigoRespuesta = "001"`, lee `custrecord_2win_as_interface`, consulta límites en `customrecord_2win_andes_salud_replay_con`, llama `dominio.reprocesarEvento()` del dominio correspondiente.

### 9.3 `2win_ss_precarga_pos_farmacia.js` — Cache Warmup

Ejecuta `domPrecargas.getAll*()` para cada tipo de catálogo y almacena en `libCache` (TTL 1200s). Se ejecuta al inicio del día.

### 9.4 `2win_ss_andes_salud_autoclean_temp_lines.js`

Limpia líneas temporales huérfanas en OVs.

### 9.5 `2win_ss_autopicking_one.js`

Autopicking de una sola OV específica (debugging / reproceso puntual).

---

## 10. Suitelets

### 10.1 `2win_sl_andes_salud_autopicking.js` — Autopicking Manual

GET sin parámetros → formulario de búsqueda. GET con parámetros → ejecuta autopicking de OV específica. POST → JSON con resultado. Permite ejecutar autopicking manualmente para debugging o corrección.

### 10.2 `2win_sl_configuracion_inicial.js` — Asistente de Configuración

Wizard multi-paso (6 pasos) para setup inicial: subsidiaria, ubicaciones, centros de costo, productos, parámetros de integración, finalización. Usa helpers: `2win_helper_parametros.js`, `2win_helper_registros.js`, `2win_helper_campos.js`.

### 10.3 `2win_sl_discrepancia_inventario.js` — Reporte de Discrepancias

Reporte paginado async usando `Promise.all()` para consultas paralelas de discrepancias de inventario.

### 10.4 `2win_sl_lista_customers.js`

Lista de pacientes/clientes para gestión desde UI.

---

## 11. Client Scripts

| Archivo | Función |
|---|---|
| `2win_cl_address.js` | Validaciones de dirección en formularios |
| `2win_cl_familia_producto.js` | Comportamiento dinámico en formularios de familia de producto |
| `2win_cl_unidad_producto.js` | Validaciones en formularios de unidades de medida |
| `2win_cs_andes_salud_detalle_prefactura.js` | `verDetalleOV()` — abre modal con líneas de OV asociada |

---

## 12. Registros Personalizados (Custom Records)

| Record Type | Descripción | Campos clave |
|---|---|---|
| `customrecord_2win_andessalud_custodia` | Trazabilidad de cada operación | `custrecord_2win_as_interface`, `custrecord_2win_as_id_registro`, `datosEntrada`, `respuesta`, `codigoRespuesta` (000/001), `reintentos`, `externalid` |
| `customrecord_2win_as_prefactura_queue` | Cola de pre-facturas | `tipoMensaje` (SEND^IN/UPD/DEL), estado, uuid |
| `customrecord_2win_autopicking_queue` | Cola de autopicking | `custrecord_2win_apq_sales_order`, `custrecord_2win_apq_estado` (1/2/3), `custrecord_2win_apq_reintentos`, `custrecord_2win_apq_estado_actualizacion` (CREATE/UPDATE), `custrecord_2win_apq_error` |
| `customrecord_2win_andes_salud_replay_con` | Configuración de reintentos | Límite por tipo de interfaz |
| `customrecord_2w_as_prefactura` | Pre-factura (cabecera) | Vinculada a OV, subsidiaria, cliente |
| `customrecord_2w_as_prefactura_detalles` | Líneas de pre-factura | Estado (Nuevo/Modificado/Eliminado) |
| `customrecord_2win_nacionalidades` | Catálogo nacionalidades con códigos HL7 | |
| `customrecord_2w_comunas_chile` / `_regiones_chile` / `_ciudades_chile` | Catálogos geográficos Chile | Código HL7 |
| `customrecord_2w_recaudaciones_root` | Cabecera de reporte de caja | |

**Campos custom en records estándar:**
- `salesorder.custbody_2win_nro_cuenta_paciente` — Número de cuenta del paciente
- `salesorder.custbody_2win_auto_seleccion` — Bandera autopicking
- `location.custrecord_2win_is_autopicking` — Bodega con autopicking automático
- `transactionline.custcol_2win_as_identificador_fila` — Identificador único de línea (correlativo `CrgCorrel`)
- `transactionline.custcol_2win_flag_item_provisional` — Línea provisional (excluida del autopicking)
- `subsidiary.custrecord_2winrutsubsiudiaria` — RUT de la subsidiaria

---

## 13. Flujos Principales de Ejecución

### 13.1 Crear Admisión (Paciente llega al hospital)

```
HIS → POST /crear_admision (HL7 ADT^A01)
  → Restlet
  → domAdmision.crear()
    → hl7_dao.getMessageFromRawMessage()       [parsear HL7]
    → libMapeoAdmision.mapearCampos()           [HL7 → campos NS]
    → _inicializarContexto()                    [proceso + custodia]
    → Validar PID-2.1 existe
    → daoCliente.busquedaRegistroPorIdExterno() [buscar paciente]
    → daoOrdenVenta.buscar(PV1-19.1)            [¿ya existe?]
    → daoOrdenVenta.crear()                     [crear OV = admisión]
    → _manejarExito()                           [custodia + auditoría]
  <- { success: true, message: "Admisión registrada" }
```

### 13.2 Venta POS Farmacia

```
POS → POST /pos_farmacia_venta (JSON)
  → Restlet → domVenta.procesoVenta()
    → libCache.getSubsidiariaByRut()
    → daoSearchInvoice.searchInvoice()    [folio único]
    → libCache.getUbicacionByCodigo()
    → libCache.getTipoDTEByCodigo()
    → daoSearchCustomer o cliente genérico
    → Construir líneas + líneas descuento
    → daoCreateInvoice.createInvoice()    [crear factura]
    → Calcular diferencia redondeo EFECTIVO
      → [|diff| <= 5 CLP] daoJournalRounding.createJournalRounding()
    → Por cada forma de pago:
      → libCache.getCuentaByFormaPagoVenta()
      → daoCreateCustomerPayment.createCustomerPayment()
    → [Si error] daoDeleteInvoice.deleteInvoice()  [rollback]
  <- { tipoMensaje: "POS^VENTA", estado: { success: true } }
```

### 13.3 Autopicking (Despacho automático de OV)

```
Usuario guarda OV con líneas de inventario
  → UE afterSubmit (2win_ue_andes_salud_orden_venta.js)
    → businessModule.validarCambiosLineas()
    → daoAutopickingQueue.addToQueue(ovId, estadoActualizacion)
    → daoAutopickingQueue.verificarScheduledScriptActivo(DEPLOY_ID)
    → [Si no activo] task.create(SCHEDULED_SCRIPT).submit()

Scheduled Script (2win_ss_autopicking_processor.js)
  → daoAutopickingQueue.getPending(20)
  → Por cada OV:
    → record.load(salesorder)
    → AutoPickingManager.syncronize(record, "afterSubmit", estado)
      → #getSaleOrderLines()               [líneas inventariables]
      → #getItemFulfillmentLines()          [IFs existentes via SuiteQL]
      → #getLocationDetails()               [flag autopicking por bodega]
      → itemFulfillmentDao.prepararContextoAsignacion()
      → Agrupar por {ubicación}_{auto|manual}
      → Por grupo existente: updateLines()
      → Líneas nuevas: createPartialFulfillment()
      → Grupos huérfanos: deleteById()
    → daoAutopickingQueue.markAsProcessed()
  → [Si quedan pendientes] task.create() → relanzar SS
```

### 13.4 Pre-factura

```
HIS → POST /crear_prefactura (JSON)
  → Restlet → domPrefactura.agendarTareaCrear()
    → crearArchivoProceso()               [archivo JSON en File Cabinet]
    → dao_prefactura_queue.addToQueue()
    → [Si no hay MR activo] task.create(MAP_REDUCE).submit()
  <- { id_proceso: uuid }

Map/Reduce (2win_mr_andes_salud_crear_prefactura.js)
  → getInputData: getPending("SEND^IN")
  → map: cargar archivo JSON de File Cabinet
  → reduce: domPrefactura.crear()
    → validar OV
    → crear customrecord_2w_as_prefactura
    → crear líneas customrecord_2w_as_prefactura_detalles
  → domPrefactura.notificarResultados() → PUT al HIS
  → [Si quedan pendientes] auto-lanzar MR
```

### 13.5 Sincronización de Catálogos (NetSuite → HIS)

```
Admin guarda subsidiaria en NetSuite
  → UE afterSubmit (2win_ue_andes_salud_subsidiaria.js)
    → domSubsidiaria.eventoCreacionRegistro(newRecord)
      → daoParametrosOperacion.getParam("interfaces_andessalud_hc_url_base")
      → daoSubsidiaria.recuperarCamposRegistro()
      → libFormato.verificarPropiedades()    [valida campos]
      → libPeticion.generarToken()           [OAuth2]
      → libPeticion.ejecutarPeticion(PUT, /creacion-empresa, token, body)
      → Validar respuesta 202
      → [Error] libCustodia.guardarOActualizarRegistro() código "001"
```

### 13.6 Motor de Reintentos

```
Scheduled (2win_ss_andes_salud_interfaces_custodia.js)
  → libCustodia.busquedaRegistrosPorCodigoError("001")
  → Por cada custodia en error:
    → daoReplayConfig.getRetryLimitForFlow(interface)
    → [Si reintentos < límite] dominio.reprocesarEvento(custodiaRecord)
      → reconstruye y reenvía evento original
      → actualiza custodia con nuevo resultado
```

---

## 14. Reglas de Negocio y Validaciones

### 14.1 Pacientes / Clientes

- **RUT único y válido:** Módulo 11 chileno validado antes de guardar; omite si registro pasa a inactivo.
- **Upsert por RUT en creación:** Si ya existe un cliente con el mismo RUT → actualiza en lugar de duplicar.
- **Ficha / ID externo:** Los pacientes se identifican primero por `externalid` (ID en HIS), luego por RUT.

### 14.2 Admisiones

- **Paciente debe existir** en NetSuite antes de crear la admisión.
- **Número de episodio único** (`PV1-19.1`): No se pueden duplicar.
- **Cuenta paciente única por subsidiaria** (`custbody_2win_nro_cuenta_paciente`).
- **Transferencia requiere dos OVs:** Hospitalaria y de urgencia deben existir.

### 14.3 Autopicking

- **Solo ítems inventariables:** `InvtPart`, `Assembly`, `Kit`. Excluye servicios y provisionales.
- **1 fulfillment por bodega+tipo:** Agrupación por `{ubicación}_{auto|manual}`.
- **Sin sobreconsumo de lotes:** Contexto de asignación preparado 1 sola vez por OV.
- **Idempotencia en cola:** OV ya PENDIENTE no se duplica.
- **Máximo 3 reintentos:** Después → estado ERROR permanente.
- **Auto-relanzamiento:** Garantiza eventual consistencia sin intervención manual.

### 14.4 Pre-facturas

- **Procesamiento siempre asíncrono:** Cola → Map/Reduce.
- **1 MR activo por tipo de mensaje:** Verificación antes de lanzar.
- **Notificación obligatoria al HIS** del resultado (éxito/error por línea).

### 14.5 POS Farmacia

- **Folio único:** No puede existir factura previa con el mismo folio.
- **Valor unitario neto ≠ 0:** Si cero → error 400, no se crea factura.
- **Rollback atómico:** Error en journal o pago → eliminar factura.
- **Redondeo EFECTIVO:** Diferencia ≤ 5 CLP → journal. Diferencia > 5 CLP → error.
- **Cache obligatorio:** Todos los catálogos se resuelven desde `N/cache`; requiere precarga previa.

### 14.6 Catálogos Salientes (NetSuite → HIS)

- **Propiedades obligatorias** validadas con `libFormato.verificarPropiedades()` antes de enviar al HIS.
- **Respuesta esperada: HTTP 202** con `estado.success === true`.
- **Todo error → custodia código "001"** para reintento posterior por el SS custodia.

---

## 15. Escenarios y Casos de Error

### 15.1 Duplicados

| Escenario | Comportamiento |
|---|---|
| Admisión con episodio ya existente | Error: "Ya existe un registro de admisión con el ID..." |
| Cliente con RUT ya existente | Upsert: actualiza en lugar de crear |
| Factura POS con folio duplicado | Error: "La factura con folio X ya existe" |
| OV ya en cola autopicking (PENDIENTE) | `addToQueue` retorna registro existente sin duplicar |

### 15.2 Datos Incompletos

| Escenario | Comportamiento |
|---|---|
| HL7 sin segmento PID | Error: "No se han recibido datos del paciente" |
| Subsidiaria sin propiedades requeridas | `verificarPropiedades()` lanza excepción antes de llamar al HIS |
| Producto con valor neto cero | Retorna error 400 sin crear factura |
| Pre-factura sin `detallePrestaciones` | Error: "Se requiere detallePrestaciones" |

### 15.3 Error en Comunicación con HIS

| Escenario | Comportamiento |
|---|---|
| HIS responde código ≠ 202 | Error, custodia guardada con código "001" |
| OAuth2 falla | Error propagado al dominio, custodia registrada |
| Timeout HTTP | Error capturado, custodia registrada, reintento automático |

### 15.4 Autopicking

| Escenario | Comportamiento |
|---|---|
| Error procesando OV | `handleError()` → reintentos++; si < 3 queda PENDIENTE para reintento |
| 3 fallos consecutivos | Estado → ERROR permanente, requiere intervención manual |
| SS ya activo | No se lanza uno nuevo (verificación previa) |
| Línea no inventariable o provisional | Omitida silenciosamente |

### 15.5 POS Farmacia

| Escenario | Comportamiento |
|---|---|
| Error en journal de redondeo | Elimina factura, lanza excepción |
| Error en algún pago | Elimina factura, lanza excepción (rollback completo) |
| Cache no disponible | Error en `libCache.get*()`, falla la venta |
| Diferencia redondeo > 5 CLP | Registra error, no crea journal, continúa con pago |

### 15.6 Reintentos

| Escenario | Comportamiento |
|---|---|
| Error en notificación HIS | SS custodia lee registros "001", llama `reprocesarEvento()` |
| Reintento exitoso | Custodia actualizada a código "000" |
| Límite de reintentos alcanzado | Error permanente, requiere acción manual |

---

## 16. Matriz de Relaciones

```
CAPA              ARCHIVO                         DELEGA A / USA
─────────────────────────────────────────────────────────────────────────
INTERFACE         rl_crear_admision         →  dom_admision
                  rl_crear_cliente          →  dom_cliente
                  rl_pos_farmacia_venta     →  dom_venta
                  rl_crear_prefactura       →  dom_prefactura
                  rl_ov_agregar_lineas      →  dom_orden_venta
                  rl_actualizacion_estado   →  dom_orden_venta

DOMAIN            dom_admision              →  dao_cliente, dao_orden_venta, lib_mapeo_admision
                  dom_autopicking           →  dao_itemfulfillment, N/query, N/search
                  dom_cliente               →  dao_cliente, lib_mapeo, hl7_dao
                  dom_prefactura            →  dao_prefactura, dao_prefactura_queue, N/task
                  dom_orden_venta           →  dao_orden_venta, dao_file, N/task
                  dom_subsidiaria           →  dao_subsidiaria, lib_peticion, lib_custodia
                  dom_departamento          →  dao_departamento, lib_peticion, lib_custodia
                  dom_ubicacion             →  dao_ubicacion, lib_peticion, lib_custodia
                  dom_venta                 →  dao_create_invoice, dao_customer_payment,
                                               dao_journal_rounding, lib_cache
                  dom_precargas             →  dao_search_all_*, lib_cache

TRIGGER           ue_orden_venta            →  dom_autopicking, dao_autopicking_queue, N/task
                  ue_subsidiaria            →  dom_subsidiaria
                  ue_departamento           →  dom_departamento
                  ue_ubicacion              →  dom_ubicacion

SCHEDULED         ss_autopicking            →  dom_autopicking, dao_autopicking_queue
                  ss_custodia               →  dom_subsidiaria/departamento/ubicacion/pago
                  ss_precarga               →  dom_precargas, lib_cache

LIB               lib_peticion              →  amh.andessalud.cl (OAuth2 + HTTP)
                  lib_custodia              →  customrecord_2win_andessalud_custodia
                  lib_cache                 →  N/cache (TTL 1200s)
                  lib_hl7                   →  parser/builder HL7 v2.5
                  lib_mapeo_admision        →  segmentos HL7 → campos OV NetSuite
```

---

*Documentación generada automáticamente a partir del análisis de código fuente del proyecto 2WIN_INTEG. Versión 2.0 — incluye capa Domain completa.*
