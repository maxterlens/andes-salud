/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description El Inventory Count (Recuento de inventario) que genera el modulo.
 *
 *              armarRecuento: la cabecera del formulario, un articulo por linea
 *              y el check AS Recuento Inventario Carga marcado, como el AS_NSP_032.
 *              guardarRecuento: lo guarda; va aparte para medir cada paso.
 *              comenzarRecuento: lo pasa de Abierto a Iniciado.
 *              aprobarRecuento: la accion nativa Aprobar; NetSuite crea los
 *              ajustes de inventario.
 *              cargarRecuento: lo abre para escribirle las cantidades.
 *              escribirCantidades: escribe la Cantidad del recuento y su
 *              detalle por lote en las lineas de los articulos recibidos.
 *              Vacio o 0 van sin detalle de lotes.
 *              Cargar, escribir y guardar van separados para medir cada paso.
 *
 *              Se crea en modo estandar, no dinamico como el AS_NSP_032: en
 *              dinamico cada linea dispara el sourcing del articulo (unidades,
 *              instantanea) al confirmarla, y con mas de mil lineas el guardado
 *              se vuelve lento. En estandar NetSuite hace el sourcing de todas
 *              las lineas una sola vez, al guardar.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.9.0
 *
 */

define(['N/record', 'N/action', 'N/format', '../../constants/AS_RecuentoInventarioManualConstants'],
    (record, action, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function armarRecuento(cabecera, articulos) {
        const recuento = record.create({ type: CONSTANTES.RECUENTO.TIPO });

        recuento.setValue({ fieldId: 'subsidiary', value: cabecera.subsidiaria });
        recuento.setValue({ fieldId: 'location',   value: cabecera.ubicacion });
        if (cabecera.departamento) recuento.setValue({ fieldId: 'department', value: cabecera.departamento });
        if (cabecera.clase) recuento.setValue({ fieldId: 'class', value: cabecera.clase });
        recuento.setValue({ fieldId: 'trandate',   value: format.parse({ value: cabecera.fecha, type: format.Type.DATE }) });
        recuento.setValue({ fieldId: 'account',    value: cabecera.cuenta });
        recuento.setValue({ fieldId: 'memo',       value: cabecera.nota });
        recuento.setValue({ fieldId: CONSTANTES.RECUENTO.CAMPO_CARGA, value: true });
        articulos.forEach((articulo, linea) => {
            recuento.setSublistValue({ sublistId: 'item', fieldId: 'item', line: linea, value: articulo });
        });

        return recuento;
    }

    function guardarRecuento(recuento) { return recuento.save({ disableTriggers: true }); }

    function comenzarRecuento(recuentoId) {
        action.execute({
            recordType: CONSTANTES.RECUENTO.TIPO,
            id        : CONSTANTES.RECUENTO.ACCION_COMENZAR,
            params    : { recordId: recuentoId },
        });
    }

    function aprobarRecuento(recuentoId) {
        action.execute({
            recordType: CONSTANTES.RECUENTO.TIPO,
            id        : CONSTANTES.RECUENTO.ACCION_APROBAR,
            params    : { recordId: recuentoId },
        });
    }

    function cargarRecuento(recuentoId) { return record.load({ type: CONSTANTES.RECUENTO.TIPO, id: recuentoId }); }

    function escribirCantidades(recuento, cantidades) {
        const lineas = recuento.getLineCount({ sublistId: 'item' });
        let actualizadas = 0;

        for (let linea = 0; linea < lineas; linea++) {
            const cantidad = cantidades[String(recuento.getSublistValue({ sublistId: 'item', fieldId: 'item', line: linea }))];
            if (!cantidad) continue;
            if (!cantidad.total) {
                escribirSinLotes(recuento, linea, cantidad.total === null ? '' : 0);
            } else {
                recuento.setSublistValue({ sublistId: 'item', fieldId: CONSTANTES.RECUENTO.CAMPO_CANTIDAD, line: linea, value: cantidad.total });
                escribirDetalle(recuento.getSublistSubrecord({ sublistId: 'item', fieldId: CONSTANTES.RECUENTO.CAMPO_DETALLE, line: linea }), cantidad.lotes);
            }
            actualizadas++;
        }

        return actualizadas;
    }

    function escribirSinLotes(recuento, linea, valor) {
        const detalle = { sublistId: 'item', fieldId: CONSTANTES.RECUENTO.CAMPO_DETALLE, line: linea };
        recuento.setSublistValue({ sublistId: 'item', fieldId: CONSTANTES.RECUENTO.CAMPO_CANTIDAD, line: linea, value: valor });
        if (recuento.hasSublistSubrecord(detalle)) recuento.removeSublistSubrecord(detalle);
    }

    function escribirDetalle(detalle, lotes) {
        const sublista = CONSTANTES.RECUENTO.DETALLE_SUBLISTA;
        for (let linea = detalle.getLineCount({ sublistId: sublista }) - 1; linea >= 0; linea--) {
            detalle.removeLine({ sublistId: sublista, line: linea });
        }
        lotes.forEach((lote, linea) => {
            detalle.setSublistText({ sublistId: sublista, fieldId: CONSTANTES.RECUENTO.DETALLE_LOTE,      line: linea, text: lote.lote });
            detalle.setSublistValue({ sublistId: sublista, fieldId: CONSTANTES.RECUENTO.DETALLE_ESTADO,   line: linea, value: CONSTANTES.RECUENTO.ESTADO_INVENTARIO });
            detalle.setSublistValue({ sublistId: sublista, fieldId: CONSTANTES.RECUENTO.DETALLE_CANTIDAD, line: linea, value: lote.cantidad });
        });
    }

    return {
        armarRecuento       : armarRecuento,
        guardarRecuento     : guardarRecuento,
        comenzarRecuento    : comenzarRecuento,
        aprobarRecuento     : aprobarRecuento,
        cargarRecuento      : cargarRecuento,
        escribirCantidades  : escribirCantidades,
    };
});
