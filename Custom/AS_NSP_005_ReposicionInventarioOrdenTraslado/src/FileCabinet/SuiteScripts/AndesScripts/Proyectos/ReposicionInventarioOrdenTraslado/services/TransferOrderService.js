/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        TransferOrderService.js
 * @description Servicio de creación de Órdenes de Traslado para reposición.
 *              Responsabilidad: orquestar la creación de la OT y el guardado del log de resultado,
 *              y registrar los ítems que quedaron en conflicto (pendientes de resolución manual).
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
     * Los ítems pueden venir con cantidad parcial (menor a lo que el destino necesitaba)
     * cuando el origen no tuvo stock suficiente para cubrir el 100% — en ese caso el
     * status queda marcado como 'Éxito parcial' para que sea visible en el log.
     *
     * @param {Object}        params
     * @param {string}        params.subsidiaryId  Internal ID de la subsidiaria
     * @param {string}        params.locationFrom  Internal ID de la ubicación origen
     * @param {string}        params.locationTo    Internal ID de la ubicación destino
     * @param {Array<Object>} params.items         Artículos a reponer, ya limitados por
     *                                              disponibilidad de origen (salida de
     *                                              ReposicionService.evaluarReposicionPorOrigen)
     *
     * @returns {{ locationTo: string, toId: number|null, status: string, message: string, logId: number|null }}
     */
    const processReplenishment = ({ subsidiaryId, locationFrom, locationTo, items }) => {
        let toId        = null;
        let status      = 'Éxito';
        let message     = '';
        let linesDetail = '';

        const hayParciales = items.some(item => item.esParcial);

        // ── Crear Orden de Traslado ──────────────────────────────────────────
        try {
            toId        = TransferOrderRepository.create({ subsidiaryId, locationFrom, locationTo, items });
            linesDetail = buildLinesDetail(items);
            status      = hayParciales ? 'Éxito parcial' : 'Éxito';
            message     = `Orden de Traslado ID ${toId} creada con ${items.length} línea(s).` +
                (hayParciales ? ' Una o más líneas quedaron limitadas por el stock disponible en origen.' : '');

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
        let logId = null;
        try {
            const now  = new Date();
            const name = `REP_${now.toISOString().substring(0, 10)}_TO${toId || 'ERR'}_LOC${locationTo}`;

            logId = LogRepository.save({
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

        return { locationTo, toId, status, message, logId };
    };

    /**
     * Registra en el log un ítem que quedó en CONFLICTO: 2 o más destinos compiten por él
     * y el origen no tiene disponibilidad suficiente para cubrir la necesidad total.
     * No crea Orden de Traslado — solo deja constancia de que requiere resolución manual
     * desde el Suitelet "Resolución de Stock Limitado".
     *
     * @param {Object} params
     * @param {string} params.subsidiaryId  Internal ID de la subsidiaria
     * @param {string} params.locationFrom  Internal ID de la ubicación origen
     * @param {Object} params.conflicto     Uno de los elementos del arreglo `conflictos`
     *                                       retornado por ReposicionService.evaluarReposicionPorOrigen
     *
     * @returns {number|null}  Internal ID del log creado, o null si falló el guardado
     */
    const logStockLimitado = ({ subsidiaryId, locationFrom, conflicto }) => {
        const now  = new Date();
        const name = `REP_${now.toISOString().substring(0, 10)}_CONFLICTO_ITEM${conflicto.itemInternalId}_ORIG${locationFrom}`;

        const destinosDetalle = conflicto.destinos
            .map(d => `  - Destino ${d.locationTo}: necesita ${d.necesidad}, sugerido ${d.sugerido} (orden ${d.orden === null || d.orden === undefined ? 'sin definir' : d.orden})`)
            .join('\n');

        const message =
            `Stock insuficiente en origen para cubrir a ${conflicto.destinos.length} destino(s) que compiten por ` +
            `[${conflicto.itemCode}] ${conflicto.itemDisplayName}. ` +
            `Disponible en origen: ${conflicto.disponibleOrigen} | Necesidad total: ${conflicto.necesidadTotal}. ` +
            `Requiere resolución manual en el Suitelet "Resolución de Stock Limitado".`;

        const linesDetail =
            `[${conflicto.itemCode}] ${conflicto.itemDisplayName}\n` +
            `Stock origen: ${conflicto.stockOrigen} | Mínimo protegido origen: ${conflicto.minimoOrigen} | Disponible: ${conflicto.disponibleOrigen}\n` +
            destinosDetalle;

        let logId = null;
        try {
            logId = LogRepository.save({
                name,
                date: now,
                subsidiaryId,
                locationFrom,
                locationTo: null,
                toId: null,
                status: 'Pendiente de Resolución Manual',
                message,
                linesDetail
            });

            log.error('TransferOrderService.logStockLimitado',
                `[${subsidiaryId}:${locationFrom}] ${message}`
            );
        } catch (e) {
            log.error('TransferOrderService.logStockLimitado',
                `[${subsidiaryId}:${locationFrom}] ${e.name}: ${e.message}`
            );
        }

        return logId;
    };

    /**
     * Construye el texto de detalle de líneas para el campo log_lines_detail.
     * Formato: una línea por artículo con código, nombre, cantidades del destino
     * y cantidades/mínimo del origen, marcando cuando la reposición fue parcial.
     *
     * @param   {Array<Object>} items
     * @returns {string}
     */
    const buildLinesDetail = (items) =>
        items.map(item =>
            `[${item.itemCode}] ${item.itemDisplayName}` +
            ` | Enviado: ${item.qtyToOrder}` +
            (item.esParcial ? ` (PARCIAL, destino necesitaba ${item.qtyNecesaria})` : '') +
            ` | Stock origen: ${item.stockOrigen}` +
            ` | Mínimo protegido origen: ${item.minimoOrigen}` +
            ` | Stock actual destino: ${item.currentQty}` +
            ` | En tránsito a destino: ${item.inTransitQty}` +
            ` | Nivel preferido destino: ${item.preferredLevel}` +
            ` | Punto reorden destino: ${item.safetyStockLevel}`
        ).join('\n');

    return { processReplenishment, logStockLimitado };
});
