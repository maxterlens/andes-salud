# Documento técnico — AS_NSP_016 Alerta de OC pendiente de recepción

## Objetivo técnico

Map/Reduce agendado que busca las Órdenes de Compra en estado *Pending Receipt* con 5 o más
días desde la última aprobación, y por cada una envía un correo al proveedor con el PDF de la
orden adjunto.

Todo el comportamiento configurable vive en tres parámetros del deployment. El corte de 5 días
y el tope de destinatarios están en el código.

## Arquitectura

Dos capas: entry point delgado + handler. **No hay `services/` ni `repositories/`**: el volumen
de lógica no lo justifica y las búsquedas viven en el propio handler.

```
AS_AlertaOrdenCompraPendienteRecepcion_MPRD_2.1.js   entry point: los 3 stages + try/catch
   └─ handlers/AlertaOrdenCompraHandler.js           todo: busqueda, destinatarios, PDF, envio
        ├─ N/search   la OC, los contactos, el proveedor, la subsidiaria
        ├─ N/record   carga la OC para el render
        ├─ N/render   mergeEmail del correo y renderAsPdf del adjunto
        └─ N/email    el envio
```

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `AS_AlertaOrdenCompraPendienteRecepcion_MPRD_2.1.js` | Los tres stages. El `map` tiene el try/catch que captura la falla de una OC sin voltear la ejecución |
| `handlers/AlertaOrdenCompraHandler.js` | Todo lo demás: la búsqueda de entrada, la cascada de destinatarios, el PDF, el envío y el resumen |
| `src/Objects/email/custemailtmpl_as_email_purch_order_pend_receipt.xml` | Definición de la plantilla de correo |
| `src/Objects/email/...template.html` | El HTML del correo |
| `src/Objects/mapreduce/customscript_as_alerta_oc_pend_recep.xml` | El script, sus tres parámetros y el deployment |

## Flujo de ejecución

### `getInputData` — `buscarOrdenesPendientesRecepcion`

Devuelve un objeto `{ [id]: datosDeLaOC }`, no un array: cada entrada llega al `map` como un
par clave/valor.

### `map` — `procesarOrdenCompra`, una OC por invocación

```
obtenerParametros()                     los tres parametros del deployment
obtenerDestinatarios(oc)                cascada de tres origenes
destinatarios = correos.slice(0, 10)    tope de N/email.send
si no hay destinatarios                 → log.debug + write 'SIN_CORREO' + return
render.mergeEmail(plantilla, oc.id)     asunto y cuerpo con los datos de la transaccion
subject/body .replace(/{{DIAS}}/g, ...) el placeholder propio, que mergeEmail no resuelve
generarPdf(oc, plantillaPdf)            renderAsPdf de la OC
email.send(...)                         con relatedRecords.transactionId
log.debug 'Alerta enviada'              + write 'ENVIADO'
```

El `catch` del `map` registra `log.error` con el stack y escribe `'ERROR'`, para que la OC
aparezca en el resumen sin abortar el resto.

### `summarize` — `resumirEjecucion`

Agrupa la salida en `ENVIADO`, `SIN_CORREO` y `ERROR`, y emite **un solo `log.audit`** con los
cuatro totales y los ids accionables. Si `inputSummary.error` viene con algo, además emite un
`log.error` por la búsqueda fallida.

## Componentes

**`AS_AlertaOrdenCompraPendienteRecepcion_MPRD_2.1.js`** — MapReduceScript,
`customscript_as_alerta_oc_pend_recep`. Entry points `getInputData`, `map` y `summarize`. Los
tres delegan en el handler; el único código propio es el try/catch del `map`.

**`handlers/AlertaOrdenCompraHandler.js`** — expone tres funciones:
`buscarOrdenesPendientesRecepcion`, `procesarOrdenCompra` y `resumirEjecucion`. Internamente
tiene además `obtenerParametros`, `buscarContactosProveedor`, `correoDelProveedor`,
`obtenerDestinatarios` y `generarPdf`.

## Objetos de NetSuite

**`customscript_as_alerta_oc_pend_recep`** — AS Alerta OC Pendiente Recepcion.

| Parámetro | Script ID | Tipo | Obligatorio |
|---|---|---|---|
| Plantilla Correo | `custscript_as_aopr_plantilla_correo` | SELECT `-120` (Email Template) | No |
| Plantilla PDF/HTML | `custscript_as_aopr_plantilla_pdf` | SELECT `-387` | No |
| Autor del Correo | `custscript_as_aopr_autor_correo` | SELECT `-4` (Employee) | No |

> Los tres son `ismandatory F` pero **el envío no funciona sin ellos**: `email.send` exige
> `author`, y `mergeEmail` exige un `templateId` válido. El deployment se puede guardar vacío y
> falla recién en ejecución.

**Deployment `customdeploy_as_alerta_oc_pend_recep`:** `status NOTSCHEDULED`, `isdeployed T`,
`loglevel DEBUG`, `runasrole ADMINISTRATOR`, `concurrencylimit 1`, `buffersize 1`,
`queueallstagesatonce T`, `yieldaftermins 60`.

**`custemailtmpl_as_email_purch_order_pend_receipt`** — *Correo Alerta Orden de Compra Pendiente
de Recepción*, `recordtype TRANSACTION`. Asunto:
`Orden de Compra ${transaction.tranid} - Pendiente de Recepción ({{DIAS}} días)`.

**Features del manifest:** `SERVERSIDESCRIPTING`, `CUSTOMRECORDS`, `SUBSIDIARIES`,
`PURCHASEORDERS`, `ACCOUNTING`, `CRM` como requeridas; `ADVRECEIVING`, `MAILMERGE`,
`MULTILANGUAGE` como opcionales.

## Datos utilizados

| Campo | Origen | Uso |
|---|---|---|
| `custbody_as_ultimo_fecha_aprobador` | OC | Base del cálculo de días. **No es la fecha de la orden** |
| `custbody_as_correo_notif_email` | OC | Segundo origen de destinatario |
| `custbody_as_agrupar_contacto_prov` | OC | Checkbox que habilita el envío masivo a contactos |
| `customrecord_as_correo_notif_oc_subs` | custom record | Contactos por subsidiaria y proveedor |
| `custrecord_as_cn_subsidiaria`, `custrecord_as_cn_vendedor`, `custrecord_as_cn_correo` | ese record | Filtros y correo |
| `email` del Vendor | ficha del proveedor | Tercer origen, el último de la cascada |
| `address.address`, `taxidnum` de la Subsidiary | subsidiaria | Datos que el FTL del PDF no trae solo |

> **Cuatro de estos objetos no pertenecen a este proyecto.**
> `custbody_as_correo_notif_email`, `custbody_as_agrupar_contacto_prov` y
> `customrecord_as_correo_notif_oc_subs` se despliegan con **AS_NSP_007**. Ver Dependencias.

## Lógica de negocio

### La búsqueda de entrada

```js
type:    search.Type.PURCHASE_ORDER,
filters: [
    ['mainline', 'is',    'T'],          'AND',
    ['status',   'anyof', 'PurchOrd:B'], 'AND',
    ['formulanumeric: TRUNC({today}) - TRUNC({custbody_as_ultimo_fecha_aprobador})',
        'greaterthanorequalto', 5]
]
```

Tres cosas no obvias:

- **`PurchOrd:B` es *Pending Receipt***. Es un código de estado interno, no un texto: no se
  rompe si cambia el idioma de la cuenta.
- **`mainline is T`** deja una fila por orden, no una por línea.
- **El corte de 5 días está dentro del filtro**, no en un parámetro. La misma fórmula se repite
  como columna para poder informar los días en el correo.

Una OC sin `custbody_as_ultimo_fecha_aprobador` no entra: la resta da null y no cumple el
filtro.

### La cascada de destinatarios

`obtenerDestinatarios` decide en tres escalones y devuelve también el `origen`, que se registra
en el log:

```
si oc.agrupar:
    contactos = buscarContactosProveedor(oc)     por subsidiaria + proveedor, activos, con correo
    si hay                → origen 'contactos del proveedor (masiva)'
    si no hay             → log.debug y cae al siguiente escalon
si oc.correoOC            → origen 'Correo de Notificacion de la OC'
si no                     → correoDelProveedor(oc), origen 'email del proveedor'
```

El escalón 1 solo se evalúa si el checkbox está marcado. Que la masiva no encuentre contactos
**no corta el envío**: cae al correo de la OC.

### El tope de destinatarios

```js
const MAX_DESTINATARIOS = 10;
const destinatarios = correos.slice(0, MAX_DESTINATARIOS);
```

Es un límite de `N/email.send`, que cuenta `recipients + cc + bcc`. Cuando recorta, el log lo
dice: `(recortado de N, tope 10)`.

### El placeholder `{{DIAS}}`

`render.mergeEmail` resuelve las expresiones `${transaction.*}` de la plantilla, pero **no
conoce los días de atraso**, que son un cálculo de la búsqueda. Por eso la plantilla lleva el
marcador propio `{{DIAS}}` y el handler lo reemplaza a mano, en el asunto y en el cuerpo, con
`replace(/{{DIAS}}/g, oc.dias)`.

### El PDF

`generarPdf` carga la OC con `N/record`, crea el renderer con la plantilla del parámetro, y le
agrega un data source `subsidiary` con la dirección y el RUT de la subsidiaria, porque el FTL
estándar no los trae. La dirección se pasa con los saltos de línea convertidos a `<br/>`.

El archivo se nombra `<tranid>.pdf`.

## Hardcodes

| Valor | Dónde | Impacto de cambiarlo |
|---|---|---|
| `5` días | filtro de `buscarOrdenesPendientesRecepcion` | **El corte de la alerta.** Cambiarlo exige tocar código y desplegar. Aparece dos veces: en el filtro y en la columna |
| `'PurchOrd:B'` | mismo filtro | Estado *Pending Receipt*. Es un código interno, estable entre idiomas |
| `MAX_DESTINATARIOS = 10` | handler | Límite de `N/email.send`. Subirlo hace fallar el envío |
| `'{{DIAS}}'` | handler y plantilla HTML | Si se renombra en uno de los dos lados, el correo sale con el literal a la vista |
| `custbody_as_ultimo_fecha_aprobador` | filtro y columna | De qué fecha se cuentan los días |
| Ids de los campos y del custom record de contactos | handler | Deben coincidir con los del AS_NSP_007 en la cuenta |
| `.replace(/\r\n|\r|\n/g, '<br/>')` | `generarPdf` | Formato de la dirección en el PDF |

## Configuración

### Configurable

Los tres parámetros del deployment (plantilla de correo, plantilla PDF y autor), el horario del
schedule, el contenido de la plantilla de correo, y las filas del custom record de contactos.

### Requiere código

El corte de 5 días, el estado que se busca, el tope de destinatarios, el orden de la cascada de
destinatarios, y de qué campo sale la fecha base.

## Despliegue

```bash
cd andes-salud/Custom/AS_NSP_016_AlertaOrdenCompraPendienteRecepcion
suitecloud project:validate --server
suitecloud project:deploy
```

`project.json` fija `defaultAuthId: "AndesSaludQa"`: un `project:deploy` sin argumentos va a
**QA**.

> **El deployment viaja con `status NOTSCHEDULED`.** Cada vez que se despliega el proyecto, el
> script queda apagado y hay que volver a programarlo y ponerlo en *Scheduled* a mano. Es la
> causa más probable de "dejó de correr después de un pase".

Después de desplegar en una cuenta nueva:

1. Cargar los tres parámetros del deployment.
2. Programar el schedule y dejarlo en *Scheduled*.
3. Verificar que el AS_NSP_007 esté desplegado antes (ver Dependencias).

## Restricciones técnicas

| Restricción | Detalle |
|---|---|
| **10 destinatarios** | Límite de `N/email.send`, contando recipients + cc + bcc |
| **Un PDF por OC** | `record.load` + `renderAsPdf` por cada orden. Es lo más caro del `map` en governance |
| **Sin control de reenvío** | Manda el mismo correo cada día mientras la OC siga pendiente |
| **Días calendario** | La fórmula usa `TRUNC({today})`, sin calendario de hábiles |
| **Depende de un campo de otro proyecto** | Sin `custbody_as_ultimo_fecha_aprobador` la búsqueda no devuelve nada |
| **`concurrencylimit 1`, `buffersize 1`** | Procesamiento secuencial: con muchas OC la corrida se alarga |

## Manejo de errores

El `map` envuelve `procesarOrdenCompra` en try/catch: registra `log.error` con nombre, mensaje,
el valor de la OC y el stack, y escribe `'ERROR'` en la salida. **Una OC que falla no voltea la
ejecución**; el resto sigue y el resumen la reporta.

`summarize` revisa `context.inputSummary.error` y emite un `log.error` aparte si la búsqueda de
entrada falló.

**Una OC sin correo no es un error**: se registra como `debug`, se escribe `'SIN_CORREO'` y se
cuenta en el resumen.

## Logs y diagnóstico

| Nivel | Título | Cuándo |
|---|---|---|
| `debug` | `buscarOrdenesPendientesRecepcion` | Una vez: cuántas OC entraron |
| `debug` | `Alerta enviada \| <tranid>` | Una por OC enviada: destinatarios, origen, recorte y adjunto |
| `debug` | `OC sin correo \| <tranid>` | Una por OC sin destinatario |
| `debug` | `Masiva sin contactos \| <tranid>` | Cuando el checkbox está marcado pero no hay contactos |
| `error` | `Error al procesar la OC \| id <n>` | Solo si falla una OC |
| `audit` | `Alerta OC pendiente de recepcion - Resumen` | Una vez al final: totales + ids accionables |

El deployment está en `loglevel DEBUG`. **Con el deployment en AUDIT el log queda en una sola
línea por corrida**, que es el diseño buscado: el resumen trae los ids de las OC sin correo y
con error, que es lo accionable. Bajarlo a AUDIT es lo indicado para producción.

El campo `origen` del log de envío es la herramienta de diagnóstico principal: dice por cuál de
los tres escalones de la cascada salió el correo.

## Dependencias

**De otros proyectos.** El módulo lee cuatro objetos que **no despliega**:

| Objeto | Vive en |
|---|---|
| `custbody_as_correo_notif_email` | AS_NSP_007 |
| `custbody_as_agrupar_contacto_prov` | AS_NSP_007 |
| `customrecord_as_correo_notif_oc_subs` | AS_NSP_007 |
| `custbody_as_ultimo_fecha_aprobador` | AS_NSP_002, AS_NSP_007, AS_NSP_009 y este proyecto |

> El `manifest.xml` declara como dependencia solo `custbody_as_correo_notif_email` y
> `custbody_as_ultimo_fecha_aprobador`. **Faltan `custbody_as_agrupar_contacto_prov` y
> `customrecord_as_correo_notif_oc_subs`**, así que `project:validate` no los va a exigir y el
> despliegue puede pasar en una cuenta donde no existen. La falla aparecería recién en
> ejecución, al armar la búsqueda de contactos.

**De NetSuite:** `N/search`, `N/email`, `N/render`, `N/record`, `N/runtime`, `N/log`.

**AS_NSP_007 apunta a producción** (`AndesSaludProd`) y este proyecto a QA. Antes de un pase a
producción hay que confirmar que los tres objetos del 007 ya estén allá.

## Riesgos de modificación

**Cambiar el corte de 5 días** hay que hacerlo en dos lugares del mismo archivo: el filtro y la
columna de la fórmula. Si se cambia solo uno, la alerta se dispara con un criterio y reporta
otro número de días.

**Renombrar `{{DIAS}}`** exige tocar el handler y el HTML de la plantilla a la vez.

**Reordenar la cascada de destinatarios** cambia a quién le llega el correo sin ningún aviso:
las tres ramas devuelven un resultado válido.

**Redesplegar el proyecto** apaga el schedule, porque el deployment viaja en `NOTSCHEDULED`.

**Subir `MAX_DESTINATARIOS`** hace fallar `email.send` en las OC con muchos contactos.

## Decisiones de implementación

### Map/Reduce en vez de Scheduled Script

El proceso es una OC por vez, independiente de las demás, y una falla no debe voltear la
corrida. El `map` aísla cada orden con su try/catch y `summarize` consolida. Un Scheduled
Script habría necesitado su propio manejo de reinicio y governance.

### Toda la salida pasa por `context.write`

El `map` no acumula nada en memoria: escribe `'ENVIADO'`, `'SIN_CORREO'` o `'ERROR'` por clave,
y `summarize` los agrupa. Por eso el resumen puede listar los ids exactos sin volver a
consultar nada.

### El dato faltante no es un error

Una OC sin correo se registra en `debug` y se cuenta aparte de los errores en el resumen. Es la
política de logs del repositorio: `error` es solo para fallas reales.
(Fuente: CLAUDE.md, sección "Niveles de log")

### El `{{DIAS}}` a mano

Se eligió un placeholder propio en vez de pasar los días como otro data source porque
`render.mergeEmail` trabaja sobre la transacción y no admite fuentes adicionales como sí lo
hace `render.create()` para el PDF.

### La subsidiaria como data source del PDF

La plantilla estándar de OC no trae la dirección ni el RUT de la subsidiaria emisora. En vez de
mantener una plantilla propia, se inyectan esos dos datos con `addCustomDataSource` y se sigue
usando la plantilla que el cliente ya tiene.

## Pendientes o deuda técnica

**Autor del correo sin definir.** El parámetro apunta hoy a un usuario persona. La decisión
tomada fue crear un empleado tipo "Sistemas" con un buzón real del dominio corporativo — no uno
inventado — para que los rebotes y respuestas lleguen a algún lado y para no arriesgar rechazos
por SPF/DMARC al escribir a proveedores externos. **Falta crear ese empleado y cargarlo.**

**Falta verificar el checkbox `custbody_as_agrupar_contacto_prov`.** Hay que correr una OC
**sin** el check marcado y **con** Correo de Notificación cargado, y confirmar que el log diga
`Origen: Correo de Notificacion de la OC`. Si dijera `contactos del proveedor (masiva)`,
significa que `getValue` está devolviendo el string `'T'`/`'F'` en vez de un booleano y que
`if (oc.agrupar)` da verdadero siempre; se corrige comparando explícitamente.

**El manifest no declara dos de sus dependencias** — ver Dependencias.

**`loglevel DEBUG`** en el deployment. Bajar a `AUDIT` para producción.

**El corte de 5 días no es un parámetro.** Si el negocio pide cambiarlo, conviene subirlo a un
`scriptcustomfield` antes que editar el filtro.

**Sin control de reenvío.** No hay registro de a qué OC ya se le avisó, así que el proveedor
recibe el mismo correo todos los días.
