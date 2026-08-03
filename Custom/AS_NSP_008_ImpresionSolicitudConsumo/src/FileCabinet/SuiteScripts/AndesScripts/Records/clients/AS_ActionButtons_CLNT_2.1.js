/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_ActionButtons_CLNT_2.1.js
 * @description Client Script para la Solicitud de Consumo.
 */
define(['N/currentRecord', 'N/url'], (currentRecord, url) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Constantes
    // ─────────────────────────────────────────────────────────────────────────

    const SUITELET_SCRIPT_ID = 'customscript_as_impresion_pdf_stlt';
    const SUITELET_DEPLOY_ID = 'customdeploy_as_impresion_pdf_stlt';
    const RECORD_TYPE        = 'customrecord_2win_solicitud_consumo';
    const TEMPLATE_ID        = 224;

    // ─────────────────────────────────────────────────────────────────────────
    // HOOK pageInit (requerido por NetSuite)
    // ─────────────────────────────────────────────────────────────────────────

    const pageInit = (_context) => {
        // Sin lógica en init; todo se resuelve en el click del botón
    };

    // ─────────────────────────────────────────────────────────────────────────
    // BOTÓN — Impresión
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Abre el PDF de la Solicitud de Consumo en una nueva pestaña,
     * usando el Suitelet de impresión en modo Advanced PDF/HTML Template.
     */
    const imprimirSolicitudConsumo = () => {
        const record = currentRecord.get();
        const id     = record.id;

        const suiteletUrl = url.resolveScript({
            scriptId:     SUITELET_SCRIPT_ID,
            deploymentId: SUITELET_DEPLOY_ID,
            params: {
                id:         id,
                recordtype: RECORD_TYPE,
                reportname: 'solicitudconsumo_pdf',
                filetype: 'pdf',
                mode: 'view'
            }
        });

        window.open(suiteletUrl, '_blank');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return { pageInit, imprimirSolicitudConsumo };
});