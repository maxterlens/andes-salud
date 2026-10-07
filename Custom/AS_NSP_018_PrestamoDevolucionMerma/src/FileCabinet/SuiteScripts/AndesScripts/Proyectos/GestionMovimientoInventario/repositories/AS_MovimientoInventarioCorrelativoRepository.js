/**
 * AS_NSP_018 — Correlativo por Tipo de Movimiento
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/error', 'N/query', 'N/record', '../lib/AS_MovimientoInventarioConstants'],
    (error, query, record, CONSTANTES) => {

    function obtenerSiguienteCorrelativo(idTipo) {
        const idFila = buscarFilaCorrelativo(idTipo);
        for (let intento = 1; intento <= CONSTANTES.CORRELATIVO.REINTENTOS; intento++) {
            try {
                return reservarNumero(idFila);
            } catch (fallo) {
                if (fallo.name !== 'RCRD_HAS_BEEN_CHANGED' || intento === CONSTANTES.CORRELATIVO.REINTENTOS) throw fallo;
            }
        }
    }

    function buscarFilaCorrelativo(idTipo) {
        const filas = query.runSuiteQL({
            query : 'SELECT c.id AS id FROM ' + CONSTANTES.RECORDS.CORRELATIVO
                  + ' c WHERE c.' + CONSTANTES.CAMPOS_CORRELATIVO.TIPO + ' = ? AND c.isinactive = ?',
            params: [idTipo, 'F'],
        }).asMappedResults();
        if (filas.length) return filas[0].id;
        throw error.create({
            name     : 'AS_MOVIMIENTO_SIN_CORRELATIVO',
            message  : 'El Tipo de Movimiento no tiene una fila activa en AS Movimiento Inventario Correlativo. '
                     + 'Configura las filas de Prestamo, Devolucion y Merma con los prefijos PRE#, DEV# y MER# y Ultimo numero en 0.',
            notifyOff: true,
        });
    }

    function reservarNumero(idFila) {
        const fila = record.load({ type: CONSTANTES.RECORDS.CORRELATIVO, id: idFila });
        const numero = Number(fila.getValue({ fieldId: CONSTANTES.CAMPOS_CORRELATIVO.ULTIMO })) + 1;
        fila.setValue({ fieldId: CONSTANTES.CAMPOS_CORRELATIVO.ULTIMO, value: numero });
        fila.save();
        return fila.getValue({ fieldId: 'name' }) + String(numero).padStart(CONSTANTES.CORRELATIVO.DIGITOS, '0');
    }

    return { obtenerSiguienteCorrelativo };
});
