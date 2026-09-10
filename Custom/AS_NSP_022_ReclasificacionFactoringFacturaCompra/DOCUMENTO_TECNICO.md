# Documento técnico — AS_NSP_022 Reclasificación de Factura de Compra a Factoring

## Objetivo técnico

Generar, desde la Factura de Compra, el asiento contable que traspasa la deuda del
proveedor original al factor, y dejarlo aplicado a la factura para que quede saldada. El
trabajo pesado no corre en el `beforeLoad`: el User Event valida y encola un Map/Reduce
que crea el asiento.

## Arquitectura

Tres componentes desplegados y tres capas internas:

| Componente | Tipo | Rol |
|---|---|---|
| `AS_FacturaFactoring_UE_2.1.js` | UserEventScript | pinta el botón, valida y decide si encola |
| `AS_FacturaFactoring_CS_2.1.js` | ClientScript | recarga la factura con la marca del botón |
| `AS_ReclasificacionFactoring_MPRD_2.1.js` | MapReduceScript | crea el asiento fuera de la vista |

El proyecto usa **entry point → handler → repository**. No usa capa `services/`: la regla
de negocio es corta y vive en los handlers.

Los dos handlers consumen `AS_FacturaCompraRepository`. El del User Event lo usa solo para
`obtenerSubsidiariasDelFactor`, la única validación de la pantalla que no se resuelve
leyendo campos del registro ya cargado.

El Client Script no tiene objeto en `src/Objects/`: se carga desde el User Event con
`form.clientScriptModulePath`, con la ruta definida en `CONSTANTES.CLIENT_SCRIPT`.

## Estructura de archivos

```
src/FileCabinet/SuiteScripts/AndesScripts/Transacciones/
  AS_FacturaFactoring_UE_2.1.js            entry point del UE: rutea a construirVista
  AS_FacturaFactoring_CS_2.1.js            el boton: desactiva y recarga con la marca
  AS_ReclasificacionFactoring_MPRD_2.1.js  entry point del MR: getInputData y map
  handlers/
    AS_FacturaFactoringHandler.js          todo lo que se ve en la pantalla de la factura
    AS_ReclasificacionFactoringHandler.js  la regla: si no hay diario, crearlo y escribirlo
  repositories/
    AS_FacturaCompraRepository.js          lee la factura, lee el factor, escribe el diario
    AS_AsientoFactoringRepository.js       unico punto que crea el asiento
  lib/
    AS_FactoringConstants.js               ids, textos, mensajes, roles autorizados
src/Objects/
  usereventscript/customscript_as_ue_factura_factoring.xml
  mapreduce/customscript_as_mr_reclasif_factoring.xml
```

## Flujo de ejecución

```
Usuario abre la factura (VIEW)
  │
  ▼
AS_FacturaFactoring_UE_2.1.js  beforeLoad
  └─ AS_FacturaFactoringHandler.construirVista
       ├─ ¿el tipo es VIEW?                        no ─▶ sale
       ├─ ¿el rol esta en ROLES_AUTORIZADOS?       no ─▶ sale, sin boton
       ├─ agregarBoton  (+ clientScriptModulePath)
       ├─ ¿la URL trae as_factoring=T?             no ─▶ sale, solo se pinto el boton
       ├─ ¿la factura ya tiene diario?             si ─▶ aviso con el enlace al asiento
       ├─ obtenerFaltantes                        hay ─▶ aviso con la lista de faltantes
       │    ├─ aprobacion, factoring, factor, hold  (del registro ya cargado)
       │    └─ AS_FacturaCompraRepository.obtenerSubsidiariasDelFactor
       │          record.load del VENDOR ─▶ sublist submachine
       └─ encolarDiario  ──────────────── no pudo ─▶ aviso de proceso ocupado
                │                            pudo ─▶ aviso de encolada
                ▼
     task.create MAP_REDUCE  custscript_as_rf_factura = id de la factura
                │
                ▼
AS_ReclasificacionFactoring_MPRD_2.1.js  getInputData → [idFactura] → map
  └─ AS_ReclasificacionFactoringHandler.reclasificarAFactoring
       ├─ AS_FacturaCompraRepository.obtenerDatosFactura
       ├─ ¿ya tiene diario?                        si ─▶ log YA_HECHA y sale
       ├─ AS_AsientoFactoringRepository.crearAsiento
       └─ AS_FacturaCompraRepository.escribirDiario
```

El botón no llama al servidor por su cuenta: `reclasificarFactoring` solo recarga la
misma URL agregando `as_factoring=T`, y el `beforeLoad` lee esa marca. Toda la decisión
vive del lado del servidor. (Fuente: comentario en `AS_FacturaFactoring_CS_2.1.js`)

## Componentes

### AS_FacturaFactoring_UE_2.1.js

UserEventScript, entry point `beforeLoad`. Solo rutea a
`AS_FacturaFactoringHandler.construirVista` dentro de un `try/catch` que loguea con el
título `FACTORING ERROR` y relanza el fallo.

### AS_FacturaFactoringHandler.js

Todo el comportamiento de la pantalla. Funciones, en el orden del archivo:

| Función | Responsabilidad |
|---|---|
| `construirVista(context)` | corta por tipo y por rol, pinta el botón y resuelve los cuatro finales |
| `agregarBoton(form)` | `form.addButton` y `form.clientScriptModulePath` |
| `obtenerFaltantes(factura)` | devuelve el arreglo de requisitos incumplidos |
| `encolarDiario(idFactura)` | `task.create` + `submit`; devuelve `false` si el proceso está ocupado |
| `armarMensajeSubsidiaria(factura)` | arma el texto del faltante de subsidiaria con el nombre del factor y el de la subsidiaria |
| `armarListaFaltantes(faltantes)` | arma el `<ul>` del mensaje |
| `armarEnlaceDiario(idDiario, nombreDiario)` | arma el `<a>` al asiento |
| `avisar(form, tipo, titulo, texto)` | `form.addPageInitMessage` |

El chequeo de rol está **antes** de leer el parámetro de la URL, no solo antes de pintar
el botón: así un rol no autorizado tampoco puede disparar la reclasificación pegando el
enlace con la marca a mano. (Fuente: versión anterior de este documento)

`obtenerFaltantes` lee el factor una sola vez al inicio y lo reutiliza: sirve para el
cuarto faltante y como condición para consultar el quinto. Sin factor no hay a quién
consultarle las subsidiarias, así que la consulta queda dentro de un `if (factor)`.

El enlace del aviso muestra el nombre del asiento, leído con
`getText({ fieldId: 'custbody_2win_factoring_journal' })`, y usa el id solo para el
`href`.

### AS_FacturaFactoring_CS_2.1.js

ClientScript. `pageInit` está vacío; la función real es `reclasificarFactoring`, que es
la que el botón invoca por `functionName`. Desactiva el botón para que un doble clic no
encole dos veces y recarga la URL limpiando la marca previa antes de volver a agregarla.

La marca se limpia ahí y no en `pageInit` porque en modo vista NetSuite solo ejecuta la
función del botón: `pageInit` no corre, y sin esa limpieza cada clic dejaría una marca
más pegada en la URL. (Fuente: versión anterior de este documento)

### AS_ReclasificacionFactoring_MPRD_2.1.js

MapReduceScript. `getInputData` devuelve un arreglo de un solo elemento con el id de
factura que llega en el parámetro `custscript_as_rf_factura`; `map` rutea al handler
dentro de un `try/catch` que loguea `FACTORING ERROR` y relanza.

### AS_ReclasificacionFactoringHandler.js

`reclasificarAFactoring(idFactura)`: carga los datos, corta si la factura ya tiene diario
(log `FACTORING YA RECLASIFICADA`), crea el asiento, lo escribe de vuelta en la factura y
emite el `log.audit` `FACTORING DIARIO CREADO` con folio, proveedor, factor, monto,
diario y usuario.

### AS_FacturaCompraRepository.js

- `obtenerDatosFactura(idFactura)` — `record.load` del `VENDOR_BILL`; devuelve en un solo
  objeto `factura`, `diario`, `folio`, `subsidiaria`, `proveedor`, `cuenta`, `moneda`,
  `tipoCambio`, `monto` y `factor`. Incluye el diario ya escrito porque de ese dato
  depende que el handler corte antes de crear uno repetido.
- `obtenerSubsidiariasDelFactor(idFactor)` — `record.load` del `VENDOR` y recorre la
  sublist `submachine` acumulando el campo de línea `subsidiary`. Devuelve un arreglo de
  ids **como texto**, para poder compararlos contra el `getValue({ fieldId: 'subsidiary' })`
  de la factura, que también devuelve texto. Sin esa conversión la comparación con
  `includes` nunca coincidiría y el faltante saltaría siempre.
- `escribirDiario(idFactura, idDiario)` — `record.submitFields` sobre
  `custbody_2win_factoring_journal`.

La cuenta que devuelve `obtenerDatosFactura` es la de la propia factura y no una fija: la
línea del debe tiene que golpear la misma cuenta por pagar donde quedó la deuda con el
proveedor, o la factura no se salda. (Fuente: versión anterior de este documento)

No sirve el campo `subsidiary` de la cabecera del proveedor, que es solo la principal: los
factores comparten la misma (Andes Salud SpA) y por lo tanto no distingue nada entre uno y
otro. Lo que decide es la sublist completa.

### AS_AsientoFactoringRepository.js

`crearAsiento(datos)` crea el `JOURNAL_ENTRY`, arma las dos líneas y devuelve el id.
`agregarLineaDebe` y `agregarLineaHaber` escriben la línea 0 y la línea 1
respectivamente. Después del `save` emite el `log.debug` `FACTORING ASIENTO` con la
composición del asiento.

## Objetos de NetSuite

| Objeto | scriptid | Detalle |
|---|---|---|
| User Event | `customscript_as_ue_factura_factoring` | archivo `AS_FacturaFactoring_UE_2.1.js` |
| Deployment del UE | `customdeploy_as_ue_factura_factoring` | `VENDORBILL`, `USERINTERFACE`, `allroles T`, `runasrole ADMINISTRATOR`, `RELEASED`, log `DEBUG` |
| Map/Reduce | `customscript_as_mr_reclasif_factoring` | archivo `AS_ReclasificacionFactoring_MPRD_2.1.js` |
| Parámetro del MR | `custscript_as_rf_factura` | tipo TEXT, etiqueta `Id Factura`; lo escribe el UE al encolar |
| Deployment del MR | `customdeploy_as_mr_reclasif_factoring` | `NOTSCHEDULED`, `buffersize 1`, `concurrencylimit 1`, `runasrole ADMINISTRATOR`, log `DEBUG` |

El deployment del Map/Reduce está en `NOTSCHEDULED` a propósito: no corre por calendario,
solo cuando el User Event lo encola con `task.submit`.

El `runasrole ADMINISTRATOR` del User Event es además lo que permite que
`obtenerSubsidiariasDelFactor` cargue el registro del proveedor: la validación funciona
aunque el usuario que mira la factura no tenga permiso de ver proveedores.

Features exigidas por `src/manifest.xml`: `SERVERSIDESCRIPTING` (requerida), `ACCOUNTING`
(requerida), `CRM` (no requerida).

> El proyecto **no crea ningún campo ni custom record**. Todos los campos y columnas que
> usa deben existir en la cuenta destino. (Fuente: comentario en `AS_FactoringConstants.js`)

## Datos utilizados

Campos de cabecera de la Factura de Compra (`CONSTANTES.CAMPOS`):

| Constante | Campo | Uso |
|---|---|---|
| `FACTORING` | `custbody_factoring` | requisito: debe estar marcado |
| `FACTOR` | `custbody_factoring_vendor` | entidad del haber, y sujeto de la validación de subsidiaria |
| `HOLD` | `paymenthold` | requisito: debe estar desmarcado |
| `DIARIO` | `custbody_2win_factoring_journal` | dónde se guarda el asiento generado |
| `TIPO_DIARIO` | `custbody_tipo_de_diario` | se escribe en el asiento |
| `APROBACION` | `approvalstatus` | requisito en la factura, y valor del asiento |

Columnas de línea del asiento (`CONSTANTES.COLUMNAS`), que son del `AS_NSP_003`:

| Constante | Columna | Uso |
|---|---|---|
| `APLICAR` | `custcol_as_aplicar_trans_relacionada` | se marca en la línea del debe |
| `TRANSACCION` | `custcol_as_transaccion_relacionada` | id de la factura, en la línea del debe |
| `FOLIO` | `custcol_2w_folio` | folio de la factura, en las dos líneas |

Marcar esas dos columnas es lo que hace que el `AS_NSP_003` aplique el diario a la
factura y la deje pagada: es la única diferencia con el flujo manual anterior. (Fuente:
versión anterior de este documento)

Del registro del proveedor de factoring (`record.Type.VENDOR`):

| Elemento | Valor | Uso |
|---|---|---|
| sublist | `submachine` | la pestaña Subsidiarias del proveedor, una línea por subsidiaria habilitada |
| campo de línea | `subsidiary` | id de cada subsidiaria habilitada |

La sublist incluye también la subsidiaria principal, que aparece ahí con su marca de
principal, así que no hace falta leer el campo de cabecera por separado.

Campos nativos leídos de la factura: `tranid`, `subsidiary`, `entity`, `account`,
`currency`, `exchangerate`, `total`.

## Lógica de negocio

En el User Event, en este orden y cortando en el primer no:

1. El tipo de evento tiene que ser `VIEW`.
2. El rol actual tiene que estar en `ROLES_AUTORIZADOS`.
3. Si la URL no trae `as_factoring=T`, solo se pinta el botón y termina.
4. Si `custbody_2win_factoring_journal` tiene valor, avisa que ya se reclasificó.
5. `obtenerFaltantes` arma la lista completa de una pasada — no corta en el primero — para
   que el usuario corrija todo junto en vez de descubrir un pendiente nuevo en cada
   intento. (Fuente: versión anterior de este documento)
6. Si no falta nada, encola. Si `submit` falla, avisa que el proceso está ocupado.

Los cinco requisitos que evalúa `obtenerFaltantes`:

| # | Condición | Mensaje |
|---|---|---|
| 1 | `approvalstatus` ≠ `'2'` | `SIN_APROBAR` |
| 2 | `custbody_factoring` sin marcar | `SIN_FACTORING` |
| 3 | `custbody_factoring_vendor` vacío | `SIN_FACTOR` |
| 4 | `paymenthold` marcado | `CON_HOLD` |
| 5 | la subsidiaria de la factura no está entre las del factor | `SIN_SUBSIDIARIA_*` |

El quinto solo se evalúa si hay factor, y es el único que sale de una consulta y no del
registro cargado. Su mensaje se arma en `armarMensajeSubsidiaria` concatenando
`SIN_SUBSIDIARIA_INICIO`, el `getText` del factor, `SIN_SUBSIDIARIA_MEDIO` y el `getText`
de la subsidiaria. No lleva punto final: los nombres de subsidiaria terminan en `S.A.` o
`SPA` y el punto quedaba duplicado.

El motivo del quinto requisito es de NetSuite, no del módulo: el asiento se crea en la
subsidiaria de la factura y NetSuite rechaza la línea del haber si el factor no está
habilitado en esa subsidiaria, con el error
`Ha ingresado un valor de campo no válido <id> para el siguiente campo: entity`. Sin esta
validación ese error solo aparecía dentro del Map/Reduce, después de que el usuario ya
había visto el aviso de que la reclasificación quedaba en proceso: la factura se quedaba
sin diario y nadie se enteraba.

En el Map/Reduce:

1. Vuelve a preguntar si la factura ya tiene diario, ahora contra el registro cargado. Es
   la segunda barrera contra el asiento duplicado.
2. Crea el asiento: dos líneas, siempre las mismas.
   - **Debe**: cuenta de la factura, proveedor original, `debit` = total, memo
     `Pago de factoring`, folio, `APLICAR` en true y `TRANSACCION` con el id de la factura.
   - **Haber**: cuenta `577`, factor, `credit` = total, memo
     `Traspaso de deuda al factoring`, folio.
3. Escribe el id del asiento en la factura.

El asiento se crea con `approvalstatus` = `2` (Aprobada) a propósito: uno en Pending
Approval no impacta el mayor, la factura seguiría abierta y el usuario vería una
reclasificación que no reclasificó nada. (Fuente: versión anterior de este documento)

## Hardcodes

| Valor | Dónde | Propósito | Impacto de cambiarlo |
|---|---|---|---|
| `'577'` (`CUENTA_FACTORING`) | `AS_FactoringConstants.js` | cuenta del haber, 2120005 Factoring por pagar | es un internal id de esta cuenta: en otro ambiente apunta a otra cuenta contable o no existe |
| `'3'` (`TIPO_DIARIO_FACTORING`) | `AS_FactoringConstants.js` | valor de `custbody_tipo_de_diario` | mismo riesgo por ambiente |
| `'2'` (`APROBACION_APROBADA`) | `AS_FactoringConstants.js` | requisito de la factura y estado del asiento | es el valor nativo de `approvalstatus`, estable entre cuentas |
| `[3, 1484, 1520, 1461]` (`ROLES_AUTORIZADOS`) | `AS_FactoringConstants.js` | roles que ven el botón | ids internos de roles: distintos en cada cuenta. El `3` es Administrator y está para pruebas en QA |
| `/SuiteScripts/AndesScripts/Transacciones/AS_FacturaFactoring_CS_2.1.js` | `AS_FactoringConstants.js` | ruta del Client Script | si se mueve o renombra el archivo, el botón deja de funcionar sin error visible |
| `line: 0` y `line: 1` | `AS_AsientoFactoringRepository.js` | el asiento son siempre dos líneas | agregar una tercera línea obliga a reindexar |
| `'submachine'` y `'subsidiary'` | `AS_FacturaCompraRepository.js`, `obtenerSubsidiariasDelFactor` | sublist y campo de línea de las subsidiarias del proveedor | si el `sublistId` no es ese, `getLineCount` no devuelve líneas, el arreglo queda vacío y el quinto faltante bloquea **todas** las reclasificaciones |
| `'subsidiary'` (cabecera de la factura) | `AS_FacturaFactoringHandler.js`, `obtenerFaltantes` | subsidiaria contra la que se compara | es un campo nativo, estable entre cuentas |

Los dos primeros están confirmados contra `customrecord_2w_parametros_facturacion`:
`andes_salud_factoring_cta_credito_diario` = 577 y `andes_salud_factoring_tipo_diario` = 3.
Hay que verificarlos antes de pasar a producción. (Fuente: versión anterior de este
documento)

## Configuración

### Configurable

Sin tocar código, en la cuenta: el nivel de log de cada deployment, el estado
`isdeployed` de los scripts, y **las subsidiarias habilitadas de cada proveedor de
factoring** — que es lo que determina con qué facturas puede usarse cada factor.

### Requiere código

Los roles autorizados, la cuenta de factoring, el tipo de diario, los textos de los
mensajes, la ruta del Client Script y la composición del asiento. Todo vive en
`AS_FactoringConstants.js` o en los repositories, y exige editar y desplegar.

## Despliegue

El `project.json` fija `defaultAuthId: "AndesSaludQa"`, así que un `project:deploy` sin
argumentos va a **QA**.

```bash
cd andes-salud/Custom/AS_NSP_022_ReclasificacionFactoringFacturaCompra

suitecloud project:validate --server
suitecloud project:deploy
```

Después de desplegar, en la cuenta:

- Verificar que el deployment del Map/Reduce quedó en `NOTSCHEDULED` y con
  `concurrencylimit 1`.
- Verificar los ids de `CUENTA_FACTORING`, `TIPO_DIARIO_FACTORING` y `ROLES_AUTORIZADOS`
  contra la cuenta destino antes de usarlo en producción.
- **Probar el quinto faltante en los dos sentidos**: una factura cuyo factor sí tenga esa
  subsidiaria (debe encolar) y una cuyo factor no la tenga (debe mostrar el aviso y no
  encolar). Si el aviso sale siempre, el `sublistId` `submachine` no es el correcto en esa
  cuenta.
- Bajar los deployments a nivel de log `AUDIT` cuando termine la etapa de pruebas: hoy los
  dos están en `DEBUG`.

## Restricciones técnicas

- **Una factura a la vez.** El `concurrencylimit` es 1 y el `getInputData` devuelve un
  solo elemento. Si llega una segunda tarea con el proceso corriendo, `submit` falla y el
  usuario recibe el aviso de proceso ocupado. Un deployment de Map/Reduce tampoco encola:
  ejecuta de a una, igual que un Scheduled. (Fuente: comentario en
  `AS_ReclasificacionFactoring_MPRD_2.1.js`)
- **El aviso de proceso en curso se dispara también con la propia factura.** La marca
  `as_factoring=T` queda en la URL después del clic, así que recargar la página vuelve a
  entrar por el camino de encolar. Si el Map/Reduce que se lanzó recién sigue corriendo, la
  factura todavía no tiene diario, pasa los cinco faltantes y el `submit` falla. Por eso el
  mensaje no afirma que sea otra factura: `encolarDiario` solo sabe que `submit` falló, no
  qué factura está procesando el Map/Reduce.
- **Payment Hold.** Con la factura retenida NetSuite no la lista en el selector de
  transacción relacionada, así que el diario no se puede aplicar. Por eso el User Event
  exige desmarcarlo antes de dejar encolar. (Fuente: versión anterior de este documento)
- **Multi-subsidiary vendor.** La relación proveedor–subsidiaria es de muchos a muchos y
  vive en la sublist `submachine`, no en un campo. Asignar la subsidiaria padre no habilita
  las hijas: cada una va explícita en la lista del proveedor.
- **El `record.load` del proveedor corre dentro del `beforeLoad`**, una vez por clic del
  botón. Son 10 unidades de governance sobre las 1.000 del contexto, y solo se ejecuta
  cuando la URL trae la marca — no en cada apertura de la factura.
- **El módulo depende del `AS_NSP_003`** para que el asiento quede aplicado: sin el
  comportamiento de las columnas `custcol_as_aplicar_trans_relacionada` y
  `custcol_as_transaccion_relacionada`, el asiento se crea pero la factura no se salda.
- El User Event corre solo en contexto `USERINTERFACE`.

## Manejo de errores

| Dónde | Qué hace |
|---|---|
| `AS_FacturaFactoring_UE_2.1.js` | `try/catch` en `beforeLoad`: `log.error` con título `FACTORING ERROR` y relanza |
| `AS_ReclasificacionFactoring_MPRD_2.1.js` | `try/catch` en `map`: `log.error` con título `FACTORING ERROR` y relanza |
| `encolarDiario` | atrapa el fallo de `submit`, lo registra como `log.audit` `FACTORING PROCESO OCUPADO` y devuelve `false` — no es un error, es concurrencia esperada |

`obtenerSubsidiariasDelFactor` no tiene manejo propio: si el `record.load` del proveedor
falla, la excepción sube al `try/catch` del entry point y el usuario ve el error de
NetSuite en lugar del banner. Es el mismo tratamiento que el resto de la pantalla.

No hay reintento automático: el usuario vuelve a presionar el botón.

## Logs y diagnóstico

| Título | Nivel | Cuándo |
|---|---|---|
| `FACTORING ENCOLADA` | audit | el UE encoló la tarea; incluye id de factura y de tarea |
| `FACTORING PROCESO OCUPADO` | audit | `submit` falló por concurrencia |
| `FACTORING YA RECLASIFICADA` | audit | el MR encontró la factura con diario y cortó |
| `FACTORING DIARIO CREADO` | audit | resumen del proceso: folio, proveedor, factor, monto, diario, usuario |
| `FACTORING DATOS` | debug | volcado de los campos leídos de la factura |
| `FACTORING ASIENTO` | debug | composición del asiento creado: subsidiaria, moneda, tipo de cambio, las dos líneas y la factura a la que se aplicó |
| `FACTORING ERROR` | error | fallo real en el UE o en el MR |

El quinto faltante **no emite log**: se resuelve en la pantalla y el usuario ve el motivo
en el banner. Si hace falta rastrearlo, el rastro es la ausencia de `FACTORING ENCOLADA`
para esa factura.

Para diagnosticar una reclasificación que no terminó: buscar `FACTORING ENCOLADA` con el
id de la factura, y después `FACTORING DIARIO CREADO` o `FACTORING ERROR` con ese mismo
id. Con el deployment en `AUDIT` quedan solo las cuatro primeras líneas; el detalle del
asiento exige `DEBUG`.

## Dependencias

Internas:

- `AS_NSP_003_AplicacionJournalFacturaCompra` — las dos columnas de aplicación.
- Campos `custbody_factoring`, `custbody_factoring_vendor` y
  `custbody_2win_factoring_journal`, y la columna `custcol_2w_folio`, que vienen del
  entorno 2WIN y ya existen en la cuenta.

Módulos de NetSuite: `N/record`, `N/task`, `N/runtime`, `N/ui/message`. Sin librerías de
terceros.

## Riesgos de modificación

- **La carpeta `Transacciones/` es compartida entre proyectos.** Un archivo con el mismo
  nombre en la misma ruta pisa el de otro proyecto al desplegar. El
  `AS_FacturaCompraRepository.js` de este proyecto convive con el
  `FacturaCompraRepository.js` del `AS_NSP_003`, que hace otra cosa: renombrar cualquiera
  de los dos al nombre del otro destruye uno de los dos. (Fuente: CLAUDE.md)
- **El quinto faltante falla bloqueando, no permitiendo.** Si `obtenerSubsidiariasDelFactor`
  devuelve un arreglo vacío por cualquier motivo — `sublistId` incorrecto, proveedor sin
  líneas, cambio de nombre de la sublist en una versión futura — `includes` da `false`
  siempre y **ninguna factura se puede reclasificar**. Es el punto más sensible del cambio.
- **La comparación es entre textos.** Si se quita el `String()` del `map`, o si algún día
  `getValue` sobre `subsidiary` devolviera número, la comparación deja de coincidir y se
  produce el mismo bloqueo total.
- **Cambiar la ruta o el nombre del Client Script** rompe el botón sin error visible: la
  ruta está escrita a mano en `CONSTANTES.CLIENT_SCRIPT`.
- **Tocar el orden de las líneas del asiento** obliga a revisar los índices `line: 0` y
  `line: 1` en las dos funciones que las escriben.
- **Mover el chequeo de rol de su posición actual** — antes de leer el parámetro de la
  URL — reabre el camino de disparar el proceso pegando el enlace con la marca.

## Decisiones de implementación

- **Map/Reduce en vez de Scheduled.** Un deployment de Scheduled atiende de a una tarea y
  dos usuarios reclasificando a la vez hacían fallar al segundo con `INPROGRESS`. (Fuente:
  comentario en `AS_ReclasificacionFactoring_MPRD_2.1.js`)
- **El proceso se encola, no corre en el `beforeLoad`.** La creación del asiento queda
  fuera del ciclo de la pantalla; el usuario recibe el aviso y recarga después.
- **El botón solo recarga la URL con una marca.** Toda la decisión está en el servidor: el
  Client Script no valida nada. (Fuente: comentario en `AS_FacturaFactoring_CS_2.1.js`)
- **La validación de subsidiaria vive en el User Event y no en el Client Script.** Es
  coherente con lo anterior: el CS no valida nada, y así el chequeo tampoco se puede
  saltear. El costo es que el usuario se entera al presionar el botón y no al elegir el
  factor.
- **Las subsidiarias del factor se leen de la sublist `submachine` con `record.load`, no
  con SuiteQL.** La sublist y su campo `subsidiary` se confirmaron inspeccionando un
  registro real de proveedor con el Netsuite Field Explorer. La alternativa era una
  consulta `N/query` contra `vendorsubsidiaryrelationship`, que no se pudo verificar
  contra la cuenta: se descartó por no poder comprobarla, no por un fallo observado.
- **La transacción relacionada se escribe por id y no por texto.** Con `setSublistText`
  fallaba con la interfaz en español: busca la etiqueta que se muestra y esa está
  traducida, así que `Bill #0002` no existía como opción. El id no depende del idioma.
  (Fuente: versión anterior de este documento)
- **El asiento se crea aprobado**, por el impacto en el mayor. (Fuente: versión anterior de
  este documento)
- **El control de rol es una lista blanca en el código** y no la audiencia del deployment:
  el deployment está con `allroles T` porque el User Event debe correr para todos —
  también para quien solo mira la factura — y es el código el que decide si pinta el botón.
- **Sin capa `services/`**: entry point delgado, handler y repositories, según las capas
  descritas en el CLAUDE.md. (Fuente: CLAUDE.md)

## Pendientes o deuda técnica

- **Cinco de los ocho `.js` perdieron su bloque `@description`**: los dos entry points de
  servidor no, pero sí `AS_FacturaFactoring_UE_2.1.js`, los dos handlers y los dos
  repositories. Conservan bloque solo `AS_FacturaFactoring_CS_2.1.js`,
  `AS_ReclasificacionFactoring_MPRD_2.1.js` y `AS_FactoringConstants.js`. Este documento
  pasó a ser la única fuente del porqué de varias decisiones; por eso las citas que antes
  apuntaban a esos comentarios ahora dicen *versión anterior de este documento*.
- **Está sin decidir si las listas de subsidiarias de los factores deben completarse.** Si
  un factor puede comprar deuda de cualquier subsidiaria del grupo, corresponde completar
  las listas de los proveedores de factoring y entonces el quinto faltante no se dispararía
  nunca. Si la restricción es real por contrato, el faltante es permanente y además
  convendría filtrar el selector de **Proveedor Factoring**, que hoy muestra todos los
  proveedores de la cuenta.
- **La marca `as_factoring=T` sobrevive en la URL después de encolar.** Recargar la página
  reintenta el encolado y produce el aviso de proceso en curso sobre la propia factura. El
  mensaje se redactó para cubrir ese caso, pero el reintento en sí sigue ocurriendo.
- `obtenerDatosFactura` lee cada campo dos veces: una para el `log.debug`
  `FACTORING DATOS` y otra para el objeto que devuelve.
- El `3` (Administrator) sigue en `ROLES_AUTORIZADOS`.
- Los dos deployments están en nivel de log `DEBUG`.
- `CUENTA_FACTORING` y `TIPO_DIARIO_FACTORING` están fijos en el código aunque los valores
  existen en `customrecord_2w_parametros_facturacion`: no se leen de ahí.
