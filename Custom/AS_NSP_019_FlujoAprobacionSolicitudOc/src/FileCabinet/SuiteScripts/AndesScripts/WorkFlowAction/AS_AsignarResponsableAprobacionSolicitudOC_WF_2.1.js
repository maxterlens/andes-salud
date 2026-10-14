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
 * responsable configurado para la combinación Subsidiaria + Departamento
 * (cabecera) de la solicitud de compra (purchaserequisition) y lo asigna al
 * campo estándar nextapprover de la transacción.
 *
 * Si falta la subsidiaria o el departamento, o no existe responsable para la
 * combinación, la solicitud queda Pendiente de Aprobación sin aprobador
 * (nextapprover vacío) y se registra el motivo en el log.
 *
 * Aplica únicamente a registros de tipo purchaserequisition.
 *
 * @author      Andes Salud
 * @version     2.1
 */

define(['../CustomRecord/repositories/ASResponsableAprobacionSoliOCRepository'],
    (ASResponsableAprobacionSoliOCRepository) => {

        const FIELD_SUBSIDIARY = 'subsidiary';
        const FIELD_DEPARTMENT = 'department';
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
                    log.audit({
                        title: 'onAction - Tipo de registro no soportado',
                        details: `Este action solo aplica a ${RECORD_TYPE_PURCHASE_REQUISITION}. Tipo recibido: ${newRecord.type}`
                    });
                    return;
                }

                const subsidiaria = newRecord.getValue({ fieldId: FIELD_SUBSIDIARY });
                const departamento = newRecord.getValue({ fieldId: FIELD_DEPARTMENT });

                if (!subsidiaria || !departamento) {
                    log.audit({
                        title: 'onAction - Datos incompletos, queda sin aprobador',
                        details: `Solicitud ${newRecord.id || '(nueva)'} | Subsidiaria: ${subsidiaria || '-'} | Departamento: ${departamento || '-'}`
                    });
                    return;
                }

                const responsable = ASResponsableAprobacionSoliOCRepository.buscarResponsable(subsidiaria, departamento);

                if (!responsable) {
                    log.audit({
                        title: 'onAction - Responsable no configurado, queda sin aprobador',
                        details: `Solicitud ${newRecord.id || '(nueva)'} | Subsidiaria: ${subsidiaria} | Departamento: ${departamento}`
                    });
                    return;
                }

                newRecord.setValue({ fieldId: FIELD_NEXT_APPROVER, value: responsable });
                log.debug({
                    title: 'onAction - Responsable asignado',
                    details: `Solicitud ${newRecord.id || '(nueva)'} | Subsidiaria: ${subsidiaria} | Departamento: ${departamento} | Responsable: ${responsable}`
                });

            } catch (e) {
                log.error({ title: 'onAction - Error inesperado', details: `${e.name}: ${e.message}` });
            }
        };

        return { onAction };

    }
);
