/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Crea el Inventory Adjustment del modulo, contra la cuenta de
 *              ajuste de la solicitud:
 *
 *              crearAjusteSalida   descuenta: Merma y Devolucion A la Clinica.
 *              crearAjusteEntrada  suma: Prestamo A la Clinica.
 *
 *              Tres diferencias con el traslado que conviene tener a mano si
 *              falla al guardar: la ubicacion va en la linea y no en la cabecera,
 *              el adjustqtyby de salida va negativo, y la cantidad de cada lote
 *              tambien. Si NetSuite ya asigno el detalle de inventario por su
 *              cuenta, se respeta: volver a asignarlo duplica la cantidad y el
 *              registro no guarda.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', '../../constants/AS_MovimientoInventarioConstants', '../query/AS_MovimientoInventarioQuery', '../search/AS_MovimientoInventarioSearch'],
    (record, CONSTANTES, movimientoQuery, movimientoSearch) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function crearAjusteSalida(datos, lineas) {
        const ajuste = crearCabeceraAjuste(datos);

        movimientoQuery.obtenerAsignacionesLotes(lineas, datos.ubicacion);

        lineas.forEach((linea) => {
            agregarLineaAjuste(ajuste, datos, linea.articulo, -linea.cantidad);

            if (linea.asignaciones) {
                const detalle = ajuste.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });

                if (detalle.getLineCount({ sublistId: 'inventoryassignment' }) === 0) {
                    linea.asignaciones.forEach((asignacion) => {
                        detalle.selectNewLine({ sublistId: 'inventoryassignment' });
                        detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: asignacion.numeroInventario });
                        if (asignacion.bin) detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: asignacion.bin });
                        detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -asignacion.cantidad });
                        detalle.commitLine({ sublistId: 'inventoryassignment' });
                    });
                }
            }

            ajuste.commitLine({ sublistId: 'inventory' });
        });

        return guardarAjuste(ajuste);
    }

    /**
     * El material llega de afuera: el lote no existe todavia en Andes, asi que
     * se recibe con el nombre escrito en la linea (receiptinventorynumber).
     */
    function crearAjusteEntrada(datos, lineas) {
        const ajuste = crearCabeceraAjuste(datos);

        lineas.forEach((linea) => {
            agregarLineaAjuste(ajuste, datos, linea.articulo, linea.cantidad);

            if (linea.lote) {
                const detalle = ajuste.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });

                detalle.selectNewLine({ sublistId: 'inventoryassignment' });
                detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'receiptinventorynumber', value: linea.lote });
                detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: linea.cantidad });
                detalle.commitLine({ sublistId: 'inventoryassignment' });
            }

            ajuste.commitLine({ sublistId: 'inventory' });
        });

        return guardarAjuste(ajuste);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function crearCabeceraAjuste(datos) {
        const ajuste = record.create({ type: CONSTANTES.RECORDS.AJUSTE, isDynamic: true });

        ajuste.setValue({ fieldId: 'subsidiary', value: datos.subsidiaria });
        ajuste.setValue({ fieldId: 'account',    value: datos.cuenta });
        ajuste.setValue({ fieldId: 'department', value: datos.servicio });
        ajuste.setValue({ fieldId: 'memo',       value: datos.memo });

        return ajuste;
    }

    function agregarLineaAjuste(ajuste, datos, articulo, cantidad) {
        ajuste.selectNewLine({ sublistId: 'inventory' });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item',        value: articulo });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location',    value: datos.ubicacion });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'department',  value: datos.servicio });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: cantidad });
    }

    function guardarAjuste(ajuste) {
        const id = ajuste.save();

        return { id: id, numero: movimientoSearch.obtenerNumeroTransaccion(CONSTANTES.RECORDS.AJUSTE, id) };
    }

    return {
        crearAjusteSalida : crearAjusteSalida,
        crearAjusteEntrada: crearAjusteEntrada,
    };
});
