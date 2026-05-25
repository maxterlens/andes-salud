/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Dominio optimizado V2 para operaciones de órdenes de venta (Modo Estándar)
 */
define(["N/record", "N/log", "../lib/2win_lib_mapeo_json_v2"], function (record, nLog, libMapeoV2) {
    /**
     * @function formatearFecha
     * @param {string} parametro - Dato "AAAA-MM-DD" a formatear
     * @returns {Date|null} fecha formateada para campo date de netsuite
     */
    const formatearFecha = (parametro) => {
        if (!parametro) return null;
        try {
            const partes = parametro.split("-");
            if (partes.length !== 3) return null;
            return new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
        } catch (error) {
            return null;
        }
    };

    /**
     * @function definirCamposCuerpo
     * @description Define campos del cuerpo del registro de manera eficiente
     * @param {Object} camposRegistro - Campos a definir
     * @param {record.Record} registro - Instancia del registro
     */
    const definirCamposCuerpo = (camposRegistro, registro) => {
        // Campos de fecha
        const fechaAlta = formatearFecha(camposRegistro.custbody_2win_as_fecha_alta);
        if (fechaAlta) registro.setValue({ fieldId: "custbody_2win_as_fecha_alta", value: fechaAlta });

        const fechaEnvio = formatearFecha(camposRegistro.custbody_2win_as_fecha_envio);
        if (fechaEnvio) registro.setValue({ fieldId: "custbody_2win_as_fecha_envio", value: fechaEnvio });

        // Campos directos
        const camposDirectos = [
            { fieldId: "entity", valor: camposRegistro.entity },
            { fieldId: "subsidiary", valor: camposRegistro.subsidiary },
            { fieldId: "custbody_2w_ficha_paciente", valor: camposRegistro.custbody_2w_ficha_paciente },
            { fieldId: "custbody_2w_ingreso_paciente", valor: camposRegistro.custbody_2w_ingreso_paciente },
            { fieldId: "custbody_2win_nro_cuenta_paciente", valor: camposRegistro.custbody_2win_nro_cuenta_paciente },
            { fieldId: "department", valor: camposRegistro.department },
            { fieldId: "custbody_2win_tipo_atencion", valor: camposRegistro.custbody_2win_tipo_atencion },
            { fieldId: "class", valor: camposRegistro.class }
        ];

        for (const campo of camposDirectos) {
            if (campo.valor !== undefined && campo.valor !== null && campo.valor !== "") {
                try {
                    // ignoreFieldChange no tiene efecto real en isDynamic: false, pero se puede omitir para limpiar
                    registro.setValue({ fieldId: campo.fieldId, value: campo.valor });
                } catch (e) {
                    nLog.error(`Error asignando campo ${campo.fieldId}`, e);
                }
            }
        }
    };

    /**
     * @function agregarLineasOptimizado
     * @description Agrega múltiples líneas a una OV de manera optimizada (Modo Estándar)
     */
    const agregarLineasOptimizado = (lineas, registro, cacheImpuestos) => {
        const resultado = { lineasProcesadas: 0, lineasConError: 0, errores: [] };

        let lineCount = registro.getLineCount({ sublistId: "item" });
        const idsAEliminar = new Set(lineas.map((l) => String(l.custcol_2win_as_identificador_fila)));

        // Eliminar líneas existentes que coincidan (de atrás hacia adelante)
        for (let i = lineCount - 1; i >= 0; i--) {
            try {
                const idFila = registro.getSublistValue({
                    sublistId: "item",
                    fieldId: "custcol_2win_as_identificador_fila",
                    line: i
                });
                if (idFila && idsAEliminar.has(String(idFila))) {
                    registro.removeLine({ sublistId: "item", line: i });
                }
            } catch (e) {
                // Ignorar errores en lectura
            }
        }

        // Recalcular líneas después de eliminar
        let lineaActualIndex = registro.getLineCount({ sublistId: "item" });

        // Agregar nuevas líneas usando setSublistValue (Modo Estándar)
        lineas.forEach((linea, index) => {
            try {
                if (!linea.item) throw new Error("Item es requerido");
                if (!linea.custcol_2win_as_identificador_fila) throw new Error("Identificador de fila es requerido");

                const montoAfecto = Number(linea.MontoAfecto) || 0;
                const montoExento = Number(linea.MontoExento) || 0;
                const iva = Number(linea.Iva) || 0;
                const lineasAAgregar = [];

                if (montoAfecto === 0 && montoExento === 0) {
                    lineasAAgregar.push({ amount: 0, taxcode: cacheImpuestos.afecto, tax1amt: 0 });
                } else {
                    if (montoAfecto > 0) lineasAAgregar.push({ amount: montoAfecto, taxcode: cacheImpuestos.afecto, tax1amt: iva });
                    if (montoExento > 0) lineasAAgregar.push({ amount: montoExento, taxcode: cacheImpuestos.exento, tax1amt: 0 });
                }

                lineasAAgregar.forEach((datosLinea) => {
                    // Función helper para no repetir código de setSublistValue
                    const setSubVal = (fieldId, value) => {
                        if (value !== undefined && value !== null) {
                            registro.setSublistValue({ sublistId: "item", fieldId: fieldId, line: lineaActualIndex, value: value });
                        }
                    };

                    // Campos obligatorios/financieros
                    setSubVal("item", linea.item);
                    setSubVal("amount", datosLinea.amount);
                    setSubVal("taxcode", datosLinea.taxcode);
                    if (datosLinea.tax1amt > 0) setSubVal("tax1amt", datosLinea.tax1amt);

                    // Campos personalizados
                    setSubVal("custcol_2win_as_identificador_fila", String(linea.custcol_2win_as_identificador_fila));
                    setSubVal("custcol_2win_as_rut_financiador", linea.custcol_2win_as_rut_financiador);
                    setSubVal("custcol_2win_as_codigo_convenio", linea.custcol_2win_as_codigo_convenio);
                    setSubVal("custcol_2win_as_nombre_convenio", linea.custcol_2win_as_nombre_convenio);
                    setSubVal("custcol_2win_as_codigo_paquete", linea.custcol_2win_as_codigo_paquete);
                    setSubVal("custcol_2win_as_nombre_paquete", linea.custcol_2win_as_nombre_paquete);
                    setSubVal("custcol_2win_as_codigo_servicio", linea.custcol_2win_as_codigo_servicio);

                    lineaActualIndex++; // Avanzar el índice de la línea manualmente
                });

                resultado.lineasProcesadas++;
            } catch (error) {
                resultado.lineasConError++;
                resultado.errores.push({
                    linea: index,
                    CrgCorrel: linea.custcol_2win_as_identificador_fila,
                    error: error.message
                });
            }
        });

        return resultado;
    };

    /**
     * @function procesarOrdenVenta
     */
    const procesarOrdenVenta = (datosMapeados, cache) => {
        const resultado = { exitoso: false, idRegistro: null, errores: [] };

        try {
            const cuentaPaciente = datosMapeados.custbody_2win_nro_cuenta_paciente;
            const subsidiary = datosMapeados.subsidiary;
            const ovExistente = cache.ordenesVenta[cuentaPaciente];
            let registro;

            if (ovExistente) {
                if (String(ovExistente.subsidiary) === String(subsidiary)) {
                    // CAMBIO CLAVE: isDynamic: false para rendimiento backend
                    registro = record.load({ type: record.Type.SALES_ORDER, id: ovExistente.internalid, isDynamic: false });
                } else {
                    // CAMBIO CLAVE: isDynamic: false
                    registro = record.copy({ type: record.Type.SALES_ORDER, id: ovExistente.internalid, isDynamic: false });

                    registro.setValue({ fieldId: "subsidiary", value: subsidiary });
                    registro.setValue({ fieldId: "location", value: "" });
                    registro.setValue({ fieldId: "orderstatus", value: "B" });
                    registro.setValue({ fieldId: "externalid", value: `OV-${subsidiary}-${cuentaPaciente}` });

                    const lineCount = registro.getLineCount({ sublistId: "item" });
                    for (let i = lineCount - 1; i >= 1; i--) {
                        registro.removeLine({ sublistId: "item", line: i });
                    }
                }
            } else {
                resultado.errores.push({ error: `No se encontró orden de venta para cuenta: ${cuentaPaciente}`, esGeneral: true });
                return resultado;
            }

            definirCamposCuerpo(datosMapeados, registro);

            const cacheImpuestos = {
                afecto: cache.impuestos["IVA AFECTO"] || cache.impuestos["IVA Afecto"],
                exento: cache.impuestos["IVA EXENTO"] || cache.impuestos["IVA Exento"]
            };

            if (!cacheImpuestos.afecto || !cacheImpuestos.exento) throw new Error("No se encontraron códigos de impuesto en caché");

            const resultadoLineas = agregarLineasOptimizado(datosMapeados.item || [], registro, cacheImpuestos);

            const idRegistro = registro.save({ enableSourcing: false, ignoreMandatoryFields: true });

            resultado.exitoso = true;
            resultado.idRegistro = idRegistro;
            resultado.lineasProcesadas = resultadoLineas.lineasProcesadas;
            resultado.lineasConError = resultadoLineas.lineasConError;
            if (resultadoLineas.errores.length > 0) resultado.errores = resultadoLineas.errores;
        } catch (error) {
            resultado.errores.push({ error: error.message, esGeneral: true });
        }

        return resultado;
    };

    const validarMapearDatosSendIn = (datosEntrada, cache) => libMapeoV2.validarMapearPaciente(datosEntrada, cache);

    return { procesarOrdenVenta, validarMapearDatosSendIn, agregarLineasOptimizado, formatearFecha };
});
