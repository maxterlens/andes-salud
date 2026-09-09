/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Unico punto del proyecto que lee la Factura de Compra y le escribe
 *              de vuelta el diario generado.
 *
 *              obtenerDatosFactura devuelve todo lo que el diario necesita en una
 *              sola carga: la cabecera contable de la factura mas el factor al que
 *              se le cede la deuda. Incluye el diario ya escrito, porque de ese
 *              dato depende que el handler corte antes de crear uno repetido.
 *
 *              La cuenta que devuelve es la de la propia factura, no una fija: la
 *              linea del debe tiene que golpear la misma cuenta por pagar en la
 *              que quedo la deuda con el proveedor, o la factura no se salda.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', '../lib/AS_FactoringConstants'],
    (record, CONSTANTES) => {

    const obtenerDatosFactura = (idFactura) => {
        const factura = record.load({ type: record.Type.VENDOR_BILL, id: idFactura });

        log.debug({
            title  : CONSTANTES.LOGS.DATOS,
            details: 'factura: ' + idFactura
                   + ' | tranid: [' + factura.getValue({ fieldId: 'tranid' }) + ']'
                   + ' | aprobacion: ' + factura.getValue({ fieldId: CONSTANTES.CAMPOS.APROBACION })
                   + ' | hold: ' + factura.getValue({ fieldId: CONSTANTES.CAMPOS.HOLD })
                   + ' | cuenta: ' + factura.getValue({ fieldId: 'account' })
                   + ' | proveedor: ' + factura.getValue({ fieldId: 'entity' })
                   + ' | factor: ' + factura.getValue({ fieldId: CONSTANTES.CAMPOS.FACTOR })
                   + ' | monto: ' + factura.getValue({ fieldId: 'total' }),
        });

        return {
            factura    : idFactura,
            diario     : factura.getValue({ fieldId: CONSTANTES.CAMPOS.DIARIO }),
            folio      : factura.getValue({ fieldId: 'tranid' }),
            subsidiaria: factura.getValue({ fieldId: 'subsidiary' }),
            proveedor  : factura.getValue({ fieldId: 'entity' }),
            cuenta     : factura.getValue({ fieldId: 'account' }),
            moneda     : factura.getValue({ fieldId: 'currency' }),
            tipoCambio : factura.getValue({ fieldId: 'exchangerate' }),
            monto      : factura.getValue({ fieldId: 'total' }),
            factor     : factura.getValue({ fieldId: CONSTANTES.CAMPOS.FACTOR }),
        };
    };

    const escribirDiario = (idFactura, idDiario) => {
        record.submitFields({
            type  : record.Type.VENDOR_BILL,
            id    : idFactura,
            values: { [CONSTANTES.CAMPOS.DIARIO]: idDiario },
        });
    };

    return {
        obtenerDatosFactura: obtenerDatosFactura,
        escribirDiario     : escribirDiario,
    };
});
