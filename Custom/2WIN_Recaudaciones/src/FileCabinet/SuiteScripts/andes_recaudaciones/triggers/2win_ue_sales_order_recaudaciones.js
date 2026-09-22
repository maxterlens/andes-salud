/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(["N/ui/serverWidget", "../dao/SalesOrderRecaudacionesDAO", "N/log", "N/url"], function (serverWidget, recaudacionesDAO, nLog, url) {
    /**
     * Función helper para agregar una sublista al formulario
     * @param {Object} form - Formulario de NetSuite
     * @param {Object} opciones - Opciones de la sublista
     * @param {string} opciones.id - ID de la sublista
     * @param {string} opciones.label - Etiqueta de la sublista
     * @param {string} opciones.tab - ID del tab donde se agregará
     * @param {Array} opciones.datos - Array de datos a mostrar
     * @param {Array} opciones.columnas - Array de columnas [{id, label, type}]
     */
    function agregarSublista(form, opciones) {
        try {
            const sublist = form.addSublist({
                id: opciones.id,
                label: opciones.label,
                tab: opciones.tab,
                type: serverWidget.SublistType.LIST
            });

            // Agregar columnas
            opciones.columnas.forEach((col) => {
                sublist.addField({
                    id: col.id,
                    label: col.label,
                    type: col.type
                });
            });

            // Agregar columna de link al registro (oculta, para referencia)
            const linkField = sublist.addField({
                id: "custpage_link",
                label: "Link",
                type: serverWidget.FieldType.TEXT
            });
            linkField.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });

            // Poblar datos
            if (opciones.datos && opciones.datos.length > 0) {
                opciones.datos.forEach((dato, index) => {
                    opciones.columnas.forEach((col) => {
                        let valor = dato[col.id] || "";
                        
                        // Si es la columna numero, crear un link HTML
                        if (col.id === "numero" && dato.id) {
                            const recordUrl = url.resolveRecord({
                                recordType: getRecordType(dato),
                                recordId: dato.id
                            });
                            valor = `<a href="${recordUrl}" target="_blank">${valor}</a>`;
                        }
                        
                        sublist.setSublistValue({
                            id: col.id,
                            line: index,
                            value: valor
                        });
                    });

                    // Guardar ID del registro para posible link
                    sublist.setSublistValue({
                        id: "custpage_link",
                        line: index,
                        value: dato.id || ""
                    });
                });
            }

            nLog.debug("agregarSublista", `Sublista ${opciones.label} creada con ${opciones.datos ? opciones.datos.length : 0} registros`);
        } catch (error) {
            nLog.error("agregarSublista", `Error creando sublista ${opciones.label}: ${error.message}`);
        }
    }

    /**
     * Helper para determinar el tipo de registro basado en los datos
     * @param {Object} dato - Objeto con datos de la transacción
     * @returns {string} - Tipo de registro de NetSuite
     */
    function getRecordType(dato) {
        // Inferir el tipo basado en el origen y otros datos
        if (dato.origen === "CAJA") {
            // Las boletas son Invoices del flujo de caja
            if (dato.estado && dato.estado.includes("Invoice")) {
                return "invoice";
            }
            // Los journals del flujo de caja
            return "journalentry";
        } else {
            // Origen FACTURACIÓN
            if (dato.estado && dato.estado.includes("Credit")) {
                return "creditmemo";
            }
            return "invoice";
        }
    }

    /**
     * Punto de entrada beforeLoad - Agrega sublistas de recaudaciones
     * @param {Object} scriptContext - Contexto del script
     */
    function beforeLoad(scriptContext) {
        try {
            // Solo ejecutar en modo VIEW o EDIT
            if (scriptContext.type !== scriptContext.UserEventType.VIEW && scriptContext.type !== scriptContext.UserEventType.EDIT) {
                return;
            }

            const form = scriptContext.form;
            const salesOrder = scriptContext.newRecord;
            const salesOrderId = salesOrder.id;
            const cuentaPaciente = salesOrder.getValue("custbody_2win_nro_cuenta_paciente");

            nLog.debug("beforeLoad", `SO ID: ${salesOrderId}, Cuenta Paciente: ${cuentaPaciente}`);

            if (!cuentaPaciente) {
                nLog.debug("beforeLoad", "No hay cuenta paciente, no se mostrarán recaudaciones");
                return;
            }

            // Crear tab principal de Recaudaciones
            form.addTab({
                id: "custpage_tab_recaudaciones",
                label: "Recaudaciones"
            });
            // - transacciones de caja
            form.addSubtab({
                id: "custpage_tab_boletas",
                label: "Boletas",
                tab: "custpage_tab_recaudaciones"
            });
            form.addSubtab({
                id: "custpage_tab_bonos",
                label: "Bonos",
                tab: "custpage_tab_recaudaciones"
            });
            form.addSubtab({
                id: "custpage_tab_coberturas",
                label: "Coberturas",
                tab: "custpage_tab_recaudaciones"
            });
            form.addSubtab({
                id: "custpage_tab_formas_pago",
                label: "Formas de Pago",
                tab: "custpage_tab_recaudaciones"
            });
            
            form.addSubtab({
                id: "custpage_tab_cierre_caja",
                label: "Cierre de Caja",
                tab: "custpage_tab_recaudaciones"
            });

            // - transacciones de facturación

            form.addSubtab({
                id: "custpage_tab_facturas",
                label: "Facturas",
                tab: "custpage_tab_recaudaciones"
            });
            form.addSubtab({
                id: "custpage_tab_notas_credito",
                label: "Notas de Crédito",
                tab: "custpage_tab_recaudaciones"
            });
            form.addSubtab({
                id: "custpage_tab_notas_debito",
                label: "Notas de Débito",
                tab: "custpage_tab_recaudaciones"
            });
            // Obtener datos del DAO
            const datosCaja = recaudacionesDAO.getTransaccionesCaja({ cuentaPaciente });
            const datosFacturacion = recaudacionesDAO.getTransaccionesFacturacion({ salesOrderId });

            // Definir columnas comunes para todas las sublistas
            const columnas = [
                { id: "folio", label: "Folio", type: serverWidget.FieldType.TEXT },
                { id: "numero", label: "Número", type: serverWidget.FieldType.TEXT },
                { id: "fecha", label: "Fecha", type: serverWidget.FieldType.TEXT },
                { id: "estado", label: "Estado", type: serverWidget.FieldType.TEXT },
                { id: "memo", label: "Memo", type: serverWidget.FieldType.TEXT },
                { id: "monto", label: "Monto", type: serverWidget.FieldType.TEXT },
                { id: "origen", label: "Origen", type: serverWidget.FieldType.TEXT }
            ];

            // Agregar sublistas para transacciones de caja
            agregarSublista(form, {
                id: "custpage_slist_boletas",
                label: "Boletas",
                tab: "custpage_tab_boletas",
                datos: datosCaja.boletas,
                columnas: columnas
            });

            agregarSublista(form, {
                id: "custpage_slist_bonos",
                label: "Bonos",
                tab: "custpage_tab_bonos",
                datos: datosCaja.bonos,
                columnas: columnas
            });

            agregarSublista(form, {
                id: "custpage_slist_coberturas",
                label: "Coberturas",
                tab: "custpage_tab_coberturas",
                datos: datosCaja.coberturas,
                columnas: columnas
            });

            agregarSublista(form, {
                id: "custpage_slist_formas_pago",
                label: "Formas de Pago",
                tab: "custpage_tab_formas_pago",
                datos: datosCaja.formasPago,
                columnas: columnas
            });

            agregarSublista(form, {
                id: "custpage_slist_cierre_caja",
                label: "Cierre de Caja",
                tab: "custpage_tab_cierre_caja",
                datos: datosCaja.cierreCaja,
                columnas: columnas
            });

            // Agregar sublistas para transacciones de facturación
            agregarSublista(form, {
                id: "custpage_slist_facturas",
                label: "Facturas",
                tab: "custpage_tab_facturas",
                datos: datosFacturacion.facturas,
                columnas: columnas
            });

            agregarSublista(form, {
                id: "custpage_slist_notas_credito",
                label: "Notas de Crédito",
                tab: "custpage_tab_notas_credito",
                datos: datosFacturacion.notasCredito,
                columnas: columnas
            });

            agregarSublista(form, {
                id: "custpage_slist_notas_debito",
                label: "Notas de Débito",
                tab: "custpage_tab_notas_debito",
                datos: datosFacturacion.notasDebito,
                columnas: columnas
            });

            nLog.audit("beforeLoad", "Sublistas de recaudaciones pobladas exitosamente");
        } catch (error) {
            nLog.error("beforeLoad", error);
            // throw error;
        }
    }

    return {
        beforeLoad: beforeLoad
    };
});
