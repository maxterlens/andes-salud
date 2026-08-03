/**
 * @NApiVersion 2.1
 * @module ./2win_dao_config.js
 * @NModuleScope Public
 */
define(["N/config", "N/file", "N/log", "N/url"], function (config, file, nLog, url) {

    /**
     * @function recuperarCuentaConsumo - Ejecuta una busqueda para las configuraciones del ambiente
     * @returns {Number} - Dato recuperado
     */
    function recuperarCuentaConsumo() {
        try {
            const accountingConfig = config.load({ type: config.Type.ACCOUNTING_PREFERENCES });
            const cuentaConsumo = accountingConfig.getValue({ fieldId: "INVCOUNTACCOUNT" });
            nLog.debug("recuperarCuentaConsumo - cuentaConsumo", { cuentaConsumo: cuentaConsumo });

            // Validar si se recupero valor
            if (cuentaConsumo) {
                return cuentaConsumo;
            } else {
                throw new Error("No se recupero cuenta consumo INVCOUNTACCOUNT")
            };
        } catch (error) {
            nLog.error("recuperarCuentaConsumo - error", error);
            throw error;
        }
    }

    return {
        recuperarCuentaConsumo: recuperarCuentaConsumo
    };
});
