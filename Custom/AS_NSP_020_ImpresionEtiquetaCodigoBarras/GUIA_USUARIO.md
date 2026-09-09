# Guía de usuario — Impresión de etiquetas con código de barras

## Para qué sirve

Etiquetar un artículo con su código de barras dependía de herramientas externas y de que cada
bodega se las arreglara por su cuenta. No había una forma estándar de imprimir desde NetSuite,
y el formato de la etiqueta cambiaba según quién la generara.

Este módulo agrega un botón en la ficha del artículo que imprime la etiqueta directamente en
una impresora térmica Zebra conectada a la computadora del usuario, con un formato definido en
NetSuite e igual para todos.

## Alcance

**Qué hace:** imprime una etiqueta con el nombre del artículo centrado arriba y el código de
barras del UPC Code debajo, con el número impreso bajo las barras. Permite elegir el formato de
etiqueta y cuántas copias, y las manda todas en una sola pasada.

**Qué no hace:**

- No imprime varios artículos a la vez: es un artículo por vez, desde su ficha.
- No imprime desde una lista, una Orden de Compra ni ninguna transacción.
- No permite elegir entre varias impresoras conectadas a la misma computadora: usa siempre la
  que esté marcada como predeterminada en Browser Print.
- No avisa si el nombre del artículo no entra en la etiqueta.

## Quién lo usa

Cualquier usuario que abra la ficha de un artículo. El botón está habilitado para todos los
roles y todos los empleados, y solo aparece en la interfaz de NetSuite (no en integraciones ni
en procesos automáticos).

Crear o modificar los formatos de etiqueta requiere permiso sobre el registro
**AS Configuracion Etiqueta Impresora**.

## Dónde se usa

En la **ficha del artículo**, botón **Imprimir Etiqueta Zebra**, junto a los botones estándar.

Aparece solo en estos tres tipos de artículo:

| Tipo de artículo | |
|---|---|
| Inventory Item | artículo de inventario |
| Lot Numbered Inventory Item | artículo con número de lote |
| Serialized Inventory Item | artículo serializado |

En cualquier otro tipo de registro el botón no existe.

## Requisitos previos

### En el artículo

Tiene que tener cargado el **UPC Code**. Sin eso el botón avisa y no imprime.

### En la computadora, una sola vez por equipo

Lo necesita cualquier computadora que vaya a imprimir, sin importar la sucursal ni la red.

1. **Instalar Browser Print.** Es el programa de Zebra que permite que NetSuite le hable a la
   impresora. Se descarga del sitio de Zebra (búscalo como "Zebra Browser Print for Windows
   PC"; Zebra pide llenar un formulario con nombre, empresa y correo antes de dejarte
   descargar). Instálalo y **déjalo corriendo**: tiene que aparecer su icono en la bandeja del
   sistema, al lado del reloj. Si se cierra el programa, el botón deja de funcionar.

2. **Elegir la impresora por defecto.** Con la Zebra conectada por USB y encendida, abre
   **Browser Print Settings** y en **Default Devices** presiona **Change**. Selecciona tu
   impresora y confirma con **Set**. Si este paso queda pendiente, al imprimir sale el mensaje
   *"No se encontró la impresora"*.

3. **Autorizar NetSuite.** Es automático: la primera vez que uses el botón, Browser Print
   agrega solo el dominio de NetSuite a su lista de **Accepted Hosts**. Solo si alguien lo
   rechazó por error hay que revisar que el dominio no haya quedado en **Blocked Hosts** dentro
   de Browser Print Settings.

> **Si en esa computadora está instalado Text2 Barcode, hay que detenerlo o desinstalarlo.**
> Los dos programas usan el mismo puerto y no pueden funcionar al mismo tiempo.

### En NetSuite

Tiene que existir al menos un formato de etiqueta creado. Si no hay ninguno, el botón avisa y
no imprime.

## Cómo usarlo

1. Abre el artículo en NetSuite.
2. Presiona **Imprimir Etiqueta Zebra**.
3. En la ventana que se abre:
   - **Subsidiaria**: viene preseleccionada. Solo aparecen las sucursales que tienen formato
     configurado.
   - **Formato de etiqueta**: los formatos de esa sucursal.
   - **Cantidad de etiquetas**: cuántas copias. Viene en 1.
4. Presiona **Imprimir**.

## Qué ocurre durante el proceso

La ventana se abre al instante, sin esperar: los datos ya venían cargados desde que se abrió el
artículo.

Al presionar **Imprimir**, la etiqueta se manda a la impresora predeterminada de Browser Print
y aparece un aviso con el nombre de la impresora a la que se envió. Las copias salen todas de
una sola pasada, no como trabajos separados.

Si cambias la subsidiaria en el desplegable, la lista de formatos se recarga con los de esa
sucursal.

## Configuración funcional

Todo el aspecto de la etiqueta se configura en NetSuite, sin pedirle nada al área de sistemas y
sin volver a instalar nada: guardas el cambio, recargas el artículo y la siguiente etiqueta ya
sale distinta.

Cada combinación de **modelo de impresora + tamaño de rollo** necesita su propia configuración.
Dos impresoras iguales con rollos distintos son dos configuraciones diferentes.

**Customization → Lists, Records & Fields → Record Types → AS Configuracion Etiqueta Impresora
→ New Record**

| Campo | Qué poner |
|---|---|
| **Name** | Cómo lo verá el usuario en la ventana. Usa modelo + tamaño: `ZD230 - Etiqueta 60x40mm` |
| **Sucursal** | Dónde está instalada esa impresora |
| **Resolución (DPI)** | 203 o 300, según la ficha técnica del equipo |
| **Etiqueta: ancho** | Ancho del rollo, en puntos |
| **Etiqueta: alto** | Alto del rollo, en puntos |
| **Nombre: distancia desde arriba** | Dónde empieza el texto |
| **Nombre: tamaño de letra** | Alto de cada letra |
| **Nombre: líneas máximas** | En cuántos renglones se parte un nombre largo |
| **Código: distancia desde arriba** | Dónde empiezan las barras |
| **Código: altura de barras** | Qué tan altas son las barras |
| **Código: grosor de barras** | Normalmente 2 o 3 |

Todos esos campos son obligatorios. **Predeterminado** es el único opcional.

### Cómo se calculan los puntos

Todas las medidas van en **puntos**, no en milímetros. La conversión depende del DPI:

- **203 DPI** → 8 puntos por milímetro (1 cm = 80 puntos)
- **300 DPI** → ~11,8 puntos por milímetro (1 cm = 118 puntos)

Para una etiqueta de 60 × 40 mm en una impresora de 203 DPI: `60 × 8 = 479` de ancho y
`40 × 8 = 320` de alto.

El campo **Resolución (DPI)** es solo informativo: sirve para calcular los demás valores, pero
el sistema no lo usa al imprimir. Cambiarlo por sí solo no cambia nada en la etiqueta.

### Configuración de referencia (la que está en uso)

| Campo | Valor |
|---|---|
| Name | ZD230 - Etiqueta 60x40mm |
| Resolución (DPI) | 203 |
| Etiqueta: ancho | 479 |
| Etiqueta: alto | 320 |
| Nombre: distancia desde arriba | 85 |
| Nombre: tamaño de letra | 26 |
| Nombre: líneas máximas | 2 |
| Código: distancia desde arriba | 145 |
| Código: altura de barras | 70 |
| Código: grosor de barras | 2 |

### Ajustar cómo se ve la etiqueta

| Lo que quieres | Qué cambiar |
|---|---|
| Subir el código de barras | Bajar **Código: distancia desde arriba** |
| Bajar el código de barras | Subir ese mismo campo |
| Mover todo el contenido | Cambiar los dos campos de "distancia desde arriba" en la misma cantidad |
| Letra más grande o más chica | **Nombre: tamaño de letra** |
| Barras más altas | **Código: altura de barras** |
| El código se sale por los costados | Bajar **Código: grosor de barras** |
| Nombres largos que se cortan | Subir **Nombre: líneas máximas** de 2 a 3 |

> **Cuidado con encimar el texto y el código.** El nombre ocupa, hacia abajo, el valor de
> "distancia desde arriba" más el alto de letra por la cantidad de líneas. Con los valores de
> referencia: 85 + (26 × 2) ≈ 137. Por eso el código de barras no puede empezar antes del punto
> 140 sin montarse sobre el texto.

### Probar sin gastar etiquetas

En [labelary.com/viewer.html](https://labelary.com/viewer.html) puedes ver cómo va a salir la
etiqueta antes de imprimirla. Configura **Print Density: 8 dpmm (203 dpi)** y **Label Size:
2.36 x 1.58 pulgadas**, y pega el código de la etiqueta.

## Pendiente de configurar en NetSuite

En una cuenta donde se acaba de instalar el módulo:

1. Crear al menos un registro de **AS Configuracion Etiqueta Impresora**. Sin eso, el botón
   avisa que no hay formato configurado.
2. En cada computadora que vaya a imprimir, hacer los tres pasos de **Requisitos previos**.

## Restricciones y consideraciones

**El nombre del artículo se corta sin aviso.** Con los valores de referencia (letra 26, 2
líneas) entran **alrededor de 76 caracteres**, unos 38 por renglón. Lo que no entra simplemente
no se imprime, y no aparece ningún mensaje. La cuenta es aproximada porque la letra es
proporcional: un nombre con muchas `M` o `W` entra menos que uno con `I` o `1`.

- Hasta 70 caracteres: seguro.
- Entre 70 y 80: revisa la etiqueta impresa.
- Más de 80: se corta.

Si necesitan nombres más largos, sube **Nombre: líneas máximas** a 3 (pasa a ~114 caracteres).

**El código de barras muy largo también se recorta sin aviso.** Con grosor 2 y ancho 479 el
tope es de unos 17 caracteres de UPC. Más largo que eso, las barras arrancan pegadas al borde
izquierdo y se cortan por la derecha.

**La configuración se lee al abrir el artículo, no al imprimir.** Si cambias un formato y
tienes la ficha abierta, hay que recargar la página para que tome el cambio.

**El desplegable muestra todas las sucursales configuradas**, no solo la del usuario. Un
artículo compartido entre varias subsidiarias abre preseleccionado con la primera de su lista,
que suele ser la matriz; si esa no tiene formato, cae a la primera configurada.

**La checkbox "Predeterminado" no hace nada.** Aunque su texto de ayuda diga que marca la
configuración que aparecerá ya seleccionada, el sistema no la lee. Marcarla o no marcarla no
cambia el comportamiento.

**Una computadora, una impresora.** Se imprime siempre en la que esté marcada como
predeterminada en Browser Print. Para cambiar de impresora hay que cambiarla ahí.

## Errores y solución

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| *El articulo no tiene UPC Code cargado, no se puede generar el codigo de barras.* | El artículo no tiene código de barras | Cargar el UPC Code en el artículo |
| *No hay ningun formato de etiqueta configurado. Creelo en AS Configuracion Etiqueta Impresora.* | Nadie ha creado la configuración, o la única que había está inactiva | Crear el registro (ver Configuración funcional) |
| *Indica cuantas etiquetas quieres imprimir.* | La cantidad está vacía, en 0, en negativo o tiene texto | Escribir un número entero mayor a 0 |
| *No se encontro la impresora. Verifica que Browser Print este abierto en este equipo.* | Browser Print está cerrado, o no hay impresora marcada como predeterminada | Abrir Browser Print y revisar el paso 2 de Requisitos previos |
| *No se pudo imprimir: ...* | Browser Print respondió con un error | Revisar que la Zebra esté encendida, con papel y sin luces de error |

## Problemas frecuentes

**El botón no hace nada.** Recarga la página del artículo. Si sigue igual, revisa que Browser
Print esté corriendo en la bandeja del sistema.

**Sale una etiqueta en blanco o a medias.** Casi siempre es calibración de la impresora, no del
sistema: la Zebra no está detectando dónde empieza cada etiqueta. Se calibra desde la propia
impresora (manteniendo presionado el botón de avance) o con Zebra Setup Utilities.

**Dos impresoras iguales imprimen distinto.** Si tienen el mismo rollo y el mismo formato, el
problema es de la impresora: calibración o ajustes guardados en su memoria. Si tienen rollos de
distinto tamaño, hay que crear un formato para cada una.

**La etiqueta sale más chica de lo esperado.** Probablemente esa impresora es de 300 DPI y la
configuración fue calculada para 203. Hay que recalcular las medidas o crear una configuración
aparte para ese modelo.

**Cambié la configuración y sigue saliendo igual.** Recarga la página del artículo.

## Resultado esperado

Al presionar **Imprimir** aparece un aviso con el nombre de la impresora a la que se envió, y
las etiquetas salen de la Zebra.

Cada etiqueta lleva el nombre del artículo centrado arriba y, debajo, el código de barras del
UPC Code con el número impreso bajo las barras. Todas las copias salen en una sola pasada.

Si en vez del aviso de envío aparece un mensaje de error, revisa la tabla de **Errores y
solución**.
