/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Unico punto del proyecto que crea el Inventory Adjustment de la
 *              Merma. Es la salida definitiva del inventario: no hay ubicacion
 *              destino, la cantidad va negativa y la cuenta contable de la
 *              cabecera del movimiento es la que recibe el ajuste.
 *
 *              Tres diferencias con el Inventory Transfer que conviene tener a
 *              mano si el ajuste falla al guardar: la ubicacion va en la linea y
 *              no en la cabecera, el adjustqtyby va negativo, y la cantidad de
 *              cada inventoryassignment tambien va negativa. Si NetSuite ya
 *              asigno el detalle de inventario por su cuenta, se respeta: volver
 *              a asignarlo duplica la cantidad y el registro no guarda.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', 'N/search', '../lib/AS_MovimientoInventarioConstants', './AS_ConsultaStockRepository'],
    (record, search, CONSTANTES, consultaStockRepository) => {

    function crearAjusteInventario(datos, lineas, lotesPorArticulo) {
        const ajuste = record.create({
            type     : CONSTANTES.RECORDS.AJUSTE,
            isDynamic: true,
        });

        ajuste.setValue({ fieldId: 'subsidiary', value: datos.subsidiaria });
        ajuste.setValue({ fieldId: 'account',    value: datos.cuenta });
        ajuste.setValue({ fieldId: 'department', value: datos.servicio });
        ajuste.setValue({ fieldId: 'memo',       value: datos.memo });

        lineas.forEach((linea) => {
            agregarLineaAjuste(ajuste, datos, linea, lotesPorArticulo);
        });

        const idAjuste = ajuste.save();

        const numeroAjuste = search.lookupFields({
            type   : CONSTANTES.RECORDS.AJUSTE,
            id     : idAjuste,
            columns: ['tranid'],
        }).tranid;

        return { id: idAjuste, numero: numeroAjuste };
    }

    function agregarLineaAjuste(ajuste, datos, linea, lotesPorArticulo) {
        ajuste.selectNewLine({ sublistId: 'inventory' });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item',        value: linea.articulo });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'location',    value: datos.ubicacion });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'department',  value: datos.servicio });
        ajuste.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: -linea.cantidad });

        asignarLotes(ajuste, datos.ubicacion, linea, lotesPorArticulo);

        ajuste.commitLine({ sublistId: 'inventory' });
    }

    function asignarLotes(ajuste, ubicacion, linea, lotesPorArticulo) {
        if (!lotesPorArticulo[linea.articulo]) {
            lotesPorArticulo[linea.articulo] = consultaStockRepository.buscarLotesDisponibles(linea.articulo, ubicacion);
        }

        const enLaUbicacion = lotesPorArticulo[linea.articulo];

        if (enLaUbicacion.length === 0) {
            return;
        }

        const detalle = ajuste.getCurrentSublistSubrecord({
            sublistId: 'inventory',
            fieldId  : 'inventorydetail',
        });

        if (detalle.getLineCount({ sublistId: 'inventoryassignment' }) > 0) {
            return;
        }

        elegirAsignaciones(enLaUbicacion, linea).forEach((asignacion) => {
            detalle.selectNewLine({ sublistId: 'inventoryassignment' });
            detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: asignacion.numeroInventario });

            if (asignacion.bin) {
                detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: asignacion.bin });
            }

            detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: -asignacion.cantidad });
            detalle.commitLine({ sublistId: 'inventoryassignment' });
        });
    }

    function elegirAsignaciones(enLaUbicacion, linea) {
        if (linea.lote) {
            const elegido = enLaUbicacion.filter((fila) => fila.nombreLote === linea.lote)[0];

            if (!elegido) {
                return [];
            }

            return [{
                numeroInventario: elegido.numeroInventario,
                bin             : elegido.bin,
                cantidad        : linea.cantidad,
            }];
        }

        const asignaciones = [];

        let porAsignar = linea.cantidad;

        enLaUbicacion.forEach((lote) => {
            if (porAsignar <= 0) {
                return;
            }

            const cantidad = Math.min(porAsignar, lote.enMano);

            porAsignar = Math.round((porAsignar - cantidad) * 100000000) / 100000000;

            asignaciones.push({
                numeroInventario: lote.numeroInventario,
                bin             : lote.bin,
                cantidad        : cantidad,
            });
        });

        return asignaciones;
    }

    return { crearAjusteInventario };
});
