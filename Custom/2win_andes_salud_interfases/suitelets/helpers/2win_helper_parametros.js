/**
 * @NApiVersion 2.1
 * @description Helper para gestión de parámetros de operación
 * @author 2Win
 * @version 1.0.0
 */
define(["N/record", "N/search", "N/log"], function (record, search, nLog) {
    /**
     * Constantes
     */
    const REGISTRO_PARAMETROS = "customrecord_2w_parametros_operacion";

    /**
     * Crea o actualiza parรกmetros de operaciรณn
     * @param {Array<Object>} parametros - Array de parรกmetros a crear
     * @returns {void}
     */
    function crearParametros(parametros) {
        try {
            // Buscar si ya existe un registro de parรกmetros
            const registroId = buscarRegistroParametros();

            let registro;
            if (registroId) {
                // Actualizar registro existente
                registro = record.load({
                    type: REGISTRO_PARAMETROS,
                    id: registroId
                });
                nLog.audit("crearParametros", "Actualizando registro de parรกmetros existente: " + registroId);
            } else {
                // Crear nuevo registro
                registro = record.create({
                    type: REGISTRO_PARAMETROS,
                    isDynamic: false
                });
                nLog.audit("crearParametros", "Creando nuevo registro de parรกmetros");
            }

            // Establecer cada parรกmetro
            parametros.forEach(function (parametro) {
                try {
                    const campoId = parametro.nombre;
                    const valor = parametro.valor;

                    // Validar que el campo exista en el registro
                    if (registro.getField({ fieldId: campoId })) {
                        registro.setValue({
                            fieldId: campoId,
                            value: valor
                        });
                        nLog.debug("Parรกmetro establecido", campoId + " = " + valor);
                    } else {
                        nLog.warn("Campo no encontrado", "El campo " + campoId + " no existe en el registro de parรกmetros");
                    }
                } catch (e) {
                    nLog.error("Error al establecer parรกmetro", "Nombre: " + parametro.nombre + ", Error: " + e.message);
                }
            });

            // Guardar el registro
            const registroGuardadoId = registro.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });

            nLog.audit("crearParametros - exito", "Parรกmetros guardados correctamente. Registro ID: " + registroGuardadoId);
        } catch (error) {
            nLog.error("crearParametros - error", error);
            throw error;
        }
    }

    /**
     * Busca un registro de parรกmetros existente
     * @returns {string|null} - ID del registro o null si no existe
     */
    function buscarRegistroParametros() {
        try {
            const busqueda = search.create({
                type: REGISTRO_PARAMETROS,
                filters: [],
                columns: ["internalid"]
            });

            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            if (resultado && resultado.length > 0) {
                return resultado[0].getValue("internalid");
            }

            return null;
        } catch (error) {
            // Si el registro no existe, retornar null
            if (error.name === "SSS_INVALID_RECORD_TYPE") {
                nLog.warn("buscarRegistroParametros", "El registro de parรกmetros no existe aรบn");
                return null;
            }
            nLog.error("buscarRegistroParametros - error", error);
            return null;
        }
    }

    /**
     * Obtiene el valor de un parรกmetro especรญfico
     * @param {string} nombreParametro - Nombre del parรกmetro
     * @returns {string|null} - Valor del parรกmetro o null si no existe
     */
    function obtenerParametro(nombreParametro) {
        try {
            const busqueda = search.create({
                type: REGISTRO_PARAMETROS,
                filters: [],
                columns: [nombreParametro]
            });

            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            if (resultado && resultado.length > 0) {
                const valor = resultado[0].getValue(nombreParametro);
                nLog.debug("obtenerParametro", nombreParametro + " = " + valor);
                return valor;
            }

            return null;
        } catch (error) {
            nLog.error("obtenerParametro - error", error);
            return null;
        }
    }

    /**
     * Obtiene todos los parรกmetros de operaciรณn
     * @returns {Object} - Objeto con todos los parรกmetros
     */
    function obtenerTodosParametros() {
        try {
            const busqueda = search.create({
                type: REGISTRO_PARAMETROS,
                filters: [],
                columns: search.getAllColumns()
            });

            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            if (resultado && resultado.length > 0) {
                const parametros = {};
                const columnas = resultado[0].columns;

                columnas.forEach(function (columna) {
                    const nombre = columna.name || columna.fieldId;
                    if (nombre && nombre !== "internalid") {
                        parametros[nombre] = resultado[0].getValue(columna);
                    }
                });

                return parametros;
            }

            return {};
        } catch (error) {
            nLog.error("obtenerTodosParametros - error", error);
            return {};
        }
    }

    /**
     * Valida si existe el registro de parรกmetros
     * @returns {boolean} - True si existe, false si no
     */
    function existeRegistroParametros() {
        return buscarRegistroParametros() !== null;
    }

    return {
        crearParametros: crearParametros,
        obtenerParametro: obtenerParametro,
        obtenerTodosParametros: obtenerTodosParametros,
        existeRegistroParametros: existeRegistroParametros,
        buscarRegistroParametros: buscarRegistroParametros
    };
});