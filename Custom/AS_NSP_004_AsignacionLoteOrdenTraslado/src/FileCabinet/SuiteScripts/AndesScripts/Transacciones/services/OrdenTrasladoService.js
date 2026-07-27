/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoService.js
 * @description Lógica de negocio de stock para la Orden de Traslado.
 *              Valida parámetros y delega al OrdenTrasladoRepository local.
 */
define(['../repositories/OrdenTrasladoRepository'], (OrdenTrasladoRepository) => {

    /**
     * Retorna el stock disponible de uno o más ítems en una ubicación.
     *
     * @param {{ itemIds: Array<string|number>, locationId: string|number }} params
     * @returns {{ ok: boolean, stockMap: Object, error: string|null }}
     */
    const obtenerStockDisponibleEnLote = ({ itemIds, locationId }) => {
        if (!itemIds || !itemIds.length || !locationId) {
            return {
                ok      : false,
                stockMap: {},
                error   : 'Se requieren los parámetros itemIds y locationId.'
            };
        }

        try {
            const stockMap = OrdenTrasladoRepository.obtenerStockDisponibleEnLote(itemIds, locationId);
            return { ok: true, stockMap, error: null };
        } catch (e) {
            log.error({ title: 'OrdenTrasladoService.obtenerStockDisponibleEnLote', details: e.toString() });
            return { ok: false, stockMap: {}, error: e.toString() };
        }
    };

    return { obtenerStockDisponibleEnLote };
});
