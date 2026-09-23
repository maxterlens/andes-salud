/**
 * AS_NSP_005 — Reposición de Inventario por Orden de Traslado (módulo M2)
 * @description Map/Reduce que crea las Órdenes de Traslado correspondientes a
 *              resoluciones manuales YA CONFIRMADAS desde el Suitelet de Resolución
 *              de Stock Limitado. No vuelve a evaluar conflictos ni reparte stock —
 *              esa decisión ya la tomó una persona al presionar "Confirmar"; este
 *              proceso únicamente ejecuta lo que quedó registrado en el log en
 *              estado "Pendiente de Creación de OT" (ver TransferOrderService.
 *              registrarResolucionPendiente y ResolucionStockLimitadoHandler.
 *              _procesarConfirmacion).
 *
 *              Se sacó la creación de la OT fuera de la request del Suitelet porque,
 *              cuando una resolución involucra muchos destinos a la vez, crearlas
 *              todas de forma síncrona podía tardar demasiado o superar el límite
 *              de unidades de gobernancia de un Suitelet — la persona no debería
 *              quedar esperando esa creación en pantalla.
 *
 *              Disparo: el Handler del Suitelet dispara este Map/Reduce de inmediato
 *              (task.create) apenas se confirma una resolución, sin esperar ninguna
 *              programación. Auto-encadenamiento: al finalizar (summarize), vuelve a
 *              consultar si quedó algún log pendiente — ya sea porque llegó uno nuevo
 *              mientras corría esta ejecución, o porque el disparo inmediato del
 *              Suitelet no pudo iniciar una ejecución nueva porque esta ya estaba en
 *              curso — y, de haber, se autodispara de nuevo. No depende de ninguna
 *              programación periódica.
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define([
    '../repositories/ASLogReposicionAutomaticaInventarioRepository',
    '../services/TransferOrderService',
    'N/task',
    'N/log'
], (LogRepository, TransferOrderService, task, log) => {

    const SCRIPT_ID     = 'customscript_as_proc_resol_manual_mr';
    const DEPLOYMENT_ID = 'customdeploy_as_proc_resol_manual_mr';

    /**
     * getInputData — trae todos los logs en estado "Pendiente de Creación de OT".
     * Cada uno ya tiene, en su campo RESOLUCION_DETALLE, exactamente qué artículos y
     * cantidades hay que despachar — no hace falta volver a calcular nada acá.
     */
    const getInputData = () => {
        const pendientes = LogRepository.getPendientesCreacionOT();

        log.error('AS_ProcesarResolucionManual_MPRD - getInputData',
            `Registros pendientes de creación de OT: ${pendientes.length}`
        );

        return pendientes;
    };

    /**
     * map — por cada log pendiente, parsea el detalle de resolución guardado y crea
     * la Orden de Traslado correspondiente, actualizando ese mismo log con el resultado.
     */
    const map = (context) => {
        const registro = JSON.parse(context.value);

        let items = [];
        try {
            items = JSON.parse(registro.resolucionDetalle || '[]');
        } catch (e) {
            log.error('AS_ProcesarResolucionManual_MPRD - map',
                `Log ${registro.id}: no se pudo parsear el detalle de resolución (${e.message}). Se omite.`
            );
            return;
        }

        if (!items.length) {
            log.error('AS_ProcesarResolucionManual_MPRD - map',
                `Log ${registro.id}: detalle de resolución vacío, se omite.`
            );
            return;
        }

        TransferOrderService.procesarResolucionPendiente({
            logId       : registro.id,
            subsidiaryId: registro.subsidiaryId,
            locationFrom: registro.locationFrom,
            locationTo  : registro.locationTo,
            items
        });
    };

    /**
     * summarize — registra errores de la etapa map y, si tras esta ejecución quedó
     * algún log en "Pendiente de Creación de OT" (llegado durante la corrida, o porque
     * el disparo inmediato del Suitelet no pudo arrancar una ejecución nueva porque
     * esta ya estaba en curso), se autodispara de nuevo. Así se procesa todo sin
     * depender de ninguna programación periódica.
     */
    const summarize = (summary) => {
        summary.mapSummary.errors.iterator().each((key, error) => {
            log.error('AS_ProcesarResolucionManual_MPRD - error en map', `Key ${key}: ${error}`);
            return true;
        });

        const restantes = LogRepository.getPendientesCreacionOT();

        log.error('AS_ProcesarResolucionManual_MPRD - summarize',
            `Registros aún pendientes tras esta ejecución: ${restantes.length}`
        );

        if (restantes.length) {
            try {
                task.create({
                    taskType    : task.TaskType.MAP_REDUCE,
                    scriptId    : SCRIPT_ID,
                    deploymentId: DEPLOYMENT_ID
                }).submit();

                log.error('AS_ProcesarResolucionManual_MPRD - summarize',
                    `Se autodisparó una nueva ejecución: quedan ${restantes.length} registro(s) pendiente(s).`
                );
            } catch (e) {
                log.error('AS_ProcesarResolucionManual_MPRD - summarize',
                    `No se pudo autodisparar una nueva ejecución (${e.name}: ${e.message}). ` +
                    `Quedan ${restantes.length} registro(s) pendiente(s) sin procesar — se procesarán en ` +
                    `la próxima vez que alguien confirme una resolución en el Suitelet, o al reintentar ` +
                    `manualmente esta ejecución.`
                );
            }
        }
    };

    return { getInputData, map, summarize };
});
