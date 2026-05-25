/**
 * @desc Librería para procesar registro cliente.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["../domain/2win_dom_cliente", "N/log", "N/error"], function (domCliente, nLog, error) {
    /**
     * @function crearRegistro - Función para crear un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function crearRegistro(parametro) {
        try {
            nLog.audit("crearRegistro - parametro", parametro);

            let respuesta = domCliente.crearRegistroNetsuite(parametro);
            nLog.audit("crearRegistro - respuesta", respuesta);

            return respuesta;
        } catch (err) {
            nLog.error("crearRegistro - error", err);
            throw err;
        }
    }

    /**
     * @function editarRegistro - Función para editar un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function editarRegistro(parametro) {
        try {
            nLog.audit("editarRegistro - parametro", parametro);

            let respuesta = domCliente.editarRegistroNetsuite(parametro);
            nLog.audit("editarRegistro - respuesta", respuesta);

            return respuesta;
        } catch (err) {
            nLog.error("editarRegistro - error", err);
            throw err;
        }
    }

    /**
     * @function fusionarRegistro - Función para fusionar un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function fusionarRegistro(parametro) {
        try {
            nLog.audit("fusionarRegistro - parametro", parametro);

            let respuesta = domCliente.fusionarRegistroNetsuite(parametro);
            nLog.audit("fusionarRegistro - respuesta", respuesta);

            return respuesta;
        } catch (err) {
            nLog.error("fusionarRegistro - error", err);
            throw err;
        }
    }

    return {
        crearRegistro: crearRegistro,
        editarRegistro: editarRegistro,
        fusionarRegistro: fusionarRegistro
    };
});
