/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @author      Andes Salud
 * @version     1.0.0
 * @description Busca la nota de credito creada cuando una automatizacion posterior devuelve error.
 */
define(['N/search'],
    (search) => {

    const buscarNotaCredito = (fila) => {
        const resultados = search.create({
            type: search.Type.TRANSACTION,
            filters: [
                ['type', 'anyof', 'CustCred'],
                'AND',
                ['mainline', 'is', 'T'],
                'AND',
                ['subsidiary', 'anyof', fila.subsidiary],
                'AND',
                ['custbody_2wintipodtesii', 'anyof', 4],
                'AND',
                ['custbody_2winfolioacepta', 'is', String(fila.folioAcepta)]
            ],
            columns: [
                search.createColumn({ name: 'internalid', sort: search.Sort.DESC }),
                search.createColumn({ name: 'tranid' })
            ]
        }).run().getRange({ start: 0, end: 1 });

        if (resultados.length === 0) {
            return null;
        }

        return {
            id:     resultados[0].getValue({ name: 'internalid' }),
            numero: resultados[0].getValue({ name: 'tranid' })
        };
    };

    return {
        buscarNotaCredito: buscarNotaCredito
    };
});
