/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        ReposicionService.js
 * @description Servicio de lógica de reposición de inventario.
 *              Responsabilidad: determinar qué artículos requieren reposición y en qué cantidad,
 *              aplicando la regla de stock efectivo y punto de reorden.
 *              No accede directamente a NetSuite — delega en InventarioRepository.
 */
define(['../repositories/InventarioRepository', 'N/log'],
(InventarioRepository, log) => {

    /**
     * Determina qué artículos de una ubicación destino requieren reposición.
     *
     * Regla de negocio:
     *   stock_efectivo = stock_disponible_en_destino + cantidad_en_tránsito_hacia_destino
     *
     *   Condición de reposición:
     *     stock_efectivo <= safetystocklevel  AND  preferredstocklevel > stock_efectivo
     *
     *   Cantidad a pedir:
     *     ceil(preferredstocklevel - stock_efectivo)
     *
     * El stock en tránsito corresponde a Órdenes de Traslado pendientes (no recibidas)
     * cuyo destino es la ubicación evaluada, evitando reponer artículos que ya vienen en camino.
     *
     * @param   {string|number} locationTo  Internal ID de la ubicación destino
     * @returns {Array<{
     *   itemInternalId: string,
     *   itemCode: string,
     *   itemDisplayName: string,
     *   qtyToOrder: number,
     *   safetyStockLevel: number,
     *   preferredLevel: number,
     *   safetyStock: number,
     *   currentQty: number,
     *   inTransitQty: number,
     *   effectiveQty: number
     * }>}
     */
    const getItemsToReplenish = (locationTo) => {
        log.error('ReposicionService.getItemsToReplenish - INICIO',
            `Evaluando artículos para locationTo: ${locationTo}`
        );

        const itemConfigs = InventarioRepository.getItemLocationConfig(locationTo);

        log.error('ReposicionService.getItemsToReplenish - itemConfigs',
            `locationTo ${locationTo}: ${itemConfigs.length} artículo(s) con reorderpoint > 0 encontrados.`
        );

        if (!itemConfigs.length) {
            log.error('ReposicionService.getItemsToReplenish',
                `locationTo ${locationTo}: sin artículos con punto de reorden configurado.`
            );
            return [];
        }

        const itemIds = itemConfigs.map(ic => ic.item_internal_id).join(',');

        const stockMap     = InventarioRepository.getAvailableStock(locationTo, itemIds);
        const inTransitMap = InventarioRepository.getPendingInTransitQty(locationTo, itemIds);

        log.error('ReposicionService.getItemsToReplenish - stockMap',    JSON.stringify(stockMap));
        log.error('ReposicionService.getItemsToReplenish - inTransitMap', JSON.stringify(inTransitMap));

        const result = itemConfigs.reduce((acc, ic) => {
            const currentQty    = stockMap[ic.item_internal_id]     || 0;
            const inTransitQty  = inTransitMap[ic.item_internal_id] || 0;
            const effectiveQty  = currentQty + inTransitQty;

            const safetyStockLevel = Number(ic.safetystocklevel)   || 0;
            const preferredLevel   = Number(ic.preferredstocklevel) || 0;
            const safetyStock      = Number(ic.safetystocklevel)    || 0;

            const needsReplenishment = effectiveQty < safetyStockLevel/* && preferredLevel > effectiveQty*/;

            log.error('ReposicionService.getItemsToReplenish - evaluación artículo', JSON.stringify({
                itemInternalId : ic.item_internal_id,
                itemCode       : ic.item_code,
                currentQty,
                inTransitQty,
                effectiveQty,
                safetyStockLevel,
                preferredLevel,
                needsReplenishment,
                qtyToOrder     : needsReplenishment ? safetyStockLevel - effectiveQty : 0
            }));

            if (needsReplenishment) {
                acc.push({
                    itemInternalId  : ic.item_internal_id,
                    itemCode        : ic.item_code,
                    itemDisplayName : ic.item_display_name || '',
                    qtyToOrder      : safetyStockLevel - effectiveQty,
                    safetyStockLevel,
                    preferredLevel,
                    safetyStock,
                    currentQty,
                    inTransitQty,
                    effectiveQty
                });
            }

            return acc;
        }, []);

        log.error('ReposicionService.getItemsToReplenish - RESULTADO',
            `locationTo ${locationTo}: ${result.length} artículo(s) requieren reposición de un total de ${itemConfigs.length} evaluados.`
        );

        return result;
    };

    return { getItemsToReplenish };
});
