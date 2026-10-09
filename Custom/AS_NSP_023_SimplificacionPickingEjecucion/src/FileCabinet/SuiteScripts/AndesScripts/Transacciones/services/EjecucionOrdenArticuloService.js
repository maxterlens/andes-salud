/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file EjecucionOrdenArticuloService.js
 * @description Service — reglas de negocio para el estado de envío de la Ejecución de Orden de Artículo.
 */
define([
    '../repositories/EjecucionOrdenArticuloRepository'
], (EjecucionOrdenArticuloRepository) => {

    const SHIP_STATUS = Object.freeze({ PICKED: 'A', PACKED: 'B', SHIPPED: 'C' });
    const TIPO_ORIGEN_PERMITIDO = 'TrnfrOrd';
    const TIPO_EVENTO_CREACION = 'create';

    /**
     * Determina si la ejecución debe marcarse como Enviada:
     * solo en creación y cuando el origen es una Orden de Traslado.
     * @param {Object} params
     * @param {string} params.type - Tipo de evento del User Event.
     * @param {number|string} params.createdFrom - ID de la transacción origen.
     * @returns {boolean}
     */
    const debeMarcarseEnviado = ({ type, createdFrom }) => {
        if (type != TIPO_EVENTO_CREACION) return false;

        if (!createdFrom) {
            log.error({ title: 'EjecucionOrdenArticuloService', details: 'Ejecución sin transacción origen (createdfrom). No se actualiza shipstatus.' });
            return false;
        }

        const tipoOrigen = EjecucionOrdenArticuloRepository.obtenerTipoTransaccionOrigen(createdFrom);
        if (tipoOrigen != TIPO_ORIGEN_PERMITIDO) {
            log.error({ title: 'EjecucionOrdenArticuloService', details: `Origen ${createdFrom} es de tipo ${tipoOrigen}. Solo aplica a Orden de Traslado.` });
            return false;
        }
        return true;
    };

    /**
     * Marca como Enviada una ejecución ya guardada (afterSubmit).
     * @param {Object} params
     * @param {number|string} params.id - ID interno de la ejecución.
     * @param {string} params.type - Tipo de evento del User Event.
     * @param {number|string} params.createdFrom - ID de la transacción origen.
     * @param {string} params.shipStatus - Estado de envío actual.
     */
    const marcarComoEnviado = ({ id, type, createdFrom, shipStatus }) => {
        if (!debeMarcarseEnviado({ type, createdFrom })) return;
        if (shipStatus === SHIP_STATUS.SHIPPED) return;

        EjecucionOrdenArticuloRepository.actualizarEstadoEnvio(id, SHIP_STATUS.SHIPPED);
        log.error({ title: 'EjecucionOrdenArticuloService', details: `Ejecución ${id} actualizada a shipstatus ${SHIP_STATUS.SHIPPED} (Enviado).` });
    };

    return {
        SHIP_STATUS,
        debeMarcarseEnviado,
        marcarComoEnviado
    };
});
