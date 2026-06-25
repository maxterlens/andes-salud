/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 * @NModuleScope SameAccount
 */

/**
 * AS_AsignarProximoGrupoAprobacionOCGrupo1_2.1.js
 *
 * Workflow Action: Asignar Próximo Grupo de Aprobación OC - Grupo 1
 *
 * Busca en el custom record custrecord_as_niveles_aprobacion el nivel de
 * aprobación correspondiente a la subsidiaria de la orden de compra y al
 * Grupo de Aprobación 1, y asigna el resultado en el campo correspondiente
 * de la transacción.
 *
 * @author      Andes Salud
 * @version     2.1
 */

define(['N/runtime','./repository/ASNivelesAprobacionOCRepository'],
    (runtime, ASNivelesAprobacionOCRepository) => {

        /**
         * @param {Object} scriptContext
         * @param {N/record.Record} scriptContext.newRecord  - Registro actual de la transacción
         * @param {N/record.Record} scriptContext.oldRecord  - Registro anterior
         * @param {Object}          scriptContext.workflow   - Contexto del workflow
         */
        const onAction = (scriptContext) => {

            const { newRecord } = scriptContext;

            try {
                const grupoAprobacion = runtime.getCurrentScript().getParameter({ name: 'custscript_as_asig_prox_gr_apr_wf_grupap' });
                log.error('grupoAprobacion', grupoAprobacion);
                if (!grupoAprobacion) {
                    log.error({ title: 'onAction - Parámetro no encontrado', details: 'El parámetro custscript_as_asig_prox_gr_apr_wf_grupap no tiene valor.' });
                    return;
                }

                const subsidiaria = newRecord.getValue({ fieldId: 'subsidiary' });
                log.error('subsidiaria', subsidiaria);

                if (!subsidiaria) {
                    log.error({ title: 'onAction - Subsidiaria no encontrada', details: `La transacción ${newRecord.id} no tiene subsidiaria asignada.` });
                    return;
                }

                const nivelAprobacion = ASNivelesAprobacionOCRepository.buscarPorSubsidiariaYGrupo(subsidiaria, grupoAprobacion);
                log.error('nivelAprobacion', nivelAprobacion);
                
                if (!nivelAprobacion) {
                    log.error({
                        title: 'onAction - Nivel de aprobación no encontrado',
                        details: `No se encontró nivel de aprobación para Subsidiaria: ${subsidiaria}, Grupo: ${grupoAprobacion}`
                    });
                    return;
                }

                newRecord.setValue({ fieldId: 'custbody_as_siguiente_nivel_aprobacion', value: nivelAprobacion.id });

            } catch (e) {
                log.error({ title: 'onAction - Error inesperado', details: `${e.name}: ${e.message}` });
            }
        };

        return { onAction };

    }
);
