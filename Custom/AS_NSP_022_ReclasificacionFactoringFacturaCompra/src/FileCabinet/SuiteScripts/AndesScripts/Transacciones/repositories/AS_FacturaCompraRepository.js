/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
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
            fecha      : factura.getValue({ fieldId: 'trandate' }),
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

    const obtenerSubsidiariasDelFactor = (idFactor) => {
        const factor       = record.load({ type: record.Type.VENDOR, id: idFactor });
        const cantidad     = factor.getLineCount({ sublistId: 'submachine' });
        const subsidiarias = [];

        for (let linea = 0; linea < cantidad; linea++) {
            subsidiarias.push(String(factor.getSublistValue({
                sublistId: 'submachine',
                fieldId  : 'subsidiary',
                line     : linea,
            })));
        }

        return subsidiarias;
    };

    const escribirDiario = (idFactura, idDiario) => {
        record.submitFields({
            type  : record.Type.VENDOR_BILL,
            id    : idFactura,
            values: { [CONSTANTES.CAMPOS.DIARIO]: idDiario },
        });
    };

    return {
        obtenerDatosFactura         : obtenerDatosFactura,
        obtenerSubsidiariasDelFactor: obtenerSubsidiariasDelFactor,
        escribirDiario              : escribirDiario,
    };
});
