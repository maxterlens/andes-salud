/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        TransferOrderService.js
 * @description Servicio de creación de Órdenes de Traslado para reposición.
 *              Responsabilidad: orquestar la creación de la OT y el guardado del log de resultado.
 *              No accede directamente a NetSuite — delega en los repositorios correspondientes.
 */
define([
    '../repositories/TransferOrderRepository',
    '../repositories/ASLogReposicionAutomaticaInventarioRepository',
    'N/log'
],
(TransferOrderRepository, LogRepository, log) => {

    /**
     * Crea una Orden de Traslado para los artículos indicados y persiste el resultado en el log.
     * Si la creación de la OT falla, el error se captura, se registra en el log y no se propaga,
     * permitiendo que el proceso continúe con los demás pares de ubicación.
     *
     * @param {Object}        params
     * @param {string}        params.subsidiaryId  Internal ID de la subsidiaria
     * @param {string}        params.locationFrom  Internal ID de la ubicación origen
     * @param {string}        params.locationTo    Internal ID de la ubicación destino
     * @param {Array<Object>} params.items         Artículos a reponer (salida de ReposicionService)
     * @param {string}        params.executionId   ID del deployment del script MR
     */
    const processReplenishment = ({ subsidiaryId, locationFrom, locationTo, items }) => {
        let toId        = null;
        let status      = 'Éxito';
        let message     = '';
        let linesDetail = '';

        // ── Crear Orden de Traslado ──────────────────────────────────────────
        try {
            toId        = TransferOrderRepository.create({ subsidiaryId, locationFrom, locationTo, items });
            linesDetail = buildLinesDetail(items);
            message     = `Orden de Traslado ID ${toId} creada con ${items.length} línea(s).`;

            log.error('TransferOrderService.processReplenishment',
                `[${subsidiaryId}:${locationFrom}→${locationTo}] ${message}`
            );
        } catch (e) {
            status  = 'Error';
            message = `${e.name}: ${e.message}`;
            log.error('TransferOrderService.processReplenishment',
                `[${subsidiaryId}:${locationFrom}→${locationTo}] ${message}`
            );
        }

        // ── Guardar log de resultado ─────────────────────────────────────────
        try {
            const now  = new Date();
            const name = `REP_${now.toISOString().substring(0, 10)}_TO${toId || 'ERR'}_LOC${locationTo}`;

            LogRepository.save({
                name,
                date        : now,
                subsidiaryId,
                locationFrom,
                locationTo,
                toId,
                status,
                message,
                linesDetail
            });
        } catch (e) {
            log.error('TransferOrderService.processReplenishment - saveLog',
                `[${subsidiaryId}:${locationFrom}→${locationTo}] ${e.name}: ${e.message}`
            );
        }
    };

    /**
     * Construye el texto de detalle de líneas para el campo log_lines_detail.
     * Formato: una línea por artículo con código, nombre y cantidades clave.
     *
     * @param   {Array<Object>} items
     * @returns {string}
     */
    const buildLinesDetail = (items) =>
        items.map(item =>
            `[${item.itemCode}] ${item.itemDisplayName}` +
            ` | Solicitado: ${item.qtyToOrder}` +
            ` | Stock actual: ${item.currentQty}` +
            ` | En tránsito: ${item.inTransitQty}` +
            ` | Nivel preferido: ${item.preferredLevel}` +
            ` | Punto reorden: ${item.safetyStockLevel}`
        ).join('\n');

    return { processReplenishment };
});
