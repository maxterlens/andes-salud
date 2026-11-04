/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @author      Andes Salud
 * @version     1.0.0
 * @description Crea una nota de credito de venta independiente a partir de una fila del JSON.
 */
define(['N/record', '../repositories/AS_NotaCreditoCreacionRepository'],
    (record, repository) => {

    const crearNotaCredito = (fila) => {
        const notaCredito = record.create({ type: record.Type.CREDIT_MEMO, isDynamic: true });

        notaCredito.setValue({ fieldId: 'externalid',               value: fila.externalId });
        notaCredito.setValue({ fieldId: 'entity',                   value: fila.customerInternalId });
        notaCredito.setValue({ fieldId: 'subsidiary',               value: fila.subsidiary });
        notaCredito.setText({  fieldId: 'currency',                 text:  fila.currency });
        notaCredito.setValue({ fieldId: 'account',                  value: fila.accountInternalId });
        notaCredito.setValue({ fieldId: 'trandate',                 value: armarFecha(fila.date) });
        notaCredito.setText({  fieldId: 'postingperiod',            text:  fila.postingPeriod });
        notaCredito.setValue({ fieldId: 'custbody_2wintipodtesii',  value: 4 });
        notaCredito.setValue({ fieldId: 'custbody_2winfolioacepta', value: fila.folioAcepta });
        notaCredito.setValue({ fieldId: 'memo',                     value: fila.memo });
        notaCredito.setValue({ fieldId: 'approvalstatus',           value: 2 });

        notaCredito.selectNewLine({ sublistId: 'item' });
        notaCredito.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item',        value: fila.itemInternalId });
        notaCredito.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: fila.memo });
        notaCredito.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity',    value: 1 });
        notaCredito.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate',        value: fila.itemRate });
        notaCredito.setCurrentSublistText({  sublistId: 'item', fieldId: 'taxcode',     text:  fila.taxCode });
        notaCredito.commitLine({ sublistId: 'item' });

        try {
            return {
                id:          notaCredito.save({ enableSourcing: true, ignoreMandatoryFields: true }),
                numero:      '',
                estado:      'CREADO',
                advertencia: ''
            };
        } catch (e) {
            const registrada = repository.buscarNotaCredito(fila);

            if (!registrada) {
                throw e;
            }

            const yaExistia = e.message.indexOf('Este registro ya existe') !== -1;
            return {
                id:          registrada.id,
                numero:      registrada.numero,
                estado:      yaExistia ? 'YA EXISTIA' : 'CREADO CON ADVERTENCIA',
                advertencia: e.message
            };
        }
    };

    const armarFecha = (texto) => {
        const partes = texto.split('/');
        return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    };

    return {
        crearNotaCredito: crearNotaCredito
    };
});
