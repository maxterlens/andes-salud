/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        ReposicionService.js
 * @description Servicio de lógica de reposición de inventario.
 *              Responsabilidad: determinar qué artículos requieren reposición y en qué cantidad,
 *              tanto desde la perspectiva del destino (necesidad) como del origen
 *              (disponibilidad real a repartir entre los destinos que lo comparten).
 *              No accede directamente a NetSuite — delega en InventarioRepository.
 */
define(['../repositories/InventarioRepository', 'N/log'],
(InventarioRepository, log) => {

    /**
     * Determina qué artículos de una ubicación destino requieren reposición y CUÁNTO NECESITAN,
     * sin considerar todavía si la ubicación de origen tiene stock disponible para cubrirlo.
     * Esa validación se hace después, en evaluarReposicionPorOrigen.
     *
     * Regla de negocio:
     *   stock_efectivo = stock_disponible_en_destino + cantidad_en_tránsito_hacia_destino
     *
     *   Condición de reposición:
     *     stock_efectivo < safetystocklevel
     *
     *   Cantidad necesitada:
     *     safetystocklevel - stock_efectivo
     *
     * El stock en tránsito corresponde a Órdenes de Traslado pendientes (no recibidas)
     * cuyo destino es la ubicación evaluada, evitando reponer artículos que ya vienen en camino.
     *
     * @param   {string|number} locationTo  Internal ID de la ubicación destino
     * @param   {Object}        [preloaded] Datos ya consultados en bulk para VARIAS
     *                                       ubicaciones a la vez (ver InventarioRepository
     *                                       "variantes bulk"), para evitar que esta función
     *                                       dispare sus propias 3 consultas cuando se llama
     *                                       muchas veces seguidas (una por cada ubicación
     *                                       destino) dentro de una misma ejecución — caso del
     *                                       Suitelet de Resolución de Stock Limitado. Si se omite,
     *                                       el comportamiento es idéntico al original: consulta
     *                                       los 3 datos para ESTA ubicación únicamente (caso del
     *                                       proceso automático, donde cada origen ya tiene su
     *                                       propia asignación de gobernancia y no hay este riesgo).
     * @param   {Array<Object>} [preloaded.itemConfigs]  Salida de getItemLocationConfig(Bulk) para esta ubicación
     * @param   {Object}        [preloaded.stockMap]     Salida de getAvailableStock(Bulk) para esta ubicación
     * @param   {Object}        [preloaded.inTransitMap] Salida de getPendingInTransitQty(Bulk) para esta ubicación
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
    const getItemsToReplenish = (locationTo, preloaded) => {
        log.error('ReposicionService.getItemsToReplenish - INICIO',
            `Evaluando artículos para locationTo: ${locationTo}`
        );

        const itemConfigs = (preloaded && preloaded.itemConfigs)
            ? preloaded.itemConfigs
            : InventarioRepository.getItemLocationConfig(locationTo);

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

        const stockMap     = (preloaded && preloaded.stockMap)
            ? preloaded.stockMap
            : InventarioRepository.getAvailableStock(locationTo, itemIds);
        const inTransitMap = (preloaded && preloaded.inTransitMap)
            ? preloaded.inTransitMap
            : InventarioRepository.getPendingInTransitQty(locationTo, itemIds);

        log.error('ReposicionService.getItemsToReplenish - stockMap',    JSON.stringify(stockMap));
        log.error('ReposicionService.getItemsToReplenish - inTransitMap', JSON.stringify(inTransitMap));

        const result = itemConfigs.reduce((acc, ic) => {
            const currentQty    = stockMap[ic.item_internal_id]     || 0;
            const inTransitQty  = inTransitMap[ic.item_internal_id] || 0;
            const effectiveQty  = currentQty + inTransitQty;

            const safetyStockLevel = Number(ic.safetystocklevel)   || 0;
            const preferredLevel   = Number(ic.preferredstocklevel) || 0;
            const safetyStock      = Number(ic.safetystocklevel)    || 0;

            const needsReplenishment = effectiveQty < safetyStockLevel;

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

    /**
     * Ordena un conjunto de "entradas" (destino + ítem solicitado) por prioridad configurada
     * (menor número = se atiende primero; sin valor = al final). Ante empate, respeta el
     * orden de llegada.
     *
     * @param   {Array<{destino: Object, item: Object}>} entradas
     * @returns {Array<{destino: Object, item: Object}>}
     */
    const _ordenarPorPrioridad = (entradas) =>
        entradas
            .map((e, idx) => ({ ...e, _idx: idx }))
            .sort((a, b) => {
                const ordenA = (a.destino.orden === null || a.destino.orden === undefined) ? Infinity : Number(a.destino.orden);
                const ordenB = (b.destino.orden === null || b.destino.orden === undefined) ? Infinity : Number(b.destino.orden);
                if (ordenA !== ordenB) return ordenA - ordenB;
                return a._idx - b._idx;
            });

    /**
     * Calcula un reparto SUGERIDO (no definitivo) del stock disponible de un ítem entre
     * los destinos que compiten por él, siguiendo el orden de prioridad configurado.
     * Este reparto es únicamente una propuesta por defecto que se muestra al usuario en el
     * Suitelet de Resolución de Stock Limitado — el reparto real lo confirma una persona.
     *
     * @param   {number} disponible  Cantidad disponible del ítem en el origen
     * @param   {Array<{destino: Object, item: Object}>} entradas
     * @returns {Object}  Map locationTo -> cantidad sugerida
     */
    const _sugerirReparto = (disponible, entradas) => {
        let restante = disponible;
        const sugerido = {};

        _ordenarPorPrioridad(entradas).forEach(({ destino, item }) => {
            const asignado = Math.min(item.qtyToOrder, restante);
            sugerido[destino.locationTo] = asignado;
            restante -= asignado;
        });

        return sugerido;
    };

    /**
     * Evalúa, para UNA ubicación origen, las necesidades de todos los destinos que lo
     * comparten en la misma ejecución, y separa el resultado en dos grupos:
     *
     *   - resueltos:   destinos/ítems que pueden atenderse automáticamente porque:
     *                    a) solo un destino solicita ese ítem (se permite reposición
     *                       parcial automática si el origen no alcanza a cubrir el 100%), o
     *                    b) dos o más destinos solicitan ese ítem, pero el origen tiene
     *                       disponibilidad suficiente para cubrir la necesidad total.
     *
     *   - conflictos:  ítems solicitados por 2 o más destinos donde el origen NO tiene
     *                    disponibilidad suficiente para cubrir la necesidad total. Estos
     *                    NO se resuelven automáticamente — requieren que una persona decida
     *                    la distribución desde el Suitelet de Resolución de Stock Limitado.
     *                    Se incluye un reparto "sugerido" (basado en el orden de prioridad)
     *                    solo a modo de propuesta inicial editable.
     *
     * Regla de negocio para la disponibilidad de origen:
     *   disponibleOrigen[item] = max(0, stockOrigen[item] - minimoOrigen[item] - comprometidoOrigen[item])
     *
     * comprometidoOrigen es lo que ya está comprometido en Órdenes de Traslado pendientes de
     * despacho desde ese mismo origen (ver InventarioRepository.getCommittedInTransitFromLocation).
     * Es necesario restarlo explícitamente porque NetSuite no reduce el "Quantity Available"
     * del origen por una OT recién creada — solo lo hace cuando la OT se despacha — así que sin
     * este descuento, dos evaluaciones sucesivas (dos búsquedas del Suitelet, o dos corridas del
     * proceso automático) verían el mismo stock "disponible" y podrían comprometerlo dos veces.
     *
     * @param   {Object}   params
     * @param   {string|number} params.locationFrom  Internal ID de la ubicación origen
     * @param   {Array<{
     *   locationTo: string|number,
     *   orden: number|null,
     *   items: Array<Object>   // salida de getItemsToReplenish para ese destino
     * }>}        params.destinos  Necesidades por destino que comparten este origen
     * @param   {Object}   [params.stockOrigenMap]   Salida ya calculada de getAvailableStock(Bulk)
     *                                                 para este origen. Si se omite, se consulta acá
     *                                                 mismo (comportamiento original, usado por el
     *                                                 proceso automático). Ver nota de gobernancia en
     *                                                 getItemsToReplenish — misma lógica acá para
     *                                                 evitar 3 consultas por cada origen cuando el
     *                                                 Suitelet evalúa muchos orígenes en una sola ejecución.
     * @param   {Object}   [params.minimoOrigenMap]  Salida ya calculada de getSafetyStockByLocation(Bulk)
     * @param   {Object}   [params.comprometidoMap]  Salida ya calculada de getCommittedInTransitFromLocation(Bulk)
     *
     * @returns {{
     *   resueltos: Array<{ locationTo: string|number, items: Array<Object> }>,
     *   conflictos: Array<{
     *     itemInternalId: string,
     *     itemCode: string,
     *     itemDisplayName: string,
     *     stockOrigen: number,
     *     minimoOrigen: number,
     *     comprometidoOrigen: number,          // comprometido en OTs pendientes de despacho desde origen
     *     disponibleSinComprometido: number,   // stock - mínimo, SIN restar comprometido (uso: mostrar en UI)
     *     disponibleOrigen: number,            // disponibleSinComprometido - comprometido (uso: validación/tope)
     *     necesidadTotal: number,
     *     destinos: Array<{ locationTo: string|number, orden: number|null, necesidad: number, sugerido: number, item: Object }>
     *   }>
     * }}
     */
    const evaluarReposicionPorOrigen = ({ locationFrom, destinos, stockOrigenMap, minimoOrigenMap, comprometidoMap }) => {
        const itemIdsSet = new Set();
        destinos.forEach(d => d.items.forEach(it => itemIdsSet.add(String(it.itemInternalId))));
        const itemIds = Array.from(itemIdsSet).join(',');

        if (!itemIds) return { resueltos: [], conflictos: [] };

        if (!stockOrigenMap)  stockOrigenMap  = InventarioRepository.getAvailableStock(locationFrom, itemIds);
        if (!minimoOrigenMap) minimoOrigenMap = InventarioRepository.getSafetyStockByLocation(locationFrom, itemIds);
        if (!comprometidoMap) comprometidoMap = InventarioRepository.getCommittedInTransitFromLocation(locationFrom, itemIds);

        // disponibleBruto: stock - mínimo protegido, SIN restar lo comprometido en OTs
        // pendientes de despacho — es el valor que se muestra en la interfaz como
        // "Stock disponible en origen".
        // disponible: disponibleBruto - comprometido — es el valor EFECTIVO que sigue
        // gobernando toda la validación (tope de los inputs, comparación contra la
        // necesidad total para decidir si hay conflicto, y el reparto sugerido).
        const disponibleBruto = {};
        const disponible      = {};
        itemIdsSet.forEach(itemId => {
            const stock        = stockOrigenMap[itemId]  || 0;
            const minimo       = minimoOrigenMap[itemId] || 0;
            const comprometido = comprometidoMap[itemId] || 0;
            const bruto        = Math.max(0, stock - minimo);
            disponibleBruto[itemId] = bruto;
            disponible[itemId]      = Math.max(0, bruto - comprometido);
        });

        log.error('ReposicionService.evaluarReposicionPorOrigen - disponible',
            JSON.stringify({ locationFrom, disponibleBruto, disponible, comprometidoMap })
        );

        // Agrupar, por ítem, todos los destinos que lo solicitan.
        const entradasPorItem = {};
        destinos.forEach(destino => {
            destino.items.forEach(item => {
                const itemId = String(item.itemInternalId);
                if (!entradasPorItem[itemId]) entradasPorItem[itemId] = [];
                entradasPorItem[itemId].push({ destino, item });
            });
        });

        const resueltosPorDestino = {};
        const conflictos = [];

        const pushResuelto = (locationTo, itemPayload) => {
            if (!resueltosPorDestino[locationTo]) resueltosPorDestino[locationTo] = [];
            resueltosPorDestino[locationTo].push(itemPayload);
        };

        Object.keys(entradasPorItem).forEach(itemId => {
            const entradas         = entradasPorItem[itemId];
            const disponibleItem   = disponible[itemId] || 0;
            const stockOrigen      = stockOrigenMap[itemId]  || 0;
            const minimoOrigen     = minimoOrigenMap[itemId] || 0;

            if (entradas.length === 1) {
                // Un solo destino solicita este ítem: se permite reposición parcial automática.
                const { destino, item } = entradas[0];
                const asignado = Math.min(item.qtyToOrder, disponibleItem);

                if (asignado > 0) {
                    pushResuelto(destino.locationTo, {
                        ...item,
                        qtyNecesaria : item.qtyToOrder,
                        qtyToOrder   : asignado,
                        esParcial    : asignado < item.qtyToOrder,
                        stockOrigen,
                        minimoOrigen
                    });
                }

                log.error('ReposicionService.evaluarReposicionPorOrigen - ítem único destino', JSON.stringify({
                    locationFrom, itemId, locationTo: destino.locationTo, disponibleItem, asignado
                }));
                return;
            }

            // 2 o más destinos compiten por el mismo ítem.
            const necesidadTotal = entradas.reduce((sum, e) => sum + e.item.qtyToOrder, 0);

            if (disponibleItem >= necesidadTotal) {
                // Alcanza para cubrir el 100% de todos los destinos: automático, sin conflicto.
                entradas.forEach(({ destino, item }) => {
                    pushResuelto(destino.locationTo, {
                        ...item,
                        qtyNecesaria : item.qtyToOrder,
                        qtyToOrder   : item.qtyToOrder,
                        esParcial    : false,
                        stockOrigen,
                        minimoOrigen
                    });
                });

                log.error('ReposicionService.evaluarReposicionPorOrigen - ítem múltiples destinos, sin conflicto',
                    JSON.stringify({ locationFrom, itemId, disponibleItem, necesidadTotal, destinos: entradas.length })
                );
            } else {
                // No alcanza: conflicto que requiere resolución manual.
                const sugerido = _sugerirReparto(disponibleItem, entradas);

                conflictos.push({
                    itemInternalId  : itemId,
                    itemCode        : entradas[0].item.itemCode,
                    itemDisplayName : entradas[0].item.itemDisplayName,
                    stockOrigen,
                    minimoOrigen,
                    comprometidoOrigen        : comprometidoMap[itemId] || 0,
                    disponibleSinComprometido : disponibleBruto[itemId] || 0,
                    disponibleOrigen: disponibleItem,
                    necesidadTotal,
                    destinos: entradas.map(({ destino, item }) => ({
                        locationTo : destino.locationTo,
                        orden      : (destino.orden === null || destino.orden === undefined) ? null : Number(destino.orden),
                        necesidad  : item.qtyToOrder,
                        sugerido   : sugerido[destino.locationTo] || 0,
                        item
                    }))
                });

                log.error('ReposicionService.evaluarReposicionPorOrigen - ítem múltiples destinos, CONFLICTO',
                    JSON.stringify({ locationFrom, itemId, disponibleItem, necesidadTotal, destinos: entradas.length })
                );
            }
        });

        const resueltos = Object.keys(resueltosPorDestino).map(locationTo => ({
            locationTo,
            items: resueltosPorDestino[locationTo]
        }));

        log.error('ReposicionService.evaluarReposicionPorOrigen - RESULTADO', JSON.stringify({
            locationFrom,
            destinosResueltos: resueltos.length,
            itemsEnConflicto : conflictos.length
        }));

        return { resueltos, conflictos };
    };

    return { getItemsToReplenish, evaluarReposicionPorOrigen };
});
