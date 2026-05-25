/**
 * @NApiVersion 2.1
 * @module ./2win_dao_cliente.js
 * @NModuleScope Public
 */
define(["N/record", "N/search", "../dao/2win_dao", "N/log", "N/task", "./2win_dao_subsidiaria"], function (record, search, dao, nLog, task, daoSubsidiaria) {
    const RegistroPorIdExternoCache = new Map(); // Cache para resultados de búsqueda por ID externo
    const RegistroPorRutCache = new Map(); // Cache para resultados de búsqueda por RUT

    /**
     * @function busquedaRegistroPorIdExterno - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} externalid - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorIdExterno(externalid) {
        try {
            nLog.debug("busquedaRegistroPorIdExterno - parametro", {
                externalid: externalid,
                tipoDato: typeof externalid
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customer",
                filters: [["externalid", "anyof", externalid]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = objSearch.filters;
            if (RegistroPorIdExternoCache.has(externalid)) {
                return RegistroPorIdExternoCache.get(externalid);
            }
            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorIdExterno - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                RegistroPorIdExternoCache.set(externalid, result);
                return result;
            } else {
                throw new Error(`No se encontro paciente con id: ${externalid}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorIdExterno - error", error);
            throw error;
        }
    }
    /**
     * @function busquedaRegistroPorRut - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} rut - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorRut(rut, notError = false) {
        try {
            nLog.debug("busquedaRegistroPorRut - parametro", {
                rut: rut,
                tipoDato: typeof rut
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customer",
                filters: [["custentity_2wrut", "is", rut]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = objSearch.filters;

            if (RegistroPorRutCache.has(rut)) {
                return RegistroPorRutCache.get(rut);
            }
            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorRut - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                RegistroPorRutCache.set(rut, result);
                return result;
            } else {
                if (!notError) throw new Error(`No se encontro registro con rut: ${rut}`);
                return null;
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorRut - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaMasivaPorRut - Función optimizada para buscar múltiples clientes por RUT en una sola consulta.
     * @param {Array<string>} ruts - Array de RUTs a buscar.
     * @return {Map<string, number>} - Map con clave RUT y valor internalid del cliente.
     */
    function busquedaMasivaPorRut(ruts) {
        try {
            nLog.audit("busquedaMasivaPorRut - inicio", {
                cantidad: ruts.length
            });

            if (!ruts || ruts.length === 0) {
                return new Map();
            }

            // Eliminar duplicados y valores vacíos
            const rutsUnicos = [...new Set(ruts)].filter((r) => r && r.trim() !== "");

            if (rutsUnicos.length === 0) {
                nLog.warn("busquedaMasivaPorRut - no hay RUTs válidos");
                return new Map();
            }

            /**@description - se agrega correccion para evitar fallo en la busqueda */
            let result = [];
            for (let j = 0; j < rutsUnicos.length; j++) {
                // Crear búsqueda con múltiples filtros usando ANYOF
                let objSearch = {
                    type: "customer",
                    filters: [["custentity_2wrut", "is", rutsUnicos[j]]],
                    columns: [search.createColumn({ name: "internalid", label: "internalid" }), search.createColumn({ name: "custentity_2wrut", label: "rut" })]
                };

                let resultado = dao.obtenerResultados(objSearch);
                nLog.audit("busquedaMasivaPorRut - resultado", {
                    extension: resultado.length,
                    resultado: resultado
                });

                // Si recupero resultado
                if (resultado.length > 0) {
                    // Empujar resultado a result
                    result.push(resultado[0]);
                }
            }

            /**@description - se comenta seccion causa del error por filtro ANYOF invalido para campo texto */
            // // Crear búsqueda con múltiples filtros usando ANYOF
            // let objSearch = {
            //     type: "customer",
            //     filters: [["custentity_2wrut", "anyof", rutsUnicos]],
            //     columns: [
            //         search.createColumn({ name: "internalid", label: "internalid" }),
            //         search.createColumn({ name: "custentity_2wrut", label: "rut" })
            //     ]
            // };

            // // Ejecutar búsqueda
            // let result = dao.obtenerResultados(objSearch);

            // Convertir resultados a Map para acceso O(1)
            const mapaClientes = new Map();
            result.forEach((cliente) => {
                mapaClientes.set(cliente.rut, cliente.internalid);
                // mapaClientes.set(cliente.custentity_2wrut, cliente.internalid); // Se comenta porque clave rut no es la indicada
            });

            nLog.audit("busquedaMasivaPorRut - resultados", {
                solicitados: rutsUnicos.length,
                encontrados: mapaClientes.size,
                result: result,
                mapaClientes: mapaClientes
            });

            return mapaClientes;
        } catch (error) {
            nLog.error("busquedaMasivaPorRut - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistrosDuplicados - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} duplicateSearchCriteria - Parametros a usar en los filtros de la busqueda.
     * @return {object<{master, duplicates}>} - Resultados de la busqueda.
     * @throws {Error} - Error al realizar la busqueda.
     */
    function busquedaRegistrosDuplicados(duplicateSearchCriteria) {
        const master = duplicateSearchCriteria.externalid;
        const duplicates = duplicateSearchCriteria.mrg.map(function (item) {
            return item.externalid_a_fusionar;
        });
        nLog.debug("busquedaRegistrosDuplicados - parametros", {
            master: master,
            duplicates: duplicates
        });
        const externalIds = [master].concat(duplicates);
        duplicateSearchCriteria.duplicates = [];
        duplicateSearchCriteria.master = null;
        search
            .create({
                type: search.Type.CUSTOMER,
                filters: [["externalid", "anyof", externalIds]],
                columns: [search.createColumn({ name: "internalid", label: "internalid" }), search.createColumn({ name: "externalid", label: "externalid" })]
            })
            .run()
            .each(function (result) {
                const id = result.getValue({ name: "internalid" });
                const extId = result.getValue({ name: "externalid" });
                if (extId === master) {
                    duplicateSearchCriteria.master = id;
                } else {
                    duplicateSearchCriteria.duplicates.push(id);
                }
                return true; // Continuar iterando
            });
        return {
            master: duplicateSearchCriteria.master,
            duplicates: duplicateSearchCriteria.duplicates
        };
    }
    /**
     * @function actualizarUltimosDatosRegistro - Actualizar los ultimos datos del registro final en el master.
     * @param {number} mainId - Id del registro maestro.
     * @param {number} lastRecordId - Id del ultimo registro.
     * @return {number} - Id del registro actualizado.
     * @throws {Error} - Error al actualizar el registro.
     */
    function actualizarUltimosDatosRegistro(mainId, lastRecordId) {
        if (!mainId || !lastRecordId) {
            nLog.error("Error en Parámetros", "mainId y lastRecordId son requeridos.");
            return null;
        }

        // nLog.debug("Iniciando Actualización", `Registro Principal ID: ${mainId}, Registro Origen ID: ${lastRecordId}`);

        try {
            const mainRecord = record.load({
                type: record.Type.CUSTOMER,
                id: mainId,
                isDynamic: false
            });

            const sourceRecord = record.load({
                type: record.Type.CUSTOMER,
                id: lastRecordId,
                isDynamic: false
            });

            const sourceFields = sourceRecord.getFields();

            const excludedFields = [
                "internalid",
                "externalid",
                "id",
                "type",
                "recordtype",
                "lastmodifieddate",
                "datecreated",
                "entityid",
                "isinactive",
                "companyname",
                "balance",
                "overduebalance",
                "unbilledorders",
                "consolbalance",
                "otherrelationships",
                "addressbook",
                "contacts",
                "dateclosed",
                "entryformquerystring",
                "version",
                "nameorig",
                "currid",
                "nsapiCT",
                "firstname",
                "lastname"
            ];

            let fieldsUpdatedCount = 0;
            const listFieldsUpdated = [];
            let fieldsSkippedCount = 0;

            sourceFields.forEach(function (fieldId) {
                if (excludedFields.indexOf(fieldId.toLowerCase()) !== -1) {
                    fieldsSkippedCount++;
                    return;
                }

                try {
                    const targetField = mainRecord.getField({ fieldId: fieldId });

                    if (!targetField) {
                        // nLog.debug("Campo Inexistente/Inválido en Destino", `Saltando campo: ${fieldId}`);
                        fieldsSkippedCount++;
                        return;
                    }

                    const value = sourceRecord.getValue({ fieldId: fieldId });
                    const currentValue = mainRecord.getValue({ fieldId: fieldId });

                    if (JSON.stringify(value) === JSON.stringify(currentValue)) {
                        fieldsSkippedCount++;
                        return;
                    }

                    mainRecord.setValue({
                        fieldId: fieldId,
                        value: value,
                        ignoreFieldChange: true
                    });
                    listFieldsUpdated.push(fieldId);
                    fieldsUpdatedCount++;
                } catch (e) {
                    nLog.error("Error al Procesar Campo", `Campo: ${fieldId}, Error: ${e.message}`);
                    fieldsSkippedCount++;
                }
            });

            // nLog.debug("Resumen de Campos", `Campos Actualizados: ${fieldsUpdatedCount}, Campos Omitidos/Sin Cambios: ${fieldsSkippedCount}`);
            // nLog.debug("Campos Actualizados", listFieldsUpdated.join(", "));
            if (fieldsUpdatedCount > 0) {
                sourceRecord.setValue({ fieldId: "entityid", value: `${mainRecord.getValue("entityid")} - ${(Math.random() * 100) / 100}` });
                sourceRecord.save({
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                });
                const savedId = mainRecord.save({
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                });
                nLog.audit("Actualización Exitosa", `Registro principal ${mainId} actualizado con datos de ${lastRecordId}. Nuevo ID guardado: ${savedId}`);
                return savedId;
            } else {
                nLog.audit("Actualización Omitida", `No se encontraron campos modificados para actualizar en el registro principal ${mainId}`);
                return mainId;
            }
        } catch (error) {
            nLog.error({
                title: "Error en actualizarUltimosDatosRegistro",
                details: `Error al actualizar Customer ID ${mainId} desde Customer ID ${lastRecordId}. Error: ${error.message || JSON.stringify(error)}`
            });

            return null;
        }
    }

    /**
     * @function definirCamposRegistro - Definir campos de registro.
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

            // Validar existencia de campo requerido
            if (!parametro.datos.externalid) {
                throw new Error("Campo requerido no encontrado o vacío: externalid");
            }

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
                            let removerLinea = registro.removeLine({
                                sublistId: campo,
                                line: ind
                            });
                            nLog.audit("definirCamposRegistro - removerLinea", removerLinea);
                        }
                    }

                    // Iterar sobre valores sublista
                    for (let i = 0; i < sublista.length; i++) {
                        // Seleccionar nueva linea
                        let lineaRegistro = registro.selectNewLine({ sublistId: campo });
                        nLog.debug("definirCamposRegistro - linea", campo);

                        // Aislar cada linea de sublista
                        let datosSublista = sublista[i];
                        nLog.debug("definirCamposRegistro - datosSublista", datosSublista);

                        // Iterar sobre datos para linea de sublista
                        for (let key in datosSublista) {
                            // Validar si existe subregistro
                            nLog.debug(`definirCamposRegistro - sublista - ${campo}`, datosSublista[key]);
                            if (typeof datosSublista[key] === "object") {
                                // Aislar datos subregistro
                                let datosSubregistro = datosSublista[key];
                                nLog.debug("definirCamposRegistro - datosSubregistro", datosSubregistro);
                                nLog.debug("definirCamposRegistro - campo", campo);

                                // Recuperar subregistro
                                let subregistro = lineaRegistro.getCurrentSublistSubrecord({ sublistId: campo, fieldId: key });
                                nLog.debug("definirCamposRegistro - subregistro", key);

                                // Iterar sobre datos subregistro
                                for (let campoSubregistro in datosSubregistro) {
                                    // Definir campos subregistro
                                    subregistro.setValue({ fieldId: campoSubregistro, value: datosSubregistro[campoSubregistro] });
                                    nLog.debug(`definirCamposRegistro - datosSubregistro - ${campoSubregistro}`, datosSubregistro[campoSubregistro]);
                                }
                            } else {
                                // Definir campos sublista
                                lineaRegistro.setCurrentSublistValue({ sublistId: campo, fieldId: key, value: datosSublista[key] });
                                nLog.debug(`definirCamposRegistro - sublista - ${campo} campo - ${key}`, datosSublista[key]);
                            }
                        }

                        // Guardar linea
                        lineaRegistro.commitLine({ sublistId: campo });
                        nLog.debug("definirCamposRegistro - lineaRegistro", campo);
                    }
                } else {
                    // Definir campos de cuerpo
                    registro.setValue({ fieldId: campo, value: parametro.datos[campo] });
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
     * @function creaRegistro - Crear un nuevo registro.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function creaRegistro(parametro) {
        /**
         *  Nombre del Campo (Label)	ID del Campo Sugerido	Tipo de Campo NetSuite	Campo(s) HL7 de Origen	Notas
            ID Paciente (Sistema Origen)	custentity_pac_correl	Free-Form Text	PID-2.1	Campo Clave. Marcar como External ID para upsert.
            N° de Ficha Paciente	custentity_pac_numficha	Free-Form Text	PV1-2.1	Número de ficha interna del sistema origen.
            RUT Responsable Cuenta	custentity_rut_responsable	Free-Form Text	PV1-8.1	RUT del responsable financiero.
            Nombre Responsable Cuenta	custentity_nombre_responsable	Free-Form Text	PV1-8.2	Nombre del responsable, puede ser el mismo paciente o un tercero.
         */
        try {
            nLog.audit("creaRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = creaRegistro.name;

            // Verificar extension de valores para campo
            if (parametro.datos.comments && parametro.datos.comments !== null && parametro.datos.comments.length > 998) {
                // Limitar longitud de valor a asignar a campo
                parametro.datos.comments = parametro.datos.comments.substring(0, 998);
            }

            // Crear registro
            let registro = record.create({ type: record.Type.CUSTOMER, isDynamic: true });

            // Definir campos de registro
            registro.setValue({ fieldId: "isperson", value: "T" });
            nLog.debug("creaRegistro - isperson", "T");
            /**@todo: Se debe mapear campo subsidiary */
            registro.setValue({ fieldId: "subsidiary", value: "1" });
            registro.setValue({ fieldId: "custentity_pac_correl", value: parametro.datos.externalid });
            // registro.setValue({ fieldId: "custentity_pac_numficha", value: "1" });
            // registro.setValue({ fieldId: "custentity_rut_responsable", value: "1" });
            // registro.setValue({ fieldId: "custentity_nombre_responsable", value: "1" });

            nLog.debug("creaRegistro - subsidiary", "1");
            registro = definirCamposRegistro(parametro, registro);

            // Adjuntar todas las subsidiarias activas
            const activeSubsidiaries = daoSubsidiaria.busquedaSubsidiariasActivas();
            if (activeSubsidiaries && activeSubsidiaries.length > 0) {
                activeSubsidiaries.forEach(function (subsidiaryId) {
                    // Asegurarse de no agregar la subsidiaria principal dos veces
                    if (subsidiaryId !== registro.getValue({ fieldId: "subsidiary" })) {
                        registro.selectNewLine({ sublistId: "submachine" });
                        registro.setCurrentSublistValue({ sublistId: "submachine", fieldId: "subsidiary", value: subsidiaryId });
                        registro.commitLine({ sublistId: "submachine" });
                    }
                });
            }

            // Guardar registro
            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);
            parametro.id = idRegistro;
            nLog.audit("creaRegistro - idRegistro", idRegistro);

            return parametro;
        } catch (error) {
            nLog.error("creaRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function editarRegistro - Editar registro existente.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function editarRegistro(parametro) {
        try {
            nLog.audit("editarRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = editarRegistro.name;

            // Verificar extension de valores para campo
            if (parametro.datos.comments && parametro.datos.comments !== null && parametro.datos.comments.length > 998) {
                // Limitar longitud de valor a asignar a campo
                parametro.datos.comments = parametro.datos.comments.substring(0, 998);
            }

            // Cargar registro
            let registro = record.load({ type: record.Type.CUSTOMER, id: parametro.idRegistroNetsuite, isDynamic: true });

            // Definir campos de registro
            registro = definirCamposRegistro(parametro, registro);

            // Limpiar subsidiarias existentes en submachine
            let lineCountSubsidiaries = registro.getLineCount({ sublistId: "submachine" });
            for (let i = lineCountSubsidiaries - 1; i >= 0; i--) {
                registro.removeLine({
                    sublistId: "submachine",
                    line: i
                });
            }

            // Adjuntar todas las subsidiarias activas
            const activeSubsidiaries = daoSubsidiaria.busquedaSubsidiariasActivas();
            if (activeSubsidiaries && activeSubsidiaries.length > 0) {
                activeSubsidiaries.forEach(function (subsidiaryId) {
                    // No agregar la subsidiaria principal ya que está en el cuerpo del registro
                    if (subsidiaryId !== registro.getValue({ fieldId: "subsidiary" })) {
                        registro.selectNewLine({ sublistId: "submachine" });
                        registro.setCurrentSublistValue({
                            sublistId: "submachine",
                            fieldId: "subsidiary",
                            value: subsidiaryId
                        });
                        registro.commitLine({ sublistId: "submachine" });
                    }
                });
            }

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
     * @function fusionarRegistros - Fusionar registros duplicados.
     * @param {number} masterId - Id del registro maestro.
     * @param {number} duplicates - Ids de los registros duplicados.
     * @returns {number} - Id de la tarea de deduplicacion.
     * @throws {Error} - Error al crear la tarea de deduplicacion.
     */
    function fusionarRegistros(masterId, duplicates) {
        const parametro = {
            etapa: fusionarRegistros.name,
            idRegistroNetsuite: masterId,
            idRegistroCreado: null,
            tipoRegistroCreado: null
        };
        const customerId = masterId;
        const cusRecords = duplicates;
        const dedupeTask = task.create({
            taskType: task.TaskType.ENTITY_DEDUPLICATION
        });
        dedupeTask.entityType = task.DedupeEntityType.CUSTOMER;
        dedupeTask.dedupeMode = task.DedupeMode.MERGE;
        dedupeTask.masterSelectionMode = task.MasterSelectionMode.SELECT_BY_ID;
        dedupeTask.masterRecordId = customerId;
        dedupeTask.recordIds = cusRecords;
        parametro.id = masterId;
        parametro.dedupeTaskId = dedupeTask.submit();
        return parametro;
    }
    function busquedaRegistroPorNroFicha(nroFicha) {
        try {
            nLog.debug("busquedaRegistroPorNroFicha - parametro", {
                nroFicha: nroFicha,
                tipoDato: typeof nroFicha
            });
            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customer",
                filters: [["custentity_pac_numficha", "is", nroFicha]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorNroFicha - resultados", {
                extension: result.length,
                resultado: result
            });
            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result[0]?.internalid;
            } else {
                throw new Error(`No se encontro paciente con numero de ficha: ${nroFicha}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorNroFicha - error", error);
            throw error;
        }
    }
    return {
        busquedaRegistroPorIdExterno: busquedaRegistroPorIdExterno,
        busquedaRegistroPorRut: busquedaRegistroPorRut,
        busquedaMasivaPorRut: busquedaMasivaPorRut,
        busquedaRegistroPorNroFicha: busquedaRegistroPorNroFicha,
        creaRegistro: creaRegistro,
        editarRegistro: editarRegistro,
        busquedaRegistrosDuplicados: busquedaRegistrosDuplicados,
        fusionarRegistros: fusionarRegistros,
        actualizarUltimosDatosRegistro: actualizarUltimosDatosRegistro
    };
});
