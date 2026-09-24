/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', '../lib/AS_FactoringConstants'],
    (record, CONSTANTES) => {

    const crearAsiento = (datos) => {
        const asiento = record.create({ type: record.Type.JOURNAL_ENTRY });

        asiento.setValue({ fieldId: 'trandate',     value: datos.fecha });
        asiento.setValue({ fieldId: 'subsidiary',   value: datos.subsidiaria });
        asiento.setValue({ fieldId: 'currency',     value: datos.moneda });
        asiento.setValue({ fieldId: 'exchangerate', value: datos.tipoCambio });
        asiento.setValue({ fieldId: CONSTANTES.CAMPOS.TIPO_DIARIO, value: CONSTANTES.TIPO_DIARIO_FACTORING });
        asiento.setValue({ fieldId: CONSTANTES.CAMPOS.APROBACION, value: CONSTANTES.APROBACION_APROBADA });

        agregarLineaDebe(asiento, datos);
        agregarLineaHaber(asiento, datos);

        const idAsiento = asiento.save();

        log.debug({
            title  : CONSTANTES.LOGS.ASIENTO,
            details: 'diario: ' + idAsiento + ' | subsidiaria: ' + datos.subsidiaria
                   + ' | moneda: ' + datos.moneda + ' | tipo de cambio: ' + datos.tipoCambio
                   + ' | debe: cuenta ' + datos.cuenta + ' proveedor ' + datos.proveedor
                   + ' por ' + datos.monto
                   + ' | haber: cuenta ' + CONSTANTES.CUENTA_FACTORING + ' factor ' + datos.factor
                   + ' por ' + datos.monto
                   + ' | aplicado a la factura ' + datos.factura,
        });

        return idAsiento;
    };

    // Cancela la deuda con el proveedor original. Las dos columnas de aplicacion son la
    const agregarLineaDebe = (asiento, datos) => {
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'account', line: 0, value: datos.cuenta });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'entity',  line: 0, value: datos.proveedor });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'debit',   line: 0, value: datos.monto });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'memo',    line: 0, value: CONSTANTES.MEMOS.DEBE });
        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.FOLIO, line: 0, value: datos.folio });

        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.APLICAR,     line: 0, value: true });
        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.TRANSACCION, line: 0, value: datos.factura });
    };

    // Genera la deuda con el factor
    const agregarLineaHaber = (asiento, datos) => {
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'account', line: 1, value: CONSTANTES.CUENTA_FACTORING });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'entity',  line: 1, value: datos.factor });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'credit',  line: 1, value: datos.monto });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'memo',    line: 1, value: CONSTANTES.MEMOS.HABER });
        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.FOLIO, line: 1, value: datos.folio });
    };

    return { crearAsiento: crearAsiento };
});
