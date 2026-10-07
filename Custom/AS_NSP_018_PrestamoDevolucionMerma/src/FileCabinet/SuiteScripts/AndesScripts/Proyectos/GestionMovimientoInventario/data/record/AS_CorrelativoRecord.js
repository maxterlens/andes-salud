/**
 * AS_NSP_018 — Correlativo por Tipo de Movimiento
 * @description El numero de cada solicitud: PRE#000001, DEV#000001, MER#000001.
 *
 *              Cada tipo tiene su fila en AS Movimiento Inventario Correlativo.
 *              La primera solicitud de un tipo crea la fila con el prefijo de
 *              CORRELATIVO.PREFIJOS y el ultimo numero en 0. Si otro usuario
 *              guardo la misma fila en el medio (RCRD_HAS_BEEN_CHANGED), vuelve
 *              a cargarla y reintenta hasta CORRELATIVO.REINTENTOS veces.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/error', 'N/record', '../../constants/AS_MovimientoInventarioConstants', '../query/AS_MovimientoInventarioQuery'],
    (error, record, CONSTANTES, movimientoQuery) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function reservarCorrelativo(idTipo, nombreTipo) {
        const idFila = movimientoQuery.obtenerFilaCorrelativo(idTipo) || crearFilaCorrelativo(idTipo, nombreTipo);

        for (let intento = 1; intento <= CONSTANTES.CORRELATIVO.REINTENTOS; intento++) {
            try {
                return reservarNumero(idFila);
            } catch (fallo) {
                if (fallo.name !== 'RCRD_HAS_BEEN_CHANGED' || intento === CONSTANTES.CORRELATIVO.REINTENTOS) throw fallo;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function crearFilaCorrelativo(idTipo, nombreTipo) {
        const prefijo = CONSTANTES.CORRELATIVO.PREFIJOS[nombreTipo];

        if (!prefijo) {
            throw error.create({
                name     : 'AS_MOVIMIENTO_SIN_CORRELATIVO',
                message  : 'El Tipo de Movimiento ' + nombreTipo + ' no tiene prefijo de correlativo. '
                         + 'Agregalo en CORRELATIVO.PREFIJOS de AS_MovimientoInventarioConstants.',
                notifyOff: true,
            });
        }

        const fila = record.create({ type: CONSTANTES.RECORDS.CORRELATIVO });
        fila.setValue({ fieldId: 'name', value: prefijo });
        fila.setValue({ fieldId: CONSTANTES.CAMPOS_CORRELATIVO.TIPO, value: idTipo });
        fila.setValue({ fieldId: CONSTANTES.CAMPOS_CORRELATIVO.ULTIMO, value: 0 });
        return fila.save();
    }

    function reservarNumero(idFila) {
        const fila = record.load({ type: CONSTANTES.RECORDS.CORRELATIVO, id: idFila });
        const numero = Number(fila.getValue({ fieldId: CONSTANTES.CAMPOS_CORRELATIVO.ULTIMO })) + 1;
        fila.setValue({ fieldId: CONSTANTES.CAMPOS_CORRELATIVO.ULTIMO, value: numero });
        fila.save();
        return fila.getValue({ fieldId: 'name' }) + String(numero).padStart(CONSTANTES.CORRELATIVO.DIGITOS, '0');
    }

    return {
        reservarCorrelativo: reservarCorrelativo,
    };
});
