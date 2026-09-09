# Guía de usuario — Alerta de Orden de Compra pendiente de recepción

## Para qué sirve

Una Orden de Compra aprobada que el proveedor nunca despacha queda abierta sin que nadie se
entere: no hay recepción, no hay factura, y el material simplemente no llega. Hasta ahora había
que revisarlo a mano una por una.

Este módulo recorre todos los días las órdenes de compra aprobadas que siguen sin recepción y
**le manda un correo al proveedor recordándole que la orden está pendiente**, con el PDF de la
orden adjunto.

## Alcance

**Qué hace:**

- Corre solo, una vez al día, a la hora que se configure.
- Busca las OC en estado *Pending Receipt* que llevan **5 o más días** desde su última
  aprobación.
- Manda un correo al proveedor por cada una, con el PDF de la orden adjunto y la cantidad de
  días de atraso en el asunto y en el cuerpo.
- Deja el correo registrado en la propia OC, en la pestaña de comunicación.
- Al terminar deja en el log un resumen: cuántas procesó, cuántas envió y cuáles quedaron sin
  correo.

**Qué no hace:**

- No cancela ni cierra la orden.
- No avisa al comprador ni a nadie interno: el correo va al proveedor.
- No reenvía ni escala: manda el mismo correo todos los días mientras la OC siga pendiente.
- No manda nada si la OC no tiene ningún correo configurado; solo lo anota en el log.

## Quién lo usa

Nadie lo ejecuta a mano en el día a día: es un proceso automático.

Quien lo configura y lo supervisa necesita permiso de administrador para entrar al deployment
del script y para revisar el log de ejecución.

Quien recibe el correo es **el proveedor**.

## Dónde se usa

El proceso no tiene pantalla propia. Se controla desde su deployment:

```
Customization > Scripting > Scripts > AS Alerta OC Pendiente Recepcion
   > Deployments > AS Alerta OC Pendiente Recepcion
```

Desde ahí se ve el estado, se programa la hora, se cargan los parámetros y se revisa el
**Execution Log**.

## Requisitos previos

### En la orden de compra

Para que una OC entre en la alerta:

| Condición | Detalle |
|---|---|
| Estado | *Pending Receipt* |
| Antigüedad | 5 o más días desde la fecha de la última aprobación |

La fecha que se mira es la del campo **AS Ultima Fecha Aprobador**, no la fecha de la orden. Una
OC aprobada hoy no alerta aunque se haya creado hace un mes.

### Para que llegue el correo

La OC tiene que tener a quién escribirle. El sistema busca en tres lugares, **en este orden**,
y usa el primero que encuentre:

1. **Los contactos cargados del proveedor** — solo si la OC tiene marcado el check
   *Agrupar Contacto Proveedor*. Salen del registro **AS Correo Notificación OC por Subsidiaria**,
   filtrados por la subsidiaria y el proveedor de esa orden.
2. **El campo Correo de Notificación de la propia OC.**
3. **El correo cargado en la ficha del proveedor.**

Si los tres están vacíos, no se manda nada y la OC queda anotada en el resumen como *sin
correo*. **No es un error**: es un dato faltante y así se reporta.

> Como máximo se mandan **10 destinatarios** por correo. Si hay más contactos cargados, se
> toman los primeros 10 y el log deja constancia de cuántos se recortaron.

## Cómo usarlo

No hay que hacer nada en el día a día. Lo que sí hay que dejar configurado, una vez:

1. Entrar al deployment del script.
2. Cargar los tres parámetros de la pestaña **Parameters** (ver Configuración funcional).
3. En la pestaña **Schedule**, marcar *Daily Event*, elegir la hora y guardar.
4. Cambiar el **Status** a *Scheduled*.

Para probarlo sin esperar a la hora programada: **Actions → Save & Execute**, y después revisar
el Execution Log.

## Qué ocurre durante el proceso

El proceso arranca a la hora programada, arma la lista de órdenes que cumplen la condición, y
para cada una:

1. Decide a quién escribirle según la cascada de tres orígenes.
2. Genera el PDF de la orden.
3. Manda el correo con el asunto *Orden de Compra \<número\> - Pendiente de Recepción (N días)*
   y el PDF adjunto.
4. Deja el correo asociado a la orden.

Al final escribe una sola línea de resumen en el log con los totales y los ids de las órdenes
que quedaron sin correo o con error.

## Configuración funcional

### Los tres parámetros del deployment

```
Customization > Scripting > Script Deployments
   > AS Alerta OC Pendiente Recepcion > Parameters
```

| Parámetro | Qué poner | Obligatorio |
|---|---|---|
| **Plantilla Correo** | `Correo Alerta Orden de Compra Pendiente de Recepción` | Sí, en la práctica |
| **Plantilla PDF/HTML** | La plantilla de impresión de la OC (por ejemplo `Standard Purchase PDF/HTML Template 2`) | Sí, en la práctica |
| **Autor del Correo** | El empleado desde cuya casilla sale el correo | Sí, en la práctica |

> **Los tres están marcados como no obligatorios en NetSuite**, así que el deployment se deja
> guardar vacío — pero el envío falla. Si el log se llena de errores, esto es lo primero que
> hay que revisar.

**Cuidado con la Plantilla Correo.** Existe otra plantilla parecida, *Correo Orden de Compra
Aprobada*, que pertenece a otro proyecto y se manda cuando la OC se aprueba. No es esta. Si se
carga la equivocada, el proveedor recibe el aviso de "orden aprobada" en vez del de "pendiente
de recepción", y la cantidad de días no aparece.

**Sobre el Autor del Correo.** Conviene que no sea una persona: si el proveedor responde o el
correo rebota, tiene que llegar a un buzón que alguien revise. Lo indicado es un empleado tipo
"Sistemas" con una casilla real del dominio corporativo — no una inventada, porque los correos
a proveedores externos pueden ser rechazados si la casilla remitente no existe.

### La programación

```
> Deployments > AS Alerta OC Pendiente Recepcion > Schedule
   Daily Event, Repeat every 1 day, Start Time: la hora elegida, No End Date
   Status: Scheduled
```

Mientras el Status diga *Not Scheduled*, el proceso no corre aunque el schedule esté cargado.

### Los contactos del proveedor

```
Customization > Lists, Records & Fields > Record Types
   > AS Correo Notificación OC por Subsidiaria > New
   → Subsidiaria + Proveedor + Correo
```

Una fila por cada correo. Solo se usan si la OC tiene marcado *Agrupar Contacto Proveedor*, y
solo las filas activas y con correo cargado.

## Pendiente de configurar en NetSuite

1. **Cargar el parámetro Autor del Correo.** Está vacío y sin eso no sale ningún correo.
2. **Corregir el parámetro Plantilla Correo** si quedó apuntando a *Correo Orden de Compra
   Aprobada*.
3. **Crear el empleado remitente** de sistemas con buzón real, si se decide no dejar a una
   persona como autor.
4. **Programar el deployment** y dejarlo en *Scheduled*.

## Restricciones y consideraciones

**El corte de 5 días está fijo en el código.** No es un parámetro: para alertar a los 3 o a los
10 días hay que modificar el script y desplegarlo.

**Son días calendario**, no hábiles. Una OC aprobada un miércoles alerta el lunes siguiente.

**El correo se repite todos los días** mientras la orden siga en *Pending Receipt*. No hay
control de "ya se le avisó ayer".

**Una OC sin correo no es un error.** Aparece en el resumen como *sin correo* y el proceso
sigue con las demás.

**El tope de 10 destinatarios es de NetSuite**, no del módulo: `N/email.send` no admite más
entre destinatarios, copia y copia oculta.

**Si se vuelve a desplegar el proyecto desde el repositorio, el deployment vuelve a quedar en
*Not Scheduled*** y hay que reprogramarlo. Es un detalle a tener presente después de cada pase.

## Errores y solución

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El proceso no corre nunca | El Status del deployment está en *Not Scheduled* | Programarlo y ponerlo en *Scheduled* |
| Todas las OC salen con error en el log | Falta el parámetro Autor del Correo | Cargarlo |
| El correo llega con el texto equivocado | Está cargada la plantilla de OC aprobada | Cambiar el parámetro Plantilla Correo |
| El correo llega sin PDF adjunto | Falta el parámetro Plantilla PDF/HTML | Cargarlo |
| Una OC aparece como *sin correo* | Ni contactos, ni Correo de Notificación, ni email en el proveedor | Cargar alguno de los tres |
| Llegaron menos correos que contactos cargados | Se aplicó el tope de 10 | Ver el log: dice de cuántos se recortó |
| Una OC no alerta y debería | No está en *Pending Receipt*, o no han pasado 5 días desde la última aprobación | Revisar el estado y la fecha del último aprobador |

## Resultado esperado

Con el deployment en *Scheduled* y los tres parámetros cargados, cada día a la hora fijada el
Execution Log debe mostrar **una sola línea de resumen** como esta:

```
Alerta OC pendiente de recepcion - Resumen
OC procesadas: 55 | Alertas enviadas: 54 | Sin correo: 1 | Con error: 0 | OC sin correo (id): 12345
```

Si *Con error* es distinto de cero, hay que abrir el log y revisar el detalle de cada OC
fallida. Si *Sin correo* crece, faltan correos cargados en proveedores o en las órdenes.

El proveedor recibe un correo con el asunto *Orden de Compra \<número\> - Pendiente de Recepción
(N días)* y el PDF de la orden adjunto.
