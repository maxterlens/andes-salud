# Comportamiento del Sistema — Registro de Solicitud de Inventario

<!-- ficha
version: 0.1
fecha: 01/10/2026
-->

## Cómo funciona

Se entra por `Transacciones > Gestion de Movimientos > Solicitudes de Inventario`. Cada
solicitud es un préstamo, una devolución o una merma, y pasa por dos pasos: primero se guarda
con `Guardar Solicitud`, y queda `Pendiente de Procesar` sin mover inventario; después se
procesa con el botón de su tipo, y el sistema valida el stock y genera el movimiento de
inventario. Mientras está `Pendiente de Procesar` se puede corregir o anular; una vez procesada
ya no se edita y queda como registro.

| Estado | Qué significa | Qué se puede hacer |
|---|---|---|
| `Pendiente de Procesar` | La solicitud está guardada y todavía no movió inventario | Editar, `Anular Movimiento`, procesar e `Imprimir Comprobante` |
| `Pendiente de Devolucion` | Préstamo procesado: el material está en la bodega de préstamos | Registrar devoluciones e imprimir |
| `Devuelto Parcial` | Préstamo con una parte ya devuelta | Registrar devoluciones por lo que falta e imprimir |
| `Devuelto Total` | Préstamo devuelto completo | Consultar e imprimir |
| `Procesado` | Devolución o merma ejecutada | Consultar e imprimir |
| `Anulado` | Solicitud descartada antes de procesar; no movió inventario | Consultar e imprimir |

## Actores

| ID | Actor | Qué hace |
|---|---|---|
| ACT-01 | QF CASPM | Registra y procesa préstamos, devoluciones y mermas; corrige, anula, consulta e imprime |
| ACT-02 | Administrator | Lo mismo que QF CASPM, y mantiene la configuración del registro |
| ACT-03 | Rol de consulta | Cualquier otro rol: consulta solicitudes e imprime comprobantes |

## Glosario

| Palabra | Qué significa |
|---|---|
| Solicitud | El registro de un préstamo, una devolución o una merma |
| Préstamo | Material de farmacia que se entrega a otra institución y que tiene que volver |
| Devolución | El material de un préstamo que vuelve, completo o en partes |
| Merma | Material que se da de baja porque está vencido, deteriorado, en cuarentena u otro motivo |
| Entidad receptora | La institución que recibe el material prestado |
| Bodega de préstamos | La ubicación de cada subsidiaria donde queda registrado el material prestado mientras está afuera |
| Lote | El número que identifica una partida de un artículo |
| Pendiente | Lo que falta devolver de un préstamo |
| Procesar | El paso que mueve el inventario de verdad |
| Traslado de inventario | El movimiento que NetSuite genera al procesar un préstamo o una devolución |
| Ajuste de inventario | El movimiento que NetSuite genera al procesar una merma: descuenta el material |
| Cuenta de ajuste | La cuenta contable donde se registra la merma |

## Cómo leer los diagramas

- La figura de persona es el rol y cada óvalo es algo que se hace en el sistema.
- La línea continua une al rol con lo que hace; la flecha punteada «include» marca un paso que
  siempre ocurre dentro de otro, y «extend», algo opcional.
- Debajo de cada diagrama, la tabla dice lo mismo con palabras: "Usa" es lo que el rol inicia,
  "Incluido en" es un paso que siempre ocurre dentro de ese caso, y "Extiende" es algo opcional.

## Procesos

### Proceso 1 — Préstamo

Flujo: QF CASPM o Administrator registra el préstamo: selecciona subsidiaria, servicio y
ubicación de origen; el sistema asigna como destino la bodega de préstamos; elige la entidad
receptora e ingresa artículos, lotes y cantidades. Mientras no lo procese, puede corregirlo o
anularlo. Al procesarlo, el sistema valida el stock y genera el traslado hacia la bodega de
préstamos, y el préstamo queda `Pendiente de Devolucion`.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-01 | Registrar préstamo | Usa: ACT-01, ACT-02 | Crea la solicitud de préstamo con sus datos y artículos; queda `Pendiente de Procesar`, sin mover inventario |
| CU-02 | Seleccionar subsidiaria | Incluido en: CU-01 | Define la subsidiaria de la solicitud; las listas del formulario se cargan solo con lo de esa subsidiaria |
| CU-03 | Seleccionar servicio y ubicación | Incluido en: CU-01 | Indica el servicio y la ubicación de donde sale el material |
| CU-04 | Asignar bodega de préstamos como destino | Incluido en: CU-01 | El sistema completa el destino con la bodega de préstamos de la subsidiaria |
| CU-05 | Seleccionar entidad receptora | Incluido en: CU-01 | Elige la institución que se lleva el material, solo entre las activas autorizadas para la subsidiaria; es obligatoria |
| CU-06 | Ingresar artículos, lotes y cantidades | Incluido en: CU-01 | Agrega cada artículo, el lote cuando aplica y la cantidad; el sistema muestra lo disponible. Con lote, si se pide más de lo que hay se ajusta solo; sin lote, no deja guardar |
| CU-07 | Procesar préstamo | Usa: ACT-01, ACT-02 | Ejecuta el préstamo con `Procesar Prestamo`; queda `Pendiente de Devolucion` y el material, en la bodega de préstamos |
| CU-08 | Validar stock | Incluido en: CU-07 | Antes de mover, compara lo pedido con lo que hay del lote o del artículo en la ubicación de salida; los lotes `Bloqueado`, `En Inspección` o `Damaged` no cuentan. Si falta en una línea, no se mueve nada |
| CU-09 | Generar traslado de inventario | Incluido en: CU-07 | Mueve el material con un traslado de inventario: hacia la bodega de préstamos al prestar, de vuelta a la ubicación de origen al devolver |
| CU-10 | Corregir o anular solicitud | Extiende: CU-01 | Solo mientras está `Pendiente de Procesar`: permite corregir fecha, responsable, comentarios y artículos, o anular la solicitud sin mover inventario |

### Proceso 2 — Devolución

Flujo: QF CASPM o Administrator registra la devolución: selecciona la subsidiaria y el préstamo
pendiente, con un filtro opcional por entidad receptora; el sistema hereda del préstamo el
origen (la bodega de préstamos) y el destino (la ubicación de donde salió), y el usuario indica
cuánto vuelve. Al procesarla, el sistema toma los mismos lotes del préstamo, valida que estén en
la bodega, genera el traslado de vuelta y descuenta el pendiente del préstamo.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-11 | Registrar devolución | Usa: ACT-01, ACT-02 | Crea la solicitud de devolución de un préstamo; queda `Pendiente de Procesar`, sin mover inventario |
| CU-02 | Seleccionar subsidiaria | Incluido en: CU-11 | Define la subsidiaria de la solicitud; las listas del formulario se cargan solo con lo de esa subsidiaria |
| CU-12 | Seleccionar préstamo pendiente | Incluido en: CU-11 | Muestra los préstamos de la subsidiaria con cantidad pendiente, con su número, entidad, ubicación de origen y pendiente, y toma el elegido |
| CU-13 | Filtrar por entidad receptora | Extiende: CU-12 | Opcional: deja solo los préstamos de una entidad; vacío, muestra todos, incluidos los antiguos registrados sin entidad |
| CU-14 | Heredar origen y destino del préstamo | Incluido en: CU-11 | El sistema toma subsidiaria, servicio y entidad del préstamo, fija el origen en la bodega de préstamos y el destino en la ubicación de donde salió el material |
| CU-15 | Ingresar cantidades a devolver | Incluido en: CU-11 | Muestra lo prestado, lo devuelto y lo pendiente de cada artículo, con la cantidad a devolver cargada con lo pendiente; no deja devolver más |
| CU-16 | Procesar devolución | Usa: ACT-01, ACT-02 | Ejecuta la devolución con `Procesar Devolucion`; queda `Procesado` y el préstamo, `Devuelto Parcial` o `Devuelto Total` |
| CU-17 | Tomar los lotes del préstamo | Incluido en: CU-16 | El sistema devuelve los mismos lotes que salieron en el préstamo, descontando lo que ya volvió en devoluciones anteriores |
| CU-08 | Validar stock | Incluido en: CU-16 | Antes de mover, compara lo pedido con lo que hay del lote o del artículo en la ubicación de salida; los lotes `Bloqueado`, `En Inspección` o `Damaged` no cuentan. Si falta en una línea, no se mueve nada |
| CU-09 | Generar traslado de inventario | Incluido en: CU-16 | Mueve el material con un traslado de inventario: hacia la bodega de préstamos al prestar, de vuelta a la ubicación de origen al devolver |
| CU-18 | Actualizar pendiente del préstamo | Incluido en: CU-16 | Resta lo devuelto de cada línea del préstamo; si no queda nada pendiente lo deja `Devuelto Total` y, si queda, `Devuelto Parcial` |
| CU-10 | Corregir o anular solicitud | Extiende: CU-11 | Solo mientras está `Pendiente de Procesar`: permite corregir fecha, responsable, comentarios y artículos, o anular la solicitud sin mover inventario |

### Proceso 3 — Merma

Flujo: QF CASPM o Administrator registra la merma: selecciona subsidiaria, servicio y ubicación,
el motivo de la baja y la cuenta de ajuste, e ingresa artículos, lotes y cantidades. Mientras no
la procese, puede corregirla o anularla. Al procesarla, el sistema valida el stock y genera un
ajuste que descuenta el material de la misma ubicación, y la merma queda `Procesado`.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-19 | Registrar merma | Usa: ACT-01, ACT-02 | Crea la solicitud de merma con sus datos y artículos; queda `Pendiente de Procesar`, sin mover inventario |
| CU-02 | Seleccionar subsidiaria | Incluido en: CU-19 | Define la subsidiaria de la solicitud; las listas del formulario se cargan solo con lo de esa subsidiaria |
| CU-03 | Seleccionar servicio y ubicación | Incluido en: CU-19 | Indica el servicio y la ubicación de donde sale el material |
| CU-20 | Seleccionar motivo de baja | Incluido en: CU-19 | Elige el motivo: `Vencimiento`, `Deterioro`, `Cuarentena` u `Otro` |
| CU-21 | Seleccionar cuenta de ajuste | Incluido en: CU-19 | Elige la cuenta contable de la merma, solo entre las activas autorizadas para la subsidiaria |
| CU-06 | Ingresar artículos, lotes y cantidades | Incluido en: CU-19 | Agrega cada artículo, el lote cuando aplica y la cantidad; el sistema muestra lo disponible. Con lote, si se pide más de lo que hay se ajusta solo; sin lote, no deja guardar |
| CU-22 | Procesar merma | Usa: ACT-01, ACT-02 | Ejecuta la merma con `Procesar Merma`; queda `Procesado` y el material sale del inventario |
| CU-08 | Validar stock | Incluido en: CU-22 | Antes de mover, compara lo pedido con lo que hay del lote o del artículo en la ubicación de salida; los lotes `Bloqueado`, `En Inspección` o `Damaged` no cuentan. Si falta en una línea, no se mueve nada |
| CU-23 | Generar ajuste de inventario | Incluido en: CU-22 | Descuenta el material de la misma ubicación contra la cuenta elegida |
| CU-10 | Corregir o anular solicitud | Extiende: CU-19 | Solo mientras está `Pendiente de Procesar`: permite corregir fecha, responsable, comentarios y artículos, o anular la solicitud sin mover inventario |

### Proceso 4 — Corrección, consulta y configuración

Flujo: Antes de procesar, QF CASPM o Administrator puede corregir o anular cualquier solicitud;
una vez procesada, ya no se edita. Cualquier rol consulta las solicitudes e imprime su
comprobante. Administrator, además, configura por subsidiaria las entidades receptoras, las
cuentas de merma y la bodega de préstamos, que alimentan las listas del registro.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-10 | Corregir o anular solicitud | Usa: ACT-01, ACT-02 | Solo mientras está `Pendiente de Procesar`: permite corregir fecha, responsable, comentarios y artículos, o anular la solicitud sin mover inventario |
| CU-24 | Consultar solicitudes | Usa: ACT-01, ACT-02, ACT-03 | Busca y abre solicitudes: estado, artículos, lotes y movimiento de inventario generado. Un rol de consulta solo puede verlas |
| CU-25 | Imprimir comprobante | Usa: ACT-01, ACT-02, ACT-03 | Genera el PDF con la plantilla del tipo de solicitud, en cualquier estado, incluso anulada |
| CU-26 | Configurar entidades receptoras | Usa: ACT-02 | Registra las instituciones a las que presta cada subsidiaria; una entidad inactiva deja de aparecer al prestar |
| CU-27 | Configurar cuentas de merma | Usa: ACT-02 | Registra las cuentas contables autorizadas para merma en cada subsidiaria; una cuenta inactiva deja de aparecer |
| CU-28 | Configurar bodega de préstamos | Usa: ACT-02 | Marca una ubicación por subsidiaria como bodega de préstamos, que el sistema usa como destino al prestar |
