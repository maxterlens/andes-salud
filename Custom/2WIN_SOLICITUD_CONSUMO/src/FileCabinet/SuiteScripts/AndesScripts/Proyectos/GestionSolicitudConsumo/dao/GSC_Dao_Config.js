/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Dao_Config — Configuraciones globales de NetSuite para el módulo Gestión Solicitud de Consumo.
 *
 * Responsabilidades:
 *  - Recuperar valores de configuración contable (N/config) necesarios para el flujo.
 */
define(['N/config', 'N/log'], function (config, nLog) {

    /**
     * Recupera la cuenta de consumo configurada en Preferencias Contables (INVCOUNTACCOUNT).
     * @returns {string} Internal ID de la cuenta de consumo
     * @throws {Error} Si el campo no tiene valor configurado
     */
    function recuperarCuentaConsumo() {
        try {
            const accountingConfig = config.load({ type: config.Type.ACCOUNTING_PREFERENCES });
            const cuentaConsumo    = accountingConfig.getValue({ fieldId: 'INVCOUNTACCOUNT' });

            nLog.error('GSC_Dao_Config.recuperarCuentaConsumo', { cuentaConsumo: cuentaConsumo });

            if (cuentaConsumo) {
                return cuentaConsumo;
            }
            throw new Error('No se recuperó cuenta consumo INVCOUNTACCOUNT');
        } catch (e) {
            nLog.error('GSC_Dao_Config.recuperarCuentaConsumo - error', e);
            throw e;
        }
    }

    return {
        recuperarCuentaConsumo
    };
});
