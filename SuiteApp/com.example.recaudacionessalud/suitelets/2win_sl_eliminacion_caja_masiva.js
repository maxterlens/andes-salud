/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(["N/ui/serverWidget", "N/query", "N/log", "N/format", "N/task"], function (
    serverWidget,
    query,
    nLog,
    format,
    task
) {
    /**
     * Parsea el contenido de un archivo CSV y devuelve las filas procesadas
     * @param {string} csvContent - Contenido del archivo CSV
     * @returns {Object} { filas, errores }
     */
    function parseCSV(csvContent) {
        const lineas = csvContent.split(/\r?\n/).filter(function (linea) {
            return linea.trim() !== "";
        });

        if (lineas.length === 0) {
            return { filas: [], errores: ["El archivo está vacío."] };
        }

        // Detectar delimitador (coma, punto y coma, o tab)
        const primeraLinea = lineas[0];
        let delimitador = ",";
        if (primeraLinea.indexOf(";") !== -1) {
            delimitador = ";";
        } else if (primeraLinea.indexOf("\t") !== -1) {
            delimitador = "\t";
        }

        // Detectar si la primera línea es encabezado
        let inicioDatos = 0;
        const primeraColumna = primeraLinea.split(delimitador)[0].trim().toLowerCase();
        if (
            primeraColumna.indexOf("fecha") !== -1 ||
            primeraColumna.indexOf("date") !== -1 ||
            primeraColumna.indexOf("unidad") !== -1 ||
            primeraColumna.indexOf("apertura") !== -1 ||
            primeraColumna.indexOf("movimiento") !== -1
        ) {
            inicioDatos = 1;
        }

        const filas = [];
        const errores = [];

        for (let i = inicioDatos; i < lineas.length; i++) {
            const columnas = lineas[i].split(delimitador).map(function (c) {
                return c.trim().replace(/^[""]|[""]$/g, "");
            });

            if (columnas.length < 4) {
                errores.push(`Fila ${i + 1}: no tiene suficientes columnas (${columnas.length}/4)`);
                continue;
            }

            const fechaStr = columnas[0];
            const unidadStr = columnas[1];
            const aperturaStr = columnas[2];
            const movimientoStr = columnas[3];

            // Parsear fecha - soporta YYYY-MM-DD y DD/MM/YYYY
            let fecha;
            if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
                fecha = fechaStr;
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(fechaStr)) {
                const partes = fechaStr.split("/");
                fecha = `${partes[2]}-${partes[1]}-${partes[0]}`;
            } else {
                try {
                    const dateObj = format.parse({ value: fechaStr, type: "date" });
                    const dia = dateObj.getDate().toString().padStart(2, "0");
                    const mes = (dateObj.getMonth() + 1).toString().padStart(2, "0");
                    fecha = `${dateObj.getFullYear()}-${mes}-${dia}`;
                } catch (e) {
                    errores.push(`Fila ${i + 1}: fecha inválida "${fechaStr}"`);
                    continue;
                }
            }

            const unidad = parseInt(unidadStr, 10);
            const apertura = parseInt(aperturaStr, 10);
            const movimiento = parseInt(movimientoStr, 10);

            if (isNaN(unidad) || isNaN(apertura) || isNaN(movimiento)) {
                errores.push(`Fila ${i + 1}: valores numéricos inválidos`);
                continue;
            }

            filas.push({ fecha, unidad, apertura, movimiento });
        }

        return { filas, errores };
    }

    /**
     * Busca transacciones para un mes específico usando query paginada
     * Trae todas las transacciones del mes + razón social, luego se filtran en memoria
     * @param {Object} params - { mes (YYYY-MM), razonSocial }
     * @returns {Array} Lista de transacciones encontradas
     */
    function buscarTransaccionesPorMes(params) {
        const { mes, razonSocial } = params;
        const transacciones = [];

        try {
            // Calcular primer y último día del mes
            const [anio, mesNum] = mes.split("-").map(Number);
            const diaInicio = "01";
            const ultimoDiaDate = new Date(anio, mesNum, 0); // día 0 del mes siguiente = último día
            const diaFin = String(ultimoDiaDate.getDate()).padStart(2, "0");
            const mesStr = String(mesNum).padStart(2, "0");

            // Fechas en formato DD/MM/YYYY para SuiteQL
            const fechaInicio = `${diaInicio}/${mesStr}/${anio}`;
            const fechaFin = `${diaFin}/${mesStr}/${anio}`;

            const queryStr = `
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
                    NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) as amount,
                    custbodyunidadcaja as unidadcaja,
                    TO_CHAR(custbodyfechacaja, 'YYYY-MM-DD') as fechacaja,
                    custbodyaperturacaja as aperturacaja
                FROM
                    transaction
                    INNER JOIN transactionLine ON transactionLine.transaction = transaction.id AND transactionLine.mainLine = 'T'
                WHERE
                    transaction.custbody_2win_created_from_income_flow = 'T'
                    AND custbodyrazonsocialcaja = ?
                    AND custbodyfechacaja BETWEEN TO_DATE(?, 'DD/MM/YYYY') AND TO_DATE(?, 'DD/MM/YYYY')
                ORDER BY
                    transaction.id DESC
            `;

            const queryParams = [razonSocial, fechaInicio, fechaFin];

            nLog.audit("buscarTransaccionesPorMes", `Mes: ${mes}, Rango: ${fechaInicio} - ${fechaFin}`);

            // Usar query paginada para soportar más de 5000 resultados
            const pagedData = query.runSuiteQLPaged({
                query: queryStr,
                params: queryParams,
                pageSize: 5000
            });

            nLog.audit("buscarTransaccionesPorMes", `Total páginas: ${pagedData.pageRanges.length}`);

            pagedData.pageRanges.forEach(function (pageRange) {
                const page = pagedData.fetch({
                    index: pageRange.index
                });
                const results = page.data.asMappedResults();
                nLog.debug("buscarTransaccionesPorMes", `Página ${pageRange.index + 1}/${pagedData.pageRanges.length}: ${results.length} resultados`);
                transacciones.push(...results);
            });

            nLog.audit("buscarTransaccionesPorMes", `Total transacciones del mes ${mes}: ${transacciones.length}`);

        } catch (e) {
            nLog.error("Error en buscarTransaccionesPorMes", e);
        }

        return transacciones;
    }

    /**
     * Filtra transacciones en memoria contra las combinaciones buscadas del CSV
     * @param {Array} transacciones - Transacciones obtenidas de la query por mes
     * @param {Object} combinacionesBuscadas - Mapa de keys "fecha|unidad|apertura|movimiento" buscadas
     * @returns {Object} { filtradas, movimientosEncontrados }
     */
    function filtrarTransaccionesEnMemoria(transacciones, combinacionesBuscadas) {
        const filtradas = [];
        const movimientosEncontrados = {};

        transacciones.forEach(function (t) {
            // Normalizar valores para comparación
            const fecha = t.fechacaja || null;
            const unidad = t.unidadcaja !== null && t.unidadcaja !== undefined ? parseInt(t.unidadcaja, 10) : null;
            const apertura = t.aperturacaja !== null && t.aperturacaja !== undefined ? parseInt(t.aperturacaja, 10) : null;
            const movimiento = t.numeromovimiento !== null && t.numeromovimiento !== undefined ? parseInt(t.numeromovimiento, 10) : null;

            if (fecha !== null && unidad !== null && apertura !== null && movimiento !== null) {
                const key = `${fecha}|${unidad}|${apertura}|${movimiento}`;
                if (combinacionesBuscadas[key]) {
                    filtradas.push(t);
                    movimientosEncontrados[key] = true;
                }
            }
        });

        return { filtradas, movimientosEncontrados };
    }

    /**
     * Busca todas las transacciones para los datos parseados del CSV
     * Optimización: agrupa por mes, ejecuta 1 query paginada por mes, filtra en memoria
     * @param {Array} filas - Filas parseadas del CSV
     * @param {string} razonSocial - Razón social de caja
     * @returns {Object} { transacciones, resumen }
     */
    function buscarTodasTransacciones(filas, razonSocial) {
        // Construir set de combinaciones buscadas para filtrado en memoria
        const combinacionesBuscadas = {};
        filas.forEach(function (f) {
            const key = `${f.fecha}|${f.unidad}|${f.apertura}|${f.movimiento}`;
            combinacionesBuscadas[key] = true;
        });

        // Agrupar por mes (YYYY-MM) para minimizar queries
        const meses = {};
        filas.forEach(function (fila) {
            const mesKey = fila.fecha.substring(0, 7); // "YYYY-MM"
            if (!meses[mesKey]) {
                meses[mesKey] = {
                    mes: mesKey,
                    filas: []
                };
            }
            meses[mesKey].filas.push(fila);
        });

        // Calcular grupos únicos (fecha/unidad/apertura) para el resumen
        const gruposUnicos = {};
        filas.forEach(function (f) {
            gruposUnicos[`${f.fecha}|${f.unidad}|${f.apertura}`] = true;
        });

        const totalMeses = Object.keys(meses).length;
        nLog.audit(
            "buscarTodasTransacciones",
            `Filas: ${filas.length}, Meses únicos: ${totalMeses}, Combinaciones buscadas: ${Object.keys(combinacionesBuscadas).length}, Grupos únicos: ${Object.keys(gruposUnicos).length}`
        );

        const todasTransacciones = [];
        const todosMovimientosEncontrados = {};
        let indiceMes = 0;

        Object.keys(meses).forEach(function (mesKey) {
            indiceMes++;
            const grupoMes = meses[mesKey];

            nLog.audit(
                `Procesando mes ${indiceMes}/${totalMeses}`,
                `Mes: ${mesKey}, Filas: ${grupoMes.filas.length}`
            );

            // Query paginada por mes (trae todas las transacciones del mes con esa razón social)
            const transacciones = buscarTransaccionesPorMes({
                mes: mesKey,
                razonSocial: razonSocial
            });

            // Filtrar en memoria contra las combinaciones del CSV
            const { filtradas, movimientosEncontrados } = filtrarTransaccionesEnMemoria(
                transacciones,
                combinacionesBuscadas
            );

            // Acumular movimientos encontrados
            Object.keys(movimientosEncontrados).forEach(function (key) {
                todosMovimientosEncontrados[key] = true;
            });

            todasTransacciones.push(...filtradas);

            nLog.audit(
                `Mes ${mesKey} procesado`,
                `Query total: ${transacciones.length}, Filtradas: ${filtradas.length}, Movimientos encontrados: ${Object.keys(movimientosEncontrados).length}`
            );
        });

        // Deduplicar transacciones por ID
        const transaccionesUnicas = [];
        const idsVistos = {};
        todasTransacciones.forEach(function (t) {
            if (!idsVistos[t.id]) {
                idsVistos[t.id] = true;
                transaccionesUnicas.push(t);
            }
        });

        // Calcular movimientos sin resultados
        const movimientosSinResultados = [];
        Object.keys(combinacionesBuscadas).forEach(function (key) {
            if (!todosMovimientosEncontrados[key]) {
                const partes = key.split("|");
                movimientosSinResultados.push({
                    fecha: partes[0],
                    unidad: partes[1],
                    apertura: partes[2],
                    movimiento: partes[3]
                });
            }
        });

        return {
            transacciones: transaccionesUnicas,
            resumen: {
                totalFilas: filas.length,
                totalGrupos: Object.keys(gruposUnicos).length,
                totalTransacciones: transaccionesUnicas.length,
                movimientosBuscados: Object.keys(combinacionesBuscadas).length,
                movimientosEncontrados: Object.keys(todosMovimientosEncontrados).length,
                movimientosSinResultados: movimientosSinResultados.length,
                detalleSinResultados: movimientosSinResultados
            }
        };
    }

    /**
     * Crea el formulario de carga de archivo CSV (GET)
     * @returns {serverWidget.Form} Formulario creado
     */
    function crearFormularioCarga() {
        const form = serverWidget.createForm({
            title: "Eliminación Masiva de Transacciones de Caja"
        });

        // Grupo de carga
        form.addFieldGroup({
            id: "custpage_filters",
            label: "Carga de Archivo CSV"
        });

        // Campo de archivo CSV (NO puede tener container - restricción de NetSuite para campos FILE)
        form.addField({
            id: "custpage_archivo_csv",
            type: serverWidget.FieldType.FILE,
            label: "Archivo CSV"
        }).isMandatory = true;

        // Instrucciones
        const instrucciones = form.addField({
            id: "custpage_instrucciones",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Instrucciones",
            container: "custpage_filters"
        });
        instrucciones.defaultValue = `
            <div style="padding: 10px; background-color: #d9edf7; border-radius: 4px; border: 1px solid #bce8f1; margin-bottom: 10px;">
                <strong>Instrucciones:</strong> Exporte el archivo Excel como CSV (valores separados por comas o punto y coma).
                El archivo debe tener las columnas: <strong>FECHA CAJA, UNIDAD CAJA, APERTURA CAJA, MOVIMIENTO CAJA</strong>.
                La primera fila puede ser encabezado.
            </div>
        `;

        // Razón Social
        const fieldRazonSocial = form.addField({
            id: "custpage_razon_social_caja",
            type: serverWidget.FieldType.TEXT,
            label: "Razón Social de Caja",
            container: "custpage_filters"
        });
        fieldRazonSocial.isMandatory = true;
        fieldRazonSocial.helpText = "Ingrese la Razón Social de Caja que aplica a todos los registros del archivo.";

        form.addSubmitButton({
            label: "Cargar y Buscar Transacciones"
        });

        // Client script para confirmación y seleccionar todo
        form.clientScriptModulePath = "./2win_cs_eliminacion_caja.js";

        return form;
    }

    /**
     * Muestra los resultados de la búsqueda en una sublist con checkboxes
     * @param {serverWidget.Form} form - Formulario donde agregar la tabla
     * @param {Array} transacciones - Lista de transacciones a mostrar
     * @param {Object} resumen - Resumen de la búsqueda
     * @param {Array} errores - Errores de parseo del CSV
     */
    function mostrarResultados(form, transacciones, resumen, errores) {
        // Mostrar resumen
        const resumenField = form.addField({
            id: "custpage_resumen_busqueda",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Resumen de Búsqueda"
        });

        resumenField.defaultValue = `
            <div style="padding: 15px; background-color: #dff0d8; border-radius: 5px; border: 2px solid #3c763d; margin-bottom: 10px;">
                <h3 style="color: #3c763d; margin-top: 0;">Resumen de Búsqueda</h3>
                <table style="font-size: 14px;">
                    <tr><td><strong>Filas en CSV:</strong></td><td>${resumen.totalFilas}</td></tr>
                    <tr><td><strong>Grupos únicos (Fecha/Unidad/Apertura):</strong></td><td>${resumen.totalGrupos}</td></tr>
                    <tr><td><strong>Movimientos buscados:</strong></td><td>${resumen.movimientosBuscados}</td></tr>
                    <tr><td><strong>Movimientos con resultados:</strong></td><td>${resumen.movimientosEncontrados}</td></tr>
                    <tr><td><strong>Movimientos sin resultados:</strong></td><td>${resumen.movimientosSinResultados}</td></tr>
                    <tr><td><strong>Total transacciones encontradas:</strong></td><td>${resumen.totalTransacciones}</td></tr>
                </table>
            </div>
        `;

        // Mostrar errores de parseo si los hay
        if (errores && errores.length > 0) {
            const errorField = form.addField({
                id: "custpage_errores_parseo",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Advertencias de Parseo"
            });

            let htmlErrores = `
                <div style="padding: 15px; background-color: #fcf8e3; border-radius: 5px; border: 2px solid #faebcc; margin-bottom: 10px;">
                    <h3 style="color: #8a6d3b; margin-top: 0;">Advertencias de Parseo (${errores.length})</h3>
                    <ul style="font-size: 12px; max-height: 150px; overflow-y: auto;">
            `;
            errores.forEach(function (err) {
                htmlErrores += `<li>${err}</li>`;
            });
            htmlErrores += "</ul></div>";
            errorField.defaultValue = htmlErrores;
        }

        // Mostrar movimientos sin resultados si los hay
        if (resumen.detalleSinResultados && resumen.detalleSinResultados.length > 0) {
            const sinResultadosField = form.addField({
                id: "custpage_sin_resultados",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Movimientos Sin Resultados"
            });

            let htmlSinResultados = `
                <div style="padding: 15px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442; margin-bottom: 10px;">
                    <h3 style="color: #a94442; margin-top: 0;">Movimientos Sin Resultados (${resumen.movimientosSinResultados})</h3>
                    <div style="font-size: 12px; max-height: 200px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr style="background-color: #f5e0e0;">
                                <th style="padding: 4px; border: 1px solid #ddd;">Fecha</th>
                                <th style="padding: 4px; border: 1px solid #ddd;">Unidad</th>
                                <th style="padding: 4px; border: 1px solid #ddd;">Apertura</th>
                                <th style="padding: 4px; border: 1px solid #ddd;">Movimiento</th>
                            </tr>
            `;
            resumen.detalleSinResultados.forEach(function (m) {
                htmlSinResultados += `
                    <tr>
                        <td style="padding: 4px; border: 1px solid #ddd;">${m.fecha}</td>
                        <td style="padding: 4px; border: 1px solid #ddd;">${m.unidad}</td>
                        <td style="padding: 4px; border: 1px solid #ddd;">${m.apertura}</td>
                        <td style="padding: 4px; border: 1px solid #ddd;">${m.movimiento}</td>
                    </tr>
                `;
            });
            htmlSinResultados += "</table></div></div>";
            sinResultadosField.defaultValue = htmlSinResultados;
        }

        // Si no hay transacciones, mostrar mensaje y volver
        if (transacciones.length === 0) {
            form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se encontraron transacciones para los movimientos especificados en el archivo CSV."
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
            label: `Transacciones Encontradas (${transacciones.length})`
        });

        // Checkbox para seleccionar
        sublist.addField({
            id: "custpage_select",
            type: serverWidget.FieldType.CHECKBOX,
            label: "Eliminar"
        });

        // Columnas de datos
        sublist.addField({ id: "custpage_id", type: serverWidget.FieldType.INTEGER, label: "ID" });
        sublist.addField({ id: "custpage_tipo", type: serverWidget.FieldType.TEXT, label: "Tipo" });
        sublist.addField({ id: "custpage_tranid", type: serverWidget.FieldType.TEXT, label: "Número" });
        sublist.addField({ id: "custpage_memo", type: serverWidget.FieldType.TEXT, label: "Memo" });
        sublist.addField({ id: "custpage_fecha", type: serverWidget.FieldType.TEXT, label: "Fecha" });
        sublist.addField({ id: "custpage_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });
        sublist.addField({ id: "custpage_movimiento", type: serverWidget.FieldType.TEXT, label: "Movimiento" });

        // Agregar datos a la sublist
        transacciones.forEach(function (transaccion, index) {
            if (transaccion.id !== null && transaccion.id !== undefined) {
                sublist.setSublistValue({ id: "custpage_id", line: index, value: String(transaccion.id) });
            }
            if (transaccion.recordtype !== null && transaccion.recordtype !== undefined) {
                sublist.setSublistValue({ id: "custpage_tipo", line: index, value: transaccion.recordtype });
            }
            if (transaccion.tranid !== null && transaccion.tranid !== undefined) {
                sublist.setSublistValue({ id: "custpage_tranid", line: index, value: String(transaccion.tranid) });
            }
            if (transaccion.memo !== null && transaccion.memo !== undefined && transaccion.memo !== "") {
                sublist.setSublistValue({ id: "custpage_memo", line: index, value: String(transaccion.memo).substring(0, 300) });
            }
            if (transaccion.tranDate !== null && transaccion.tranDate !== undefined) {
                try {
                    const fecha = new Date(transaccion.trandate || transaccion.tranDate);
                    sublist.setSublistValue({ id: "custpage_fecha", line: index, value: fecha.toLocaleDateString() });
                } catch (e) {
                    sublist.setSublistValue({ id: "custpage_fecha", line: index, value: String(transaccion.tranDate) });
                }
            }
            if (transaccion.amount !== null && transaccion.amount !== undefined) {
                sublist.setSublistValue({ id: "custpage_monto", line: index, value: String(transaccion.amount) });
            }
            if (transaccion.numeromovimiento !== null && transaccion.numeromovimiento !== undefined && transaccion.numeromovimiento !== "") {
                sublist.setSublistValue({ id: "custpage_movimiento", line: index, value: String(transaccion.numeromovimiento) });
            }
        });

        // Agregar botón de eliminar
        form.addButton({
            id: "custpage_btn_eliminar",
            label: "Eliminar Seleccionados",
            functionName: "confirmarEliminacion"
        });

        // Campo oculto para identificar cuando es una eliminación
        form.addField({
            id: "custpage_es_eliminacion",
            type: serverWidget.FieldType.TEXT,
            label: "Es Eliminación"
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Campo oculto para mantener razón social
        form.addField({
            id: "custpage_razon_social_hidden",
            type: serverWidget.FieldType.TEXT,
            label: "Razón Social Hidden"
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

        const registrosAEliminar = [];

        // Recopilar los IDs seleccionados
        for (let i = 0; i < numLineas; i++) {
            let seleccionada;
            try {
                seleccionada = request.getSublistValue({
                    group: "custpage_transacciones",
                    name: "custpage_select",
                    line: i
                });
            } catch (e) {
                continue;
            }

            if (seleccionada === "T" || seleccionada === true) {
                const id = request.getSublistValue({
                    group: "custpage_transacciones",
                    name: "custpage_id",
                    line: i
                });

                let tipoRegistro;
                try {
                    tipoRegistro = request.getSublistValue({
                        group: "custpage_transacciones",
                        name: "custpage_tipo",
                        line: i
                    });
                } catch (e) {
                    tipoRegistro = "unknown";
                }

                registrosAEliminar.push({
                    id: parseInt(id, 10),
                    tipoRegistro: tipoRegistro,
                    flujo: "caja"
                });
            }
        }

        if (registrosAEliminar.length === 0) {
            form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se seleccionaron registros para eliminar."
            });
            return;
        }

        try {
            nLog.audit("Eliminación masiva", `Registros a eliminar: ${registrosAEliminar.length}`);

            const jsonStr = JSON.stringify(registrosAEliminar);
            nLog.audit("Eliminación masiva", `Tamaño JSON: ${jsonStr.length} caracteres`);

            // Iniciar el MapReduce
            const mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: "customscript_2win_mr_eliminacion",
                deploymentId: "customdeploy_2win_mr_eliminacion",
                params: {
                    custscript_2w_mr_eliminacion_cache_id: jsonStr
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

            mensajeField.defaultValue = `
                <div style="padding: 20px; background-color: #dff0d8; border-radius: 5px; border: 2px solid #3c763d;">
                    <h3 style="color: #3c763d; margin-top: 0;">Proceso de Eliminación Masiva Iniciado</h3>
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
        } catch (e) {
            nLog.error("Error al iniciar MapReduce", e);
            const errorField = form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Error"
            });
            errorField.defaultValue = `
                <div style="padding: 20px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442;">
                    <h3 style="color: #a94442; margin-top: 0;">Error al iniciar el proceso</h3>
                    <p style="font-size: 14px;">${e.message}</p>
                </div>
            `;
        }
    }

    function onRequest(context) {
        const { request, response } = context;

        try {
            nLog.audit("INICIO Suitelet Masivo", "Suitelet de Eliminación Masiva iniciado");

            if (request.method === "GET") {
                // Mostrar formulario de carga
                const form = crearFormularioCarga();
                response.writePage(form);
            } else if (request.method === "POST") {
                // Verificar si es búsqueda o eliminación
                const esEliminacion = request.parameters.custpage_es_eliminacion === "T";

                if (esEliminacion) {
                    // Procesar eliminación usando MapReduce
                    const form = crearFormularioCarga();
                    procesarEliminacion(form, request);
                    response.writePage(form);
                    nLog.audit("Eliminación masiva iniciada", "Proceso MapReduce iniciado para eliminación de registros");
                } else {
                    // Cargar CSV y buscar transacciones
                    const razonSocial = request.parameters.custpage_razon_social_caja;

                    if (!razonSocial) {
                        const form = crearFormularioCarga();
                        form.addField({
                            id: "custpage_error_campo",
                            type: serverWidget.FieldType.INLINEHTML,
                            label: "Error"
                        }).defaultValue = `
                            <div style="padding: 10px; background-color: #f2dede; border-radius: 4px; border: 1px solid #a94442; color: #a94442;">
                                <strong>Error:</strong> Debe ingresar la Razón Social de Caja.
                            </div>
                        `;
                        response.writePage(form);
                        return;
                    }

                    // Obtener archivo CSV
                    const fileObj = request.files["custpage_archivo_csv"];

                    if (!fileObj) {
                        const form = crearFormularioCarga();
                        form.addField({
                            id: "custpage_error_campo",
                            type: serverWidget.FieldType.INLINEHTML,
                            label: "Error"
                        }).defaultValue = `
                            <div style="padding: 10px; background-color: #f2dede; border-radius: 4px; border: 1px solid #a94442; color: #a94442;">
                                <strong>Error:</strong> Debe seleccionar un archivo CSV.
                            </div>
                        `;
                        response.writePage(form);
                        return;
                    }

                    // Leer contenido del archivo
                    const csvContent = fileObj.getContents();
                    nLog.audit("CSV cargado", `Tamaño: ${csvContent.length} caracteres`);

                    // Parsear CSV
                    const parseResult = parseCSV(csvContent);
                    nLog.audit("CSV parseado", `Filas: ${parseResult.filas.length}, Errores: ${parseResult.errores.length}`);

                    if (parseResult.filas.length === 0) {
                        const form = crearFormularioCarga();
                        let errorMsg = "No se encontraron filas válidas en el archivo CSV.";
                        if (parseResult.errores.length > 0) {
                            errorMsg += "<br><br>Errores:<br>" + parseResult.errores.join("<br>");
                        }
                        form.addField({
                            id: "custpage_error_csv",
                            type: serverWidget.FieldType.INLINEHTML,
                            label: "Error"
                        }).defaultValue = `
                            <div style="padding: 10px; background-color: #f2dede; border-radius: 4px; border: 1px solid #a94442; color: #a94442;">
                                <strong>Error:</strong> ${errorMsg}
                            </div>
                        `;
                        response.writePage(form);
                        return;
                    }

                    // Buscar transacciones
                    const resultado = buscarTodasTransacciones(parseResult.filas, razonSocial);
                    nLog.audit(
                        "Búsqueda completada",
                        `Transacciones: ${resultado.transacciones.length}, Movimientos sin resultados: ${resultado.resumen.movimientosSinResultados}`
                    );

                    // Mostrar formulario con resultados
                    const form = crearFormularioCarga();

                    // Mantener valor de razón social
                    form.updateDefaultValues({
                        custpage_razon_social_caja: razonSocial
                    });

                    mostrarResultados(form, resultado.transacciones, resultado.resumen, parseResult.errores);
                    response.writePage(form);
                }
            }
        } catch (e) {
            nLog.error("Error en Suitelet Masivo", e);
            const form = serverWidget.createForm({ title: "Error" });
            form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Error"
            }).defaultValue = `
                <div style="padding: 20px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442;">
                    <h3 style="color: #a94442; margin-top: 0;">Error</h3>
                    <p style="font-size: 14px;">${e.message}</p>
                    <pre style="font-size: 12px; overflow: auto; max-height: 200px;">${e.stack || ""}</pre>
                </div>
            `;
            response.writePage(form);
        }
    }

    return {
        onRequest: onRequest
    };
});