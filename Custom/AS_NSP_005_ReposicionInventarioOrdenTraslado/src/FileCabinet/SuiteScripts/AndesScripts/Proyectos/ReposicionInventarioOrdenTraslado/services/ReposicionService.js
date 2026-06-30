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
     *     stock_efectivo <= reorderpoint  AND  preferredstocklevel > stock_efectivo
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
     *   reorderPoint: number,
     *   preferredLevel: number,
     *   safetyStock: number,
     *   currentQty: number,
     *   inTransitQty: number,
     *   effectiveQty: number
     * }>}
     */
    const getItemsToReplenish = (locationTo) => {
        const itemConfigs = InventarioRepository.getItemLocationConfig(locationTo);

        if (!itemConfigs.length) {
            log.debug('ReposicionService.getItemsToReplenish',
                `locationTo ${locationTo}: sin artículos con punto de reorden configurado.`
            );
            return [];
        }

        const itemIds = itemConfigs.map(ic => ic.item_internal_id).join(',');

        const stockMap     = InventarioRepository.getAvailableStock(locationTo, itemIds);
        const inTransitMap = InventarioRepository.getPendingInTransitQty(locationTo, itemIds);

        return itemConfigs.reduce((acc, ic) => {
            const currentQty    = stockMap[ic.item_internal_id]     || 0;
            const inTransitQty  = inTransitMap[ic.item_internal_id] || 0;
            const effectiveQty  = currentQty + inTransitQty;

            const reorderPoint   = parseFloat(ic.reorderpoint)        || 0;
            const preferredLevel = parseFloat(ic.preferredstocklevel) || 0;
            const safetyStock    = parseFloat(ic.safetystocklevel)    || 0;

            if (effectiveQty <= reorderPoint && preferredLevel > effectiveQty) {
                acc.push({
                    itemInternalId  : ic.item_internal_id,
                    itemCode        : ic.item_code,
                    itemDisplayName : ic.item_display_name,
                    qtyToOrder      : Math.ceil(preferredLevel - effectiveQty),
                    reorderPoint,
                    preferredLevel,
                    safetyStock,
                    currentQty,
                    inTransitQty,
                    effectiveQty
                });
            }

            return acc;
        }, []);
    };

    return { getItemsToReplenish };
});
