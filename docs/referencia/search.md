# Buscar datos en NetSuite

Las tres formas que existen, cuando usar cada una, y como se usan hoy en Andes.

Fuente: [N/search Module](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4345764122.html)
y [SuiteScript 2.x Search Operators](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_4094344956.html).

## Cual de las tres

| Necesito | Uso | Costo |
|---|---|---|
| Uno o dos campos de UN registro que ya se cual es | `search.lookupFields` | 1 unidad |
| Un conjunto de registros con filtros | `search.create` | 10 unidades |
| Cruzar tablas, agrupar, o traer miles de filas | `N/query` (SuiteQL) | 10 unidades |

La regla que ya se aplica en el repo: **nunca un `lookupFields` dentro de un `forEach`**.
Si son N registros, es una sola busqueda con `anyof` y despues se recorre el resultado.

## search.lookupFields

Lo mas barato. Solo sirve si ya tienes el id interno.

```js
const proveedor = search.lookupFields({
    type:    search.Type.VENDOR,
    id:      oc.vendorId,
    columns: ['email']
});
```

Para campos de tipo lista devuelve un array de `{value, text}`, no un string.
Para joins se usa punto: `columns: ['address.address', 'taxidnum']`.

Precedente: `AS_NSP_016.../handlers/AlertaOrdenCompraHandler.js`, funciones
`correoDelProveedor` y `generarPdf`.

## search.create

```js
search.create({
    type:    search.Type.PURCHASE_ORDER,
    filters: [
        ['mainline', 'is',    'T'],          'AND',
        ['status',   'anyof', 'PurchOrd:B'], 'AND',
        ['custbody_as_correo_notif_email', 'isnotempty', '']
    ],
    columns: ['tranid', 'entity', 'subsidiary']
}).run().each((resultado) => {
    // ...
    return true;   // false corta el recorrido
});
```

### Recorrer el resultado

- `.each()` — recorre, pero **tope de 4.000 filas**. Sirve para el caso normal.
- `.getRange({start, end})` — hasta 1.000 por llamada. Se usa cuando solo interesan
  las primeras filas: `getRange({start: 0, end: 1})` para saber si existe algo.
- `.runPaged()` — sin tope de 4.000. Es la unica opcion cuando el volumen es grande.
- En Map/Reduce, `getInputData` puede devolver la busqueda entera y NetSuite pagina solo.

### Leer una columna

- `getValue` devuelve el id interno; `getText` devuelve la etiqueta.
- Un checkbox devuelve el **string** `'T'` o `'F'`, no un booleano. `if (valor)` da
  true incluso con `'F'`: hay que comparar contra `'T'` explicitamente.

## Operadores por tipo de campo

Elegir un operador que no corresponde al tipo de campo tira
`SSS_INVALID_SRCH_OPERATOR` en tiempo de ejecucion, no al guardar.

| Tipo de campo | Operadores |
|---|---|
| Texto | `is` `isnot` `contains` `doesnotcontain` `startswith` `doesnotstartwith` `haskeywords` |
| Numerico / Moneda | `equalto` `notequalto` `greaterthan` `greaterthanorequalto` `lessthan` `lessthanorequalto` `between` `notbetween` `isempty` `isnotempty` |
| Fecha | `on` `onorafter` `onorbefore` `after` `before` `within` `notwithin` `noton` `notonorafter` `notonorbefore` `notafter` `notbefore` `isempty` `isnotempty` |
| Lista / Registro | `anyof` `noneof` |
| Multiselect | `allof` `notallof` `anyof` `noneof` |
| Checkbox | `is` con `'T'` o `'F'` |

## Filtros con formula

Cuando la condicion no es un campo sino un calculo. El operador es el del tipo que
devuelve la formula, y el nombre del filtro es `formulanumeric` / `formuladate` /
`formulatext`.

```js
['formulanumeric: TRUNC({today}) - TRUNC({custbody_as_ultimo_fecha_aprobador})',
 'greaterthanorequalto', 5]
```

Dentro de la formula los campos van entre llaves y es SQL de Oracle, no JavaScript.
Precedente: `AS_NSP_016.../handlers/AlertaOrdenCompraHandler.js`,
`buscarOrdenesPendientesRecepcion`.

## Transacciones: el filtro que siempre falta

Una busqueda de transacciones devuelve **una fila por linea contable**, no una por
documento. Sin `['mainline', 'is', 'T']` una factura de 4 lineas aparece 4 veces y
cualquier conteo queda inflado.

Los tres que casi siempre van juntos:

```js
['type',     'anyof', 'CustInvc'],   // el tipo, con su codigo interno
['mainline', 'is',    'T'],          // solo la cabecera
['internalidnumber', 'notequalto', idInterno]   // excluirse a si mismo al editar
```

Precedente: `AS_NSP_012.../handlers/AS_FacturaVentaHandler.js`, `buscarFacturaDuplicada`.

## Cuando pasar a N/query

`N/search` no cruza tablas arbitrarias ni agrupa con libertad. Para eso esta SuiteQL
via `N/query`, que ademas trae miles de filas en una sola llamada y evita el patron
de N busquedas dentro de un ciclo.

En el repo se usa en AS_NSP_018 para stock y lotes por ubicacion.
