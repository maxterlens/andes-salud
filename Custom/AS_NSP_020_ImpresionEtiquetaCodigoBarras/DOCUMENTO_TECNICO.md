# Documento técnico — AS_NSP_020 Impresión de Etiqueta con Código de Barras

## Objetivo técnico

Imprimir una etiqueta con el nombre y el código de barras de un artículo, desde la ficha del
artículo en NetSuite, en una impresora térmica Zebra conectada por USB a la computadora del
usuario.

Las medidas de la etiqueta no están en el código: viven en el custom record
`customrecord_as_formato_etiqueta`, una fila por cada combinación de modelo de impresora y
tamaño de rollo.

## Arquitectura

Tres capas del lado servidor (entry point → handler → repository) y, del lado navegador, un
Client Script que orquesta tres librerías propias más el SDK de Zebra. **No hay capa
`services/`**: la lógica de negocio del proyecto es la construcción del ZPL, que vive en su
propia librería.

```
Articulo (vista)
   │
   ▼
AS_EtiquetaArticulo_UE_2.1.js          entry point: beforeLoad + try/catch + log.error
   └─ handlers/AS_EtiquetaArticuloHandler.js    arma la vista: campos ocultos y boton
        └─ repositories/AS_FormatoEtiquetaRepository.js   N/search al custom record
   │
   │  (campos ocultos con los datos ya resueltos)
   ▼
AS_EtiquetaArticulo_CS_2.1.js          orquesta la impresion al hacer clic
   ├─ lib/AS_EtiquetaSelector.js       ventana de seleccion (subsidiaria, formato, cantidad)
   ├─ lib/AS_EtiquetaZpl.js            arma el string ZPL
   └─ lib/AS_EtiquetaImpresora.js      habla con Browser Print
        └─ lib/LibreriaZebra/          SDK oficial de Zebra, sin modificar
   │
   ▼
Browser Print (app local)  →  Zebra (USB)
```

## Estructura de archivos

Todo bajo
`src/FileCabinet/SuiteScripts/AndesScripts/Proyectos/ImpresionEtiquetaCodigoBarras/`.

| Archivo | Responsabilidad |
|---|---|
| `AS_EtiquetaArticulo_UE_2.1.js` | Solo `beforeLoad`, try/catch y `log.error`. Delega todo al handler |
| `handlers/AS_EtiquetaArticuloHandler.js` | Oculta el botón nativo, agrega los campos ocultos y el botón propio |
| `repositories/AS_FormatoEtiquetaRepository.js` | Único que toca datos: busca los formatos en el custom record |
| `AS_EtiquetaArticulo_CS_2.1.js` | Al hacer clic: lee los campos ocultos, abre el selector, arma el ZPL, imprime |
| `lib/AS_EtiquetaSelector.js` | Ventana modal armada con DOM directo, con los tres campos |
| `lib/AS_EtiquetaZpl.js` | Recibe datos + formato + cantidad, devuelve el string ZPL. No conoce NetSuite |
| `lib/AS_EtiquetaImpresora.js` | `BrowserPrint.getDefaultDevice()` y `device.send()`, envueltos en Promises |
| `lib/AS_EtiquetaArticuloConstants.js` | Ids de campos, del custom record, textos y mensajes |
| `lib/LibreriaZebra/BrowserPrint-3.1.250.min.js` | SDK de Zebra, sin modificar |
| `lib/LibreriaZebra/BrowserPrint-Zebra-1.1.250.min.js` | SDK de Zebra, sin modificar |

## Flujo de ejecución

**Al abrir el artículo** — servidor, `beforeLoad`, solo en `context.UserEventType.VIEW`:

1. `ocultarBotonNativo` oculta el botón nativo `printlabel`. Va en su propio try/catch y
   devuelve `true`/`false`: si el botón no existe en ese tipo de registro, no interrumpe.
2. `agregarDatosArticulo` crea dos campos ocultos `TEXT` con `itemid` y `upccode`.
3. `agregarSubsidiariaArticulo` crea un campo oculto con la subsidiaria del artículo. `subsidiary`
   puede venir como array: **se toma el primer elemento**.
4. `agregarConfiguracionEtiqueta` llama al repository y guarda **el resultado completo como JSON**
   en un campo oculto `LONGTEXT`.
5. `agregarBotonEtiqueta` agrega el botón y asigna `form.clientScriptModulePath`.
6. Un `log.debug` de resumen con lo que quedó cargado.

**Al hacer clic** — navegador:

1. `obtenerDatosArticulo` lee los tres campos ocultos. **No hay ninguna llamada al servidor.**
2. Si no hay `upc`, avisa y corta.
3. `obtenerConfiguracion` hace `JSON.parse` del campo `LONGTEXT`. Si no hay formatos, avisa y corta.
4. `etiquetaSelector.elegir` abre la ventana y devuelve una Promise: el formato elegido y la
   cantidad, o `null` si se cancela.
5. `etiquetaZpl.construir` arma el string ZPL.
6. `etiquetaImpresora.imprimir` lo manda a Browser Print y muestra el resultado.

## Componentes

**`AS_EtiquetaArticulo_UE_2.1.js`** — UserEventScript, `customscript_as_ue_etiqueta_articulo`.
Entry point `beforeLoad`. Filtra por tipo VIEW, delega en el handler, y en el `catch` emite
`log.error` con el id del artículo y vuelve a lanzar la excepción.

**`handlers/AS_EtiquetaArticuloHandler.js`** — expone `prepararVista(form, articulo)`. Depende
de `N/ui/serverWidget`, las constantes y el repository. No devuelve nada: su efecto es sobre el
`form`.

**`repositories/AS_FormatoEtiquetaRepository.js`** — expone `buscarFormatos()`. Depende de
`N/search` y las constantes. Devuelve un array de objetos con las medidas ya convertidas a
número.

**`AS_EtiquetaArticulo_CS_2.1.js`** — ClientScript. Expone `imprimirEtiquetaArticulo`, que es
`async` y es el `functionName` del botón. Depende de `N/currentRecord`, las dos librerías del
SDK de Zebra y las cuatro librerías propias.

**`lib/AS_EtiquetaSelector.js`** — expone `elegir(formatos, subsidiariaArticulo)`, que devuelve
una Promise. Construye la ventana con `document.createElement` y estilos inline.

**`lib/AS_EtiquetaZpl.js`** — expone `construir(datos, formato, cantidad)`. Sin dependencias:
es una función pura de string. Se puede probar fuera de NetSuite.

**`lib/AS_EtiquetaImpresora.js`** — expone `imprimir(zpl)`, `async`. Usa el global
`BrowserPrint` que dejó cargado el SDK.

## Objetos de NetSuite

**`customscript_as_ue_etiqueta_articulo`** — AS Etiqueta Articulo UE. Tres deployments, uno por
tipo de artículo:

| Deployment | Record type |
|---|---|
| `customdeploy_as_ue_etiq_art_inv` | `INVENTORYITEM` |
| `customdeploy_as_ue_etiq_art_lot` | `LOTNUMBEREDINVENTORYITEM` |
| `customdeploy_as_ue_etiq_art_ser` | `SERIALIZEDINVENTORYITEM` |

Los tres con la misma configuración: `status RELEASED`, `isdeployed T`, `allroles T`,
`allemployees T`, `alllocalizationcontexts T`, `executioncontext USERINTERFACE`,
`runasrole ADMINISTRATOR` y **`loglevel DEBUG`**.

**`customrecord_as_formato_etiqueta`** — AS Configuracion Etiqueta Impresora. Ver el detalle en
Datos utilizados.

**Features requeridas** (`src/manifest.xml`): `SERVERSIDESCRIPTING`, `CUSTOMRECORDS`,
`SUBSIDIARIES`, `UNITSOFMEASURE`.

## Datos utilizados

**Campos que se leen del artículo:** `itemid`, `upccode`, `subsidiary`.

**Campos ocultos que comunican servidor → navegador**, todos creados en el `beforeLoad`:

| Campo | Tipo | Contenido |
|---|---|---|
| `custpage_etiqueta_nombre` | TEXT | `itemid` |
| `custpage_etiqueta_upc` | TEXT | `upccode` |
| `custpage_etiqueta_subsidiaria` | TEXT | primer elemento de `subsidiary` |
| `custpage_etiqueta_configuracion` | LONGTEXT | JSON con todos los formatos activos |

**Custom record `customrecord_as_formato_etiqueta`.** `accesstype NONENEEDED`
(No Permission Required), `allowuiaccess T`, `includename T`. El campo **Name** nativo es lo que
se muestra en el desplegable. Todos los campos son obligatorios salvo `predeterminado`.

| Campo | Tipo | Uso en el ZPL |
|---|---|---|
| `custrecord_as_fe_subsidiaria` | Select (Subsidiary, `-117`) | Agrupa el desplegable. No entra al ZPL |
| `custrecord_as_fe_dpi` | Integer | **No se lee por código.** Informativo, para calcular los demás |
| `custrecord_as_fe_ancho` | Integer | `^PW` y ancho del `^FB` |
| `custrecord_as_fe_alto` | Integer | `^LL` |
| `custrecord_as_fe_y_nombre` | Integer | `^FO0,Y` del nombre |
| `custrecord_as_fe_fuente_nombre` | Integer | `^A0N,h,w` |
| `custrecord_as_fe_lineas_nombre` | Integer | líneas del `^FB` |
| `custrecord_as_fe_y_codigo` | Integer | `^FO x,Y` del código |
| `custrecord_as_fe_alto_codigo` | Integer | alto en `^BY` y `^BCN` |
| `custrecord_as_fe_modulo` | Integer | módulo en `^BY` |
| `custrecord_as_fe_predeterminado` | Checkbox | **Ningún código lo lee.** Ver Pendientes |

## Lógica de negocio

### La única búsqueda del proyecto

En `repositories/AS_FormatoEtiquetaRepository.js`, corre en el servidor durante el `beforeLoad`:

```js
search.create({
    type   : 'customrecord_as_formato_etiqueta',
    filters: [['isinactive', 'is', 'F']],
    columns: ['name', 'custrecord_as_fe_subsidiaria', ...las 8 medidas],
})
```

Tres cosas no obvias:

- **Trae todos los formatos activos, sin filtrar por subsidiaria ni por usuario.** El filtrado
  por subsidiaria ocurre después, en el navegador, sobre el JSON ya cargado. Se hizo así para no
  depender de que los empleados tengan bien asignada su subsidiaria, y para que un usuario de
  una sucursal pueda imprimir en otra si hace falta.
  (Fuente: documentación previa del proyecto)
- **Del campo subsidiaria se leen los dos valores:** `getValue` da el id interno (para agrupar y
  comparar) y `getText` el nombre visible (para el desplegable).
- **Los campos INTEGER vuelven como string.** Por eso cada medida pasa por `Number()` explícito
  al armar el objeto. Sin eso, el ZPL recibiría concatenaciones en vez de números.

Ni `custrecord_as_fe_dpi` ni `custrecord_as_fe_predeterminado` están entre las columnas: no
llegan al navegador.

### Preselección de la subsidiaria

En `lib/AS_EtiquetaSelector.js`:

1. Se asigna `selectorSubsidiaria.value = subsidiariaArticulo`.
2. Si esa subsidiaria no está entre las que tienen formato, el `value` queda vacío y se cae a
   `selectedIndex = 0`, la primera de la lista.

El objetivo es que la ventana **siempre abra con un formato cargado y listo para imprimir**. Un
artículo compartido entre varias subsidiarias tiene un `subsidiary` múltiple y se toma el
primero, que suele ser la matriz — de ahí que la caída a "la primera configurada" sea el caso
habitual, no la excepción. (Fuente: documentación previa del proyecto)

### Centrado del código de barras

```js
const ancho = formato.modulo * (11 * (upc.length + 3) + 13);

return Math.max(0, Math.round((formato.ancho - ancho) / 2));
```

Es el ancho teórico de un Code 128: 11 módulos por carácter, más 3 caracteres de control
(start, checksum, stop) y 13 módulos del patrón de terminación.

**Está en código y no en el record a propósito:** depende del largo del UPC de cada artículo, así
que no es un valor configurable sino un cálculo por etiqueta. El `Math.max(0, ...)` evita una
posición negativa cuando el código no cabe — en ese caso arranca pegado al borde izquierdo y
**se recorta por la derecha sin aviso**. Con `modulo = 2` y ancho 479, el tope es alrededor de
17 caracteres de UPC.

### Validación de la cantidad

```js
const cantidad = Math.floor(Number(campoCantidad.value));

if (!cantidad || cantidad < 1) { ... }
```

El `Math.floor` no es adorno: `^PQ2.5` es ZPL inválido y la impresora puede descartar el trabajo
entero. La condición cubre vacío, texto, cero, negativos y decimales.

### Truncado silencioso del nombre

El `^FB` de ZPL acomoda el texto en la cantidad de líneas indicada y **descarta lo que sobra sin
error ni marca visual**. No hay validación de largo en el código: si el nombre no entra, la
etiqueta sale cortada y nadie se entera hasta verla impresa.

### El ZPL generado

```
^XA^CI28^PW479^LL320
^FO0,85^A0N,26,26^FB479,2,0,C,0^FD<nombre>\&^FS
^FO51,145^BY2,3,70^BCN,70,Y,N,N^FD<upc>^FS
^PQ<cantidad>,0,1,Y
^XZ
```

| Comando | Qué hace |
|---|---|
| `^CI28` | Codificación UTF-8, para tildes y ñ |
| `^PW` / `^LL` | Ancho y alto de la etiqueta |
| `^FO x,y` | Posición del elemento |
| `^A0N,h,w` | Fuente escalable, alto y ancho |
| `^FB ancho,lineas,0,C,0` | Bloque de texto: acomoda y centra. **Lo que pasa de `lineas` no se imprime** |
| `^BY modulo,3,alto` | Parámetros del código de barras |
| `^BCN,alto,Y,N,N` | Code 128. La `Y` imprime el número debajo |
| `^PQ n,0,1,Y` | Cantidad de copias. Una sola pasada, no N trabajos |

## Hardcodes

Lo que **no** se configura desde NetSuite. Si algo de esto cambia, hay que tocar código y
desplegar. Está todo en `lib/AS_EtiquetaArticuloConstants.js` salvo donde se indique.

| Valor | Dónde | Impacto de cambiarlo |
|---|---|---|
| `CLIENT_SCRIPT` (ruta absoluta del CS) | Constantes | **Si se renombra o mueve la carpeta del proyecto, se rompe.** Es ruta absoluta a propósito, ver Decisiones |
| Rutas del SDK con número de versión | `define([...])` del CS | Al actualizar el SDK de Zebra hay que cambiar el nombre en el `define` **y** subir los archivos nuevos |
| `BOTON_NATIVO = 'printlabel'` | Constantes | Id del botón nativo que se oculta. Si Oracle lo renombra, el botón nativo reaparece |
| `CAMPOS.NOMBRE = 'itemid'` | Constantes | De dónde sale el nombre. Cambiar aquí para imprimir `displayname` u otro campo |
| `CAMPOS.UPC = 'upccode'` | Constantes | De dónde sale el código de barras |
| `CAMPO_SUBSIDIARIA.ORIGEN = 'subsidiary'` | Constantes | Campo múltiple; **se toma el primero** de la lista |
| `CANTIDAD_INICIAL = 1` | Constantes | Valor con el que abre el campo cantidad |
| Ids `custpage_*` | Constantes | Campos ocultos que comunican UE → CS. Solo importa que coincidan entre ambos |
| Scriptids del custom record y sus campos | Constantes | Deben coincidir exactamente con los del record en la cuenta |
| Simbología **Code 128** (`^BCN`) | `AS_EtiquetaZpl.js` | Otra simbología (EAN-13, QR) requiere otro comando ZPL |
| Ratio `3` del `^BY` | `AS_EtiquetaZpl.js` | Relación barra ancha/angosta. Casi nunca se toca |
| `^CI28` (UTF-8) | `AS_EtiquetaZpl.js` | Sin esto, tildes y ñ salen mal |
| Fórmula de centrado `11 * (largo + 3) + 13` | `AS_EtiquetaZpl.js` | Ancho teórico de Code 128. Cambia si se cambia de simbología |
| `^PQ n,0,1,Y` | `AS_EtiquetaZpl.js` | Pausa y corte entre copias. El `Y` es corte al final |
| `^FO0,` del nombre | `AS_EtiquetaZpl.js` | El nombre siempre arranca en x=0; se centra con el `^FB`, no con la posición |
| Estilos de la ventana modal | `AS_EtiquetaSelector.js` | CSS inline. No hay hoja de estilos |
| `127.0.0.1:9100` | **Dentro del SDK de Zebra** | No es nuestro. Si Zebra cambia el puerto, viene en la versión nueva del SDK |

## Configuración

### Configurable

Sin tocar código ni desplegar, editando un registro de `customrecord_as_formato_etiqueta`:
ancho y alto de la etiqueta, posición y tamaño del nombre, cantidad de líneas, posición, alto y
grosor del código de barras, y a qué subsidiaria pertenece cada formato.

Agregar un modelo de impresora o un tamaño de rollo nuevo es crear una fila más.

### Requiere código

Todo lo de la tabla de Hardcodes: de qué campo del artículo salen el nombre y el UPC, la
simbología del código de barras, el layout general (qué elementos lleva la etiqueta y en qué
orden), los textos de la ventana y los mensajes de error, y el aspecto de la ventana modal.

## Despliegue

```bash
cd andes-salud/Custom/AS_NSP_020_ImpresionEtiquetaCodigoBarras
suitecloud project:validate --server
suitecloud project:deploy
```

`project.json` fija `defaultAuthId: "AndesSaludQa"`: un `project:deploy` sin argumentos va a
**QA**, no a producción.

Se despliegan el User Event con sus tres deployments y el custom record con sus once campos.

Después de desplegar en una cuenta nueva:

1. Crear al menos una fila del custom record, o el botón avisa que no hay formato.
2. Verificar el Access Type del record.
3. En cada PC que imprima: instalar Browser Print, elegir Default Device, y dejar que se agregue
   el dominio a Accepted Hosts en el primer uso.

> **SDF no borra archivos.** Si se renombra o elimina un archivo del proyecto, la versión vieja
> queda huérfana en el File Cabinet y hay que borrarla a mano.

## Restricciones técnicas

| Restricción | Detalle |
|---|---|
| **Una app local por PC** | Un navegador no puede abrir un socket TCP crudo contra el puerto 9100 de la impresora: solo HTTP/HTTPS o WebSocket. Browser Print es el puente, y no se puede compartir por red |
| **Conflicto con Text2 Barcode** | Los dos pelean por el puerto 9100 y no pueden correr a la vez |
| **Tres tipos de artículo** | Solo `INVENTORYITEM`, `LOTNUMBEREDINVENTORYITEM` y `SERIALIZEDINVENTORYITEM` |
| **Solo interfaz de usuario** | `executioncontext USERINTERFACE`: no corre en Web Services, CSV import ni scripts |
| **Solo en vista** | El `beforeLoad` corta si el tipo no es VIEW: en edición o creación no hay botón |
| **Largo del nombre** | ~76 caracteres con la configuración de referencia. Lo que no entra en el `^FB` se corta sin aviso |
| **Largo del UPC** | ~17 caracteres con `modulo = 2` y ancho 479. Más largo, se recorta por la derecha |
| **DPI** | Las medidas están en puntos. La misma configuración en una impresora de 300 DPI imprime ~40% más chico |
| **Una PC, una impresora** | El SDK usa la marcada como default en esa máquina. No se puede elegir desde NetSuite |
| **Un artículo por vez** | No hay impresión masiva desde una lista ni desde una transacción |
| **Costo por vista** | Se consulta el custom record en cada apertura de artículo, aunque nadie imprima |

## Manejo de errores

**Servidor.** El `beforeLoad` está envuelto en try/catch: emite `log.error` con el id del
artículo y **vuelve a lanzar la excepción**, así que un fallo al preparar la vista rompe la
pantalla del artículo completa. `ocultarBotonNativo` tiene su propio try/catch interno y devuelve
`false` en vez de fallar, porque el botón nativo puede no existir.

**Navegador.** Cuatro cortes con `alert` y sin excepción: sin UPC, sin formatos, sin formato
seleccionado en la ventana, y cantidad inválida.

`AS_EtiquetaImpresora.js` lanza `Error(SIN_IMPRESORA)` cuando `getDefaultDevice` falla — es la
única excepción del lado cliente, y la atrapa el `.catch` del CS, que la muestra con `alert`.
El fallo de envío **no** lanza: la Promise resuelve con `{ exito: false, mensaje }` y el CS
muestra `FALLO_ENVIO + mensaje`.

> El mensaje `SIN_LIBRERIA` está declarado en las constantes pero **ningún archivo lo emite**.
> Si el SDK de Zebra no carga, el `define` del Client Script falla antes y el botón simplemente
> no responde, sin mensaje.

## Logs y diagnóstico

Los tres deployments están en **`loglevel DEBUG`**, así que el `log.debug` del handler deja
**una línea por cada apertura de ficha de artículo**, imprima alguien o no.

| Título | Dónde | Cuándo |
|---|---|---|
| `ETIQUETA VISTA` | handler | Al abrir el artículo: id, tipo, si se ocultó el botón nativo, nombre, upc, subsidiaria y cuántos formatos se cargaron |
| `ETIQUETA ERROR` | UE | Solo si falla el `beforeLoad` |
| `ETIQUETA DATOS` | CS | Al hacer clic, antes de validar |
| `ETIQUETA FORMATO` | selector | Al aceptar: formato elegido, cantidad y el JSON del formato |
| `ETIQUETA ZPL` | CS | El string ZPL completo que se va a enviar |
| `ZEBRA IMPRESORA` | impresora | Si encontró o no la impresora |
| `ZEBRA ENVIO` | impresora | Resultado del envío |
| `ETIQUETA IMPRESA` | CS | Impresora, éxito y mensaje |

**Los tres primeros no están en el mismo lugar que los demás.** `ETIQUETA VISTA` y
`ETIQUETA ERROR` corren en el servidor y quedan en el Execution Log del script en NetSuite.
Todo lo que emiten el Client Script, el selector y la impresora corre en el navegador y sale por
la **consola del navegador (F12)**, no en NetSuite. Para diagnosticar un problema de impresión
hay que mirar ahí.

El `ETIQUETA ZPL` de la consola se puede pegar tal cual en
[labelary.com/viewer.html](https://labelary.com/viewer.html) para ver qué se envió.

## Dependencias

**Internas:** ninguna. El proyecto no usa nada de `APIGlobales/` ni de otros proyectos.

**De NetSuite:** `N/ui/serverWidget`, `N/search`, `N/currentRecord`.

**Externas:** el SDK de Zebra Browser Print (`BrowserPrint-3.1.250.min.js` y
`BrowserPrint-Zebra-1.1.250.min.js`), que viaja en el proyecto, y la aplicación Browser Print
instalada en cada PC, que no.

## Riesgos de modificación

**Renombrar o mover la carpeta del proyecto** rompe `CLIENT_SCRIPT`, que es una ruta absoluta.
El botón aparece pero al hacer clic falla con `MODULE_DOES_NOT_EXIST`.

**Cambiar un id `custpage_*` en las constantes** hay que hacerlo en un solo lugar, pero el
handler y el CS lo leen desde ahí: si alguien escribe el id literal en uno de los dos, dejan de
comunicarse en silencio y el CS lee vacío.

**Agregar una columna al repository** no basta: hay que agregarla también al objeto que se
arma en el `each` y, si va al ZPL, pasarla por `Number()`.

**Tocar `AS_EtiquetaZpl.js`** afecta a todos los formatos de todas las sucursales a la vez: es
el único punto donde se decide el layout.

**Actualizar el SDK de Zebra** obliga a cambiar el nombre del archivo en el `define` del Client
Script, porque la ruta lleva el número de versión.

**Subir el `loglevel` de los deployments a AUDIT o ERROR** apaga `ETIQUETA VISTA`, que es hoy la
única traza de que la vista se preparó bien.

## Decisiones de implementación

### Browser Print en vez de Text2 Barcode

Se empezó con Text2 Barcode (T2B) y se migró a **Zebra Browser Print** el 2026-09-03. Motivo: la
licencia FREE de T2B cerraba sesión sola cada 5 minutos y mataba el servidor local — bloqueante
para producción. Browser Print es de Zebra, gratis, y sin ese límite.
(Fuente: documentación previa del proyecto)

Arquitectura equivalente: una app nativa en cada PC que levanta un servidor local
(`127.0.0.1:9100`) al que el navegador le habla por HTTP.

| | Text2 Barcode | Browser Print |
|---|---|---|
| Puerto local | `https://localhost:9101` | `http://127.0.0.1:9100` |
| Librería JS | CDN público | hay que subirla al File Cabinet |
| Costo | licencia PRO para producción | gratis |

### Cómo se carga el SDK de Zebra

El SDK no es un módulo AMD: es JS plano que expone un global. Se declara en el `define([...])`
del Client Script **con la ruta relativa terminada en `.js`**:

```js
define(['N/currentRecord',
        './lib/LibreriaZebra/BrowserPrint-3.1.250.min.js',
        './lib/LibreriaZebra/BrowserPrint-Zebra-1.1.250.min.js',
        ...],
    (currentRecord, _browserPrint, _browserPrintZebra, ...) => {
```

RequireJS trata cualquier dependencia terminada en `.js` como archivo literal: lo carga tal cual
y deja su global disponible. El parámetro del callback llega `undefined` — por eso se nombra
`_browserPrint` y no se usa.

**Dos caminos que no funcionan**, ambos probados:

- `<script src="/SuiteScripts/...">` inyectado a mano: esa ruta solo la entiende el cargador
  interno de módulos, no una petición HTTP normal. NetSuite responde con su página 404
  (`page_not_found.jsp`, MIME `text/html`) y el navegador se niega a ejecutarla.
- Hardcodear la URL de `media.nl?id=...&h=...` del File Cabinet: el id, el hash y el dominio son
  distintos en cada cuenta, y cambian si se refresca el sandbox.

(Fuente: CLAUDE.md, sección "Librerías externas que no son módulos AMD")

### Las búsquedas van en el User Event, no en el Client Script

`N/search` desde un Client Script es una llamada HTTP al servidor, **síncrona**. Dos búsquedas
seguidas agregaban ~3 segundos entre el clic y la ventana. Ahora se resuelven en el `beforeLoad`
(donde son baratas) y viajan resueltas en un campo oculto `LONGTEXT`. El clic abre la ventana al
instante. El costo: se consulta el custom record en cada vista del artículo, aunque nadie
imprima. (Fuente: documentación previa del proyecto)

### Por qué el campo oculto es LONGTEXT

El JSON con todos los formatos supera fácilmente los 300 caracteres que admite un campo `TEXT`
de NetSuite. Con `LONGTEXT` el tope es de 100.000 caracteres, suficiente para decenas de
formatos.

### Ventana propia en vez del diálogo de NetSuite

`N/ui/dialog` admite **máximo 3 botones**, insuficiente para listar subsidiarias y formatos.
`AS_EtiquetaSelector.js` arma la ventana con DOM directo: dos desplegables encadenados (al
cambiar la subsidiaria se recargan sus formatos) y un campo numérico para la cantidad.

Tampoco sirvió poner un campo `SELECT` en el formulario: **en modo vista NetSuite renderiza los
campos como texto de solo lectura**, no como desplegable interactivo.
(Fuente: documentación previa del proyecto)

### El botón nativo se oculta por User Event, no por formulario

`form.getButton({ id: 'printlabel' }).isHidden = true` dentro del `beforeLoad`, en su propio
try/catch. Así no hace falta un formulario personalizado por cada tipo de artículo.

### `CLIENT_SCRIPT` con ruta absoluta

`form.clientScriptModulePath` lo asigna el handler, que vive en `handlers/`. Una ruta relativa
`./AS_EtiquetaArticulo_CS_2.1.js` se resolvía desde ahí y fallaba con `MODULE_DOES_NOT_EXIST`.
Con ruta absoluta no importa qué módulo la asigne.

### Las medidas en un custom record

Estaban fijas en las constantes. Se movieron a `customrecord_as_formato_etiqueta` para que un
modelo nuevo de impresora o un rollo de otro tamaño se resuelvan **configurando, sin desplegar**.

Se evaluó guardar la plantilla ZPL completa en el record (máxima flexibilidad) pero se descartó:
obliga a quien configura a saber ZPL, y un error de tipeo rompe la impresión sin aviso. Con solo
las medidas, se llenan números. También se descartó `N/render` con FreeMarker: es un módulo de
servidor y la impresión ocurre en el navegador al hacer clic.
(Fuente: documentación previa del proyecto)

## Pendientes o deuda técnica

**`custrecord_as_fe_predeterminado` promete algo que no ocurre.** Su texto de ayuda dice "Marca
la configuracion que quieres que aparezca ya seleccionada al imprimir. Solo una debe estar
marcada", pero el campo no está entre las columnas de la búsqueda y ningún código lo lee. O se
implementa, o se quita el campo, o se corrige el texto de ayuda.

**`MENSAJES.SIN_LIBRERIA` está declarado y no se emite nunca.** No hay ruta de código que lo
muestre.

**El `throw` del UE rompe la vista del artículo completa** si falla al preparar el botón. Queda
por decidir si debe seguir así o degradar sin botón.

**`loglevel DEBUG` en los tres deployments** deja un log por cada apertura de artículo.

**No hay validación del largo del nombre ni del UPC.** Los dos se recortan sin aviso.

**Filtrar formatos por la subsidiaria del usuario** cuando entre una segunda sucursal con
impresora propia. Hoy el desplegable muestra todas las configuradas.

**Impresión desde Orden de Compra**: botón en el PO que liste las líneas, permita elegir qué
artículos imprimir y con qué cantidad. El ZPL se concatena (`^XA...^XZ^XA...^XZ`) y se manda en
un solo envío.

**Desinstalar Text2 Barcode** de los equipos donde siga instalado.

## Referencias

- Probar ZPL: [labelary.com/viewer.html](https://labelary.com/viewer.html) — Print Density
  8 dpmm (203 dpi), Label Size 2.36 x 1.58 pulgadas.
- Documentación del SDK: carpeta `Documentation/` del ZIP `zebra-browser-print-js-v31250`
  (no se incluye en el proyecto, NetSuite no la necesita).
- Validado el 2026-09-03 en sandbox `7115118-sb2` con una Zebra ZD230 (203 dpi) por USB.
  (Fuente: documentación previa del proyecto)
