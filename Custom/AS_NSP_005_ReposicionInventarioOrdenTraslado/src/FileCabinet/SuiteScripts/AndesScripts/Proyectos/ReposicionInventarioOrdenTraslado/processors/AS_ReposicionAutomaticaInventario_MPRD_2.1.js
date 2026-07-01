/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @name        AS_ReposicionAutomaticaInventario_MPRD_2.1.js
 * @author      Andes Salud
 * @version     2.0.0
 *
 * @description Orquestador Map/Reduce de reposición automática de inventario por Punto de Reorden.
 *              Este script actúa exclusivamente como orquestador de las etapas del MR;
 *              toda la lógica de negocio y acceso a datos está delegada en:
 *
 *              Repositorios:
 *                - ASConfigReposicionAutomaticaInventarioRepository  → lectura de configuración activa
 *                - InventarioRepository        → stock disponible y en tránsito
 *                - TransferOrderRepository     → creación de Orden de Traslado
 *                - ASLogReposicionAutomaticaInventarioRepository     → guardado de log de ejecución
 *
 *              Servicios:
 *                - ReposicionService           → regla de negocio de reposición
 *                - TransferOrderService        → creación de OT + log de resultado
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
     * Obtiene los pares de configuración activos (subsidiaria / origen / destino).
     * Cada elemento se convierte en una entrada para la etapa map.
     *
     * @returns {Array<{subsidiaryId: string, locationFrom: string, locationTo: string}>}
     */
    const getInputData = (context) => {
        const configs = ConfigRepository.getActiveConfigs();
        log.audit('getInputData', `Configuraciones activas: ${configs.length}`);
        return configs;
    };

    // ─── map ──────────────────────────────────────────────────────────────────
    /**
     * Por cada configuración, evalúa qué artículos requieren reposición en la
     * ubicación destino y emite una entrada por artículo.
     * Key: "subsidiaryId:locationFrom:locationTo" → identifica unívocamente la OT a crear.
     *
     * @param {Object} context
     */
    const map = (context) => {
        const { subsidiaryId, locationFrom, locationTo } = JSON.parse(context.value);
        const key = `${subsidiaryId}:${locationFrom}:${locationTo}`;

        try {
            const items = ReposicionService.getItemsToReplenish(locationTo);

            if (!items.length) {
                log.error('map', `[${key}] Sin artículos a reponer. Se omite.`);
                return;
            }

            items.forEach(item => context.write({ key, value: JSON.stringify(item) }));
            log.error('map', `[${key}] Artículos emitidos: ${items.length}`);

        } catch (e) {
            log.error('map', `[${key}] ${e.name}: ${e.message}`);
            throw e;
        }
    };

    // ─── reduce ───────────────────────────────────────────────────────────────
    /**
     * Por cada clave única, recibe los artículos a reponer, delega la creación
     * de la Orden de Traslado y el guardado del log al TransferOrderService.
     *
     * @param {Object} context
     */
    const reduce = (context) => {
        const [subsidiaryId, locationFrom, locationTo] = context.key.split(':');
        const items       = context.values.map(v => JSON.parse(v));

        TransferOrderService.processReplenishment({
            subsidiaryId,
            locationFrom,
            locationTo,
            items
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

        log.audit('summarize',
            `Ejecución completada | Errores map: ${mapErrors} | Errores reduce: ${reduceErrors}`
        );
    };

    // ─── Exports ──────────────────────────────────────────────────────────────
    return { getInputData, map, reduce, summarize };
});