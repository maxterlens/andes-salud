/**
 * @NApiVersion 2.1
 * @module ./2win_dao_ingreso_paciente.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search"], function (dao, search) {
    function obtenerPorNroCuenta(nro_cuenta) {
        try {
            let objSearch = {
                type: "customrecord_2w_ingresos_paciente",
                filters: [["name", "is", nro_cuenta] /* Número Cuenta Paciente */],
                columns: [search.createColumn({ name: "internalid", label: "id" }), search.createColumn({ name: "internalid", join: "CUSTRECORD_2W_PACIENTE", label: "id_paciente" })]
            };

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result[0];
            } else {
                log.error("obtenerPorNroCuenta", `No se encontro id paciente para numero de cuenta: ${nro_cuenta}`);
                return null;
            }
        } catch (error) {
            throw error;
        }
    }

    return {
        obtenerPorNroCuenta: obtenerPorNroCuenta
    };
});
