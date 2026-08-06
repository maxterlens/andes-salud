# Restlet: `customscript_2win_rl_andessalud_ov_ag_li`

**Nombre:** `2win_rl_andessalud_ov_agregar_lineas`  
**Tipo:** RESTlet (SuiteScript 2.1)  
**Script principal:** `2win_rl_andes_salud_ov_agregar_lineas.js`  
**Deployment:** `customdeploy_2win_rl_andessalud_ov_ag_li` — Estado: `RELEASED`  
**Módulo de dominio:** `2win_dom_orden_venta.js`

---

## Descripción general

Este RESTlet actúa como punto de entrada HTTP `PUT` para recibir mensajes de **Andes Salud** relacionados con ingresos ambulatorios y hospitalarios. Procesa dos tipos de mensajes:

| Tipo de mensaje | Descripción |
|---|---|
| `SEND^IN` | Envío de cargos ambulatorios: agrega líneas a una Orden de Venta existente en NetSuite. |
| `SEND^REV` | Reversión de cargos: elimina líneas de una Orden de Venta existente en NetSuite. |

El flujo es **asíncrono**: el RESTlet recibe los datos, los persiste en el File Cabinet como JSON, los encola en un registro custom (`customrecord_2win_as_ag_lineas_queue`) y lanza (o delega en) un script **Map/Reduce** que realiza el procesamiento real.

---

## Estructura de capas

```
RESTlet (rl_andes_salud_ov_agregar_lineas.js)
  └── domain: 2win_dom_orden_venta.js
        ├── recepcionDatos()          ← único punto de entrada desde el RESTlet
        ├── validarMapearDatosSendIn()
        ├── validarMapearDatosSendRev()
        ├── agregarLineasRegistroNetsuite()
        └── eliminarLineasRegistroNetsuite()
              └── dao: 2win_dao_orden_venta.js
                    ├── agregarLineasRegistro()
                    └── eliminarLineasRegistro()
        └── dao: 2win_dao_agregar_lineas_queue.js
              ├── addToQueue()
              └── verificarMapReduceActivo()
  └── Map/Reduce: customscript_2win_mr_andessalud_ov_ag_li (SEND^IN)
  └── Map/Reduce: customscript_2win_mr_andessalud_ov_el_li (SEND^REV)
```

---

## Payload de entrada (PUT)

```json
{
  "tipoMensaje": "SEND^IN",
  "datos": {
    "FechaEnvio": "2025-03-18",
    "Pacientes": [
      {
        "IdPaciente": "621777",
        "Ficha": 78910,
        "Ingreso": 3,
        "cuentaPaciente": 78910003,
        "detallePrestaciones": [
          {
            "CrgCorrel": 0,
            "CodigoGrupoPrefactura": "02001502",
            "RutFinanciador": "184162865",
            "CodigoConvenio": "conv001",
            "NombreConvenio": "Convenio General",
            "NombrePaquete": "NombrePaquete",
            "CodigoPaquete": "CodigoPaquete",
            "MontoAfecto": 100,
            "MontoExento": 1000,
            "Iva": 19,
            "Total": 1119,
            "CodServicio": "400"
          }
        ],
        "RutEmpresa": "1",
        "TipoAtencion": "A",
        "FechaEnvio": "20250818",
        "FechaAlta": "20250818"
      }
    ]
  }
}
```

---

## Respuesta HTTP

```json
{
  "tipoMensaje": "SEND^IN",
  "estado": {
    "success": true,
    "codigo": 200,
    "mensaje": "Batch de cargos ambulatorios recibido correctamente",
    "tipo_proceso": "ingresos ambulatorios",
    "id_proceso": "2dacf0fa-f443-4a4f-8c4e-c6fb70efcacf"
  }
}
```

> **Nota:** el RESTlet responde inmediatamente al confirmar la recepción. El procesamiento real ocurre de forma asíncrona en el Map/Reduce.

---

## Función de entrada del RESTlet: `_put(context)`

**Archivo:** `2win_rl_andes_salud_ov_agregar_lineas.js`

| Parámetro | Tipo | Descripción |
|---|---|---|
| `context` | `object` | Cuerpo de la petición PUT deserializado por NetSuite. |

Delega inmediatamente en `domOrdenVenta.recepcionDatos(context)` y retorna su resultado como JSON string. Cualquier excepción se relanza como error con `notifyOff: true`.

---

## Funciones del dominio (`2win_dom_orden_venta.js`)

### `recepcionDatos(parametro)`

Función raíz del flujo. Es la única función expuesta al RESTlet.

**Pasos:**

1. Genera un `UUID` único (con `N/crypto/random`) y verifica que no exista ya un archivo con ese nombre en la carpeta configurada.
2. Lee el parámetro de operación `id_carpeta_archivos_ingresos_ambulatorios_hospitalizados` desde `daoParametrosOperacion.getParam()` para saber en qué carpeta del File Cabinet guardar el archivo.
3. Valida que `parametro.tipoMensaje` sea `SEND^IN` o `SEND^REV`. Si no lo es, lanza excepción con el mensaje `tipoMensaje: X no es válido`.
4. Valida que existan `datos.FechaEnvio` y al menos un elemento en `datos.Pacientes`. Si no hay datos, retorna respuesta con éxito pero con mensaje `"Archivo recibido pero no se encontraron datos para procesar"`.
5. Crea un archivo JSON en el File Cabinet (`daoFile.crearArchivo`) usando el UUID como nombre.
6. Agrega el archivo a la cola de procesamiento (`daoAgregarLineasQueue.addToQueue`).
7. Verifica si ya hay un Map/Reduce activo (`daoAgregarLineasQueue.verificarMapReduceActivo`). Si no hay ninguno activo, lo lanza; si ya hay uno activo, lo deja correr (el Map/Reduce se auto-relanza al finalizar si quedan pendientes).
8. Crea registro de auditoría (`libAuditoria.crearReporteAuditoria`) y gestiona custodia (`libCustodia`).

**Map/Reduce lanzado según tipo de mensaje:**

| tipoMensaje | Script Map/Reduce lanzado | Parámetro enviado |
|---|---|---|
| `SEND^IN` | `customscript_2win_mr_andessalud_ov_ag_li` | `cuscript_mr_as_eliminar_datos_entrada` = JSON del archivo creado |
| `SEND^REV` | `customscript_2win_mr_andessalud_ov_el_li` | `custscript_mr_as_eliminar_datos_entrada` = JSON del archivo creado |

**En caso de error:** registra auditoría con estado `001`, setea `respuesta.estado.success = false` y `codigo = 400`, gestiona custodia y relanza el error.

---

### `obtenerUuid(idCarpeta)`

Genera un UUID único para identificar el proceso y el archivo JSON a crear.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `idCarpeta` | `number` | ID de la carpeta del File Cabinet donde se guardará el archivo. |

- Genera UUID con `N/crypto/random.generateUUID()`.
- Busca si ya existe un archivo con ese nombre en la carpeta (`daoFile.buscarArchivoPorNombre`).
- Si existe, se llama a sí misma recursivamente para generar un nuevo UUID.
- Retorna el UUID único generado.

---

### `validarMapearDatosSendIn(parametro)`

Valida y mapea los datos de un paciente para el flujo `SEND^IN`. Es invocada desde la etapa **map** del Map/Reduce.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parametro` | `object` | Datos de un paciente del batch (un elemento del array `Pacientes`). |

**Pasos:**

1. Valida propiedades obligatorias del paciente: `IdPaciente`, `Ficha`, `Ingreso`, `CuentaPaciente`, `RutEmpresa`, `TipoAtencion` usando `libFormato.verificarPropiedades`.
2. Extrae todos los `CodigoGrupoPrefactura` únicos de `detallePrestaciones` y realiza una **búsqueda masiva de productos** en una sola consulta SQL (`daoProducto.busquedaMasivaPorUpcCode`), generando un caché de productos.
3. Mapea los campos del cuerpo del ingreso ambulatorio (`libMapeoJson.mapearCamposCuerpoIngresoAmbulatorio`).
4. Para cada línea en `detallePrestaciones`:
   - Valida propiedades obligatorias: `CrgCorrel`, `CodigoGrupoPrefactura`, `RutFinanciador`, `CodigoConvenio`, `Total`, `CodServicio`.
   - Mapea la línea usando `libMapeoJson.mapearCamposLineaIngresoAmbulatorio` pasando el caché de productos.
   - Si una línea falla, se marca con `error` y `procesado: false` y se continúa con las siguientes.
5. Retorna `{ datosEntrada, camposMapeados }`.

Si `detallePrestaciones` está vacío, lanza excepción `"Se requiere detallePrestaciones"`.

---

### `validarMapearDatosSendRev(parametro)`

Valida y mapea los datos de un paciente para el flujo `SEND^REV`. Es invocada desde el Map/Reduce de eliminación de líneas.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parametro` | `object` | Datos de un paciente del batch. |

**Propiedades obligatorias del paciente:** `CuentaPaciente`, `RutEmpresa`.  
**Propiedades obligatorias por línea:** `CrgCorrel`.

El proceso es similar a `validarMapearDatosSendIn` pero con menos validaciones (solo se necesita el correlativo para identificar qué líneas eliminar). No realiza búsqueda masiva de productos.

---

### `agregarLineasRegistroNetsuite(parametro)`

Ejecuta la escritura en la Orden de Venta en NetSuite. Invocada desde la etapa **reduce** del Map/Reduce `SEND^IN`.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parametro` | `object` | `{ datosEntrada, camposMapeados }` resultado de `validarMapearDatosSendIn`. |

**Pasos:**

1. Llama a `daoOrdenVenta.agregarLineasRegistro(proceso)` con los campos mapeados.
2. Cruza los resultados del DAO con el `detallePrestaciones` original usando `custcol_2win_as_identificador_fila` === `CrgCorrel`.
3. Si una línea quedó con `procesado: false`, propaga el error al elemento original del array de prestaciones.
4. Retorna `{ datosEntrada, camposMapeados }` con el estado actualizado de cada línea.

---

### `eliminarLineasRegistroNetsuite(parametro)`

Ejecuta la eliminación de líneas en la Orden de Venta. Invocada desde el Map/Reduce `SEND^REV`.

Funciona de forma análoga a `agregarLineasRegistroNetsuite` pero llama a `daoOrdenVenta.eliminarLineasRegistro(proceso)`. El cruce de resultados es idéntico.

---

### `actualizarLineaRegistroNetsuite(parametro)`

Actualiza líneas específicas en una Orden de Venta (actualización de precio de producto).

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parametro` | `Array` | Array con un elemento que contiene `consumoMedicamentos.numeroCuentaPaciente` e `identificadorUnicoFila`. |

Requiere `consumoMedicamentos` en el payload. Llama a `daoOrdenVenta.actualizarLineasRegistro`. Gestiona custodia completa. Retorna respuesta con `tipoMensaje: "ActualizacionPrecioProducto"`.

---

### `actualizacionMasivaRegistros(parametro)`

Lanza un Map/Reduce para actualización masiva de estados de cuenta (`SEND^UPD`).

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parametro.gestionCuenta` | `Array` | Array de registros de gestión de cuentas. |

Genera un UUID, crea un archivo JSON en carpeta ID `1247` con la data, y lanza `customscript_2win_mr_andes_salud_ov_a_v` pasando el ID del archivo como parámetro `custscript_record_update_file_id`.

---

## Map/Reduce: `customscript_2win_mr_andessalud_ov_ag_li`

**Archivo:** `2win_mr_andes_salud_ov_agregar_lineas.js`  
**Deployment:** `customdeploy_2win_mr_andessalud_ov_ag_li`  
**Aplica a:** mensajes `SEND^IN` exclusivamente.

---

### Etapa `getInputData()`

Recupera los registros pendientes de la cola filtrados por `tipoMensaje = "SEND^IN"` con límite de 1 registro (`getPending(1, "SEND^IN")`).

Para cada registro de la cola:
- Carga el archivo JSON desde el File Cabinet (`daoFile.cargarArchivo`).
- Parsea el contenido.
- Extrae `tipoMensaje`, `FechaEnvio` y el array `Pacientes`.
- A cada paciente le añade metadatos de control: `queueRecordId`, `archivoId`, `folder`, `tipoMensaje`, `FechaEnvioA`, `uuid`.
- Lo serializa como string y lo agrega al array de salida.

Si un registro falla, llama a `daoAgregarLineasQueue.handleError()` y continúa con el siguiente.

**Retorna:** array de strings JSON, uno por paciente.

---

### Etapa `map(context)`

Recibe un paciente por iteración.

**Pasos:**

1. Parsea `context.value` al objeto paciente.
2. Valida que `tipoMensaje === "SEND^IN"`.
3. Llama a `domOrdenVenta.validarMapearDatosSendIn(datosEntrada)` para validar propiedades y mapear campos.
4. Escribe en el contexto con `context.write(CuentaPaciente, { datosEntrada, camposMapeados })`.

La **clave de agrupación es `CuentaPaciente`**, lo que garantiza que todos los pacientes de la misma cuenta se procesen secuencialmente en el mismo worker de `reduce`.

Si ocurre un error en la validación, **no relanza el error**: marca `datosEntrada.procesado = false`, guarda el mensaje de error y escribe igual el contexto para que `summarize` pueda reportarlo.

---

### Etapa `reduce(context)`

Recibe todos los payloads agrupados por `CuentaPaciente` (clave del `map`).

**Pasos:**

Para cada payload en `context.values`:
1. Parsea el JSON.
2. Si tiene `camposMapeados` (mapeo fue exitoso), llama a `domOrdenVenta.agregarLineasRegistroNetsuite(datos)` para escribir las líneas en la OV.
3. Si ocurre un error en la operación, marca `datosEntrada.procesado = false` y guarda el error.
4. Escribe el resultado con `context.write(CuentaPaciente, datosEntrada)`.

Si ocurre un **error crítico** (inesperado), itera sobre todos los valores del contexto, los marca con error y los escribe igualmente para que `summarize` pueda reportarlos.

---

### Etapa `summarize(summary)`

Consolida resultados y notifica a Andes Salud.

**Pasos:**

1. Lee parámetros de operación: `id_carpeta_archivos_ingresos_ambulatorios_hospitalizados` y `interfaces_andessalud_hc_url_base`.
2. Verifica errores en `inputSummary`, `mapSummary` y `reduceSummary`.
3. Itera sobre `summary.output` agrupando resultados por `queueRecordId` (un archivo por registro de cola).
4. Para cada registro de cola (`queueRecordId`):
   - Identifica si hubo errores a nivel de paciente o de prestación individual.
   - **Si tuvo errores:** llama a `daoAgregarLineasQueue.handleError(queueRecordId, mensaje)` y envía petición `PUT` a `{url_base}/process-batch` con `estado: "error"` y `codigo: 400`.
   - **Si procesó OK:** llama a `daoAgregarLineasQueue.markAsProcessed(queueRecordId)` y envía petición `PUT` a `{url_base}/process-batch` con `estado: "success"` y `codigo: 200`.
5. Valida la respuesta del callback: espera `tipoMensaje: "RECEPCION^EXITOSA"` y `estado.success: true` con `codigo: 200`.
6. Registra auditoría con el resumen de archivos procesados vs. con errores.
7. **Auto-relanzamiento:** al finalizar, consulta si quedan registros pendientes en la cola (`getPending(1)`). Si los hay, lanza nuevamente el mismo Map/Reduce para continuar procesando sin esperar al siguiente trigger externo.

---

## Cola de procesamiento (`customrecord_2win_as_ag_lineas_queue`)

DAO: `2win_dao_agregar_lineas_queue.js`

| Campo | Descripción |
|---|---|
| `custrecord_2win_alq_archivo_id` | ID del archivo JSON en el File Cabinet |
| `custrecord_2win_alq_folder` | ID de la carpeta del archivo |
| `custrecord_2win_alq_estado` | Estado: `1=PENDIENTE`, `2=PROCESADO`, `3=ERROR` |
| `custrecord_2win_alq_reintentos` | Contador de reintentos |
| `custrecord_2win_alq_tipo_mensaje` | Tipo: `SEND^IN` o `SEND^REV` |
| `custrecord_2win_alq_error` | Mensaje de error (si aplica) |
| `custrecord_2win_alq_fecha_procesado` | Fecha de procesamiento exitoso |

### Funciones del DAO de la cola

| Función | Descripción |
|---|---|
| `addToQueue(archivoInfo)` | Crea un registro en la cola con estado `PENDIENTE`. Requiere `archivoInfo.id`. |
| `getPending(limit, tipoMensaje)` | Busca registros con estado `PENDIENTE` y reintentos `<= MAX_RETRIES (0)`. Acepta filtro por `tipoMensaje`. |
| `markAsProcessed(queueRecordId)` | Actualiza estado a `PROCESADO` y guarda fecha de procesamiento. |
| `handleError(queueRecordId, msg)` | Incrementa reintentos. Si supera `MAX_RETRIES (0)`, pasa a estado `ERROR` permanente. |
| `verificarMapReduceActivo(deployId)` | Consulta `scheduledscriptinstance` buscando instancias del deployment en estado `PENDING` o `PROCESSING`. |
| `getQueueStats()` | Retorna conteo de registros por estado (pendiente, procesado, error, total). |
| `cleanOldProcessed(daysOld)` | Elimina registros con estado `PROCESADO` de más de X días de antigüedad (default: 30). |

> **MAX_RETRIES = 0:** si un registro falla, pasa directamente a estado `ERROR` sin reintento automático.

---

## Casuísticas

### Casuística 1: Recepción exitosa `SEND^IN` sin Map/Reduce activo

1. El sistema externo envía `PUT` con `tipoMensaje: "SEND^IN"` y datos válidos.
2. `recepcionDatos` genera UUID, crea archivo JSON en el File Cabinet.
3. Agrega registro a la cola con estado `PENDIENTE`.
4. `verificarMapReduceActivo` retorna `false` → lanza `customscript_2win_mr_andessalud_ov_ag_li`.
5. RESTlet responde `200` con `id_proceso = UUID`.
6. Map/Reduce procesa el batch: valida, mapea, agrega líneas en las OV correspondientes.
7. Actualiza estado de cola a `PROCESADO`, notifica a Andes Salud vía `PUT /process-batch`.

### Casuística 2: Recepción `SEND^IN` con Map/Reduce ya activo

1. El sistema externo envía un segundo batch mientras el Map/Reduce anterior aún está corriendo.
2. `recepcionDatos` genera UUID, crea archivo y agrega a la cola.
3. `verificarMapReduceActivo` retorna `true` → **no lanza** un nuevo Map/Reduce.
4. RESTlet responde `200`.
5. Cuando el Map/Reduce activo finaliza su `summarize`, detecta registros pendientes en la cola y **se auto-relanza** para procesar el nuevo batch.

### Casuística 3: Recepción `SEND^REV` (reversión de cargos)

1. El sistema externo envía `PUT` con `tipoMensaje: "SEND^REV"`.
2. `recepcionDatos` crea archivo JSON y agrega a la cola.
3. Verifica si hay un Map/Reduce de **eliminación** activo (`customdeploy_2win_mr_andessalud_ov_el_li`).
4. Si no hay activo, lanza `customscript_2win_mr_andessalud_ov_el_li`.
5. El Map/Reduce de eliminación valida con `validarMapearDatosSendRev` y llama a `eliminarLineasRegistroNetsuite`.

### Casuística 4: Datos inválidos en el payload

- `tipoMensaje` ausente o diferente a `SEND^IN`/`SEND^REV` → lanza excepción inmediata, responde `400` sin crear archivo ni encolar.
- `FechaEnvio` o `Pacientes` vacíos → responde `200` con mensaje `"Archivo recibido pero no se encontraron datos para procesar"`. No encola ni lanza Map/Reduce.

### Casuística 5: Error en validación de líneas dentro del Map/Reduce

- Si una `detallePrestacion` específica falta campos obligatorios (`CrgCorrel`, `CodigoGrupoPrefactura`, etc.), esa línea se marca con `procesado: false` y `error: "..."`.
- Las demás líneas del mismo paciente se procesan igualmente.
- En `summarize`, si el paciente tiene al menos una prestación con error, el registro de cola se marca con `handleError` y el callback a Andes Salud se envía con `estado: "error"` y `codigo: 400`.

### Casuística 6: Error al agregar línea en la Orden de Venta

- `daoOrdenVenta.agregarLineasRegistro` puede fallar por OV no encontrada, subsidiaria incorrecta, producto inexistente u otros.
- El `reduce` captura el error, marca `datosEntrada.procesado = false` y continúa con los demás valores del mismo `CuentaPaciente`.
- El `summarize` consolida el error y notifica al sistema externo.

### Casuística 7: UUID duplicado

- `obtenerUuid` verifica existencia del UUID en la carpeta. Si ya existe un archivo con ese nombre, se llama recursivamente para generar uno nuevo antes de continuar.

---

## Diagrama de flujo simplificado

```
Sistema Externo
     │
     │ PUT /restlet
     ▼
[RESTlet: _put()]
     │
     ▼
[recepcionDatos()]
     ├── Generar UUID
     ├── Crear archivo JSON en File Cabinet
     ├── addToQueue() → cola PENDIENTE
     │
     ├── [SEND^IN] verificarMapReduceActivo(ag_li)?
     │       NO → task.create(mr_ag_li).submit()
     │       SÍ → no hacer nada (se auto-relanza)
     │
     └── [SEND^REV] verificarMapReduceActivo(el_li)?
             NO → task.create(mr_el_li).submit()
             SÍ → no hacer nada
     │
     ▼
Respuesta 200 inmediata al sistema externo

          ─ ─ ─ Procesamiento asíncrono ─ ─ ─

[Map/Reduce: getInputData()]
     │  getPending(1, "SEND^IN") → lee cola
     │  carga archivo JSON del File Cabinet
     │  emite 1 string por paciente
     ▼
[map()] por paciente
     │  validarMapearDatosSendIn()
     │    └── busquedaMasivaPorUpcCode()
     │  context.write(CuentaPaciente, payload)
     ▼
[reduce()] por CuentaPaciente
     │  agregarLineasRegistroNetsuite()
     │    └── daoOrdenVenta.agregarLineasRegistro()
     │  context.write(CuentaPaciente, resultado)
     ▼
[summarize()]
     │  agrupa por queueRecordId
     │  markAsProcessed() o handleError()
     │  enviarRegistro(url/process-batch, resultado)
     └── getPending(1) → si hay más → relanzar MR
```

---

## Dependencias de módulos

| Módulo | Rol |
|---|---|
| `N/task` | Crear y lanzar tareas Map/Reduce |
| `N/file` | Crear archivos JSON en el File Cabinet |
| `N/crypto/random` | Generar UUIDs únicos |
| `N/cache` | Importado en el dominio (disponible para uso) |
| `N/runtime` | Obtener script ID y unidades de gobernanza restantes |
| `2win_dao_file` | Crear y cargar archivos del File Cabinet |
| `2win_dao_agregar_lineas_queue` | Gestión de la cola de procesamiento |
| `2win_dao_orden_venta` | Operaciones CRUD sobre Órdenes de Venta |
| `2win_dao_producto` | Búsqueda masiva de productos por UPC code |
| `2win_dao_static_params_operacion` | Lectura de parámetros de operación configurables |
| `2win_lib_auditoria` | Creación de reportes de auditoría y generación de tokens |
| `2win_lib_custodia` | Gestión de registros de custodia (idempotencia y trazabilidad) |
| `2win_lib_formato` | Validación de propiedades requeridas en objetos |
| `2win_lib_mapeo_json` | Mapeo de campos entre estructura Andes Salud y NetSuite |
| `2win_lib_peticion` | Ejecución de peticiones HTTP autenticadas al sistema externo |
