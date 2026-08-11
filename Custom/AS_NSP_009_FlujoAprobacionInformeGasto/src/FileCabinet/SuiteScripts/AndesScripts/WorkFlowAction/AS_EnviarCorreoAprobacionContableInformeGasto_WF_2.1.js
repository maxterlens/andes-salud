/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 * @NModuleScope SameAccount
 */

/**
 * AS_EnviarCorreoAprobacionContableInformeGasto_WF_2.1.js
 *
 * Workflow Action: Enviar Correo de Aprobación Contable - Informe de Gasto
 *
 * Al entrar al estado de Aprobación Contable, busca todos los empleados
 * que cumplan las siguientes condiciones y les envía un correo de notificación:
 *
 *   1. Tienen asignado alguno de los roles del custom record
 *      customrecord_as_rol_aprobacion_contable.
 *   2. Ese rol está habilitado para la subsidiaria del Informe de Gasto
 *      (filtro rolesubsidiary).
 *   3. Tienen el campo custentity_as_aprobador_cont_wf_inf_gast = T.
 *   4. El empleado está activo (isinactive = F).
 *
 * Parámetros del script:
 *   custscript_as_env_corr_apr_cont_ig_tmpl → Plantilla de correo (record type -120)
 *
 * @author      Andes Salud
 * @version     2.1
 */

define([
    "N/runtime",
    "N/email",
    "N/search",
    "./lib/RenderHelper",
    "./repository/ASRolesAprobacionContableRepository",
], (
    runtime,
    email,
    search,
    RenderHelper,
    ASRolesAprobacionContableRepository,
) => {
    /**
     * @param {Object}          scriptContext
     * @param {N/record.Record} scriptContext.newRecord - Registro actual del Informe de Gasto
     * @param {N/record.Record} scriptContext.oldRecord - Registro anterior
     * @param {Object}          scriptContext.workflow  - Contexto del workflow
     */
    const onAction = (scriptContext) => {
        const { newRecord } = scriptContext;

        try {
            // ── 1. Leer parámetros del script ─────────────────────────────────
            const script = runtime.getCurrentScript();
            const user = runtime.getCurrentUser();
            const emailTemplateId = script.getParameter({ name: "custscript_as_env_corr_apr_cont_ig_tmpl" });

            if (!emailTemplateId) {
                log.error({
                    title: "onAction - Parámetro faltante",
                    details:
                        "custscript_as_env_corr_apr_cont_ig_tmpl no tiene valor configurado.",
                });
                return;
            }

            // ── 2. Obtener subsidiaria del Informe de Gasto ───────────────────
            const recordId = newRecord.id;
            const subsidiaria = newRecord.getValue({ fieldId: "subsidiary" });

            if (!subsidiaria) {
                log.error({
                    title: "onAction - Subsidiaria no encontrada",
                    details: `El Informe de Gasto ${recordId} no tiene subsidiaria asignada.`,
                });
                return;
            }

            // ── 3. Obtener roles habilitados desde el custom record ────────────
            const roles = ASRolesAprobacionContableRepository.obtenerRoles();

            if (roles.length === 0) {
                log.error({
                    title: "onAction - Sin roles configurados",
                    details:
                        "El custom record customrecord_as_rol_aprobacion_contable no tiene roles activos.",
                });
                return;
            }

            log.error({
                title: "onAction - Roles obtenidos",
                details: `Informe de Gasto: ${recordId} | Subsidiaria: ${subsidiaria} | Roles: ${roles.join(", ")}`,
            });

            // ── 4. Buscar aprobadores contables ───────────────────────────────
            //
            // Condiciones:
            //   - role           IN roles del custom record
            //   - rolesubsidiary = subsidiaria del IG  (el rol tiene esa subsidiaria habilitada)
            //   - custentity_as_aprobador_cont_wf_inf_gast = T  (check individual)
            //   - isinactive     = F
            //
            const aprobadoresSearch = search.create({
                type: search.Type.EMPLOYEE,
                filters: [
                    ["role", "anyof", roles],
                    "AND",
                    ["role.subsidiaries", "anyof", subsidiaria],
                    "AND",
                    ["custentity_as_aprobador_cont_wf_inf_gast", "is", "T"],
                    "AND",
                    ["isinactive", "is", "F"],
                ],
                columns: [search.createColumn({ name: "internalid" })],
            });

            const aprobadores = [];
            const idsVistos = new Set();

            aprobadoresSearch.run().each((result) => {
                const id = Number(result.getValue({ name: "internalid" }));
                // Evitar duplicados si el empleado tiene el mismo rol en varias subsidiarias
                if (!idsVistos.has(id)) {
                    idsVistos.add(id);
                    aprobadores.push({ id });
                }
                return true;
            });

            if (aprobadores.length === 0) {
                log.error({
                    title: "onAction - Sin aprobadores contables",
                    details: `No se encontraron aprobadores para la subsidiaria ${subsidiaria} con los roles configurados.`,
                });
                return;
            }

            log.error({
                title: "onAction - Aprobadores encontrados",
                details: `Cantidad: ${aprobadores.length} | IDs: ${aprobadores.map((a) => a.id).join(", ")}`,
            });

            // ── 5. Renderizar cuerpo del correo ───────────────────────────────
            const { subject, body } = RenderHelper.renderEmailTemplate({
                templateId: emailTemplateId,
                transactionId: recordId,
                recipientId: aprobadores[0].id,
            });

            // ── 6. Enviar correo en lotes de hasta 10 aprobadores ────────────
            const BATCH_SIZE = 10;

            for (let i = 0; i < aprobadores.length; i += BATCH_SIZE) {
                const lote        = aprobadores.slice(i, i + BATCH_SIZE);
                const recipients  = lote.map(a => a.id);
                const loteNumero  = Math.floor(i / BATCH_SIZE) + 1;

                try {
                    email.send({
                        author: user.id,
                        recipients,
                        subject,
                        body,
                        relatedRecords: {
                            transactionId: recordId,
                        },
                    });

                    log.error({
                        title:   `onAction - Correo enviado (lote ${loteNumero})`,
                        details: `Destinatarios IDs: ${recipients.join(", ")} | Informe de Gasto: ${recordId}`,
                    });
                } catch (emailError) {
                    log.error({
                        title:   `onAction - Error enviando correo (lote ${loteNumero})`,
                        details: `${emailError.name}: ${emailError.message}`,
                    });
                }
            }
        } catch (e) {
            log.error({
                title: "onAction - Error inesperado",
                details: `${e.name}: ${e.message}`,
            });
        }
    };

    return { onAction };
});
