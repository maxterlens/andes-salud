/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Suitelet para eliminar movimientos completos de caja basado en folios de boleta
 */
define(["N/log", "N/query", "N/record", "N/runtime", "N/ui/serverWidget", "N/encode", "../dao/2win_dao_draft"], function (
    nLog,
    query,
    record,
    runtime,
    serverWidget,
    encode,
    draftDAO
) {
    /**
     * Busca boletas (Invoices) por sus folios
     * @param {Array} folios - Array de folios a buscar
     * @returns {Array} Array de boletas encontradas
     */
    function buscarBoletasPorFolio(folios) {
        try {
            nLog.audit("buscarBoletasPorFolio", `Buscando ${folios.length} folios: ${folios.join(", ")}`);

            const results = query
                .runSuiteQL({
                    query: `
                        SELECT DISTINCT
                            transaction.id,
                            transaction.tranid,
                            transaction.recordtype,
                            transaction.memo,
                            BUILTIN.DF(transaction.status) AS status,
                            transaction.tranDate,
                            transaction.custbody_2winfolioacepta,
                            transaction.custbodynumeromovimiento,
                            transaction.custbodyunidadcaja,
                            transaction.custbodyfechacaja,
                            transaction.custbodyaperturacaja,
                            transaction.custbodyrazonsocialcaja,
                            NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) AS amount,
                            transactionLine.subsidiary
                        FROM
                            transaction
                            INNER JOIN transactionLine ON transactionLine.transaction = transaction.id AND transactionLine.mainLine = 'T'
                        WHERE
                            transaction.custbody_2winfolioacepta IN (${folios.map(() => "?").join(",")})
                            AND transaction.type = 'CustInvc'
                            AND transaction.custbody_2win_created_from_income_flow = 'T'
                        ORDER BY
                            transaction.custbody_2winfolioacepta
                    `,
                    params: folios
                })
                .asMappedResults();

            nLog.audit("buscarBoletasPorFolio - Resultados", `Encontradas ${results.length} boletas`);
            return results;
        } catch (error) {
            nLog.error("buscarBoletasPorFolio - Error", error);
            throw error;
        }
    }

    /**
     * Busca todas las transacciones de un movimiento completo
     * @param {Object} movimiento - Datos del movimiento (numero, caja, fecha, etc.)
     * @returns {Array} Array con todas las transacciones del movimiento
     */
    function buscarTransaccionesMovimiento(movimiento) {
        try {
            let { numeromovimiento, unidadcaja, fechacaja, aperturacaja, razonsocialcaja } = movimiento;

            // Validar que todos los parámetros necesarios existan
            if (!numeromovimiento || !unidadcaja || !fechacaja || !aperturacaja || !razonsocialcaja) {
                throw new Error(`Faltan parámetros necesarios para buscar transacciones del movimiento. numeromovimiento: ${numeromovimiento}, unidadcaja: ${unidadcaja}, fechacaja: ${fechacaja}, aperturacaja: ${aperturacaja}, razonsocialcaja: ${razonsocialcaja}`);
            }

            nLog.debug("buscarTransaccionesMovimiento", { numeromovimiento, unidadcaja, fechacaja, aperturacaja, razonsocialcaja });

            // const dateObj = new Date(fechacaja);
            // fechacaja = dateObj.toLocaleDateString("en-GB");

            const results = query
                .runSuiteQL({
                    query: `
                        SELECT DISTINCT
                            transaction.id,
                            transaction.tranid,
                            transaction.recordtype,
                            transaction.memo,
                            BUILTIN.DF(transaction.status) AS status,
                            transaction.tranDate,
                            transaction.custbody_2winfolioacepta,
                            NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) AS amount,
                            transactionLine.subsidiary
                        FROM
                            transaction
                            INNER JOIN transactionLine ON transactionLine.transaction = transaction.id AND transactionLine.mainLine = 'T'
                        WHERE
                            transaction.custbodynumeromovimiento = ?
                            AND transaction.custbodyunidadcaja = ?
                            AND transaction.custbodyfechacaja = ?
                            AND transaction.custbodyaperturacaja = ?
                            AND transaction.custbodyrazonsocialcaja = ?
                            AND transaction.custbody_2win_created_from_income_flow = 'T'
                        ORDER BY
                            transaction.id DESC
                    `,
                    params: [numeromovimiento, unidadcaja, fechacaja, aperturacaja, razonsocialcaja]
                })
                .asMappedResults();

            nLog.debug("buscarTransaccionesMovimiento - Resultados", `Encontradas ${results.length} transacciones`);
            return results;
        } catch (error) {
            nLog.error("buscarTransaccionesMovimiento - Error", error);
            throw error;
        }
    }

    /**
     * Busca Sales Orders relacionados con un movimiento
     * @param {Object} movimiento - Datos del movimiento
     * @returns {Array} Array de Sales Orders
     */
    function buscarSalesOrdersMovimiento(movimiento) {
        try {
            let { numeromovimiento, unidadcaja, fechacaja, aperturacaja, razonsocialcaja } = movimiento;

            // Validar parámetros - Sales Orders
            if (!numeromovimiento || !unidadcaja || !fechacaja || !aperturacaja || !razonsocialcaja) {
                nLog.warn("buscarSalesOrdersMovimiento - Parámetros incompletos", `Omitiendo búsqueda de Sales Orders. Movimiento: ${numeromovimiento}`);
                return [];
            }

            // const dateObj = new Date(fechacaja);
            // fechacaja = dateObj.toLocaleDateString("en-GB");

            const results = query
                .runSuiteQL({
                    query: `
                        SELECT DISTINCT
                            transaction.id,
                            transaction.tranid,
                            transaction.memo,
                            transaction.status,
                            transaction.tranDate,
                            NVL(transaction.total, 0) AS amount
                        FROM
                            transaction
                        WHERE
                            transaction.custbodynumeromovimiento = ?
                            AND transaction.custbodyunidadcaja = ?
                            AND transaction.custbodyfechacaja = ?
                            AND transaction.custbodyaperturacaja = ?
                            AND transaction.custbodyrazonsocialcaja = ?
                            AND transaction.type = 'SalesOrd'
                        ORDER BY
                            transaction.id DESC
                    `,
                    params: [numeromovimiento, unidadcaja, fechacaja, aperturacaja, razonsocialcaja]
                })
                .asMappedResults();

            return results;
        } catch (error) {
            nLog.error("buscarSalesOrdersMovimiento - Error", error);
            return [];
        }
    }

    /**
     * Busca cierres de caja relacionados con un movimiento
     * @param {Object} movimiento - Datos del movimiento
     * @returns {Array} Array de cierres de caja
     */
    function buscarCierresCajaMovimiento(movimiento) {
        try {
            let { unidadcaja, fechacaja, aperturacaja, razonsocialcaja } = movimiento;

            // Validar parámetros - Cierres de Caja
            if (!unidadcaja || !fechacaja || !aperturacaja || !razonsocialcaja) {
                nLog.warn("buscarCierresCajaMovimiento - Parámetros incompletos", `Omitiendo búsqueda de Cierres de Caja. Caja: ${unidadcaja}`);
                return [];
            }

            // const dateObj = new Date(fechacaja);
            // fechacaja = dateObj.toLocaleDateString("en-GB");

            const results = query
                .runSuiteQL({
                    query: `
                        SELECT DISTINCT
                            transaction.id,
                            transaction.tranid,
                            transaction.memo,
                            transaction.tranDate,
                            NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) AS amount
                        FROM
                            transaction
                        WHERE
                            transaction.memo LIKE 'Cierre Caja General%'
                            AND transaction.custbodyunidadcaja = ?
                            AND transaction.custbodyfechacaja = ?
                            AND transaction.custbodyaperturacaja = ?
                            AND transaction.custbodyrazonsocialcaja = ?
                            AND transaction.type = 'Journal'
                        ORDER BY
                            transaction.id DESC
                    `,
                    params: [unidadcaja, fechacaja, aperturacaja, razonsocialcaja]
                })
                .asMappedResults();

            return results;
        } catch (error) {
            nLog.error("buscarCierresCajaMovimiento - Error", error);
            return [];
        }
    }

    /**
     * Elimina un movimiento completo con todas sus transacciones
     * @param {Object} movimiento - Datos del movimiento con sus transacciones
     * @returns {Object} Resultado de la eliminación
     */
    function eliminarMovimientoCompleto(movimiento) {
        const resultado = {
            numeroMovimiento: movimiento.numero,
            exito: true,
            errores: [],
            eliminadas: [],
            fallidas: []
        };

        try {
            nLog.audit("Eliminar Movimiento", `Iniciando eliminación movimiento ${movimiento.numero}`);

            const transacciones = movimiento.transacciones;
            const salesOrders = movimiento.salesOrders || [];
            const cierres = movimiento.cierres || [];

            // Orden de eliminación: primero las dependencias, luego las principales
            const ordenEliminacion = [
                ...cierres.map(t => ({ ...t, tipo: "journalentry", nombre: "Cierre Caja" })),
                ...salesOrders.map(t => ({ ...t, tipo: "salesorder", nombre: "Sales Order" })),
                ...transacciones
                    .filter(t => t.recordtype === "creditmemo")
                    .map(t => ({ ...t, tipo: "creditmemo", nombre: "Credit Memo" })),
                ...transacciones
                    .filter(t => t.recordtype === "customerpayment")
                    .map(t => ({ ...t, tipo: "customerpayment", nombre: "Customer Payment" })),
                ...transacciones
                    .filter(t => t.recordtype === "journalentry" || t.recordtype === "advintercompanyjournalentry")
                    .map(t => ({ ...t, tipo: t.recordtype, nombre: "Journal Entry" })),
                ...transacciones
                    .filter(t => t.recordtype === "invoice")
                    .map(t => ({ ...t, tipo: "invoice", nombre: "Invoice (Boleta)" }))
            ];

            nLog.debug("Orden de eliminación", `${ordenEliminacion.length} transacciones en orden`);

            for (const trans of ordenEliminacion) {
                try {
                    nLog.debug("Eliminando", `${trans.nombre} ID: ${trans.id}`);

                    // Desaplicar relaciones primero
                    draftDAO.deleteTransactionById(trans.id, trans.tipo);

                    // Eliminar la transacción
                    const exito = draftDAO.deleteTransaction(trans.id, trans.tipo);

                    if (exito) {
                        resultado.eliminadas.push({
                            id: trans.id,
                            tipo: trans.nombre,
                            tranid: trans.tranid || "N/A",
                            monto: trans.amount || 0
                        });
                        nLog.audit("Eliminación exitosa", `${trans.nombre} ID: ${trans.id}`);
                    } else {
                        resultado.fallidas.push({
                            id: trans.id,
                            tipo: trans.nombre,
                            error: "Error en eliminación"
                        });
                        resultado.exito = false;
                    }
                } catch (error) {
                    resultado.fallidas.push({
                        id: trans.id,
                        tipo: trans.nombre,
                        error: error.message
                    });
                    resultado.exito = false;
                    nLog.error("Error eliminando transacción", `ID: ${trans.id}, Error: ${error.message}`);
                }
            }

            if (resultado.exito) {
                nLog.audit("Movimiento eliminado", `Movimiento ${movimiento.numero} eliminado completamente (${resultado.eliminadas.length} transacciones)`);
            } else {
                nLog.error("Movimiento con errores", `Movimiento ${movimiento.numero}: ${resultado.fallidas.length} errores`);
            }
        } catch (error) {
            resultado.exito = false;
            resultado.errores.push(error.message);
            nLog.error("Error en eliminación de movimiento", `Movimiento: ${movimiento.numero}, Error: ${error.message}`);
        }

        return resultado;
    }

    /**
     * Genera el HTML del reporte preview
     * @param {Array} movimientos - Movimientos a eliminar
     * @returns {string} HTML del reporte
     */
    function generarReportePreview(movimientos) {
        let totalTransacciones = 0;
        let totalMonto = 0;

        let html = `
            <div style="font-family: Arial, sans-serif; max-width: 1200px; margin: 20px auto;">
                <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <h2 style="color: #856404; margin-top: 0;">📊 REPORTE DE ELIMINACIÓN - MODO PREVIEW</h2>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleString("es-CL")}</p>
                    <p><strong>Folios a procesar:</strong> ${movimientos.map(m => m.folioBoleta).join(", ")}</p>
                </div>
        `;

        movimientos.forEach((mov, index) => {
            const numTrans = mov.transacciones.length + mov.salesOrders.length + mov.cierres.length;
            totalTransacciones += numTrans;
            totalMonto += mov.montoTotal || 0;

            html += `
                <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <h3 style="color: #495057; margin-top: 0;">Movimiento #${index + 1}: ${mov.numero}</h3>
                    <p><strong>📄 Boleta Folio:</strong> ${mov.folioBoleta}</p>
                    <p><strong>🏪 Caja:</strong> ${mov.unidadcaja}, <strong>Fecha:</strong> ${new Date(mov.fechacaja).toLocaleDateString("es-CL")}</p>
                    <p><strong>🔢 Transacciones a eliminar:</strong> ${numTrans}</p>
                    <ul style="list-style: none; padding-left: 0;">
            `;

            // Agrupar por tipo
            const tipos = {};
            mov.transacciones.forEach(t => {
                const tipoNombre = {
                    invoice: "Invoice (Boleta)",
                    creditmemo: "Credit Memo",
                    customerpayment: "Customer Payment",
                    journalentry: "Journal Entry",
                    advintercompanyjournalentry: "Intercompany Journal"
                }[t.recordtype] || t.recordtype;

                if (!tipos[tipoNombre]) tipos[tipoNombre] = [];
                tipos[tipoNombre].push(t);
            });

            mov.salesOrders.forEach(t => {
                if (!tipos["Sales Order"]) tipos["Sales Order"] = [];
                tipos["Sales Order"].push(t);
            });

            mov.cierres.forEach(t => {
                if (!tipos["Cierre de Caja"]) tipos["Cierre de Caja"] = [];
                tipos["Cierre de Caja"].push(t);
            });

            Object.entries(tipos).forEach(([tipo, items]) => {
                html += `<li style="margin-bottom: 5px;">📋 ${items.length}x ${tipo}</li>`;
            });

            html += `
                    </ul>
                    <p><strong>💰 Monto total:</strong> $${(mov.montoTotal || 0).toLocaleString("es-CL")}</p>
                </div>
            `;
        });

        html += `
                <div style="background: #d1ecf1; border: 2px solid #0c5460; border-radius: 8px; padding: 20px; margin-top: 20px;">
                    <h3 style="color: #0c5460; margin-top: 0;">═════════════════════════════════════════</h3>
                    <p style="font-size: 18px; margin: 10px 0;"><strong>TOTAL:</strong> ${movimientos.length} movimientos, ${totalTransacciones} transacciones, $${totalMonto.toLocaleString("es-CL")}</p>
                    <p style="font-size: 16px; margin: 10px 0; color: #721c24;">⚠️  Esta acción NO se puede deshacer</p>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Genera el HTML del reporte final
     * @param {Array} resultados - Resultados de las eliminaciones
     * @returns {string} HTML del reporte
     */
    function generarReporteFinal(resultados) {
        let totalEliminadas = 0;
        let totalFallidas = 0;

        let html = `
            <div style="font-family: Arial, sans-serif; max-width: 1200px; margin: 20px auto;">
                <div style="background: #d4edda; border: 2px solid #28a745; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <h2 style="color: #155724; margin-top: 0;">✅ REPORTE DE ELIMINACIÓN COMPLETADA</h2>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleString("es-CL")}</p>
                    <p><strong>Ejecutado por:</strong> ${runtime.getCurrentUser().name}</p>
                </div>
        `;

        resultados.forEach((res, index) => {
            totalEliminadas += res.eliminadas.length;
            totalFallidas += res.fallidas.length;

            html += `
                <div style="background: ${res.exito ? "#f8f9fa" : "#f8d7da"}; border: 1px solid ${res.exito ? "#dee2e6" : "#f5c6cb"}; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <h3 style="color: ${res.exito ? "#495057" : "#721c24"}; margin-top: 0;">Movimiento #${index + 1}: ${res.numeroMovimiento}</h3>
            `;

            if (res.exito) {
                res.eliminadas.forEach(elim => {
                    html += `<p style="margin: 5px 0;">✓ ${elim.tipo} eliminada: ${elim.tranid} (ID: ${elim.id}, Monto: $${Number(elim.monto).toLocaleString("es-CL")})</p>`;
                });
            } else {
                html += `<p style="color: #721c24;">❌ Errores en la eliminación:</p>`;
                res.fallidas.forEach(fall => {
                    html += `<p style="color: #721c24; margin: 5px 0;">❌ ${fall.tipo} ID: ${fall.id} - ${fall.error}</p>`;
                });
                if (res.errores.length > 0) {
                    res.errores.forEach(err => {
                        html += `<p style="color: #721c24; margin: 5px 0;">⚠️ ${err}</p>`;
                    });
                }
            }

            html += `</div>`;
        });

        html += `
                <div style="background: #d1ecf1; border: 2px solid #0c5460; border-radius: 8px; padding: 20px; margin-top: 20px;">
                    <h3 style="color: #0c5460; margin-top: 0;">═════════════════════════════════════════</h3>
                    <p style="font-size: 18px; margin: 10px 0;"><strong>RESUMEN:</strong> ${totalEliminadas}/${totalEliminadas + totalFallidas} transacciones eliminadas exitosamente</p>
                    ${totalFallidas > 0 ? `<p style="color: #721c24;">⚠️ ${totalFallidas} transacciones no pudieron ser eliminadas (revisar log para detalles)</p>` : `<p style="color: #28a745;">✨ Todas las transacciones fueron eliminadas correctamente</p>`}
                </div>
                <p style="margin-top: 20px; text-align: center;">
                    <button type="button" onclick="window.location.href='/app/site/hosting/scriptlet.nl?script=customscript_2win_sl_eliminacion_boletas_folio&deploy=1'" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;">Volver al Inicio</button>
                </p>
            </div>
        `;

        return html;
    }

    /**
     * Crea el formulario del Suitelet
     * @param {Object} context - Contexto del Suitelet
     */
    function crearFormulario(context) {
        const form = serverWidget.createForm({
            title: "Eliminar Boletas por Folio"
        });

        form.addFieldGroup({
            id: "custpage_group_folios",
            label: "Folios a Eliminar"
        });

        const foliosField = form.addField({
            id: "custpage_folios",
            type: serverWidget.FieldType.LONGTEXT,
            label: "Folios de Boleta (separados por coma o salto de línea)",
            container: "custpage_group_folios"
        });
        foliosField.layoutType = serverWidget.FieldLayoutType.NORMAL;
        foliosField.isMandatory = true;
        foliosField.width = 400;
        foliosField.height = 100;

        form.addField({
            id: "custpage_instrucciones",
            type: serverWidget.FieldType.HELP,
            label: "Ingrese los folios de las boletas que desea eliminar. El sistema eliminará el MOVIMIENTO COMPLETO que incluye la boleta y todas sus transacciones relacionadas (Payments, Credit Memos, Journal Entries, etc.). Esta acción NO se puede deshacer.",
            container: "custpage_group_folios"
        });

        form.addSubmitButton({
            label: "Generar Reporte Preview"
        });

        context.response.writePage(form);
    }

    /**
     * Procesa la solicitud del Suitelet
     * @param {Object} context - Contexto del Suitelet
     */
    function onRequest(context) {
        const request = context.request;
        const response = context.response;

        try {
            // Si es GET, mostrar formulario
            if (request.method === "GET") {
                crearFormulario(context);
                return;
            }

            // Si es POST, procesar
            const foliosStr = request.parameters.custpage_folios;
            const accion = request.parameters.custpage_accion;
            const datosPreview = request.parameters.custpage_datos_preview;

            // Si hay datos de preview y acción es confirmar, ejecutar eliminación
            if (datosPreview && accion === "confirmar") {
                nLog.audit("Iniciando Eliminación", "Usuario confirmó eliminación");

                const movimientos = JSON.parse(datosPreview);
                const resultados = [];

                for (const mov of movimientos) {
                    const resultado = eliminarMovimientoCompleto(mov);
                    resultados.push(resultado);
                }

                // Mostrar reporte final
                const reporteHtml = generarReporteFinal(resultados);

                const form = serverWidget.createForm({
                    title: "Eliminación Completada"
                });

                const htmlField = form.addField({
                    id: "custpage_reporte_final",
                    type: serverWidget.FieldType.INLINEHTML,
                    label: "Reporte Final"
                });
                htmlField.defaultValue = reporteHtml;

                response.writePage(form);
                return;
            }

            // Procesar folios y generar preview
            if (!foliosStr || foliosStr.trim() === "") {
                throw new Error("Debe ingresar al menos un folio");
            }

            // Parsear folios (separados por coma, salto de línea o espacio)
            const folios = foliosStr
                .split(/[\n,\s]+/)
                .map(f => f.trim())
                .filter(f => f !== "");

            nLog.audit("Folios recibidos", `${folios.length} folios: ${folios.join(", ")}`);

            // Validar que todos los folios sean números
            const foliosInvalidos = folios.filter(f => isNaN(f));
            if (foliosInvalidos.length > 0) {
                throw new Error(`Los siguientes folios no son válidos: ${foliosInvalidos.join(", ")}`);
            }

            // Buscar boletas por folio
            const boletas = buscarBoletasPorFolio(folios);

            if (boletas.length === 0) {
                throw new Error("No se encontraron boletas con los folios especificados. Verifique que: 1. Los folios sean correctos, 2. Las boletas existan en el sistema, 3. Las boletas hayan sido creadas desde el flujo de caja");
            }

            // Agrupar por movimiento
            const movimientosMap = {};

            boletas.forEach(boleta => {
                const numMov = boleta.custbodynumeromovimiento;

                if (!numMov) {
                    nLog.error("Boleta sin número de movimiento", `Folio: ${boleta.custbody_2winfolioacepta}, ID: ${boleta.id}`);
                    return; // Saltar esta boleta
                }

                if (!movimientosMap[numMov]) {
                    movimientosMap[numMov] = {
                        numero: numMov,
                        numeromovimiento: numMov,
                        folioBoleta: boleta.custbody_2winfolioacepta,
                        unidadcaja: boleta.custbodyunidadcaja,
                        fechacaja: boleta.custbodyfechacaja,
                        aperturacaja: boleta.custbodyaperturacaja,
                        razonsocialcaja: boleta.custbodyrazonsocialcaja,
                        transacciones: [],
                        salesOrders: [],
                        cierres: [],
                        montoTotal: 0
                    };
                }

                movimientosMap[numMov].transacciones.push(boleta);
                movimientosMap[numMov].montoTotal += Number(boleta.amount) || 0;
            });

            // Para cada movimiento, buscar todas las transacciones
            const movimientos = Object.values(movimientosMap);

            for (const mov of movimientos) {
                // Buscar todas las transacciones del movimiento
                const transaccionesMov = buscarTransaccionesMovimiento(mov);

                // Agregar transacciones que no sean las boletas que ya tenemos
                transaccionesMov.forEach(trans => {
                    const existe = mov.transacciones.some(t => t.id === trans.id);
                    if (!existe) {
                        mov.transacciones.push(trans);
                        mov.montoTotal += Number(trans.amount) || 0;
                    }
                });

                // Buscar Sales Orders
                mov.salesOrders = buscarSalesOrdersMovimiento(mov);

                // Buscar Cierres de Caja
                mov.cierres = buscarCierresCajaMovimiento(mov);
            }

            // Generar reporte preview
            const reporteHtml = generarReportePreview(movimientos);

            const form = serverWidget.createForm({
                title: "Confirmación de Eliminación"
            });

            const htmlField = form.addField({
                id: "custpage_reporte_preview",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Reporte Preview"
            });
            htmlField.defaultValue = reporteHtml;

            // Campo oculto con los datos
            const datosField = form.addField({
                id: "custpage_datos_preview",
                type: serverWidget.FieldType.LONGTEXT,
                label: "Datos Preview"
            });
            datosField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            datosField.defaultValue = JSON.stringify(movimientos);

            // Campo oculto de acción
            const accionField = form.addField({
                id: "custpage_accion",
                type: serverWidget.FieldType.TEXT,
                label: "Acción"
            });
            accionField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            accionField.defaultValue = "confirmar";

            form.addSubmitButton({
                label: "✅ Confirmar Eliminación"
            });

            // Botón de cancelar
            form.addButton({
                id: "custpage_btn_cancelar",
                label: "❌ Cancelar",
                functionName: "window.history.back()"
            });

            response.writePage(form);
        } catch (error) {
            nLog.error("Error en onRequest", error);

            const form = serverWidget.createForm({
                title: "Error"
            });

            form.addField({
                id: "custpage_error_mensaje",
                type: serverWidget.FieldType.HELP,
                label: `❌ Error: ${error.message}`
            });

            form.addButton({
                id: "custpage_btn_volver",
                label: "Volver",
                functionName: "window.history.back()"
            });

            response.writePage(form);
        }
    }

    return {
        onRequest: onRequest
    };
});