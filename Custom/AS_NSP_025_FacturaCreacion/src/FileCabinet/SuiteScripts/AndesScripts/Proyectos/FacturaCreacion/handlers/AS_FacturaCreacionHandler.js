/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @author      Andes Salud
 * @version     1.2.0
 * @description Crea la factura de venta a partir de una fila del JSON. Location no se informa:
 *              sale obligatoria al guardar y se omite con el ignoreMandatoryFields del save.
 */
define(['N/record'],
    (record) => {

    const crearFactura = (fila) => {
        const factura = record.create({ type: record.Type.INVOICE, isDynamic: true });

        factura.setValue({ fieldId: 'externalid',               value: fila.externalId });
        factura.setValue({ fieldId: 'entity',                   value: fila.customerInternalId });
        factura.setValue({ fieldId: 'subsidiary',               value: fila.subsidiary });
        factura.setText({  fieldId: 'currency',                 text:  fila.currency });
        factura.setValue({ fieldId: 'account',                  value: fila.accountInternalId });
        factura.setValue({ fieldId: 'trandate',                 value: armarFecha(fila.date) });
        factura.setValue({ fieldId: 'duedate',                  value: armarFecha(fila.dueDate) });
        factura.setText({  fieldId: 'postingperiod',            text:  fila.postingPeriod });
        factura.setValue({ fieldId: 'custbody_2winfolioacepta', value: fila.folioAcepta });
        factura.setValue({ fieldId: 'memo',                     value: fila.memo });
        factura.setValue({ fieldId: 'approvalstatus',           value: 2 });

        factura.selectNewLine({ sublistId: 'item' });
        factura.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item',        value: fila.itemInternalId });
        factura.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: fila.memo });
        factura.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity',    value: 1 });
        factura.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate',        value: fila.itemRate });
        factura.setCurrentSublistText({  sublistId: 'item', fieldId: 'taxcode',     text:  fila.taxCode });
        factura.commitLine({ sublistId: 'item' });

        return factura.save({ enableSourcing: true, ignoreMandatoryFields: true });
    };

    const armarFecha = (texto) => {
        const partes = texto.split('/');
        return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
    };

    return {
        crearFactura: crearFactura
    };
});
