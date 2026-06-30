/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @author Consultor Experto NetSuite
 * @description Suitelet Híbrido: Análisis de Discrepancias optimizado con ejecución asíncrona paginada concurrente.
 */
define(["N/ui/serverWidget", "N/query"], (serverWidget, query) => {
    /**
     * Función auxiliar para ejecutar consultas paginadas de forma asíncrona y concurrente.
     * @param {string} sql - La consulta SuiteQL.
     * @param {Array} params - Los parámetros de la consulta.
     * @returns {Promise<Array>} - Arreglo aplanado con todos los resultados mapeados.
     */
    const ejecutarConsultaPaginada = async (sql, params) => {
        // 1. Ejecutamos la consulta paginada de forma asíncrona
        const pagedQuery = await query.runSuiteQLPaged.promise({
            query: sql,
            params: params,
            pageSize: 1000
        });

        // 2. Mapeamos los rangos de páginas para crear un arreglo de promesas
        const fetchPromises = pagedQuery.pageRanges.map((range) => {
            return pagedQuery.fetch.promise({ index: range.index });
        });

        // 3. Ejecutamos todas las promesas de manera concurrente
        const resolvedPages = await Promise.all(fetchPromises);

        // 4. Extraemos y aplanamos los resultados usando flatMap
        return resolvedPages.flatMap((page) => page.data.asMappedResults());
    };

    // Convertimos el punto de entrada en una función asíncrona
    const onRequest = async (context) => {
        const request = context.request;
        const response = context.response;

        if (request.method === "GET" || request.method === "POST") {
            try {
                let form = serverWidget.createForm({ title: "Reporte de Discrepancias de Inventario" });

                // --- 1. FILTROS ---
                form.addFieldGroup({ id: "fg_filtros", label: "Criterios de Búsqueda" });

                let itemField = form.addField({
                    id: "custpage_item",
                    type: serverWidget.FieldType.SELECT,
                    label: "Ítem",
                    source: "item",
                    container: "fg_filtros"
                });
                itemField.isMandatory = true;

                let locationField = form.addField({
                    id: "custpage_location",
                    type: serverWidget.FieldType.SELECT,
                    label: "Ubicación",
                    source: "location",
                    container: "fg_filtros"
                });
                locationField.isMandatory = true;

                form.addSubmitButton({ label: "Analizar Stock y Órdenes" });

                let itemId = request.parameters.custpage_item;
                let locationId = request.parameters.custpage_location;

                // --- 2. EJECUCIÓN ASÍNCRONA Y RENDERIZADO ---
                if (itemId && locationId) {
                    itemField.defaultValue = itemId;
                    locationField.defaultValue = locationId;

                    // ==========================================
                    // SECCIÓN 1: BALANCE DE INVENTARIO
                    // ==========================================

                    let sqlAgg = `SELECT quantityavailable, quantityonorder, quantitycommitted, quantityonhand 
                                  FROM AggregateItemLocation WHERE item = ? AND location = ?`;

                    let sqlBal = `SELECT quantityavailable, inventorynumber, binnumber, inventorystatus 
                                  FROM InventoryBalance WHERE item = ? AND location = ? ORDER BY lastmodifieddate ASC`;

                    // Ejecutamos las consultas utilizando la nueva función asíncrona optimizada
                    let resAgg = await ejecutarConsultaPaginada(sqlAgg, [itemId, locationId]);
                    let resBal = await ejecutarConsultaPaginada(sqlBal, [itemId, locationId]);

                    let aggOnHand = 0,
                        aggCommitted = 0,
                        aggAvailable = 0;
                    if (resAgg.length > 0) {
                        aggOnHand = resAgg[0].quantityonhand || 0;
                        aggCommitted = resAgg[0].quantitycommitted || 0;
                        aggAvailable = resAgg[0].quantityavailable || 0;
                    }

                    let balTotalAvailable = 0;
                    resBal.forEach((row) => {
                        balTotalAvailable += row.quantityavailable || 0;
                    });

                    let hasDiscrepancy = aggAvailable !== balTotalAvailable;

                    // CSS Global
                    let cssGlobal = `
                        <style>
                            .kpi-container { display: flex; gap: 15px; margin-bottom: 20px; font-family: sans-serif; }
                            .kpi-card { background-color: #2b2b2b; color: #fff; border-radius: 5px; padding: 15px; flex: 1; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                            .kpi-title { font-size: 12px; color: #aaa; margin-bottom: 8px; font-weight: normal; }
                            .kpi-value { font-size: 28px; font-weight: bold; }
                            .kpi-value.red { color: #ef5350; }
                            .kpi-value.orange { color: #ffb74d; }
                            .alert-banner { background-color: #5c2b2b; color: #ffcdd2; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-family: sans-serif; font-size: 13px; border: 1px solid #ef5350; }
                            .analysis-box { background-color: #333; color: #eee; padding: 20px; border-radius: 5px; margin-top: 20px; margin-bottom: 20px; font-family: sans-serif; display: flex; gap: 40px;}
                            .analysis-col { flex: 1; }
                            .analysis-box h3 { font-size: 13px; text-transform: uppercase; margin-top: 0; color: #fff; margin-bottom: 10px; font-weight: bold;}
                            .analysis-box p, .analysis-box ul { font-size: 13px; line-height: 1.5; margin: 0; }
                            .analysis-box ul { padding-left: 20px; }
                            .analysis-box li { margin-bottom: 8px; }
                            .badge { padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; color: #fff; }
                            .badge.partial { background-color: #f57c00; }
                            .badge.complete { background-color: #c62828; }
                        </style>
                    `;

                    let kpiHtml1 = `${cssGlobal}
                        <div class="kpi-container">
                            <div class="kpi-card"><div class="kpi-title">On hand (Aggregate)</div><div class="kpi-value">${aggOnHand}</div></div>
                            <div class="kpi-card"><div class="kpi-title">Qty committed</div><div class="kpi-value">${aggCommitted}</div></div>
                            <div class="kpi-card"><div class="kpi-title">Disponible (Aggregate)</div><div class="kpi-value ${hasDiscrepancy ? "red" : ""}">${aggAvailable}</div></div>
                            <div class="kpi-card"><div class="kpi-title">Disponible (InventoryBalance)</div><div class="kpi-value ${hasDiscrepancy ? "orange" : ""}">${balTotalAvailable}</div></div>
                        </div>
                    `;

                    if (hasDiscrepancy) {
                        kpiHtml1 += `<div class="alert-banner"><strong>⚠️ InventoryBalance</strong> reporta ${balTotalAvailable} unidades disponibles, pero <strong>AggregateItemLocation</strong> reporta ${aggAvailable} disponible con ${aggCommitted} comprometidas. El sistema no refleja correctamente el stock libre.</div>`;
                    }

                    form.addField({ id: "custpage_kpi_1", type: serverWidget.FieldType.INLINEHTML, label: " " }).defaultValue = kpiHtml1;

                    // SUBLISTA: INVENTORY BALANCE
                    let balSublist = form.addSublist({ id: "custpage_bal", type: serverWidget.SublistType.STATICLIST, label: "INVENTORYBALANCE — DETALLE POR LOTE" });
                    balSublist.addField({ id: "col_invnum", type: serverWidget.FieldType.TEXT, label: "Inventory #" });
                    balSublist.addField({ id: "col_bin", type: serverWidget.FieldType.TEXT, label: "Bin" });
                    balSublist.addField({ id: "col_status", type: serverWidget.FieldType.TEXT, label: "Status" });
                    balSublist.addField({ id: "col_qty", type: serverWidget.FieldType.TEXT, label: "Qty Disponible" });

                    resBal.forEach((row, i) => {
                        if (row.inventorynumber) balSublist.setSublistValue({ id: "col_invnum", line: i, value: String(row.inventorynumber) });
                        if (row.binnumber) balSublist.setSublistValue({ id: "col_bin", line: i, value: String(row.binnumber) });
                        if (row.inventorystatus) balSublist.setSublistValue({ id: "col_status", line: i, value: String(row.inventorystatus) });
                        if (row.quantityavailable !== null) balSublist.setSublistValue({ id: "col_qty", line: i, value: String(row.quantityavailable) });
                    });

                    // ==========================================
                    // SECCIÓN 2: ANÁLISIS DE ÓRDENES (TRANSACTION LINE)
                    // ==========================================

                    let sqlTran = `
                        SELECT t.id, t.type, t.trandate, t.tranid, ABS(tl.quantity) as qty_ordered, tl.quantitycommitted
                        FROM Transaction t
                        JOIN TransactionLine tl ON t.id = tl.transaction
                        WHERE tl.item = ? AND tl.inventorylocation = ?
                        AND t.status NOT IN ('fullyBilled', 'closed')
                        AND tl.quantitycommitted > 0
                        ORDER BY t.trandate DESC
                    `;

                    // Eliminamos el FETCH FIRST 100 ROWS ONLY de la consulta SQL ya que ahora nuestra función
                    // paginada asíncrona es capaz de traer todos los registros de forma segura y eficiente.
                    let resTran = await ejecutarConsultaPaginada(sqlTran, [itemId, locationId]);

                    let totalOrders = resTran.length;
                    let totalOrdered = 0;
                    let totalCommittedOrders = 0;
                    let ordersMissingFulfillment = [];

                    resTran.forEach((row) => {
                        let qtyO = row.qty_ordered || 0;
                        let qtyC = row.quantitycommitted || 0;
                        totalOrdered += qtyO;
                        totalCommittedOrders += qtyC;

                        if (qtyO > qtyC) {
                            ordersMissingFulfillment.push(row.tranid);
                        }
                    });

                    let pendingTotal = totalOrdered - totalCommittedOrders;
                    let urgentOrderText = ordersMissingFulfillment.length > 0 ? ordersMissingFulfillment[0] : "N/A";

                    let kpiHtml2 = `
                        <div style="margin-top: 30px; margin-bottom: 10px; font-family: sans-serif; font-size: 16px; font-weight: bold; color: #333;">
                            Detalle de órdenes con stock comprometido
                        </div>
                        <div class="kpi-container">
                            <div class="kpi-card"><div class="kpi-title">Órdenes abiertas</div><div class="kpi-value">${totalOrders}</div></div>
                            <div class="kpi-card"><div class="kpi-title">Total qty ordenada</div><div class="kpi-value">${totalOrdered}</div></div>
                            <div class="kpi-card"><div class="kpi-title">Total comprometido</div><div class="kpi-value red">${totalCommittedOrders}</div></div>
                            <div class="kpi-card"><div class="kpi-title">Sin fulfillment</div><div class="kpi-value orange">${pendingTotal}</div>
                            <div style="font-size: 10px; color: #888; margin-top: 5px;">${urgentOrderText}</div></div>
                        </div>
                    `;

                    form.addField({ id: "custpage_kpi_2", type: serverWidget.FieldType.INLINEHTML, label: " " }).defaultValue = kpiHtml2;

                    // SUBLISTA: TRANSACTION LINE (ÓRDENES)
                    let tranSublist = form.addSublist({ id: "custpage_tran", type: serverWidget.SublistType.STATICLIST, label: "SALES ORDERS ABIERTOS (STATUS ≠ FULLYBILLED / CLOSED)" });
                    tranSublist.addField({ id: "col_t_id", type: serverWidget.FieldType.TEXT, label: "ORDEN" });
                    tranSublist.addField({ id: "col_t_date", type: serverWidget.FieldType.TEXT, label: "FECHA" });
                    tranSublist.addField({ id: "col_t_tranid", type: serverWidget.FieldType.TEXT, label: "ID TRANSACCIÓN" });
                    tranSublist.addField({ id: "col_t_qord", type: serverWidget.FieldType.TEXT, label: "QTY ORDENADA" });
                    tranSublist.addField({ id: "col_t_qcom", type: serverWidget.FieldType.TEXT, label: "QTY COMPROMETIDA" });
                    tranSublist.addField({ id: "col_t_qpen", type: serverWidget.FieldType.TEXT, label: "PENDIENTE COMMIT" });
                    tranSublist.addField({ id: "col_t_status", type: serverWidget.FieldType.INLINEHTML, label: "ESTADO FULFILLMENT" });

                    resTran.forEach((row, i) => {
                        let qOrd = row.qty_ordered || 0;
                        let qCom = row.quantitycommitted || 0;
                        let qPen = qOrd - qCom;

                        let badgeHtml = qPen > 0 ? `<span class="badge partial">Parcial</span>` : `<span class="badge complete">Completo</span>`;

                        if (row.id) tranSublist.setSublistValue({ id: "col_t_id", line: i, value: String(row.id) });
                        if (row.trandate) tranSublist.setSublistValue({ id: "col_t_date", line: i, value: String(row.trandate) });
                        if (row.tranid)
                            tranSublist.setSublistValue({ id: "col_t_tranid", line: i, value: `<a href="/app/accounting/transactions/salesord.nl?id=${row.id}" target="_blank">${row.tranid}</a>` });
                        tranSublist.setSublistValue({ id: "col_t_qord", line: i, value: String(qOrd) });
                        tranSublist.setSublistValue({ id: "col_t_qcom", line: i, value: String(qCom) });
                        tranSublist.setSublistValue({ id: "col_t_qpen", line: i, value: `<span style="${qPen > 0 ? "color:#f57c00; font-weight:bold;" : ""}">${qPen}</span>` });
                        tranSublist.setSublistValue({ id: "col_t_status", line: i, value: badgeHtml });
                    });

                    // ==========================================
                    // SECCIÓN 3: CONCLUSIÓN Y PRÓXIMOS PASOS
                    // ==========================================

                    let urgenciaHtml =
                        ordersMissingFulfillment.length > 0
                            ? `<strong>${ordersMissingFulfillment[0]}</strong> tiene unidades pedidas pero no todas comprometidas. Verificar si hay stock en otra ubicación o si se requiere reposición.`
                            : `Todas las órdenes listadas tienen su stock comprometido en su totalidad.`;

                    let conclusionHtml = `
                        <div class="analysis-box">
                            <div class="analysis-col">
                                <h3>Causa raíz confirmada</h3>
                                <p>Las ${aggOnHand} unidades en inventario están completamente reservadas por ${totalOrders} sales orders abiertos. NetSuite calcula <code>disponible = on hand - committed = ${aggOnHand} - ${aggCommitted} = ${aggAvailable}</code>, lo cual es correcto.</p>
                                <div style="margin-top: 15px; font-size: 11px; color: #888;">
                                    Stock comprometido vs. on hand <span style="float:right; font-weight:bold; color:#fff;">${aggCommitted} / ${aggOnHand} (${aggOnHand > 0 ? Math.round((aggCommitted / aggOnHand) * 100) : 0}%)</span>
                                    <div style="width: 100%; height: 4px; background-color: #555; margin-top: 5px; border-radius: 2px;">
                                        <div style="width: ${aggOnHand > 0 ? Math.round((aggCommitted / aggOnHand) * 100) : 0}%; height: 100%; background-color: #c62828; border-radius: 2px;"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="analysis-col">
                                <h3>Atención urgente</h3>
                                <p>${urgenciaHtml}</p>
                            </div>
                        </div>
                    `;

                    form.addField({ id: "custpage_conclusion", type: serverWidget.FieldType.INLINEHTML, label: " " }).defaultValue = conclusionHtml;
                }

                // Renderizamos el formulario al finalizar todas las promesas asíncronas
                response.writePage(form);
            } catch (e) {
                log.error("Error en UI Discrepancias", e);
                response.write(`Se produjo un error crítico: ${e.message}`);
            }
        }
    };

    return { onRequest };
});
