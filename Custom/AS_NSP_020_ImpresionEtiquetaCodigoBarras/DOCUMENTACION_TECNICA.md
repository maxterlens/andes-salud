# AS_NSP_020 — Impresión de Etiqueta con Código de Barras

Documentación técnica del proyecto: cómo está armado, por qué se tomó cada decisión, y qué
hace falta para desplegarlo en otra cuenta.

---

## 1. Qué resuelve

Imprimir una etiqueta con el nombre y el código de barras de un artículo, desde la pantalla del
artículo en NetSuite, en una impresora térmica Zebra conectada a la computadora del usuario.

Las medidas de la etiqueta no están en el código: viven en un custom record, una fila por cada
combinación de modelo de impresora y tamaño de rollo.

---

## 2. Arquitectura

```
Articulo (vista)
   │
   ▼
AS_EtiquetaArticulo_UE_2.1.js          entry point: ciclo de vida + try/catch + log.error
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

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `AS_EtiquetaArticulo_UE_2.1.js` | Solo `beforeLoad`, try/catch y `log.error`. Delega todo al handler |
| `handlers/AS_EtiquetaArticuloHandler.js` | Oculta el botón nativo, agrega campos ocultos y el botón propio |
| `repositories/AS_FormatoEtiquetaRepository.js` | Único que toca datos: busca los formatos en el custom record |
| `AS_EtiquetaArticulo_CS_2.1.js` | Al hacer clic: lee datos, abre el selector, arma el ZPL, imprime |
| `lib/AS_EtiquetaSelector.js` | Ventana modal armada a mano (DOM) con los tres campos |
| `lib/AS_EtiquetaZpl.js` | Recibe datos + formato + cantidad, devuelve el string ZPL. No conoce NetSuite |
| `lib/AS_EtiquetaImpresora.js` | `BrowserPrint.getDefaultDevice()` y `device.send()`, envueltos en Promises |
| `lib/AS_EtiquetaArticuloConstants.js` | Ids de campos, del custom record, textos y mensajes |
| `lib/LibreriaZebra/` | SDK de Zebra (`BrowserPrint-3.1.250.min.js` y `BrowserPrint-Zebra-1.1.250.min.js`) |

---

## 3. Flujo de datos

**Al abrir el artículo** (servidor, `beforeLoad`):

1. Se oculta el botón nativo *Print Label*.
2. Se agregan campos ocultos con `itemid`, `upccode` y la subsidiaria del artículo.
3. Se busca el custom record y **el resultado completo viaja como JSON** en un campo oculto
   `LONGTEXT` (`custpage_etiqueta_configuracion`).
4. Se agrega el botón y se asigna `form.clientScriptModulePath`.

**Al hacer clic** (navegador):

1. El CS lee los campos ocultos — **no hace ninguna llamada al servidor**.
2. Abre la ventana de selección.
3. Arma el ZPL con las medidas del formato elegido.
4. Lo manda a Browser Print, que lo pasa a la impresora.

---

## 4. Búsquedas y lógica clave

Lo que hay que entender antes de tocar el código.

### La única búsqueda del proyecto

Está en `repositories/AS_FormatoEtiquetaRepository.js` y corre en el **servidor**, durante el
`beforeLoad`:

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
- **Del campo subsidiaria se leen los dos valores:** `getValue` da el id interno (para agrupar y
  comparar) y `getText` el nombre visible (para el desplegable).
- **Los campos INTEGER vuelven como string.** Por eso cada medida pasa por `Number()` explícito
  al armar el objeto. Sin eso, el ZPL recibiría concatenaciones en vez de números.

### Preselección de la subsidiaria

En `lib/AS_EtiquetaSelector.js`:

1. Se intenta preseleccionar la subsidiaria del artículo.
2. Si esa subsidiaria no tiene formato configurado, cae a la primera de la lista.

El objetivo es que la ventana **siempre abra con un formato cargado y listo para imprimir**.
Un artículo compartido entre varias subsidiarias tiene un campo `subsidiary` múltiple y se toma
**el primero**, que suele ser la matriz — de ahí que la caída a "la primera configurada" sea el
caso habitual, no la excepción.

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
entero. Cubre vacío, texto, cero, negativos y decimales.

### Por qué el campo oculto es LONGTEXT

El JSON con todos los formatos supera fácilmente los 300 caracteres que admite un campo `TEXT`
de NetSuite. Con `LONGTEXT` el tope es de 100.000 caracteres, suficiente para decenas de
formatos.

### Truncado silencioso del nombre

El `^FB` de ZPL acomoda el texto en la cantidad de líneas indicada y **descarta lo que sobra sin
error ni marca visual**. No hay validación de largo en el código: si el nombre no entra, la
etiqueta sale cortada y nadie se entera hasta verla impresa. Ver el límite en el punto 10.

---

## 5. Decisiones y por qué

### Browser Print en vez de Text2 Barcode

Se empezó con Text2 Barcode (T2B) y se migró a **Zebra Browser Print** el 2026-09-03. Motivo:
la licencia FREE de T2B cerraba sesión sola cada 5 minutos y mataba el servidor local —
bloqueante para producción. Browser Print es de Zebra, gratis, y sin ese límite.

Arquitectura equivalente: una app nativa en cada PC que levanta un servidor local
(`127.0.0.1:9100`) al que el navegador le habla por HTTP.

**Por qué hace falta una app local:** un navegador no puede abrir un socket TCP crudo contra el
puerto 9100 de una impresora. JavaScript solo puede HTTP/HTTPS o WebSocket. La app local es el
puente. Por eso **cada PC que imprima necesita la suya** — no se puede compartir una por red.

| | Text2 Barcode | Browser Print |
|---|---|---|
| Puerto local | `https://localhost:9101` | `http://127.0.0.1:9100` |
| Librería JS | CDN público | hay que subirla al File Cabinet |
| Costo | licencia PRO para producción | gratis |

Los dos **no pueden correr a la vez**: pelean por el puerto 9100.

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

**Dos caminos que no funcionan** (se probaron los dos):

- `<script src="/SuiteScripts/...">` inyectado a mano: esa ruta solo la entiende el cargador
  interno de módulos, no una petición HTTP normal. NetSuite responde con su página 404
  (`page_not_found.jsp`, MIME `text/html`) y el navegador se niega a ejecutarla.
- Hardcodear la URL de `media.nl?id=...&h=...` del File Cabinet: el id, el hash y el dominio
  son distintos en cada cuenta, y cambian si se refresca el sandbox.

### Las búsquedas van en el User Event, no en el Client Script

`N/search` desde un Client Script es una llamada HTTP al servidor, **síncrona**. Dos búsquedas
seguidas agregaban ~3 segundos entre el clic y la ventana.

Ahora se resuelven en el `beforeLoad` (donde son baratas) y viajan resueltas en un campo oculto
`LONGTEXT`. El clic abre la ventana al instante. El costo: se consulta el custom record en cada
vista del artículo, aunque nadie imprima.

### Ventana propia en vez del diálogo de NetSuite

`N/ui/dialog` admite **máximo 3 botones**, insuficiente para listar subsidiarias y formatos.
`AS_EtiquetaSelector.js` arma la ventana con DOM directo: dos desplegables encadenados
(al cambiar la subsidiaria se recargan sus formatos) y un campo numérico para la cantidad.

Tampoco sirvió poner un campo `SELECT` en el formulario: **en modo vista NetSuite renderiza los
campos como texto de solo lectura**, no como desplegable interactivo.

### `CLIENT_SCRIPT` con ruta absoluta

`form.clientScriptModulePath` lo asigna el handler, que vive en `handlers/`. Una ruta relativa
`./AS_EtiquetaArticulo_CS_2.1.js` se resolvía desde ahí y fallaba con `MODULE_DOES_NOT_EXIST`.
Con ruta absoluta no importa qué módulo la asigne.

### Las medidas en un custom record

Estaban fijas en las constantes. Se movieron a `customrecord_as_formato_etiqueta` para que un
modelo nuevo de impresora o un rollo de otro tamaño se resuelvan **configurando, sin desplegar**.

Se evaluó guardar la plantilla ZPL completa en el record (máxima flexibilidad) pero se descartó:
obliga a quien configura a saber ZPL, y un error de tipeo rompe la impresión sin aviso. Con solo
las medidas, se llenan números.

También se descartó `N/render` con FreeMarker: es un módulo de servidor y la impresión ocurre en
el navegador al hacer clic.

---

## 6. Custom record `customrecord_as_formato_etiqueta`

**AS Configuracion Etiqueta Impresora.** Una fila por combinación de impresora y tamaño de rollo.
El campo **Name** nativo es lo que se muestra en el desplegable.

| Campo | Tipo | Uso en el ZPL |
|---|---|---|
| `custrecord_as_fe_subsidiaria` | Select (Subsidiary, `-117`) | Agrupa el desplegable |
| `custrecord_as_fe_dpi` | Integer | **No se lee por código.** Informativo, para calcular los demás |
| `custrecord_as_fe_ancho` | Integer | `^PW` y ancho del `^FB` |
| `custrecord_as_fe_alto` | Integer | `^LL` |
| `custrecord_as_fe_y_nombre` | Integer | `^FO0,Y` del nombre |
| `custrecord_as_fe_fuente_nombre` | Integer | `^A0N,h,w` |
| `custrecord_as_fe_lineas_nombre` | Integer | líneas del `^FB` |
| `custrecord_as_fe_y_codigo` | Integer | `^FO x,Y` del código |
| `custrecord_as_fe_alto_codigo` | Integer | alto en `^BY` y `^BCN` |
| `custrecord_as_fe_modulo` | Integer | módulo en `^BY` |
| `custrecord_as_fe_predeterminado` | Checkbox | **Sin uso actual.** Quedó del diseño anterior |

**Access Type: `No Permission Required`.** Si se restringe, la lectura falla para los usuarios de
bodega.

---

## 7. El ZPL generado

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

**El centrado del código de barras se calcula en el código**, no viene del record, porque
depende del largo del UPC:

```js
const ancho = formato.modulo * (11 * (upc.length + 3) + 13);
return Math.max(0, Math.round((formato.ancho - ancho) / 2));
```

---

## 8. Despliegue

```bash
cd andes-salud/Custom/AS_NSP_020_ImpresionEtiquetaCodigoBarras
suitecloud project:validate --server
suitecloud project:deploy
```

El proyecto no tiene `project.json`, así que el CLI pregunta la cuenta.

**Objetos que se despliegan:** el User Event con sus 3 deployments (`INVENTORYITEM`,
`LOTNUMBEREDINVENTORYITEM`, `SERIALIZEDINVENTORYITEM`) y el custom record.

**Features requeridas** (`manifest.xml`): `SERVERSIDESCRIPTING`, `CUSTOMRECORDS`,
`SUBSIDIARIES`, `UNITSOFMEASURE`.

### Después de desplegar en una cuenta nueva

1. Crear al menos una fila del custom record (sin eso, el botón avisa que no hay formato).
2. Verificar el Access Type del record.
3. En cada PC que imprima: instalar Browser Print, elegir Default Device, y dejar que se
   agregue el dominio a Accepted Hosts en el primer uso.

> **SDF no borra archivos.** Si se renombra o elimina un archivo del proyecto, la versión vieja
> queda huérfana en el File Cabinet y hay que borrarla a mano.

---

## 9. Valores fijos en el código

Lo que **no** se configura desde NetSuite. Si algo de esto cambia, hay que tocar código y
desplegar. Está todo en `lib/AS_EtiquetaArticuloConstants.js` salvo donde se indique.

| Valor | Dónde | Qué pasa si cambia el entorno |
|---|---|---|
| `CLIENT_SCRIPT` (ruta absoluta del CS) | Constantes | **Si se renombra o mueve la carpeta del proyecto, se rompe.** Es ruta absoluta a propósito (ver punto 5) |
| Rutas del SDK con número de versión | `define([...])` del CS | Al actualizar el SDK de Zebra hay que cambiar el nombre en el `define` **y** subir los archivos nuevos |
| `BOTON_NATIVO = 'printlabel'` | Constantes | Id del botón nativo de NetSuite que se oculta. Si Oracle lo renombra, el botón nativo reaparece |
| `CAMPOS.NOMBRE = 'itemid'` | Constantes | De dónde sale el nombre. Cambiar aquí si quieren imprimir `displayname` u otro campo |
| `CAMPOS.UPC = 'upccode'` | Constantes | De dónde sale el código de barras |
| `CAMPO_SUBSIDIARIA.ORIGEN = 'subsidiary'` | Constantes | Campo multiple; **se toma el primero** de la lista |
| `CANTIDAD_INICIAL = 1` | Constantes | Valor con el que abre el campo cantidad |
| Ids `custpage_*` | Constantes | Campos ocultos que comunican UE → CS. Solo importa que coincidan entre ambos |
| Simbología **Code 128** (`^BCN`) | `AS_EtiquetaZpl.js` | Otra simbología (EAN-13, QR) requiere otro comando ZPL |
| Ratio `3` del `^BY` | `AS_EtiquetaZpl.js` | Relación barra ancha/angosta. Casi nunca se toca |
| `^CI28` (UTF-8) | `AS_EtiquetaZpl.js` | Sin esto, tildes y ñ salen mal |
| Fórmula de centrado `11 * (largo + 3) + 13` | `AS_EtiquetaZpl.js` | Ancho teórico de Code 128. Cambia si se cambia de simbología |
| `^PQ n,0,1,Y` | `AS_EtiquetaZpl.js` | Pausa y corte entre copias. El `Y` es corte al final |
| Estilos de la ventana modal | `AS_EtiquetaSelector.js` | CSS inline. No hay hoja de estilos |
| `127.0.0.1:9100` | **Dentro del SDK de Zebra** | No es nuestro. Si Zebra cambia el puerto, viene en la versión nueva del SDK |
| Scriptids del custom record | Constantes | Deben coincidir exactamente con los del record en la cuenta |

## 10. Límites conocidos

| Límite | Detalle |
|---|---|
| **Largo del nombre** | ~76 caracteres con la configuración actual. Lo que no entra en el `^FB` **se corta sin aviso** |
| **DPI** | Las medidas están en puntos. La misma configuración en una impresora de 300 DPI imprime ~40% más chico |
| **Una PC, una impresora** | El SDK usa la impresora marcada como default en esa máquina. No se puede elegir entre varias desde NetSuite |
| **Un artículo por vez** | No hay impresión masiva desde una lista ni desde una transacción |
| **`predeterminado` sin uso** | El campo existe en el record pero ningún código lo lee |
| **Error rompe la vista** | El `catch` del UE hace `throw`: si falla al preparar el botón, se rompe la pantalla del artículo completa |

---

## 11. Pendientes

- **Impresión desde Orden de Compra**: botón en el PO que liste las líneas, permita elegir qué
  artículos imprimir y con qué cantidad. El ZPL se concatena (`^XA...^XZ^XA...^XZ`) y se manda
  en un solo envío.
- **Decidir si el `throw` del UE debe seguir rompiendo la vista del artículo.**
- **Filtrar formatos por la subsidiaria del usuario** cuando entre una segunda sucursal con
  impresora propia. Hoy el desplegable muestra todas las configuradas.
- **Desinstalar Text2 Barcode** de los equipos donde siga instalado.
- **El proyecto no está en control de versiones.**

---

## 12. Referencias

- Probar ZPL: [labelary.com/viewer.html](https://labelary.com/viewer.html) — Print Density
  8 dpmm (203 dpi), Label Size 2.36 x 1.58 pulgadas.
- Documentación del SDK: carpeta `Documentation/` del ZIP `zebra-browser-print-js-v31250`
  (no se incluye en el proyecto, NetSuite no la necesita).
- Validado el 2026-09-03 en sandbox `7115118-sb2` con una Zebra ZD230 (203 dpi) por USB.
