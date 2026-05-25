/**
 * @NApiVersion 2.1
 * @module ./2win_dao_nota_debito.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log", "N/record", "../lib/2win_lib_peticion", "../lib/moment"], function (dao, search, nLog, record, libPeticion, moment) {
    /**
     * Busca una Nota de Débito por su internalId.
     * @param {string|number} internalId
     * @returns {Array} resultados de la búsqueda
     */
    function busquedaRegistroPorId(internalId) {
        try {
            nLog.debug("busquedaRegistroPorId - parametro", { internalId });

            const objSearch = {
                type: "customrecord_2win_nota_debito",
                filters: [["internalid", "is", internalId], "AND", ["mainline", "is", "T"]],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "trandate", label: "trandate" }),
                    search.createColumn({ name: "subsidiary", label: "subsidiary" }),
                    search.createColumn({ name: "amount", label: "amount" }),
                    search.createColumn({ name: "custrecord_2win_nota_debito_numero", label: "numero" }),
                    search.createColumn({ name: "custrecord_2win_nota_debito_tipo", label: "tipo" })
                ]
            };

            const result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorId - resultados", {
                cantidad: result.length,
                resultado: result
            });

            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontró Nota de Débito para id: ${internalId}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorId - error", error);
            throw error;
        }
    }

    /**
     * Recupera los campos relevantes de una Nota de Débito a partir del registro cargado.
     * @param {record.Record} registro
     * @returns {Object} objeto con los campos de la nota de débito
     */
    function recuperarCamposRegistro(registro) {
        try {
            nLog.debug("recuperarCamposRegistro - parametro", registro);

            const internalId = registro.getValue({ fieldId: "internalid" });
            const fecha = registro.getValue({ fieldId: "trandate" });
            const subsidiaria = registro.getValue({ fieldId: "subsidiary" });
            const monto = registro.getValue({ fieldId: "amount" });
            const numero = registro.getValue({ fieldId: "custrecord_2win_nota_debito_numero" });
            const tipo = registro.getValue({ fieldId: "custrecord_2win_nota_debito_tipo" });

            const notaDebito = {
                internalId,
                fecha: moment(fecha).format("YYYYMMDD"),
                subsidiaria,
                monto,
                numero,
                tipo
            };

            nLog.debug("recuperarCamposRegistro - notaDebito", notaDebito);
            return notaDebito;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }

    /**
     * Definir campos de registro de Nota de Débito.
     * @param {object} parametro - Datos para los campos del registro.
     * @param {record.Record} registro - Instancia de record.Type (nuevo o existente).
     * @return {record.Record} - Instancia de record.Type.
     * @throws {Error} - Error al definir campos del registro.
     */
    function definirCamposRegistro(parametro, registro) {
        try {
            nLog.audit("definirCamposRegistro - parametro", {
                parametro: parametro,
                registro: registro
            });

            // Iterar sobre cada campo y asignar valor en el registro
            for (let campo in parametro.datos) {
                nLog.debug(`definirCamposRegistro - campo - ${campo}`, parametro.datos[campo]);

                // Validar si es sublista
                if (Array.isArray(parametro.datos[campo])) {
                    // Aislar datos sublista
                    let sublista = parametro.datos[campo];
                    nLog.debug(`definirCamposRegistro - sublista - ${campo}`, sublista);

                    // Recuperar conteo de lineas de sublista
                    let conteoLineas = registro.getLineCount({ sublistId: campo });
                    nLog.audit(`definirCamposRegistro - conteoLineas - ${campo}`, conteoLineas);

                    // Evaluar el conteo de lineas
                    if (conteoLineas > 0) {
                        // Iterar sobre lineas de sublista de manera descendente
                        for (let ind = conteoLineas - 1; ind >= 0; ind--) {
                            nLog.audit("definirCamposRegistro - ind", ind);

                            // Remover linea
                            registro.removeLine({
                                sublistId: campo,
                                line: ind
                            });
                        }
                    }

                    // Iterar sobre valores sublista
                    for (let i = 0; i < sublista.length; i++) {
                        // Seleccionar nueva linea
                        let lineaRegistro = registro.selectNewLine({ sublistId: campo });

                        // Aislar cada linea de sublista
                        let datosSublista = sublista[i];
                        nLog.debug("definirCamposRegistro - datosSublista", datosSublista);

                        // Iterar sobre datos para linea de sublista
                        for (let key in datosSublista) {
                            // Definir campos sublista
                            lineaRegistro.setCurrentSublistValue({ sublistId: campo, fieldId: key, value: datosSublista[key] });
                            nLog.debug(`definirCamposRegistro - sublista - ${campo} campo - ${key}`, datosSublista[key]);
                        }

                        // Guardar linea
                        lineaRegistro.commitLine({ sublistId: campo });
                    }
                } else {
                    // Definir campos de cuerpo
                    if (campo === "externalid") {
                        registro.setValue({ fieldId: "custrecord_2win_nota_debito_externalid", value: parametro.datos[campo] });
                    } else if (campo === "trandate") {
                        registro.setValue({ fieldId: "trandate", value: parametro.datos[campo] });
                    } else if (campo === "subsidiary") {
                        registro.setValue({ fieldId: "subsidiary", value: parametro.datos[campo] });
                    } else if (campo === "amount") {
                        registro.setValue({ fieldId: "custrecord_2win_nota_debito_amount", value: parametro.datos[campo] });
                    } else if (campo === "numero") {
                        registro.setValue({ fieldId: "custrecord_2win_nota_debito_numero", value: parametro.datos[campo] });
                    } else if (campo === "tipo") {
                        registro.setValue({ fieldId: "custrecord_2win_nota_debito_tipo", value: parametro.datos[campo] });
                    } else {
                        registro.setValue({ fieldId: campo, value: parametro.datos[campo] });
                    }
                    nLog.debug(`definirCamposRegistro - ${campo}`, parametro.datos[campo]);
                }
            }

            return registro;
        } catch (error) {
            nLog.error("definirCamposRegistro - error", error);
            throw error;
        }
    }

    /**
     * Crear un nuevo registro de Nota de Débito.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function crearRegistro(parametro) {
        try {
            nLog.audit("crearRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = crearRegistro.name;

            // Crear registro
            let registro = record.create({ type: "customrecord_2win_nota_debito", isDynamic: true });

            // Definir campos de registro
            registro = definirCamposRegistro(parametro, registro);

            // Guardar registro
            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);
            parametro.id = idRegistro;
            nLog.audit("crearRegistro - idRegistro", idRegistro);

            return parametro;
        } catch (error) {
            nLog.error("crearRegistro - error", error);
            throw error;
        }
    }

    /**
     * Editar registro existente de Nota de Débito.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function editarRegistro(parametro) {
        try {
            nLog.audit("editarRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = editarRegistro.name;

            // Cargar registro
            let registro = record.load({ type: "customrecord_2win_nota_debito", id: parametro.idRegistroNetsuite, isDynamic: true });

            // Definir campos de registro
            registro = definirCamposRegistro(parametro, registro);

            // Guardar registro
            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);
            parametro.id = idRegistro;
            nLog.audit("editarRegistro - idRegistro", idRegistro);

            return parametro;
        } catch (error) {
            nLog.error("editarRegistro - error", error);
            throw error;
        }
    }

    /**
     * Eliminar registro de Nota de Débito.
     * @param {string|number} idRegistro - InternalId del registro a eliminar.
     * @return {object} - Resultado de la eliminación.
     */
    function eliminarRegistro(idRegistro) {
        try {
            nLog.audit("eliminarRegistro - idRegistro", idRegistro);

            record.delete({
                type: "customrecord_2win_nota_debito",
                id: idRegistro
            });

            nLog.audit("eliminarRegistro - Registro eliminado", idRegistro);
            return { success: true, message: "Registro de Nota de Débito eliminado correctamente." };

        } catch (error) {
            nLog.error("eliminarRegistro - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistroPorId: busquedaRegistroPorId,
        recuperarCamposRegistro: recuperarCamposRegistro,
        crearRegistro: crearRegistro,
        editarRegistro: editarRegistro,
        eliminarRegistro: eliminarRegistro
    };
});
