/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/ui/serverWidget", "N/url", "./2win_ue_ov_search", "/SuiteScripts/2win_andes_salud_interfases/lib/2win_ui_helper"], function (serverWidget, url, searchModule, uiHelper) {
    /**
     * Construye la pestaña principal de Admisión y Cobertura (HL7)
     * @param {Form} form - El objeto del formulario
     */
    function buildAdmissionTab(form) {
        uiHelper.createTab(form, "custpage_tab_admision_hl7", "Admisión y Cobertura (HL7)");
        uiHelper.createSubtab(form, "custpage_subtab_resumen", "Resumen de la Admisión", "custpage_tab_admision_hl7");
        uiHelper.createSubtab(form, "custpage_subtab_cobertura", "Información de Cobertura", "custpage_tab_admision_hl7");
        uiHelper.createSubtab(form, "custpage_ref_group", "Resumen Urgencias", "custpage_tab_admision_hl7");

        let fld = uiHelper.createField(form, "custpage_nro_cuenta_paciente", serverWidget.FieldType.TEXT, "N° de Cuenta Paciente", "custpage_subtab_resumen");
        fld.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        fld.layoutType = serverWidget.FieldLayoutType.NORMAL;

        uiHelper.createField(form, "custpage_nro_admision", serverWidget.FieldType.TEXT, "N° de Admisión", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_id_clinico", serverWidget.FieldType.TEXT, "N° de Ficha", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        fld = uiHelper.createField(form, "custpage_tipo_atencion", serverWidget.FieldType.TEXT, "Tipo de Atención", "custpage_subtab_resumen");
        fld.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        fld.layoutType = serverWidget.FieldLayoutType.STARTROW;

        uiHelper.createField(form, "custpage_fecha_ingreso", serverWidget.FieldType.TEXT, "Fecha de Ingreso", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_hora_ingreso", serverWidget.FieldType.TEXT, "Hora de Ingreso", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        fld = uiHelper.createField(form, "custpage_servicio_ingreso", serverWidget.FieldType.TEXT, "Servicio de Ingreso", "custpage_subtab_resumen");
        fld.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        fld.layoutType = serverWidget.FieldLayoutType.STARTROW;

        uiHelper.createField(form, "custpage_servicio_ingreso_nom", serverWidget.FieldType.TEXT, "Nombre Servicio de Ingreso", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_procedencia", serverWidget.FieldType.TEXT, "Procedencia", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_prestador_tratante", serverWidget.FieldType.TEXT, "Prestador Tratante", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        uiHelper.createField(form, "custpage_prestador_tratante_nom", serverWidget.FieldType.TEXT, "Nombre Prestador Tratante", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        uiHelper.createField(form, "custpage_responsable_cuenta_cod", serverWidget.FieldType.TEXT, "Código Responsable de Cuenta", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_responsable_cuenta_nom", serverWidget.FieldType.TEXT, "Nombre Responsable de Cuenta", "custpage_subtab_resumen").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });
    }

    /**
     * Construye la subpestaña de Información de Cobertura
     * @param {Form} form - El objeto del formulario
     */
    function buildCoverageTab(form) {
        uiHelper.createField(form, "custpage_ley_previsional", serverWidget.FieldType.TEXT, "Ley Previsional", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_prevision_nom", serverWidget.FieldType.TEXT, "Prevision", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_prevision_cod", serverWidget.FieldType.TEXT, "Codigo Prevision", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_compania_seguro", serverWidget.FieldType.TEXT, "Compañía de Seguro", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_tramo_fonasa", serverWidget.FieldType.TEXT, "Tramo Fonasa", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_rama_ffaa", serverWidget.FieldType.TEXT, "Rama FFAA", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_convenio_cod", serverWidget.FieldType.TEXT, "Código Convenio", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_convenio_nom", serverWidget.FieldType.TEXT, "Nombre Convenio", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_paquete_atencion_cod", serverWidget.FieldType.TEXT, "Código Paquete Atención", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_paquete_atencion_nom", serverWidget.FieldType.TEXT, "Nombre Paquete Atención", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_tiene_reclamo", serverWidget.FieldType.CHECKBOX, "Tiene Reclamo", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_tiene_seguro", serverWidget.FieldType.CHECKBOX, "Tiene Seguro", "custpage_subtab_cobertura").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });
    }

    /**
     * Construye la sublista de Garantías y Documentos
     * @param {Form} form - El objeto del formulario
     * @param {string} recordId - ID del registro
     */
    function buildGarantiasSublist(form, recordId) {
        const garantiasSublist = uiHelper.createSublist(form, "custpage_sublist_garantias", serverWidget.SublistType.LIST, "Garantías y Documentos Adjuntos", "custpage_tab_admision_hl7");

        garantiasSublist.addField({ id: "custpage_col_tipo_doc", type: serverWidget.FieldType.TEXT, label: "Tipo de Documento" });
        garantiasSublist.addField({ id: "custpage_col_folio_doc", type: serverWidget.FieldType.TEXT, label: "Folio / N° Documento" });
        garantiasSublist.addField({ id: "custpage_col_rut_titular", type: serverWidget.FieldType.TEXT, label: "RUT del Titular" });
        garantiasSublist.addField({ id: "custpage_col_nombre_titular", type: serverWidget.FieldType.TEXT, label: "Nombre del Titular" });

        if (recordId) {
            const garantias = searchModule.searchGarantias(recordId);
            garantias.forEach(function (garantia, line) {
                if (garantia.tipoDoc) garantiasSublist.setSublistValue({ id: "custpage_col_tipo_doc", line: line, value: garantia.tipoDoc });
                if (garantia.folioDoc) garantiasSublist.setSublistValue({ id: "custpage_col_folio_doc", line: line, value: garantia.folioDoc });
                if (garantia.rutTitular) garantiasSublist.setSublistValue({ id: "custpage_col_rut_titular", line: line, value: garantia.rutTitular });
                if (garantia.nombreTitular) garantiasSublist.setSublistValue({ id: "custpage_col_nombre_titular", line: line, value: garantia.nombreTitular });
            });
        }
    }

    /**
     * Construye la pestaña de Auditoría de Integración (HL7)
     * @param {Form} form - El objeto del formulario
     */
    function buildAuditTab(form) {
        uiHelper.createTab(form, "custpage_tab_auditoria_hl7", "Auditoría de Integración (HL7)");
        uiHelper.createSubtab(form, "custpage_subtab_msg_details", "Detalles del Mensaje", "custpage_tab_auditoria_hl7");

        uiHelper.createField(form, "custpage_id_mensaje_hl7", serverWidget.FieldType.TEXT, "ID del Mensaje HL7", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_tipo_evento_hl7", serverWidget.FieldType.TEXT, "Tipo de Evento HL7", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_fecha_mensaje", serverWidget.FieldType.TEXT, "Fecha y Hora del Mensaje", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_fecha_anulacion", serverWidget.FieldType.TEXT, "Fecha de Anulación", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_nro_solicitud_farmacia", serverWidget.FieldType.TEXT, "Nro. Solicitud Farmacia", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.DISABLED
        });

        uiHelper.createField(form, "custpage_tipo_doc_adjunto", serverWidget.FieldType.TEXT, "Tipo Documento Adjunto", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });

        uiHelper.createField(form, "custpage_folio_doc_adjunto", serverWidget.FieldType.TEXT, "Folio Documento Adjunto", "custpage_subtab_msg_details").updateDisplayType({
            displayType: serverWidget.FieldDisplayType.HIDDEN
        });
    }

    /**
     * Construye la pestaña de Transacciones Relacionadas
     * @param {Form} form - El objeto del formulario
     */
    function buildRelatedDocsTab(form) {
        uiHelper.createTab(form, "custpage_tab_documentos_relacionados", "Transacciones Relacionadas");
    }

    /**
     * Construye la sublista de Prefacturas Asociadas
     * @param {Form} form - El objeto del formulario
     * @param {string} recordId - ID del registro
     */
    function buildPrefacturasSublist(form, recordId) {
        const prefacturas = searchModule.searchPrefacturas(recordId);
        if (!prefacturas || prefacturas.length === 0) return;

        const sublistPrefacturas = uiHelper.createSublist(form, "custpage_sublist_prefacturas", serverWidget.SublistType.LIST, "Prefacturas Asociadas", "custpage_tab_documentos_relacionados");

        sublistPrefacturas.addField({ id: "custpage_col_pf_nombre", type: serverWidget.FieldType.TEXT, label: "Id Prefactura" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_glosa", type: serverWidget.FieldType.TEXT, label: "Glosa" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_montoneto", type: serverWidget.FieldType.CURRENCY, label: "Monto Neto" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_montoexento", type: serverWidget.FieldType.CURRENCY, label: "Monto Exento" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_montoiva", type: serverWidget.FieldType.CURRENCY, label: "Monto IVA" });
        sublistPrefacturas.addField({ id: "custpage_col_pf_montototal", type: serverWidget.FieldType.CURRENCY, label: "Monto Total" });

        prefacturas.forEach(function (prefactura, line) {
            const urlRecord = url.resolveRecord({
                isEditMode: false,
                recordId: prefactura.internalid,
                recordType: "customrecord_2w_as_prefactura"
            });
            if (prefactura.nombreprefactura) sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_nombre", line: line, value: `<a href='${urlRecord}'>${prefactura.nombreprefactura}</a>` });
            if (prefactura.fechaprefactura) sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_fecha", line: line, value: prefactura.fechaprefactura });
            if (prefactura.estado) sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_estado", line: line, value: prefactura.estado });
            if (prefactura.glosa) sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_glosa", line: line, value: prefactura.glosa });
            sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_montoneto", line: line, value: prefactura.montonetotal || "0" });
            sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_montoexento", line: line, value: prefactura.montoexentototal || "0" });
            sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_montoiva", line: line, value: prefactura.montoivatotal || "0" });
            sublistPrefacturas.setSublistValue({ id: "custpage_col_pf_montototal", line: line, value: prefactura.montototal || "0" });
        });
    }

    /**
     * Construye la sublista de Journals Asociados
     * @param {Form} form - El objeto del formulario
     * @param {string} recordId - ID del registro
     */
    function buildJournalsSublist(form, recordId) {
        const journals = searchModule.searchJournals(recordId);
        if (!journals || journals.length === 0) return;

        const sublistJournal = uiHelper.createSublist(form, "custpage_sublist_journal", serverWidget.SublistType.LIST, "Asientos de Diario Asociados", "custpage_tab_documentos_relacionados");

        sublistJournal.addField({ id: "custpage_col_je_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistJournal.addField({ id: "custpage_col_je_numero", type: serverWidget.FieldType.TEXT, label: "Numero" });
        sublistJournal.addField({ id: "custpage_col_je_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistJournal.addField({ id: "custpage_col_je_isrever", type: serverWidget.FieldType.TEXT, label: "Reversa" });
        sublistJournal.addField({ id: "custpage_col_je_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });

        journals.forEach(function (journal, line) {
            const urlRecord = url.resolveRecord({
                isEditMode: false,
                recordId: journal.internalid,
                recordType: "journalentry"
            });
            if (journal.tranid) sublistJournal.setSublistValue({ id: "custpage_col_je_numero", line: line, value: `<a href='${urlRecord}'>${journal.tranid}</a>` });
            if (journal.trandate) sublistJournal.setSublistValue({ id: "custpage_col_je_fecha", line: line, value: journal.trandate });
            if (journal.status) sublistJournal.setSublistValue({ id: "custpage_col_je_estado", line: line, value: journal.status });
            sublistJournal.setSublistValue({ id: "custpage_col_je_monto", line: line, value: (journal.isreversal !== "F" ? -1 : 1) * journal.amount || "0" });
            sublistJournal.setSublistValue({ id: "custpage_col_je_isrever", line: line, value: journal.isreversal });
        });
    }

    /**
     * Construye la sublista de Recaudaciones (vista sin datos)
     * @param {Form} form - El objeto del formulario
     */
    function buildRecaudacionesTab(form) {
        uiHelper.createTab(form, "custpage_tab_recaudaciones", "Recaudaciones", "custpage_tab_documentos_relacionados");

        // Transactions
        uiHelper.createSubtab(form, "custpage_subtab_rec_transactions", "Transactions", "custpage_tab_recaudaciones");
        const sublistRecTrans = uiHelper.createSublist(form, "custpage_sublist_rec_transactions", serverWidget.SublistType.LIST, "Transactions", "custpage_subtab_rec_transactions");
        sublistRecTrans.addField({ id: "custpage_col_rec_t_folio", type: serverWidget.FieldType.TEXT, label: "Folio" });
        sublistRecTrans.addField({ id: "custpage_col_rec_t_numero", type: serverWidget.FieldType.TEXT, label: "Número" });
        sublistRecTrans.addField({ id: "custpage_col_rec_t_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistRecTrans.addField({ id: "custpage_col_rec_t_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistRecTrans.addField({ id: "custpage_col_rec_t_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });

        // Invoices
        uiHelper.createSubtab(form, "custpage_subtab_rec_invoices", "Invoices", "custpage_tab_recaudaciones");
        const sublistRecInv = uiHelper.createSublist(form, "custpage_sublist_rec_invoices", serverWidget.SublistType.LIST, "Invoices", "custpage_subtab_rec_invoices");
        sublistRecInv.addField({ id: "custpage_col_rec_i_folio", type: serverWidget.FieldType.TEXT, label: "Folio" });
        sublistRecInv.addField({ id: "custpage_col_rec_i_numero", type: serverWidget.FieldType.TEXT, label: "Número" });
        sublistRecInv.addField({ id: "custpage_col_rec_i_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistRecInv.addField({ id: "custpage_col_rec_i_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistRecInv.addField({ id: "custpage_col_rec_i_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });

        // Journals
        uiHelper.createSubtab(form, "custpage_subtab_rec_journals", "Journals", "custpage_tab_recaudaciones");
        const sublistRecJrn = uiHelper.createSublist(form, "custpage_sublist_rec_journals", serverWidget.SublistType.LIST, "Journals", "custpage_subtab_rec_journals");
        sublistRecJrn.addField({ id: "custpage_col_rec_j_folio", type: serverWidget.FieldType.TEXT, label: "Folio" });
        sublistRecJrn.addField({ id: "custpage_col_rec_j_numero", type: serverWidget.FieldType.TEXT, label: "Número" });
        sublistRecJrn.addField({ id: "custpage_col_rec_j_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistRecJrn.addField({ id: "custpage_col_rec_j_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistRecJrn.addField({ id: "custpage_col_rec_j_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });

        // Notas de Crédito
        uiHelper.createSubtab(form, "custpage_subtab_rec_nc", "Notas de Crédito", "custpage_tab_recaudaciones");
        const sublistRecNC = uiHelper.createSublist(form, "custpage_sublist_rec_nc", serverWidget.SublistType.LIST, "Notas de Crédito", "custpage_subtab_rec_nc");
        sublistRecNC.addField({ id: "custpage_col_rec_nc_folio", type: serverWidget.FieldType.TEXT, label: "Folio" });
        sublistRecNC.addField({ id: "custpage_col_rec_nc_numero", type: serverWidget.FieldType.TEXT, label: "Número" });
        sublistRecNC.addField({ id: "custpage_col_rec_nc_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistRecNC.addField({ id: "custpage_col_rec_nc_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistRecNC.addField({ id: "custpage_col_rec_nc_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });

        // Pagos
        uiHelper.createSubtab(form, "custpage_subtab_rec_pagos", "Pagos", "custpage_tab_recaudaciones");
        const sublistRecPagos = uiHelper.createSublist(form, "custpage_sublist_rec_pagos", serverWidget.SublistType.LIST, "Pagos", "custpage_subtab_rec_pagos");
        sublistRecPagos.addField({ id: "custpage_col_rec_p_folio", type: serverWidget.FieldType.TEXT, label: "Folio" });
        sublistRecPagos.addField({ id: "custpage_col_rec_p_numero", type: serverWidget.FieldType.TEXT, label: "Número" });
        sublistRecPagos.addField({ id: "custpage_col_rec_p_fecha", type: serverWidget.FieldType.DATE, label: "Fecha" });
        sublistRecPagos.addField({ id: "custpage_col_rec_p_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        sublistRecPagos.addField({ id: "custpage_col_rec_p_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });
    }

    return {
        buildAdmissionTab: buildAdmissionTab,
        buildCoverageTab: buildCoverageTab,
        buildGarantiasSublist: buildGarantiasSublist,
        buildAuditTab: buildAuditTab,
        buildRelatedDocsTab: buildRelatedDocsTab,
        buildPrefacturasSublist: buildPrefacturasSublist,
        buildJournalsSublist: buildJournalsSublist,
        buildRecaudacionesTab: buildRecaudacionesTab
    };
});
