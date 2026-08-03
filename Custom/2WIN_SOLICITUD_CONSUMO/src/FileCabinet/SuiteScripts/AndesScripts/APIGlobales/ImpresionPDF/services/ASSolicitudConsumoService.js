/**
 * @NApiVersion 2.1
 * Service: lógica de negocio para Solicitud de Consumo y Recepción de Insumos.
 *
 * Responsabilidad: orquestar llamadas al repository, enriquecer los datos
 * y retornar el payload listo para el Renderer.
 *
 * Cada método corresponde a un reportName definido en Lib.Constants.
 */
define([
    '../repositories/ASSolicitudConsumoRepository',
    '../lib/helpers/Lib.Helper.XmlUtils'
], (SolicitudConsumoRepository, XmlUtils) => {

    const SolicitudConsumoService = {

        /**
         * Reporte: Solicitud de Consumo en PDF.
         * Record: customrecord_2win_solicitud_consumo (custom record)
         *
         * @param {string[]} ids        - IDs de la solicitud de consumo
         * @param {Object}   customData - Parámetros adicionales del request
         * @returns {{ header: Object, items: Object[] }}
         */
        solicitudconsumo_pdf: (ids, customData) => {
            const { header, items } = SolicitudConsumoRepository.getSolicitudConsumoCustomData(ids);

            header.totalItems    = items.length;
            header.totalCantidad = items.reduce((acc, it) => acc + it.cantidad, 0);

            return { header, items };
        },

        /**
         * Reporte: Solicitud de Consumo en PDF (Transfer Order — uso interno previo).
         * Mantenido para retrocompatibilidad.
         *
         * @param {string[]} ids        - IDs de Transfer Orders
         * @param {Object}   customData - Parámetros adicionales del request
         * @returns {{ header: Object, items: Object[] }}
         */
        solicitudconsumo_to_pdf: (ids, customData) => {
            const { header, items } = SolicitudConsumoRepository.getSolicitudConsumoData(ids);

            header.totalItems    = items.length;
            header.totalCantidad = items.reduce((acc, it) => acc + it.cantidad, 0);

            return { header, items };
        },

        /**
         * Reporte: Recepción de Insumos en PDF.
         * Record: Item Receipt
         *
         * @param {string[]} ids        - IDs de Item Receipts
         * @param {Object}   customData - Parámetros adicionales del request
         * @returns {{ header: Object, items: Object[] }}
         */
        recepcion_insumos_pdf: (ids, customData) => {
            const { header, items } = SolicitudConsumoRepository.getRecepcionInsumosData(ids);

            header.totalItems    = items.length;
            header.totalCantidad = items.reduce((acc, it) => acc + it.cantidad, 0);

            return { header, items };
        }

    };

    return SolicitudConsumoService;
});
