# Guía de usuario — Impresión de etiquetas con código de barras

Esta guía explica cómo imprimir etiquetas de artículos en una impresora térmica Zebra desde
NetSuite, cómo dejar lista una computadora nueva, y cómo configurar el formato de la etiqueta.

---

## 1. Para qué sirve

**El problema que resuelve:** hasta ahora, etiquetar un artículo con su código de barras
dependía de herramientas externas y de que cada bodega se las arreglara por su cuenta. No había
una forma estándar de imprimir desde NetSuite, y el formato de la etiqueta cambiaba según quién
la generara.

**Objetivos:**

- Imprimir la etiqueta directamente desde la ficha del artículo, sin salir de NetSuite y sin
  pasar por Excel, Word ni programas de diseño.
- Que la etiqueta salga **igual siempre**, sin importar quién la imprima.
- Que el formato (tamaño, posiciones, letra) se ajuste **desde NetSuite**, sin depender del área
  de desarrollo ni de un despliegue.
- Que cada sucursal pueda tener su propia impresora y su propio tamaño de etiqueta conviviendo
  en el mismo sistema.

## 2. Qué hace

En la pantalla de un artículo aparece el botón **Imprimir Etiqueta Zebra**. Al presionarlo se
abre una ventana donde eliges la impresora y cuántas etiquetas quieres, y salen impresas en la
Zebra conectada a tu computadora.

Cada etiqueta lleva dos cosas:

- El **nombre del artículo**, centrado en la parte superior.
- El **código de barras** del UPC Code, con el número debajo.

---

## 3. Antes de usarlo: preparar la computadora

Esto se hace **una sola vez por computadora**, y lo necesita cualquier equipo que vaya a
imprimir. No importa la sucursal ni la red.

### Paso 1 — Instalar Browser Print

Browser Print es el programa de Zebra que permite que NetSuite le hable a la impresora. Se
descarga del sitio de Zebra (búscalo como "Zebra Browser Print for Windows PC"; Zebra pide
llenar un formulario con nombre, empresa y correo antes de dejarte descargar).

Instálalo y **déjalo corriendo**: tiene que aparecer su icono en la bandeja del sistema, al
lado del reloj. Si cierras el programa, el botón deja de funcionar.

> **Importante:** si en esa computadora está instalado **Text2 Barcode**, hay que detenerlo o
> desinstalarlo. Los dos programas usan el mismo puerto y no pueden funcionar al mismo tiempo.

### Paso 2 — Elegir la impresora por defecto

Con la Zebra conectada por USB y encendida, abre **Browser Print Settings** y en
**Default Devices** presiona **Change**. Selecciona tu impresora y confirma con **Set**.

Si este paso queda pendiente, al imprimir sale el mensaje *"No se encontró la impresora"*.

### Paso 3 — Autorizar NetSuite (automático)

La primera vez que uses el botón, Browser Print agrega solo el dominio de NetSuite a su lista
de **Accepted Hosts**. No tienes que hacer nada.

Solo si alguien lo rechazó por error, hay que revisar que el dominio no haya quedado en
**Blocked Hosts** dentro de Browser Print Settings.

---

## 4. Cómo imprimir una etiqueta

1. Abre el artículo en NetSuite (**Lists → Accounting → Items**).
2. Presiona **Imprimir Etiqueta Zebra**.
3. En la ventana que se abre:
   - **Subsidiaria**: viene preseleccionada. Solo aparecen las sucursales que tienen impresora
     configurada.
   - **Formato de etiqueta**: el formato correspondiente a esa sucursal.
   - **Cantidad de etiquetas**: cuántas copias quieres. Viene en 1.
4. Presiona **Imprimir**.

Las copias salen todas de una sola pasada.

---

## 5. Configurar el formato de una impresora nueva

Cada combinación de **modelo de impresora + tamaño de rollo** necesita su propia configuración.
Dos impresoras iguales con rollos distintos son dos configuraciones diferentes.

Ve a **Customization → Lists, Records & Fields → Record Types → AS Configuracion Etiqueta
Impresora → New Record** y llena:

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

### Cómo se calculan los puntos

Todas las medidas van en **puntos**, no en milímetros. La conversión depende del DPI:

- **203 DPI** → 8 puntos por milímetro (1 cm = 80 puntos)
- **300 DPI** → ~11,8 puntos por milímetro (1 cm = 118 puntos)

Ejemplo, para una etiqueta de 60 × 40 mm en una impresora de 203 DPI:
`60 × 8 = 479 de ancho` y `40 × 8 = 320 de alto`.

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

---

## 6. Ajustar cómo se ve la etiqueta

Todos estos ajustes se hacen **editando la configuración en NetSuite**. No hay que pedirle
nada al área de sistemas ni volver a instalar nada: guardas el cambio, recargas el artículo y
la siguiente etiqueta ya sale distinta.

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
> referencia: 85 + (26 × 2) ≈ 137. Por eso el código de barras no puede empezar antes del
> punto 140 sin montarse sobre el texto.

### Probar sin gastar etiquetas

En [labelary.com/viewer.html](https://labelary.com/viewer.html) puedes ver cómo va a salir la
etiqueta antes de imprimirla. Configura **Print Density: 8 dpmm (203 dpi)** y
**Label Size: 2.36 x 1.58 pulgadas**, y pega el código de la etiqueta.

---

## 7. Límite del nombre del artículo

Con los valores de referencia (letra 26, 2 líneas), entran **alrededor de 76 caracteres**, unos
38 por renglón.

**Lo que no entra no se imprime, y no aparece ningún aviso.** El nombre simplemente sale
cortado. La cuenta es aproximada porque la letra es proporcional: un nombre con muchas `M` o `W`
entra menos que uno con `I` o `1`.

- Hasta 70 caracteres: seguro.
- Entre 70 y 80: revisa la etiqueta impresa.
- Más de 80: se corta.

Si necesitan nombres más largos, sube **Nombre: líneas máximas** a 3 (pasa a ~114 caracteres).

---

## 8. Mensajes y qué hacer

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| *El artículo no tiene UPC Code cargado* | El artículo no tiene código de barras | Cargar el UPC Code en el artículo |
| *Indica cuántas etiquetas quieres imprimir* | La cantidad está vacía o en 0 | Escribir un número mayor a 0 |
| *No hay ningún formato de etiqueta configurado* | Nadie ha creado la configuración | Crear el registro (punto 5) |
| *No se encontró la impresora* | Browser Print está cerrado, o no hay impresora por defecto | Abrir Browser Print y revisar el paso 2 |
| *No se pudo cargar la librería de Browser Print* | Problema al cargar el programa desde NetSuite | Recargar la página; si sigue, avisar a sistemas |
| *No se pudo imprimir: ...* | Browser Print respondió con un error | Revisar que la Zebra esté encendida, con papel y sin luces de error |

---

## 9. Problemas frecuentes

**El botón no hace nada.** Recarga la página del artículo. Si sigue igual, revisa que Browser
Print esté corriendo en la bandeja del sistema.

**Sale una etiqueta en blanco o a medias.** Casi siempre es calibración de la impresora, no del
sistema: la Zebra no está detectando dónde empieza cada etiqueta. Se calibra desde la propia
impresora (manteniendo presionado el botón de avance) o con Zebra Setup Utilities.

**Dos impresoras iguales imprimen distinto.** Si tienen el mismo rollo y la misma configuración,
el problema es de la impresora: calibración o ajustes guardados en su memoria. Si tienen rollos
de distinto tamaño, hay que crear una configuración para cada una.

**La etiqueta sale más chica de lo esperado.** Probablemente esa impresora es de 300 DPI y la
configuración fue calculada para 203. Hay que recalcular las medidas o crear una configuración
aparte para ese modelo.

**Cambié la configuración y sigue saliendo igual.** Recarga la página del artículo. La
configuración se lee al abrir la pantalla, no en cada impresión.
