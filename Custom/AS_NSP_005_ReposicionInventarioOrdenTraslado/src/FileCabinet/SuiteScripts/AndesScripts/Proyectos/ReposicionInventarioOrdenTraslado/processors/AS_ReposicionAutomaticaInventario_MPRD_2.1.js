/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @name        AS_ReposicionAutomaticaInventario_MPRD_2.1.js
 * @author      Andes Salud
 * @version     4.0.0
 *
 * @description Orquestador Map/Reduce de reposición automática de inventario por Punto de Reorden.
 *              Este script actúa exclusivamente como orquestador de las etapas del MR;
 *              toda la lógica de negocio y acceso a datos está delegada en:
 *
 *              Repositorios:
 *                - ASConfigReposicionAutomaticaInventarioRepository  → lectura de configuración activa
 *                - InventarioRepository        → stock disponible y en tránsito (destino y origen)
 *                - TransferOrderRepository     → creación de Orden de Traslado
 *                - ASLogReposicionAutomaticaInventarioRepository     → guardado de log de ejecución
 *
 *              Servicios:
 *                - ReposicionService           → necesidad de reposición por destino + evaluación por origen
 *                - TransferOrderService        → creación de OT + log de resultado / log de conflicto
 *
 *              La etapa map calcula únicamente la NECESIDAD de cada destino (sin mirar el
 *              origen, por lo que sigue siendo 100% paralelizable). La etapa reduce agrupa
 *              por ORIGEN (no por par origen-destino), porque un mismo origen puede abastecer
 *              a varios destinos: NetSuite garantiza que cada clave de reduce se procesa como
 *              una unidad atómica, así que ahí es donde se valida el stock disponible en el
 *              origen (respetando su propio mínimo).
 *
 *              A partir de la v4.0.0, el reparto ya no es automático en todos los casos:
 *                - Si un ítem lo solicita un solo destino, o si el origen alcanza a cubrir
 *                  el 100% de todos los destinos que lo solicitan, se crea la Orden de
 *                  Traslado automáticamente (permitiendo reposición parcial cuando aplica).
 *                - Si 2 o más destinos compiten por el mismo ítem escaso y el origen NO
 *                  alcanza a cubrir la necesidad total, el ítem queda en conflicto: NO se
 *                  crea Orden de Traslado, solo se registra un log con estado
 *                  'Pendiente de Resolución Manual'. La resolución la realiza una persona
 *                  desde el Suitelet "Resolución de Stock Limitado", que recalcula estos
 *                  mismos conflictos en vivo usando ReposicionService.evaluarReposicionPorOrigen.
 *
 * @schedule    Cada 12 horas (configurado en el deployment)
 */
define([
    '../repositories/ASConfigReposicionAutomaticaInventarioRepository',
    '../services/ReposicionService',
    '../services/TransferOrderService',
    'N/runtime',
    'N/log'
],
(ConfigRepository, ReposicionService, TransferOrderService, runtime, log) => {

    // ─── getInputData ─────────────────────────────────────────────────────────
    /**
     * Obtiene los pares de configuración activos (subsidiaria / origen / destino / orden).
     * Cada elemento se convierte en una entrada para la etapa map.
     *
     * @returns {Array<{subsidiaryId: string, locationFrom: string, locationTo: string, orden: number|null}>}
     */
    const getInputData = (context) => {
        const configs = ConfigRepository.getActiveConfigs();
        log.error('getInputData', `Configuraciones activas: ${configs.length}`);
        return configs;
    };

    // ─── map ──────────────────────────────────────────────────────────────────
    /**
     * Por cada configuración, evalúa qué artículos requiere el destino (según SU propio
     * stock efectivo vs. su safetystocklevel), sin considerar todavía el origen.
     * Key: "subsidiaryId:locationFrom" → agrupa por ORIGEN, para que todos los destinos
     * que comparten ese origen se resuelvan juntos en una sola llamada a reduce.
     *
     * @param {Object} context
     */
    const map = (context) => {
        const { subsidiaryId, locationFrom, locationTo, orden } = JSON.parse(context.value);
        const key   = `${subsidiaryId}:${locationFrom}`;
        const label = `${subsidiaryId}:${locationFrom}->${locationTo}`;

        try {
            const items = ReposicionService.getItemsToReplenish(locationTo);

            if (!items.length) {
                log.error('map', `[${label}] Sin artículos a reponer. Se omite.`);
                return;
            }

            context.write({ key, value: JSON.stringify({ locationTo, orden, items }) });
            log.error('map', `[${label}] Artículos emitidos: ${items.length}`);

        } catch (e) {
            log.error('map', `[${label}] ${e.name}: ${e.message}`);
            throw e;
        }
    };

    // ─── reduce ───────────────────────────────────────────────────────────────
    /**
     * Por cada ORIGEN único, recibe las necesidades de todos los destinos que lo comparten
     * y las evalúa con ReposicionService.evaluarReposicionPorOrigen:
     *
     *   - Los ítems "resueltos" (sin conflicto) se procesan automáticamente, creando una
     *     Orden de Traslado por cada destino con al menos un ítem asignado.
     *   - Los ítems en "conflicto" (2+ destinos compitiendo por stock insuficiente) NO
     *     generan Orden de Traslado — solo se registra un log 'Pendiente de Resolución
     *     Manual' para que una persona los resuelva desde el Suitelet correspondiente.
     *
     * @param {Object} context
     */
    const reduce = (context) => {
        const [subsidiaryId, locationFrom] = context.key.split(':');
        const destinos = context.values.map(v => JSON.parse(v));

        const { resueltos, conflictos } = ReposicionService.evaluarReposicionPorOrigen({ locationFrom, destinos });

        if (!resueltos.length && !conflictos.length) {
            log.error('reduce',
                `[${subsidiaryId}:${locationFrom}] Sin stock disponible en origen (respetando el mínimo) para ningún destino.`
            );
            return;
        }

        resueltos.forEach(({ locationTo, items }) => {
            TransferOrderService.processReplenishment({
                subsidiaryId,
                locationFrom,
                locationTo,
                items
            });
        });

        conflictos.forEach((conflicto) => {
            log.error('reduce - conflicto detectado',
                `[${subsidiaryId}:${locationFrom}] Ítem [${conflicto.itemCode}] ${conflicto.itemDisplayName} ` +
                `requiere resolución manual (${conflicto.destinos.length} destinos, disponible ${conflicto.disponibleOrigen}, necesidad ${conflicto.necesidadTotal}).`
            );
            TransferOrderService.logStockLimitado({ subsidiaryId, locationFrom, conflicto });
        });
    };

    // ─── summarize ────────────────────────────────────────────────────────────
    /**
     * Consolida y registra errores de las etapas map y reduce.
     *
     * @param {Object} context
     */
    const summarize = (context) => {
        if (context.inputSummary.error) {
            log.error('summarize - inputSummary', context.inputSummary.error);
        }

        let mapErrors    = 0;
        let reduceErrors = 0;

        context.mapSummary.errors.iterator().each((key, error) => {
            log.error('summarize - map', `Key: ${key} | ${error}`);
            mapErrors++;
            return true;
        });

        context.reduceSummary.errors.iterator().each((key, error) => {
            log.error('summarize - reduce', `Key: ${key} | ${error}`);
            reduceErrors++;
            return true;
        });

        log.error('summarize',
            `Ejecución completada | Errores map: ${mapErrors} | Errores reduce: ${reduceErrors}`
        );
    };

    // ─── Exports ──────────────────────────────────────────────────────────────
    return { getInputData, map, reduce, summarize };
});
