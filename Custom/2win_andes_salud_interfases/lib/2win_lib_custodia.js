/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/record", "N/log", "N/crypto/random", "N/search"], function (record, nLog, random, search) {
    /**
     * @function obtenerResultados
     * @param {{"type": String,"filters": Array,"columns": Array}} createSearch - Objeto con parametros para la busqueda
     * @returns {Array} - Resultados de la busqueda
     */
    function obtenerResultados(createSearch) {
        try {
            nLog.audit("obtenerResultados - createSearch", {
                type: createSearch.type,
                filters: createSearch.filters,
                tipoDato: typeof createSearch
            });

            // Array que almacenara resultados
            let searchResults = [];

            let saveSearch = search.create(createSearch);
            let searchResultCount;

            // Ejecutar busqueda estandar
            searchResultCount = saveSearch.runPaged().count;
            if (searchResultCount === 0) {
                nLog.debug("obtenerResultados - searchResultCount", "la busqueda no retorno resultados");
                return searchResultCount;
            }
            saveSearch.run().each(function (item) {
                let objectCompiled = {};
                for (let i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            nLog.debug("obtenerResultados - ejecutada", "Obtuvo resultados");

            return searchResults;
        } catch (error) {
            nLog.error("obtenerResultados - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistroCustodia - Recuperar datos de la tabla en netsuite
     * @param {String} parametro - Parametro usado para el filtro
     * @returns {Array} - Resultado de busqueda
     */
    function busquedaRegistroCustodia(parametro) {
        try {
            nLog.debug("busquedaRegistroCustodia - parametro", parametro);

            let objSearch = {
                type: "customrecord_2win_andessalud_custodia",
                filters: [["externalid", "is", parametro], "AND", ["custrecord_2win_as_codigo_respuesta", "isnot", "000"]],
                columns: [search.createColumn({ name: "internalid", label: "internalid" })]
            };
            let filtros = objSearch.filters;

            // Ejecutar busqueda
            let result = obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroCustodia - resultados", {
                extension: result.length,
                resultado: result
            });

            return result;
        } catch (error) {
            nLog.error("busquedaRegistroCustodia - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistroPorExternalid - Recuperar datos de la tabla en netsuite
     * @param {String} parametro - Parametro usado para el filtro
     * @returns {Array} - Resultado de busqueda
     */
    function busquedaRegistroPorExternalid(parametro) {
        try {
            nLog.debug("busquedaRegistroPorExternalid - parametro", parametro);

            let objSearch = {
                type: "customrecord_2win_andessalud_custodia",
                filters: [
                    search.createFilter({ name: "externalid", operator: search.Operator.IS, values: parametro })
                ],
                columns: [search.createColumn({ name: "internalid", label: "internalid" }), search.createColumn({ name: "custrecord_2win_as_codigo_respuesta", label: "codigoRespuesta" })]
            };
            let filtros = objSearch.filters;

            // Ejecutar busqueda
            let result = obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorExternalid - resultados", {
                extension: result.length,
                resultado: result
            });

            return result;
        } catch (error) {
            nLog.error("busquedaRegistroPorExternalid - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistrosPorCodigoError - Busca todos los registros de custodia con un código de respuesta específico.
     * @param {String} codigoError - El código de error a buscar (ej. "001").
     * @returns {Array} - Un array de objetos de resultado de la búsqueda.
     */
    function busquedaRegistrosPorCodigoError(codigoError) {
        try {
            nLog.debug("busquedaRegistrosPorCodigoError - Buscando por código:", codigoError);
            const resultados = [];
            search
                .create({
                    type: "customrecord_2win_andessalud_custodia",
                    filters: [["custrecord_2win_as_codigo_respuesta", "is", codigoError]],
                    columns: ["internalid", "custrecord_2win_as_interface", "custrecord_2win_as_id_registro", "custrecord_2win_as_respuesta", "custrecord_2win_as_reintentos"]
                })
                .run()
                .each(function (result) {
                    resultados.push(result);
                    return true; // Continuar procesando más resultados
                });
            nLog.debug("Nro-Registros", `busquedaRegistrosPorCodigoError - Se encontraron ${resultados.length} registros.`);
            return resultados;
        } catch (error) {
            nLog.error("busquedaRegistrosPorCodigoError - error", error);
            throw error;
        }
    }

    /**
     * @function crearRegistro - Crea un nuevo registro en base a los datos recibidos
     * @param {object} parametro - Datos necesarios para crear el registro
     * @returns {Number} - Id de registro creado
     */
    function crearRegistro(parametro) {
        try {
            nLog.audit("crearRegistro - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Generar id
            parametro.custrecord_2win_as_uuid = random.generateUUID();

            // Calcular tiempo de proceso
            parametro.custrecord_2win_as_tiempo_proceso = new Date() - parametro.custrecord_2win_as_tiempo_proceso;
            nLog.debug("crearRegistro - custrecord_2win_as_tiempo_proceso", parametro.custrecord_2win_as_tiempo_proceso);

            // Crear el registro
            let registro = record.create({ type: "customrecord_2win_andessalud_custodia", isDynamic: true });

            // Definir campos del cuerpo del registro
            registro.setValue({ fieldId: "externalid", value: parametro.externalid });
            nLog.debug("crearRegistro - externalid", parametro.externalid);
            registro.setValue({ fieldId: "custrecord_2win_as_emisor", value: parametro.custrecord_2win_as_emisor });
            nLog.debug("crearRegistro - custrecord_2win_as_emisor", parametro.custrecord_2win_as_emisor);
            registro.setValue({ fieldId: "custrecord_2win_as_receptor", value: parametro.custrecord_2win_as_receptor });
            nLog.debug("crearRegistro - custrecord_2win_as_receptor", parametro.custrecord_2win_as_receptor);
            registro.setValue({ fieldId: "custrecord_2win_as_fecha_mensaje", value: parametro.custrecord_2win_as_fecha_mensaje });
            nLog.debug("crearRegistro - custrecord_2win_as_fecha_mensaje", parametro.custrecord_2win_as_fecha_mensaje);
            registro.setValue({ fieldId: "custrecord_2win_as_fecha_proceso", value: new Date() });
            nLog.debug("crearRegistro - custrecord_2win_as_fecha_proceso", new Date());
            registro.setValue({ fieldId: "custrecord_2win_as_tiempo_proceso", value: parametro.custrecord_2win_as_tiempo_proceso });
            nLog.debug("crearRegistro - custrecord_2win_as_tiempo_proceso", parametro.custrecord_2win_as_tiempo_proceso);
            registro.setValue({ fieldId: "custrecord_2win_as_uuid", value: parametro.custrecord_2win_as_uuid });
            nLog.debug("crearRegistro - custrecord_2win_as_uuid", parametro.custrecord_2win_as_uuid);
            registro.setValue({ fieldId: "custrecord_2win_as_interface", value: parametro.custrecord_2win_as_interface });
            nLog.debug("crearRegistro - custrecord_2win_as_interface", parametro.custrecord_2win_as_interface);
            registro.setValue({ fieldId: "custrecord_2win_as_id_registro", value: parametro.custrecord_2win_as_id_registro });
            nLog.debug("crearRegistro - custrecord_2win_as_id_registro", parametro.custrecord_2win_as_id_registro);
            // Limitar a 1,000,000 caracteres
            let datosEntrada = parametro.datosEntrada;
            if (typeof datosEntrada === "string" && datosEntrada.length > 1000000) {
                datosEntrada = datosEntrada.substring(0, 1000000);
            } else if (typeof datosEntrada === "object") {
                datosEntrada = JSON.stringify(datosEntrada).substring(0, 1000000);
            }
            registro.setValue({ fieldId: "custrecord_2win_as_datos_entrada", value: datosEntrada });
            nLog.debug("crearRegistro - custrecord_2win_as_datos_entrada", parametro.datosEntrada);
            // Limitar a 300 caracteres
            let respuesta = parametro.respuesta;
            if (typeof respuesta === "string" && respuesta.length > 300) {
                respuesta = respuesta.substring(0, 300);
            } else if (typeof respuesta === "object") {
                respuesta = JSON.stringify(respuesta).substring(0, 300);
            }
            registro.setValue({ fieldId: "custrecord_2win_as_respuesta", value: respuesta });
            nLog.debug("crearRegistro - custrecord_2win_as_respuesta", parametro.respuesta);
            registro.setValue({ fieldId: "custrecord_2win_as_codigo_respuesta", value: parametro.codigoRespuesta });
            nLog.debug("crearRegistro - custrecord_2win_as_codigo_respuesta", parametro.codigoRespuesta);
            registro.setValue({ fieldId: "custrecord_2win_as_reintentos", value: parametro.reintentos });
            nLog.debug("crearRegistro - custrecord_2win_as_reintentos", parametro.reintentos);

            // Guarda registro
            let guardarRegistro = registro.save({ enableSourcing: true });
            nLog.audit("crearRegistro - guardarRegistro", guardarRegistro);

            return guardarRegistro;
        } catch (error) {
            nLog.error("crearRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarRegistro - Actualizar registro existente.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {Number} - Id de registro actualizado.
     */
    function actualizarRegistro(parametro) {
        try {
            nLog.audit("actualizarRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = actualizarRegistro.name;

            // Calcular tiempo de proceso
            parametro.custrecord_2win_as_tiempo_proceso = new Date() - parametro.custrecord_2win_as_tiempo_proceso;
            nLog.debug("actualizarRegistro - custrecord_2win_as_tiempo_proceso", parametro.custrecord_2win_as_tiempo_proceso);

            // Recuperar numero de reintentos
            parametro.reintentos = search.lookupFields({
                type: "customrecord_2win_andessalud_custodia",
                id: parametro.internalid,
                columns: ["custrecord_2win_as_reintentos"]
            });
            nLog.debug("actualizarRegistro - reintentos", parametro.reintentos);

            // Limitar a 1,000,000 caracteres
            let datosEntrada = parametro.datosEntrada;
            if (typeof datosEntrada === "string" && datosEntrada.length > 1000000) {
                datosEntrada = datosEntrada.substring(0, 1000000);
            } else if (typeof datosEntrada === "object") {
                datosEntrada = JSON.stringify(datosEntrada).substring(0, 1000000);
            }

            // Limitar a 300 caracteres
            let respuesta = parametro.respuesta;
            if (typeof respuesta === "string" && respuesta.length > 300) {
                respuesta = respuesta.substring(0, 300);
            } else if (typeof respuesta === "object") {
                respuesta = JSON.stringify(respuesta).substring(0, 300);
            }

            // Actualizar campos del registro
            parametro.registroActualizado = record.submitFields({
                type: "customrecord_2win_andessalud_custodia",
                id: parametro.internalid,
                values: {
                    custrecord_2win_as_emisor: parametro.custrecord_2win_as_emisor,
                    custrecord_2win_as_receptor: parametro.custrecord_2win_as_receptor,
                    custrecord_2win_as_fecha_mensaje: parametro.custrecord_2win_as_fecha_mensaje,
                    custrecord_2win_as_fecha_proceso: new Date(),
                    custrecord_2win_as_tiempo_proceso: parametro.custrecord_2win_as_tiempo_proceso,
                    custrecord_2win_as_interface: parametro.custrecord_2win_as_interface,
                    custrecord_2win_as_id_registro: parametro.custrecord_2win_as_id_registro,
                    custrecord_2win_as_datos_entrada: datosEntrada,
                    custrecord_2win_as_respuesta: respuesta,
                    custrecord_2win_as_codigo_respuesta: parametro.codigoRespuesta,
                    custrecord_2win_as_reintentos: Number(parametro.reintentos.custrecord_2win_as_reintentos) + 1
                },
                options: {
                    enableSourcing: false
                    // ignoreMandatoryFields: true
                }
            });

            nLog.audit("actualizarRegistro - parametro", parametro);
            return parametro.registroActualizado;
        } catch (error) {
            nLog.error("actualizarRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function guardarOActualizarRegistro - Crea o actualiza un registro de custodia.
     * @param {object} parametro - Datos para el registro.
     * @returns {Number} - Id del registro creado o actualizado.
     */
    function guardarOActualizarRegistro(parametro) {
        try {
            nLog.audit("guardarOActualizarRegistro - parametro", parametro);
            const externalid = parametro.externalid;
            const registrosExistentes = busquedaRegistroPorExternalid(externalid);

            if (registrosExistentes && registrosExistentes.length > 0) {
                nLog.debug("guardarOActualizarRegistro", `El registro con externalid ${externalid} ya existe. Actualizando.`);
                parametro.internalid = registrosExistentes[0].internalid;
                return actualizarRegistro(parametro);
            } else {
                nLog.debug("guardarOActualizarRegistro", `El registro con externalid ${externalid} no existe. Creando.`);
                return crearRegistro(parametro);
            }
        } catch (error) {
            nLog.error("guardarOActualizarRegistro - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistroCustodia: busquedaRegistroCustodia,
        busquedaRegistroPorExternalid: busquedaRegistroPorExternalid,
        busquedaRegistrosPorCodigoError: busquedaRegistrosPorCodigoError,
        crearRegistro: crearRegistro,
        actualizarRegistro: actualizarRegistro,
        guardarOActualizarRegistro: guardarOActualizarRegistro
    };
});