# Guía de usuario — Reclasificación de Factura de Compra a Factoring

## Para qué sirve

Cuando una factura de compra se cede a una empresa de factoring, la deuda deja de ser con
el proveedor original y pasa a ser con el factor. Este módulo genera ese traspaso
contable desde la misma factura: crea el asiento que cancela la deuda con el proveedor y
levanta la deuda con el factor, y lo deja aplicado a la factura.

Antes había que armar ese asiento a mano y aplicarlo a la factura, y la factura quedaba
abierta si la aplicación no se hacía bien.

## Alcance

Lo que hace:

- Valida que la factura esté en condiciones de reclasificarse.
- Crea un asiento contable aprobado con dos líneas: el debe contra la cuenta por pagar de
  la factura y el haber contra la cuenta de factoring.
- Aplica ese asiento a la factura, con lo que la factura queda pagada.
- Guarda el asiento generado en el campo **Diario Factoring** de la factura.

Lo que no hace:

- No paga al factor ni genera ningún movimiento de caja: es un traspaso de acreedor
  dentro del pasivo.
- No reversa una reclasificación. Una factura ya reclasificada no se puede volver a
  reclasificar desde el botón.
- No procesa varias facturas juntas: se reclasifica de a una.
- No corrige la configuración del proveedor de factoring. Si al factor le falta la
  subsidiaria de la factura, el módulo lo detecta y avisa, pero la subsidiaria hay que
  agregarla a mano en el proveedor.

## Quién lo usa

Solo los roles autorizados ven el botón. Hoy son:

| Rol |
|---|
| Administrador |
| Andes - Analista Contable |
| Supervisor Contable Andes Salud |
| Andes - Jefe de Contabilidad |

Quien entre con cualquier otro rol no verá el botón en la factura, y tampoco puede
disparar el proceso por otra vía.

## Dónde se usa

En la **Factura de compra** (Vendor Bill), en modo vista. El botón se llama
**Reclasificar a Factoring** y aparece en la barra de botones junto a Editar.

## Requisitos previos

La factura tiene que cumplir las cinco condiciones a la vez:

| Condición | Dónde se ve |
|---|---|
| Estado de aprobación **Aprobado** | Información primaria |
| Check **Factoring** marcado | pestaña Personalizado |
| **Proveedor Factoring** con el factor elegido | Información primaria |
| **Retención del pago** desmarcado | Información primaria |
| El **Proveedor Factoring** habilitado en la subsidiaria de la factura | pestaña Subsidiarias del proveedor |

Si falta alguna, el módulo lo dice al presionar el botón, y las muestra todas juntas en
una sola lista para corregirlas de una pasada.

La quinta condición es la que menos se ve a simple vista. El asiento se crea en la
subsidiaria de la factura, y NetSuite solo acepta un proveedor en una transacción si ese
proveedor tiene esa subsidiaria en su pestaña **Subsidiarias**. Un factor puede estar
habilitado en varias subsidiarias a la vez, pero tiene que estar en la de la factura que
se está reclasificando.

## Cómo usarlo

1. Abre la factura de compra en modo vista.
2. Presiona **Reclasificar a Factoring**.
3. La página se recarga y arriba aparece un mensaje con el resultado.
4. Si el mensaje lista requisitos faltantes, edita la factura, complétalos, guarda y
   vuelve a presionar el botón.
5. Si el mensaje confirma que la reclasificación está en proceso, espera unos segundos y
   recarga la factura para ver el asiento generado.

## Qué ocurre durante el proceso

El botón siempre recarga la misma factura y muestra uno de estos cuatro mensajes:

| Mensaje | Qué significa |
|---|---|
| **Reclasificacion en proceso** | Todo estaba en orden y el proceso se encoló. El asiento se está generando; puede demorar unos minutos. |
| **Falta completar la factura para reclasificarla** | La factura no cumple uno o más requisitos. El mensaje lista cuáles. |
| **Factura ya reclasificada** | Esta factura ya tiene su asiento. El mensaje incluye el enlace al asiento generado. |
| **Reclasificacion en curso** | Hay una reclasificación procesándose y solo se procesa una a la vez. Casi siempre es la de esta misma factura, si acabas de presionar el botón. Espera unos segundos y recarga. |

El botón se desactiva al presionarlo, para que un doble clic no encole el proceso dos
veces.

## Configuración funcional

No hay parámetros que se completen desde NetSuite: el módulo no usa custom records de
configuración ni parámetros de deployment que el usuario deba llenar. El único parámetro
del proceso, **Id Factura** (`custscript_as_rf_factura`), lo escribe el sistema al
encolar y no se completa a mano.

Lo que sí es configuración funcional, y se hace sin desarrollo, es la **pestaña
Subsidiarias de cada proveedor de factoring**: ahí se agrega o se quita en qué
subsidiarias puede operar cada factor. Es lo que determina con qué facturas puede usarse.

Cambiar los roles autorizados, la cuenta de factoring o el tipo de diario **requiere
desarrollo y un nuevo despliegue**.

## Pendiente de configurar en NetSuite

Antes de usarlo en una cuenta nueva o al pasar a producción hay que verificar que existan
y sean correctos:

- La cuenta contable de factoring que usa el haber del asiento.
- El tipo de diario Factoring.
- Los ids de los roles autorizados, que son distintos en cada cuenta.
- Los campos de la factura (**Factoring**, **Proveedor Factoring**, **Diario Factoring**)
  y las columnas de aplicación del asiento: el módulo los usa pero no los crea.
- **Las subsidiarias de cada proveedor de factoring.** Cada factor debe tener, en su
  pestaña Subsidiarias, todas las subsidiarias cuyas facturas vaya a comprar. Las listas
  actuales están incompletas y son distintas entre un factor y otro, por lo que hoy la
  reclasificación funciona con unas facturas y falla con otras.

## Restricciones y consideraciones

- **Se procesa una factura a la vez.** Si dos personas reclasifican al mismo tiempo, la
  segunda recibe el aviso de proceso ocupado y tiene que reintentar.
- **La Retención del pago tiene que estar desmarcada.** Con la factura retenida NetSuite
  no la ofrece en el selector de transacción relacionada del asiento y la aplicación no
  se puede hacer. Una vez reclasificada la factura queda pagada, así que ya nadie puede
  pagarle al proveedor original.
- **El factor tiene que estar habilitado en la subsidiaria de la factura.** No basta con
  que esté habilitado en alguna: tiene que estar en la de esa factura en particular. Un
  mismo factor puede servir para una factura de Puerto Montt y fallar con una de Chillán
  si no tiene Chillán en su lista.
- **El selector de Proveedor Factoring no filtra.** Muestra todos los proveedores, no solo
  los factores ni solo los habilitados en la subsidiaria de la factura. La validación
  ocurre al presionar el botón, no al elegir.
- **El asiento se crea aprobado.** Un asiento pendiente de aprobación no impacta el
  mayor, la factura seguiría abierta y la reclasificación no habría reclasificado nada.
- **No hay vuelta atrás desde el botón.** Si un asiento se generó mal, la corrección es
  contable y manual.

## Errores y solución

| Situación | Causa | Qué hacer |
|---|---|---|
| No aparece el botón | El rol con el que entraste no está autorizado | Cambiar a un rol autorizado, o pedir que se agregue el rol (requiere desarrollo) |
| "Estado de aprobación: la factura debe estar Aprobado" | La factura está pendiente o rechazada | Aprobar la factura y reintentar |
| "Factoring: marca el check…" | Falta indicar que la deuda se cede | Editar la factura, marcar **Factoring**, guardar |
| "Proveedor Factoring: elige la entidad…" | Falta el factor | Editar la factura, elegir el **Proveedor Factoring**, guardar |
| "Retención del pago: desmarcalo…" | La factura está retenida | Editar la factura, desmarcar **Retención del pago**, guardar |
| "Proveedor Factoring: … no está habilitado en la subsidiaria …" | El factor elegido no tiene esa subsidiaria en su pestaña Subsidiarias | Elegir otro factor que sí la tenga, o pedir que agreguen esa subsidiaria al proveedor y reintentar |
| "Reclasificacion en curso" justo después de presionar el botón | Es tu propia reclasificación: ya se encoló y sigue procesándose | Esperar unos segundos y recargar la factura. El asiento aparece cuando el proceso termina |
| "Reclasificacion en curso" sin haber presionado el botón | Otro usuario está reclasificando una factura en este momento; esta factura no se encoló | Esperar unos segundos y volver a presionar el botón |
| Presioné el botón, dice "en proceso", pero la factura no muestra el asiento | El proceso puede demorar unos minutos | Recargar la factura. Si sigue sin aparecer, pedir a desarrollo que revise el log del proceso |

## Resultado esperado

La reclasificación terminó bien cuando, al recargar la factura:

- la pestaña **Personalizado** muestra el asiento en el campo **Diario Factoring**;
- la factura queda **Pagado por completo**;
- al presionar el botón nuevamente aparece el mensaje **Factura ya reclasificada** con el
  enlace al asiento.
