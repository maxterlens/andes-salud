/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Unico punto del proyecto que crea el asiento del factoring. Si el
 *              asiento falla al guardar, el problema esta aqui: la cuenta, el
 *              factor, la subsidiaria o las columnas de aplicacion.
 *
 *              El asiento son dos lineas y siempre las mismas. El debe golpea la
 *              cuenta por pagar de la factura con el proveedor original y la deja
 *              saldada; el haber levanta la deuda con el factor en la cuenta de
 *              factoring. No hay movimiento de caja: es un traspaso de acreedor
 *              dentro del pasivo.
 *
 *              Se crea aprobado a proposito. Un asiento en Pending Approval no
 *              impacta el mayor, asi que la factura seguiria abierta y el usuario
 *              veria una reclasificacion que no reclasifico nada.
 *
 *              La transaccion relacionada se escribe por id y no por texto. Por
 *              texto fallaba con la interfaz en espanol: setSublistText busca la
 *              etiqueta que se muestra y esa esta traducida, asi que 'Bill #0002'
 *              no existia como opcion. El id no depende del idioma.
 *
 *              Ese select tampoco lista las facturas con Payment Hold marcado: por
 *              eso el User Event exige desmarcarlo antes de dejar encolar.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', '../lib/AS_FactoringConstants'],
    (record, CONSTANTES) => {

    const crearAsiento = (datos) => {
        const asiento = record.create({ type: record.Type.JOURNAL_ENTRY });

        asiento.setValue({ fieldId: 'subsidiary',   value: datos.subsidiaria });
        asiento.setValue({ fieldId: 'currency',     value: datos.moneda });
        asiento.setValue({ fieldId: 'exchangerate', value: datos.tipoCambio });
        asiento.setValue({ fieldId: CONSTANTES.CAMPOS.TIPO_DIARIO, value: CONSTANTES.TIPO_DIARIO_FACTORING });
        asiento.setValue({ fieldId: CONSTANTES.CAMPOS.APROBACION, value: CONSTANTES.APROBACION_APROBADA });

        agregarLineaDebe(asiento, datos);
        agregarLineaHaber(asiento, datos);

        return asiento.save();
    };

    // Cancela la deuda con el proveedor original. Las dos columnas de aplicacion son la
    // diferencia con el flujo actual: con ellas el AS_NSP_003 deja la factura pagada.
    const agregarLineaDebe = (asiento, datos) => {
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'account', line: 0, value: datos.cuenta });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'entity',  line: 0, value: datos.proveedor });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'debit',   line: 0, value: datos.monto });
        asiento.setSublistValue({ sublistId: 'line', fieldId: 'memo',    line: 0, value: CONSTANTES.MEMOS.DEBE });
        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.FOLIO, line: 0, value: datos.folio });

        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.APLICAR,     line: 0, value: true });

        log.debug({
            title  : CONSTANTES.LOGS.DATOS,
            details: 'columna: ' + CONSTANTES.COLUMNAS.TRANSACCION
                   + ' | id que se envia: [' + datos.factura + ']',
        });

        asiento.setSublistValue({ sublistId: 'line', fieldId: CONSTANTES.COLUMNAS.TRANSACCION, line: 0,
                                  value: datos.factura });
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
