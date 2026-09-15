/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 * @NModuleScope SameAccount
 */

/**
 * AS_AsignarResponsableAprobacionSolicitudOC_WF_2.1.js
 *
 * Workflow Action: Asignar Responsable de Aprobación - Solicitud de Compra
 *
 * Busca en el custom record customrecord_as_respon_aprob_soli_oc el
 * responsable configurado para la subsidiaria de la solicitud de compra
 * (purchaserequisition) y lo asigna al campo estándar nextapprover de la transacción.
 *
 * Aplica únicamente a registros de tipo purchaserequisition.
 *
 * @author      Andes Salud
 * @version     2.1
 */

define(['../CustomRecord/repositories/ASResponsableAprobacionSoliOCRepository'],
    (ASResponsableAprobacionSoliOCRepository) => {

        const FIELD_SUBSIDIARY = 'subsidiary';
        const FIELD_NEXT_APPROVER = 'nextapprover';
        const RECORD_TYPE_PURCHASE_REQUISITION = 'purchaserequisition';

        /**
         * @param {Object} scriptContext
         * @param {N/record.Record} scriptContext.newRecord  - Registro actual de la transacción
         * @param {N/record.Record} scriptContext.oldRecord  - Registro anterior
         * @param {Object}          scriptContext.workflow   - Contexto del workflow
         */
        const onAction = (scriptContext) => {

            const { newRecord } = scriptContext;

            try {
                if (newRecord.type !== RECORD_TYPE_PURCHASE_REQUISITION) {
                    log.error({
                        title: 'onAction - Tipo de registro no soportado',
                        details: `Este action solo aplica a ${RECORD_TYPE_PURCHASE_REQUISITION}. Tipo recibido: ${newRecord.type}`
                    });
                    return;
                }

                const subsidiaria = newRecord.getValue({ fieldId: FIELD_SUBSIDIARY });
                log.error('subsidiaria', subsidiaria);

                if (!subsidiaria) {
                    log.error({ title: 'onAction - Subsidiaria no encontrada', details: `La solicitud ${newRecord.id} no tiene subsidiaria asignada.` });
                    return;
                }

                const responsable = ASResponsableAprobacionSoliOCRepository.buscarResponsablesPorSubsidiaria(subsidiaria);
                log.error('responsable', responsable);

                if (!responsable) {
                    log.error({
                        title: 'onAction - Responsable no encontrado',
                        details: `No se encontró responsable de aprobación configurado para la Subsidiaria: ${subsidiaria}`
                    });
                    return;
                }
                newRecord.setValue({ fieldId: FIELD_NEXT_APPROVER, value: responsable });

            } catch (e) {
                log.error({ title: 'onAction - Error inesperado', details: `${e.name}: ${e.message}` });
            }
        };

        return { onAction };

    }
);
