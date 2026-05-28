/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(["N/ui/serverWidget", "N/search", "N/record", "N/query", "N/log", "../dao/2win_dao_draft", "N/format", "N/cache", "N/task"], function (
    serverWidget,
    search,
    record,
    query,
    nLog,
    { searchTransactionByMovementNumber, searchCierreCaja, unapplyCreditMemo },
    format,
    cache,
    task
) {
    /**
     * Busca prefacturas según el número ingresado
     * @param {Object} params - Parámetros de búsqueda
     * @returns {Array} Lista de prefacturas
     */
    function buscarPrefacturas(params) {
        const prefacturas = [];
        const { numeroPrefactura } = params;

        nLog.debug("params prefacturas", params);

        try {
            const queryStr = `
                SELECT
                    id,
                    name,
                    custrecord_2w_as_pf_paciente as paciente,
                    custrecord_2w_as_pf_ficha as ficha,
                    custrecord_2w_as_pf_ingreso as ingreso,
                    custrecord_2w_as_pf_fecha as fecha,
                    custrecord_2w_as_pf_montototal as montototal,
                    custrecord_2w_as_pf_estado as estado
                FROM
                    customrecord_2w_as_prefactura
                WHERE
                    name >= ?
                ORDER BY
                    name ASC
            `;

            nLog.debug("queryStr prefacturas", queryStr);
            nLog.debug("numeroPrefactura", numeroPrefactura);

            const results = query
                .runSuiteQL({
                    query: queryStr,
                    params: [numeroPrefactura]
                })
                .asMappedResults();

            prefacturas.push(...results);
            return prefacturas;
        } catch (e) {
            nLog.error("Error al buscar prefacturas", e);
            throw e;
        }
    }

    /**
     * Busca transacciones de facturación según los filtros
     * @param {Object} params - Parámetros de búsqueda
     * @returns {Array} Lista de transacciones
     */
    function buscarTransaccionesFacturacion(params) {
        const transacciones = [];
        const { folioDoc, tipoDoc, rutCliente, fechaDoc } = params;

        nLog.debug("params facturacion", params);

        try {
            let queryStr = `
                SELECT DISTINCT
                    transaction.tranid,
                    transaction.id,
                    transaction.recordtype,
                    transaction.memo,
                    BUILTIN.DF(transaction.status) as status,
                    transaction.tranDate,
                    transaction.custbody_2wintipodtesii,
                    transaction.custbody_2winfolioacepta,
                    NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) as amount
                FROM
                    transaction
                    inner join transactionLine on transactionLine.transaction = transaction.id and transactionLine.mainLine = 'T'
                WHERE
                    transaction.custbody_2win_created_from_income_flow = 'T'
            `;

            const queryParams = [];

            // Construir query dinámica según filtros proporcionados
            if (folioDoc) {
                queryStr += ` AND (transaction.memo LIKE '%'||?||'%')`;
                queryParams.push(folioDoc);
            }

            if (tipoDoc) {
                queryStr += ` AND transaction.recordtype = ?`;
                queryParams.push(tipoDoc);
            }

            if (rutCliente) {
                queryStr += ` AND transaction.entity = (SELECT id FROM customer WHERE BUILTIN.DF(customer.entityid) = ?)`;
                queryParams.push(rutCliente);
            }

            if (fechaDoc) {
                const dateObj = format.parse({
                    value: fechaDoc,
                    type: "date"
                });
                const fechaFormateada = dateObj.toLocaleDateString("en-GB");
                queryStr += ` AND transaction.trandate = ?`;
                queryParams.push(fechaFormateada);
            }

            queryStr += ` ORDER BY transaction.id DESC`;

            nLog.debug("queryStr", queryStr);
            nLog.debug("queryParams", queryParams);

            const results = query
                .runSuiteQL({
                    query: queryStr,
                    params: queryParams
                })
                .asMappedResults();

            transacciones.push(...results);
            return transacciones;
        } catch (e) {
            nLog.error("Error al buscar transacciones de facturación", e);
            throw e;
        }
    }

    /**
     * Busca todas las transacciones según los filtros
     * @param {Object} params - Parámetros de búsqueda
     * @returns {Array} Lista de transacciones
     */
    function buscarTransacciones(params) {
        const transacciones = [];
        const { caja, fechaCaja, aperturaCaja, razonSocialCaja, numeroMovimiento, cajero } = params;
        nLog.debug("params", params);
        try {
            // Buscar transacciones por movimiento específico o todas las de la caja
            if (numeroMovimiento) {
                const transMovimiento = searchTransactionByMovementNumber({
                    caja: caja,
                    fechaCaja: fechaCaja,
                    aperturaCaja: aperturaCaja,
                    razonSocialCaja: razonSocialCaja,
                    movementNumber: numeroMovimiento
                });
                transacciones.push(...transMovimiento);
            } else {
                // Si no hay número de movimiento, buscar todos los movimientos de la caja
                const dateObj = format.parse({
                    value: fechaCaja,
                    type: "date"
                });
                const fechaFormateada = dateObj.toLocaleDateString("en-GB");
                nLog.debug("buscarTransacciones", [caja, fechaFormateada, aperturaCaja, razonSocialCaja]);
                const results = query
                    .runSuiteQL({
                        query: `
                            SELECT DISTINCT
                                transaction.tranid,
                                transaction.id,
                                transaction.recordtype,
                                transaction.memo,
                                BUILTIN.DF(transaction.status) as status,
                                transaction.tranDate,
                                transaction.custbody_2wintipodtesii,
                                transaction.custbody_2winfolioacepta,
                                transaction.custbodynumeromovimiento as numeromovimiento,
                                NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid,0) as amount
                            FROM
                                transaction
                                inner join transactionLine on transactionLine.transaction = transaction.id and transactionLine.mainLine ='T'
                            WHERE
                                custbodyunidadcaja = ?
                                and custbodyfechacaja = ?
                                and custbodyaperturacaja = ?
                                and custbodyrazonsocialcaja = ?
                                and transaction.custbody_2win_created_from_income_flow = 'T'
                            ORDER BY
                                transaction.id DESC
                        `,
                        params: [caja, fechaFormateada, aperturaCaja, razonSocialCaja]
                    })
                    .asMappedResults();

                transacciones.push(...results);
            }

            // Buscar cierres de caja si se especifica cajero
            if (cajero) {
                const cierres = searchCierreCaja({
                    caja: caja,
                    fechaCaja: fechaCaja,
                    aperturaCaja: aperturaCaja,
                    razonSocialCaja: razonSocialCaja,
                    cajeroRut: cajero
                });
                // Convertir al mismo formato que las transacciones
                cierres.forEach((cierre) => {
                    transacciones.push({
                        tranid: cierre.tranid,
                        id: cierre.id,
                        recordtype: "journalentry",
                        memo: cierre.memo,
                        status: "Cierre Caja",
                        tranDate: cierre.trandate,
                        custbody_2wintipodtesii: null,
                        custbody_2winfolioacepta: null,
                        numeromovimiento: "0",
                        amount: 0
                    });
                });
            }

            return transacciones;
        } catch (e) {
            nLog.error("Error al buscar transacciones", e);
            throw e;
        }
    }

    /**
     * Crea el formulario de búsqueda
     * @param {Object} request - Request de NetSuite
     * @returns {serverWidget.Form} Formulario creado
     */
    function crearFormularioBusqueda(request) {
        const flujoSeleccionado = request.parameters.custpage_flujo || "caja";
        let title = "Eliminación de Transacciones";

        if (flujoSeleccionado === "caja") {
            title = "Eliminación de Transacciones de Caja";
        } else if (flujoSeleccionado === "facturacion") {
            title = "Eliminación de Transacciones de Facturación";
        } else if (flujoSeleccionado === "prefactura") {
            title = "Eliminación de Prefacturas";
        }

        const form = serverWidget.createForm({
            title: title
        });

        // Grupo de filtros
        const filterGroup = form.addFieldGroup({
            id: "custpage_filters",
            label: "Filtros de Búsqueda"
        });

        // Selector de flujo
        const flujoField = form.addField({
            id: "custpage_flujo",
            type: serverWidget.FieldType.SELECT,
            label: "Flujo",
            container: "custpage_filters"
        });
        flujoField.addSelectOption({
            value: "caja",
            text: "Caja"
        });
        flujoField.addSelectOption({
            value: "facturacion",
            text: "Facturación"
        });
        flujoField.addSelectOption({
            value: "prefactura",
            text: "Prefacturas"
        });

        // Campos de filtro para flujo Caja
        if (flujoSeleccionado === "caja") {
            form.addField({
                id: "custpage_unidad_caja",
                type: serverWidget.FieldType.TEXT,
                label: "Unidad de Caja",
                container: "custpage_filters"
            }).isMandatory = true;

            form.addField({
                id: "custpage_fecha_caja",
                type: serverWidget.FieldType.DATE,
                label: "Fecha de Caja",
                container: "custpage_filters"
            }).isMandatory = true;

            form.addField({
                id: "custpage_apertura_caja",
                type: serverWidget.FieldType.TEXT,
                label: "Apertura de Caja",
                container: "custpage_filters"
            }).isMandatory = true;

            const fieldRazonSocial = form.addField({
                id: "custpage_razon_social_caja",
                type: serverWidget.FieldType.TEXT,
                label: "Razón Social de Caja",
                container: "custpage_filters"
            });
            fieldRazonSocial.isMandatory = true
            form.addField({
                id: "custpage_numero_movimiento",
                type: serverWidget.FieldType.TEXT,
                label: "Número de Movimiento (Opcional)",
                container: "custpage_filters"
            });

            form.addField({
                id: "custpage_cajero",
                type: serverWidget.FieldType.TEXT,
                label: "Cajero (Opcional - para cierres)",
                container: "custpage_filters"
            });
        } else if (flujoSeleccionado === "facturacion") {
            // Campos de filtro para flujo Facturación
            form.addField({
                id: "custpage_folio_doc",
                type: serverWidget.FieldType.TEXT,
                label: "Folio Documento (Opcional)",
                container: "custpage_filters"
            });

            const tipoDocField = form.addField({
                id: "custpage_tipo_doc",
                type: serverWidget.FieldType.SELECT,
                label: "Tipo Documento (Opcional)",
                container: "custpage_filters"
            });
            tipoDocField.addSelectOption({
                value: "",
                text: ""
            });
            tipoDocField.addSelectOption({
                value: "invoice",
                text: "Factura"
            });
            tipoDocField.addSelectOption({
                value: "creditmemo",
                text: "Nota de Crédito"
            });
            tipoDocField.addSelectOption({
                value: "debitmemo",
                text: "Nota de Débito"
            });

            form.addField({
                id: "custpage_rut_cliente",
                type: serverWidget.FieldType.TEXT,
                label: "RUT Cliente (Opcional)",
                container: "custpage_filters"
            });

            form.addField({
                id: "custpage_fecha_doc",
                type: serverWidget.FieldType.DATE,
                label: "Fecha Documento (Opcional)",
                container: "custpage_filters"
            });
        } else if (flujoSeleccionado === "prefactura") {
            // Campos de filtro para flujo Prefacturas
            form.addField({
                id: "custpage_numero_prefactura",
                type: serverWidget.FieldType.TEXT,
                label: "Número de Prefactura",
                container: "custpage_filters"
            }).isMandatory = true;
        }

        form.addSubmitButton({
            label: "Buscar"
        });

        // Si hay parámetros de solicitud previos, mantener sus valores
        if (request.parameters.custpage_flujo) {
            const valores = {
                custpage_flujo: flujoSeleccionado
            };

            if (flujoSeleccionado === "caja") {
                valores.custpage_unidad_caja = request.parameters.custpage_unidad_caja;
                valores.custpage_fecha_caja = request.parameters.custpage_fecha_caja;
                valores.custpage_apertura_caja = request.parameters.custpage_apertura_caja;
                valores.custpage_razon_social_caja = request.parameters.custpage_razon_social_caja;
                valores.custpage_numero_movimiento = request.parameters.custpage_numero_movimiento;
                valores.custpage_cajero = request.parameters.custpage_cajero;
            } else if (flujoSeleccionado === "facturacion") {
                valores.custpage_folio_doc = request.parameters.custpage_folio_doc;
                valores.custpage_tipo_doc = request.parameters.custpage_tipo_doc;
                valores.custpage_rut_cliente = request.parameters.custpage_rut_cliente;
                valores.custpage_fecha_doc = request.parameters.custpage_fecha_doc;
            } else if (flujoSeleccionado === "prefactura") {
                valores.custpage_numero_prefactura = request.parameters.custpage_numero_prefactura;
            }

            form.updateDefaultValues(valores);
        }
        // Agregar script de confirmación
        form.clientScriptModulePath = "./2win_cs_eliminacion_caja.js";
        return form;
    }

    /**
     * Muestra los resultados de búsqueda de transacciones en una tabla
     * @param {serverWidget.Form} form - Formulario donde agregar la tabla
     * @param {Array} transacciones - Lista de transacciones a mostrar
     */
    function mostrarResultadosTransacciones(form, transacciones) {
        if (transacciones.length === 0) {
            form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se encontraron transacciones con los filtros especificados."
            });
            return;
        }

        // Botón "Seleccionar Todo"
        form.addButton({
            id: "custpage_btn_seleccionar_todo",
            label: "Seleccionar Todo",
            functionName: "seleccionarTodos"
        });

        // Tabla de resultados
        const sublist = form.addSublist({
            id: "custpage_transacciones",
            type: serverWidget.SublistType.LIST,
            label: "Transacciones Encontradas"
        });

        // Checkbox para seleccionar
        sublist.addField({
            id: "custpage_select",
            type: serverWidget.FieldType.CHECKBOX,
            label: "Eliminar"
        });

        // Columnas de datos
        sublist.addField({
            id: "custpage_id",
            type: serverWidget.FieldType.INTEGER,
            label: "ID"
        });

        sublist.addField({
            id: "custpage_tipo",
            type: serverWidget.FieldType.TEXT,
            label: "Tipo"
        });

        sublist.addField({
            id: "custpage_tranid",
            type: serverWidget.FieldType.TEXT,
            label: "Número"
        });

        sublist.addField({
            id: "custpage_memo",
            type: serverWidget.FieldType.TEXT,
            label: "Memo"
        });

        sublist.addField({
            id: "custpage_fecha",
            type: serverWidget.FieldType.TEXT,
            label: "Fecha"
        });

        sublist.addField({
            id: "custpage_monto",
            type: serverWidget.FieldType.CURRENCY,
            label: "Monto"
        });

        sublist.addField({
            id: "custpage_movimiento",
            type: serverWidget.FieldType.TEXT,
            label: "Movimiento"
        });

        // Agregar datos a la sublist con validación de valores
        transacciones.forEach((transaccion, index) => {
            if (transaccion.id !== null && transaccion.id !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_id",
                    line: index,
                    value: transaccion.id
                });
            }

            if (transaccion.recordtype !== null && transaccion.recordtype !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_tipo",
                    line: index,
                    value: transaccion.recordtype
                });
            }

            if (transaccion.tranid !== null && transaccion.tranid !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_tranid",
                    line: index,
                    value: transaccion.tranid
                });
            }

            if (transaccion.memo !== null && transaccion.memo !== undefined && transaccion.memo !== "") {
                sublist.setSublistValue({
                    id: "custpage_memo",
                    line: index,
                    value: transaccion.memo
                });
            }

            if (transaccion.tranDate !== null && transaccion.tranDate !== undefined) {
                const fecha = new Date(transaccion.trandate);
                sublist.setSublistValue({
                    id: "custpage_fecha",
                    line: index,
                    value: fecha.toLocaleDateString()
                });
            }

            if (transaccion.amount !== null && transaccion.amount !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_monto",
                    line: index,
                    value: transaccion.amount
                });
            }

            if (transaccion.numeromovimiento !== null && transaccion.numeromovimiento !== undefined && transaccion.numeromovimiento !== "") {
                sublist.setSublistValue({
                    id: "custpage_movimiento",
                    line: index,
                    value: transaccion.numeromovimiento
                });
            }
        });

        // Agregar botón de eliminar
        form.addButton({
            id: "custpage_btn_eliminar",
            label: "Eliminar Seleccionados",
            functionName: "confirmarEliminacion"
        });

        // Agregar campo oculto para identificar cuando es una eliminación
        form.addField({
            id: "custpage_es_eliminacion",
            type: serverWidget.FieldType.TEXT,
            label: "Es Eliminación"
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Agregar script de confirmación
        form.clientScriptModulePath = "./2win_cs_eliminacion_caja.js";
    }

    /**
     * Muestra los resultados de búsqueda de prefacturas en una tabla
     * @param {serverWidget.Form} form - Formulario donde agregar la tabla
     * @param {Array} prefacturas - Lista de prefacturas a mostrar
     */
    function mostrarResultadosPrefacturas(form, prefacturas) {
        if (prefacturas.length === 0) {
            form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se encontraron prefacturas con el número especificado."
            });
            return;
        }

        // Botón "Seleccionar Todo"
        form.addButton({
            id: "custpage_btn_seleccionar_todo",
            label: "Seleccionar Todo",
            functionName: "seleccionarTodos"
        });

        // Tabla de resultados
        const sublist = form.addSublist({
            id: "custpage_transacciones",
            type: serverWidget.SublistType.LIST,
            label: "Prefacturas Encontradas"
        });

        // Checkbox para seleccionar
        sublist.addField({
            id: "custpage_select",
            type: serverWidget.FieldType.CHECKBOX,
            label: "Eliminar"
        });

        // Columnas de datos
        sublist.addField({
            id: "custpage_id",
            type: serverWidget.FieldType.INTEGER,
            label: "ID"
        });

        sublist.addField({
            id: "custpage_numero",
            type: serverWidget.FieldType.TEXT,
            label: "Número"
        });

        sublist.addField({
            id: "custpage_paciente",
            type: serverWidget.FieldType.TEXT,
            label: "Paciente"
        });

        sublist.addField({
            id: "custpage_ficha",
            type: serverWidget.FieldType.TEXT,
            label: "Ficha"
        });

        sublist.addField({
            id: "custpage_ingreso",
            type: serverWidget.FieldType.INTEGER,
            label: "Ingreso"
        });

        sublist.addField({
            id: "custpage_fecha",
            type: serverWidget.FieldType.TEXT,
            label: "Fecha"
        });

        sublist.addField({
            id: "custpage_monto",
            type: serverWidget.FieldType.CURRENCY,
            label: "Monto Total"
        });

        sublist.addField({
            id: "custpage_estado",
            type: serverWidget.FieldType.TEXT,
            label: "Estado"
        });

        // Agregar datos a la sublist con validación de valores
        prefacturas.forEach((prefactura, index) => {
            if (prefactura.id !== null && prefactura.id !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_id",
                    line: index,
                    value: prefactura.id
                });
            }

            if (prefactura.name !== null && prefactura.name !== undefined && prefactura.name !== "") {
                sublist.setSublistValue({
                    id: "custpage_numero",
                    line: index,
                    value: prefactura.name
                });
            }

            if (prefactura.paciente !== null && prefactura.paciente !== undefined && prefactura.paciente !== "") {
                sublist.setSublistValue({
                    id: "custpage_paciente",
                    line: index,
                    value: prefactura.paciente
                });
            }

            if (prefactura.ficha !== null && prefactura.ficha !== undefined && prefactura.ficha !== "") {
                sublist.setSublistValue({
                    id: "custpage_ficha",
                    line: index,
                    value: prefactura.ficha
                });
            }

            if (prefactura.ingreso !== null && prefactura.ingreso !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_ingreso",
                    line: index,
                    value: prefactura.ingreso
                });
            }

            if (prefactura.fecha !== null && prefactura.fecha !== undefined) {
                const fecha = new Date(prefactura.fecha);
                sublist.setSublistValue({
                    id: "custpage_fecha",
                    line: index,
                    value: fecha.toLocaleDateString()
                });
            }

            if (prefactura.montototal !== null && prefactura.montototal !== undefined) {
                sublist.setSublistValue({
                    id: "custpage_monto",
                    line: index,
                    value: prefactura.montototal
                });
            }

            if (prefactura.estado !== null && prefactura.estado !== undefined && prefactura.estado !== "") {
                sublist.setSublistValue({
                    id: "custpage_estado",
                    line: index,
                    value: prefactura.estado
                });
            }
        });

        // Agregar botón de eliminar
        form.addButton({
            id: "custpage_btn_eliminar",
            label: "Eliminar Seleccionados",
            functionName: "confirmarEliminacion"
        });

        // Agregar campo oculto para identificar cuando es una eliminación
        form.addField({
            id: "custpage_es_eliminacion",
            type: serverWidget.FieldType.TEXT,
            label: "Es Eliminación"
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    /**
     * Procesa la eliminación de transacciones seleccionadas usando MapReduce
     * @param {serverWidget.Form} form - Formulario para mostrar resultados
     * @param {Object} request - Request de NetSuite
     */
    function procesarEliminacion(form, request) {
        const numLineas = request.getLineCount({
            group: "custpage_transacciones"
        });

        const flujo = request.parameters.custpage_flujo || "caja";
        const registrosAEliminar = [];

        // Recopilar los IDs seleccionados
        for (let i = 0; i < numLineas; i++) {
            const seleccionada = request.getSublistValue({
                group: "custpage_transacciones",
                name: "custpage_select",
                line: i
            });

            if (seleccionada === "T") {
                const id = request.getSublistValue({
                    group: "custpage_transacciones",
                    name: "custpage_id",
                    line: i
                });

                let tipoRegistro;

                if (flujo === "prefactura") {
                    tipoRegistro = "prefactura";
                } else {
                    tipoRegistro = request.getSublistValue({
                        group: "custpage_transacciones",
                        name: "custpage_tipo",
                        line: i
                    });
                }

                registrosAEliminar.push({
                    id: parseInt(id),
                    tipoRegistro: tipoRegistro,
                    flujo: flujo
                });
            }
        }

        if (registrosAEliminar.length === 0) {
            // No hay registros seleccionados, mostrar mensaje
            const mensajeField = form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se seleccionaron registros para eliminar."
            });
            return;
        }

        try {
            // // Generar ID único para el cache
            // const cacheId = `eliminacion_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

            // // Guardar datos en cache (solo tipo e ID, datos mínimos)
            // const cacheObj = cache.getCache({ name: "eliminacion_transacciones" });
            // cacheObj.put({
            //     key: cacheId,
            //     value: JSON.stringify(registrosAEliminar),
            //     ttl: 3600 // 1 hora de TTL
            // });

            nLog.audit("Cache creado", `Registros: ${registrosAEliminar.length}`);

            // Iniciar el MapReduce
            const mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: "customscript_2win_mr_eliminacion",
                deploymentId: "customdeploy_2win_mr_eliminacion",
                params: {
                    custscript_2w_mr_eliminacion_cache_id: JSON.stringify(registrosAEliminar)
                }
            });

            const taskId = mapReduceTask.submit();
            nLog.audit("MapReduce iniciado", `Task ID: ${taskId}`);

            // Mostrar mensaje de confirmación
            const mensajeField = form.addField({
                id: "custpage_resumen",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Proceso de Eliminación"
            });

            const htmlMensaje = `
                <div style="padding: 20px; background-color: #dff0d8; border-radius: 5px; border: 2px solid #3c763d;">
                    <h3 style="color: #3c763d; margin-top: 0;">Proceso de Eliminación Iniciado</h3>
                    <p style="font-size: 16px;">
                        <strong>Registros seleccionados:</strong> ${registrosAEliminar.length}
                    </p>
                    <p style="font-size: 14px; color: #3c763d;">
                        El proceso de eliminación se está ejecutando en segundo plano (MapReduce).
                    </p>
                    <p style="font-size: 14px; color: #3c763d;">
                        <strong>ID del proceso:</strong> ${taskId}
                    </p>
                    <p style="font-size: 14px; color: #3c763d; margin-top: 10px;">
                        Puede verificar el estado del proceso en la lista de tareas programadas.
                    </p>
                </div>
            `;

            mensajeField.defaultValue = htmlMensaje;
        } catch (e) {
            nLog.error("Error al iniciar MapReduce", e);
            const errorField = form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Error"
            });

            const htmlError = `
                <div style="padding: 20px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442;">
                    <h3 style="color: #a94442; margin-top: 0;">Error al iniciar el proceso</h3>
                    <p style="font-size: 14px;">${e.message}</p>
                </div>
            `;

            errorField.defaultValue = htmlError;
        }
    }

    function onRequest(context) {
        const request = context.request;
        const response = context.response;

        try {
            nLog.audit("INICIO Suitelet", "Suitelet de Eliminación iniciado");

            if (request.method === "GET") {
                // Mostrar formulario de búsqueda
                const form = crearFormularioBusqueda(request);
                response.writePage(form);
            } else if (request.method === "POST") {
                const flujo = request.parameters.custpage_flujo || "caja";

                // Verificar si es búsqueda o eliminación
                const esEliminacion = request.parameters.custpage_es_eliminacion === "T";

                if (esEliminacion) {
                    // Procesar eliminación usando MapReduce
                    const form = crearFormularioBusqueda(request);
                    procesarEliminacion(form, request);
                    response.writePage(form);
                    nLog.audit("Eliminación iniciada", "Proceso MapReduce iniciado para eliminación de registros");
                } else {
                    // Buscar transacciones según el flujo seleccionado
                    let registros = [];

                    if (flujo === "caja") {
                        const paramsCaja = {
                            caja: request.parameters.custpage_unidad_caja,
                            fechaCaja: request.parameters.custpage_fecha_caja,
                            aperturaCaja: request.parameters.custpage_apertura_caja,
                            razonSocialCaja: request.parameters.custpage_razon_social_caja,
                            numeroMovimiento: request.parameters.custpage_numero_movimiento || "",
                            cajero: request.parameters.custpage_cajero || ""
                        };
                        registros = buscarTransacciones(paramsCaja);
                        nLog.audit("Búsqueda de caja completada", `Flujo: Caja, Transacciones encontradas: ${registros.length}`);
                    } else if (flujo === "facturacion") {
                        const paramsFacturacion = {
                            folioDoc: request.parameters.custpage_folio_doc,
                            tipoDoc: request.parameters.custpage_tipo_doc,
                            rutCliente: request.parameters.custpage_rut_cliente,
                            fechaDoc: request.parameters.custpage_fecha_doc
                        };
                        registros = buscarTransaccionesFacturacion(paramsFacturacion);
                        nLog.audit("Búsqueda de facturación completada", `Flujo: Facturación, Transacciones encontradas: ${registros.length}`);
                    } else if (flujo === "prefactura") {
                        const paramsPrefactura = {
                            numeroPrefactura: request.parameters.custpage_numero_prefactura
                        };
                        registros = buscarPrefacturas(paramsPrefactura);
                        nLog.audit("Búsqueda de prefacturas completada", `Flujo: Prefacturas, Prefacturas encontradas: ${registros.length}`);
                    }

                    const form = crearFormularioBusqueda(request);

                    if (flujo === "prefactura") {
                        mostrarResultadosPrefacturas(form, registros);
                    } else {
                        mostrarResultadosTransacciones(form, registros);
                    }

                    response.writePage(form);
                }
            }
        } catch (e) {
            nLog.error("Error en Suitelet", e);
            const form = serverWidget.createForm({ title: "Error" });
            form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.HELP,
                label: `Error: ${e.message}`
            });
            response.writePage(form);
        }
    }

    return {
        onRequest: onRequest
    };
});
