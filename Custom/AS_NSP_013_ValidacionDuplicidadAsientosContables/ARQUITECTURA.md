# Validación de duplicidad de Asientos Contables (AS_NSP_013)

## El problema

Se estaban colando asientos contables duplicados: la misma línea (misma cuenta, mismo cliente/proveedor, mismo documento de origen) terminaba registrada dos veces, en el mismo Journal Entry o en dos distintos. Este proyecto agrega una validación que corta eso antes de guardar.

Importante: esto **no valida saldos**. No revisa si un asiento sobreaplica un pago, no calcula acumulados, no toca nada de eso. Solo compara identidad de líneas. El tema de saldo/sobreaplicación quedó fuera de alcance a propósito — hay una investigación aparte para eso (ver más abajo, sección del suitelet QA).

## Las tres piezas y por qué están separadas

**`AS_AsientoContableHandler.js`** tiene toda la lógica. No sabe nada de UI, no sabe si lo está llamando un Client Script o un User Event — recibe el record del asiento y devuelve una lista de mensajes de error (vacía si no hay problema). Se separó así porque quería una sola fuente de verdad para la regla de negocio, sin duplicarla entre el CS y el UE.

**`AS_AsientoContable_UE_2.1.js`** (User Event, `beforeSubmit`) es la barrera real. Corre siempre — UI, CSV import, integraciones, API — no importa por dónde entre el guardado. Si el handler devuelve errores, tira `error.create()` y bloquea.

**`AS_AsientoContable_CS_2.1.js`** (Client Script, `saveRecord`) es solo cosmético. Muestra el mismo mensaje pero como un diálogo bonito antes de que el usuario intente guardar, para que no tenga que esperar el viaje al servidor para enterarse. No bloquea nada por sí solo — si no está deployado en algún lado, el UE igual frena el guardado, solo que el usuario ve el error genérico de NetSuite en vez del diálogo prolijo.

## La llave de duplicidad

```
Subsidiaria (de línea) + Cuenta + Entidad + Folio + Movimiento (Debe/Haber)
```

Dos líneas son "la misma" si coinciden en estos cinco campos. El monto no entra en la llave — a propósito, un duplicado real no deja de serlo porque alguien cambió el monto por error.

El `movimiento` (Debe/Haber) está en la llave porque el par contable de un mismo documento comparte los otros cuatro campos y es completamente legítimo: un asiento reconoce el cargo en Debe, otro (o la misma línea siguiente) aplica el pago en Haber. Lo que se bloquea es que se repita el **mismo lado**, no el par. Esto aplica igual si el par vive en el mismo asiento o en dos distintos — la llave no sabe en qué transacción vive cada línea.

El folio (`custcol_2w_folio`) es el único de los cinco que es texto libre — los otros cuatro son ids que salen de campos tipo lista, así que llegan siempre limpios. El folio lo tipea gente o lo mandan integraciones externas, así que se normaliza (`trim` + `toUpperCase`) antes de comparar, para no fallar por un espacio de más o una diferencia de mayúsculas.

La subsidiaria se lee por línea (`linesubsidiary`), con fallback a la de cabecera cuando no existe — más abajo se explica por qué.

## Por qué una sola búsqueda por asiento

En vez de buscar duplicados línea por línea, se junta todo lo necesario (cuentas, entidades, folios, subsidiarias del asiento completo) y se hace **una** búsqueda a `search.Type.JOURNAL_ENTRY`, después se descarta en memoria comparando la llave exacta. SuiteScript no permite filtrar por combinaciones compuestas de campos directamente, así que el filtro de búsqueda solo acota candidatos (más amplio de lo necesario) y la llave hace el descarte fino. Esto evita que el costo de gobernanza crezca con el número de líneas del asiento.

Dos detalles de Journal Entry que costó averiguar:
- No hay filtro de `mainline` — el JE no tiene línea principal, ese campo llega vacío y filtrar por `mainline is F` descartaría todo.
- Los nombres de columna de búsqueda no son los mismos que los de la sublista: la entidad se busca como `name` (en el record es `entity`), el monto del Debe como `debitamount` (en el record es `debit`).

## La excepcion por cuenta

Hay cuentas donde repetir la llave completa es un movimiento legitimo, no un error: los pagos manuales con tarjeta de credito y debito registran el mismo folio de la misma entidad mas de una vez. Para esos casos existe el checkbox **AS Exenta de control de duplicidad** (`custrecord_as_cuenta_exenta_dup`) sobre el record Account.

Una linea cuya cuenta este marcada **no entra a la lista de control**: queda fuera de los dos controles a la vez, el interno y el externo, porque ni siquiera llega a la lista que los alimenta. El resto de las lineas del mismo asiento se sigue validando normal.

Es un checkbox sobre la cuenta y no un parametro del deployment por una razon concreta: la lista la necesitan el User Event **y** el Client Script. Con un parametro habria que definirlo en los dos scripts y mantener los dos valores iguales a mano; el dia que se desincronicen, uno bloquea y el otro no. El checkbox es una sola fuente que los dos leen, y agregar otra cuenta es marcarla en NetSuite sin desplegar codigo.

Cuando la excepcion se aplica queda rastro: un `log.audit` por asiento con cuantas lineas se exoneraron.

Advertencia al marcar una cuenta: se pierde tambien la deteccion **externa** en ella, que es la que atrapa que una misma carga se suba dos veces. Antes de marcar una cuenta conviene confirmar que los choques que da hoy son legitimos y no una carga repetida.

## El caso de Advanced Intercompany Journal Entry

Esto fue lo que más costó cerrar. Un AIJE (`advintercompanyjournalentry`) puede tener líneas de subsidiarias distintas bajo una misma cabecera — se confirmó con un asiento real donde la cabecera decía subsidiaria 5 pero dos de las cuatro líneas eran, de verdad, subsidiaria 13 (`linesubsidiary`). La primera versión del handler le pegaba la subsidiaria de cabecera a todas las líneas por igual, lo que rompía la llave para esas líneas — tanto para la comparación interna como para el filtro de búsqueda externa (que originalmente solo miraba la subsidiaria de la primera línea del array).

Se corrigió leyendo `linesubsidiary` por línea con fallback a la de cabecera (un JE normal no tiene ese campo en absoluto, así que el fallback es seguro), y el filtro de búsqueda ahora usa el conjunto completo de subsidiarias presentes en el asiento, no solo la primera.

Aparte del código, había un problema de configuración: un User Event deployado sobre record type "Journal Entry" **no se dispara** cuando el guardado entra por la pantalla de Advanced Intercompany Journal Entry, aunque por dentro NetSuite guarde el mismo tipo de transacción (`dbstrantype = Journal`). Hace falta un segundo `scriptdeployment` del mismo script, apuntando al record type de AIJE. Ya se agregó y se probó — bloquea correctamente en ambos casos.

## Lo que hay que revisar en el deployment (no es código, es configuración)

El `executioncontext` del deployment del UE decide si la validación corre o no según de dónde venga el guardado. Vale la pena confirmar que cubra:

- **CSV Import**: si no está incluido, una carga masiva de asientos pasa sin validar, sin aviso. Aparte del `executioncontext`, el propio wizard de importación de NetSuite tiene un checkbox ("Run Server SuiteScript and Trigger Workflows") que, si queda destildado, apaga todos los scripts de servidor sin importar cómo esté configurado el deployment — eso no se arregla desde acá, es un tema operativo de quien corre la carga.
- **Map/Reduce y Scheduled**: la integración con el sistema POS/farmacia (`2win_andes_salud_interfases`, fuera de este proyecto) crea asientos de forma automática. Si algún día ese pipeline reintenta procesar el mismo documento dos veces, antes generaba un duplicado silencioso — ahora la segunda pasada va a fallar. Es el comportamiento correcto, pero conviene que quien mantiene esa integración lo sepa antes de que le aparezca como un error inesperado.

## El suitelet QA de saldo (aparte, no es esta validación)

`AS_HistorialSaldoQA_SL_2.1.js` es una herramienta desechable, de solo lectura, para explorar el histórico de Cuentas por Cobrar de un paciente — sirve para la investigación de una futura validación de sobreaplicación de saldo, que todavía no existe. No valida ni bloquea nada. Tiene un formulario simple: selector de Cliente (nativo de NetSuite) y/o Ficha Paciente como texto libre.

Un hallazgo de esa investigación que vale la pena dejar anotado: el campo `custbody_2w_as_ficha_paciente` no está poblado en todas las rutas de creación de transacciones. Filtrar el histórico de un paciente solo por ese campo puede dejar afuera documentos reales suyos y mostrar un saldo incompleto — hay que cruzar también por `entity` (el cliente). Esto es justo el tipo de cosa que hay que resolver antes de poder construir una validación de saldo confiable — no alcanza con reusar la ficha como llave sin más.

Este suitelet y su deployment se borran cuando la investigación termine, como dice su propia descripción.
