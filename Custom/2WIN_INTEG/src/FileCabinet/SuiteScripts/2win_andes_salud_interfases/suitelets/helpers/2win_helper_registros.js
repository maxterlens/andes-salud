/**
 * @NApiVersion 2.1
 * @description Helper para validación de registros personalizados
 * @author 2Win
 * @version 1.0.0
 */
define(["N/search", "N/record", "N/log"], function (search, record, nLog) {
    /**
     * Registros personalizados requeridos para la integración
     */
    const REGISTROS_REQUERIDOS = [
        {
            id: "customrecord_2w_as_prefactura",
            nombre: "Prefactura Andes Salud",
            scriptId: "customrecord_2w_as_prefactura"
        },
        {
            id: "customrecord_2w_as_prefactura_detalles",
            nombre: "Detalles Prefactura Andes Salud",
            scriptId: "customrecord_2w_as_prefactura_detalles"
        },
        {
            id: "customrecord_2w_ingresos_paciente",
            nombre: "Ingresos Paciente",
            scriptId: "customrecord_2w_ingresos_paciente"
        },
        {
            id: "customrecord_2win_autopicking_queue",
            nombre: "Cola Autopicking",
            scriptId: "customrecord_2win_autopicking_queue"
        },
        {
            id: "customrecord_2win_andessalud_custodia",
            nombre: "Custodia Andes Salud",
            scriptId: "customrecord_2win_andessalud_custodia"
        },
        {
            id: "customrecord_2win_andes_salud_replay_con",
            nombre: "Replay Configuración",
            scriptId: "customrecord_2win_andes_salud_replay_con"
        }
    ];

    /**
     * Valida la existencia de los registros personalizados requeridos
     * @returns {Array<Object>} - Array con resultados de validación
     */
    function validarRegistrosRequeridos() {
        const resultados = [];

        REGISTROS_REQUERIDOS.forEach(function (registroReq) {
            const existe = existeRegistro(registroReq.id);

            resultados.push({
                id: registroReq.id,
                nombre: registroReq.nombre,
                scriptId: registroReq.scriptId,
                existe: existe
            });

            nLog.debug("Validación registro", registroReq.nombre + " - " + (existe ? "EXISTS" : "NOT EXISTS"));
        });

        return resultados;
    }

    /**
     * Verifica si un registro personalizado existe
     * @param {string} recordType - ID del tipo de registro
     * @returns {boolean} - True si existe, false si no
     */
    function existeRegistro(recordType) {
        try {
            // Intentar crear una búsqueda para verificar si existe el registro
            const busqueda = search.create({
                type: recordType,
                filters: [],
                columns: ["internalid"]
            });

            // Ejecutar búsqueda
            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            return resultado && resultado.length >= 0; // Si no da error, el registro existe
        } catch (error) {
            // Si da error de tipo de registro inválido, no existe
            if (error.name === "SSS_INVALID_RECORD_TYPE" || error.name === "SSS_TYPE_ARG_REQD") {
                nLog.warn("Registro no existe", recordType);
                return false;
            }
            nLog.error("Error al verificar registro", recordType + " - " + error.message);
            return false;
        }
    }

    /**
     * Obtiene información sobre un registro personalizado
     * @param {string} recordType - ID del tipo de registro
     * @returns {Object|null} - Información del registro o null si no existe
     */
    function obtenerInfoRegistro(recordType) {
        try {
            const busqueda = search.create({
                type: recordType,
                filters: [],
                columns: search.getAllColumns()
            });

            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            if (resultado && resultado.length >= 0) {
                return {
                    existe: true,
                    tipo: recordType,
                    columnas: resultado[0].columns.length
                };
            }

            return null;
        } catch (error) {
            return {
                existe: false,
                tipo: recordType,
                error: error.message
            };
        }
    }

    /**
     * Crea un registro personalizado si no existe
     * @param {string} recordType - ID del tipo de registro
     * @param {Object} datos - Datos del registro
     * @returns {Object} - Resultado de la operación
     */
    function crearRegistroSiNoExiste(recordType, datos) {
        try {
            if (existeRegistro(recordType)) {
                return {
                    success: true,
                    message: "El registro ya existe",
                    creado: false
                };
            }

            // Intentar crear el registro
            const nuevoRegistro = record.create({
                type: recordType,
                isDynamic: false
            });

            // Establecer valores si se proporcionan
            if (datos) {
                Object.keys(datos).forEach(function (campo) {
                    try {
                        nuevoRegistro.setValue({
                            fieldId: campo,
                            value: datos[campo]
                        });
                    } catch (e) {
                        nLog.warn("Campo no válido", campo + " - " + e.message);
                    }
                });
            }

            const registroId = nuevoRegistro.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

            nLog.audit("Registro creado", recordType + " - ID: " + registroId);

            return {
                success: true,
                message: "Registro creado exitosamente",
                creado: true,
                registroId: registroId
            };
        } catch (error) {
            nLog.error("Error al crear registro", recordType + " - " + error.message);
            return {
                success: false,
                message: error.message,
                creado: false
            };
        }
    }

    /**
     * Obtiene todos los registros personalizados del proyecto
     * @returns {Array<Object>} - Lista de registros
     */
    function obtenerRegistrosProyecto() {
        return REGISTROS_REQUERIDOS.map(function (reg) {
            return {
                id: reg.id,
                nombre: reg.nombre,
                existe: existeRegistro(reg.id)
            };
        });
    }

    /**
     * Valida que los campos requeridos existan en un registro
     * @param {string} recordType - ID del tipo de registro
     * @param {Array<string>} camposRequeridos - Lista de campos requeridos
     * @returns {Object} - Resultado de validación
     */
    function validarCamposRegistro(recordType, camposRequeridos) {
        try {
            const resultado = {
                recordType: recordType,
                existe: false,
                camposValidos: [],
                camposFaltantes: [],
                todosValidos: false
            };

            if (!existeRegistro(recordType)) {
                return resultado;
            }

            resultado.existe = true;

            // Verificar cada campo
            camposRequeridos.forEach(function (campo) {
                try {
                    const busqueda = search.create({
                        type: recordType,
                        filters: [],
                        columns: [campo]
                    });

                    busqueda.run().getRange({ start: 0, end: 1 });
                    resultado.camposValidos.push(campo);
                } catch (e) {
                    resultado.camposFaltantes.push(campo);
                }
            });

            resultado.todosValidos = resultado.camposFaltantes.length === 0;

            return resultado;
        } catch (error) {
            nLog.error("Error al validar campos", error);
            return {
                recordType: recordType,
                existe: false,
                error: error.message
            };
        }
    }

    return {
        validarRegistrosRequeridos: validarRegistrosRequeridos,
        existeRegistro: existeRegistro,
        obtenerInfoRegistro: obtenerInfoRegistro,
        crearRegistroSiNoExiste: crearRegistroSiNoExiste,
        obtenerRegistrosProyecto: obtenerRegistrosProyecto,
        validarCamposRegistro: validarCamposRegistro
    };
});