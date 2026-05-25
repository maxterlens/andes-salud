/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */
define(["N/ui/serverWidget", "N/search", "N/log", "N/runtime", "N/url", "../domain/2win_dom_autopicking", "N/record", "./ue/2win_ue_ov_ui", "./ue/2win_ue_ov_business", "./ue/2win_ue_ov_search", "/SuiteScripts/2win_andes_salud_interfases/lib/2win_ui_helper", "../dao/2win_dao_autopicking_queue", "N/task"], function (
    serverWidget,
    search,
    nLog,
    runtime,
    url,
    AutoPickingManager,
    record,
    uiModule,
    businessModule,
    searchModule,
    uiHelper,
    daoAutopickingQueue,
    task
) {
    /**
     * @param {Object} context
     * @param {Record} context.newRecord - El registro actual.
     * @param {Form} context.form - El objeto del formulario a modificar.
     * @param {string} context.type - El tipo de evento que dispara el script.
     */
    const beforeLoad = (context) => {
        if (runtime.executionContext !== runtime.ContextType.USER_INTERFACE) {
            return;
        }
        // Solo ejecutar en la interfaz de usuario (Crear, Ver, Editar)
        if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.VIEW && context.type !== context.UserEventType.EDIT) {
            return;
        }

        const form = context.form;
        const currentRecord = context.newRecord;
        const recordId = context.newRecord.id;

        // Configurar campos obligatorios
        businessModule.setMandatoryFields(form);

        // === Construir pestañas de UI ===
        uiModule.buildAdmissionTab(form);
        uiModule.buildCoverageTab(form);
        uiModule.buildAuditTab(form);
        uiModule.buildRelatedDocsTab(form);

        // Cargar sublistas
        uiModule.buildGarantiasSublist(form, recordId);
        // uiModule.buildPrefacturasSublist(form, recordId);
        uiModule.buildJournalsSublist(form, recordId);
        // uiModule.buildRecaudacionesTab(form);

        if (recordId) {
            const mappings = businessModule.getFieldMappings();
            uiHelper.hideNativeFields(form, mappings.listRecordFields, ["class"]);

            const valueFields = searchModule.lookupFields(context.newRecord.type, recordId, mappings.listRecordFields);
            uiHelper.setFieldValues(form, mappings.listCustIds, mappings.listRecordFields, valueFields, nLog);
        }
    };

    const beforeSubmit = (context) => {
        const newRecord = context.newRecord;
        const oldRecord = context.oldRecord;
        const responsableRut = newRecord.getValue("custbody_2win_responsable_cuenta_cod");
        const responsableRutOld = oldRecord ? oldRecord.getValue("custbody_2win_responsable_cuenta_cod") : null;
        const nroCuentaPaciente = newRecord.getValue("custbody_2win_nro_cuenta_paciente");
        const nroCuentaPacienteOld = oldRecord ? oldRecord.getValue("custbody_2win_nro_cuenta_paciente") : null;
        const subsidiaria = newRecord.getValue("subsidiaria");
        const subsidiariaOld = oldRecord ? oldRecord.getValue("subsidiaria") : null;

        // Validar responsable
        if (responsableRut && responsableRut !== responsableRutOld) {
            //businessModule.validateResponsable(responsableRut);
        }

        nLog.debug({ title: "newRecord.type", details: newRecord.type });

        if (newRecord.type === "salesorder") {
            if (context.type === context.UserEventType.CREATE) {
                // Validar cuenta única
                if (nroCuentaPaciente && subsidiaria && (nroCuentaPaciente !== nroCuentaPacienteOld || subsidiaria !== subsidiariaOld)) {
                    businessModule.validateUniqueAccount(nroCuentaPaciente, subsidiaria, newRecord.id);
                }
            } else {
                if (newRecord.id) {
                    // Crear instancia de AutoPickingManager
                    const autoPickingManager = new AutoPickingManager();
                    if (context.type === context.UserEventType.DELETE) {
                        autoPickingManager.deleteFulfillment(newRecord);
                        // return;
                    }
                    // autoPickingManager.syncronize(oldRecord, newRecord, "beforeSubmit");
                }
            }
        }
    };

    const SCRIPT_ID = "customscript_2win_ss_autopicking";
    const DEPLOY_ID = "customdeploy_2win_ss_autopicking";

    const afterSubmit = (context) => {
        try {
            const newRecord = context.newRecord;
            const oldRecord = context.oldRecord;

            // Procesar autopicking de forma asíncrona mediante cola
            if (newRecord.type === "salesorder") {

                if (context.type !== context.UserEventType.DELETE && newRecord.id) {
                    // Validar si hay cambios relevantes en las líneas
                    const { hayCambios, estadoActualizacion } = businessModule.validarCambiosLineas(oldRecord, newRecord);

                    if (!hayCambios) {
                        nLog.debug({
                            title: "No hay cambios relevantes",
                            details: `OV ID: ${newRecord.id} - No se agrega a la cola`
                        });
                        return;
                    }

                    nLog.audit({
                        title: "Cambios detectados en líneas de OV",
                        details: `OV ID: ${newRecord.id}, Estado: ${estadoActualizacion}`
                    });

                    // Agregar a la cola de procesamiento asíncrono con el estado
                    const result = daoAutopickingQueue.addToQueue(newRecord.id, estadoActualizacion);

                    if (result.success) {
                        nLog.audit({
                            title: "OV agregada a cola de autopicking",
                            details: `OV ID: ${newRecord.id}, Cola ID: ${result.id}, Nuevo: ${result.isNew}, Estado: ${estadoActualizacion}`
                        });

                        // Verificar si ya hay una ejecución en curso
                        const isRunning = daoAutopickingQueue.verificarScheduledScriptActivo(DEPLOY_ID);

                        if (!isRunning) {
                            // Lanzar el Scheduled Script inmediatamente
                            const scheduledTask = task.create({
                                taskType: task.TaskType.SCHEDULED_SCRIPT,
                                scriptId: SCRIPT_ID,
                                deploymentId: DEPLOY_ID
                            });
                            const taskId = scheduledTask.submit();

                            nLog.audit({
                                title: "Scheduled Script lanzado",
                                details: `Task ID: ${taskId}`
                            });
                        } else {
                            nLog.debug({
                                title: "Scheduled Script ya en ejecución",
                                details: "No se lanza nueva tarea, ya hay una en curso"
                            });
                        }
                    } else {
                        nLog.error({
                            title: "Error al agregar OV a cola de autopicking",
                            details: result.message
                        });
                    }
                }
            }
        } catch (e) {
            nLog.error("e", e);
            nLog.error({
                title: "Error en afterSubmit de orden de venta",
                details: e.message
            });
        }
    };

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
