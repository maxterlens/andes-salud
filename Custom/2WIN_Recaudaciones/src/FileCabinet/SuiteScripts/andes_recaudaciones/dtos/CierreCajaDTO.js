/**
 * @module CierreCajaDTO
 * @description Data Transfer Object para la información de cierre de caja.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias CierreCajaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.montoSobrante - Monto sobrante en caja.
     * @param {string} data.montoFaltante - Monto faltante en caja.
     * @param {string} data.Cajero - ID del cajero.
     */
    class CierreCajaDTO {
        constructor(data) {
            this.montoSobrante = data.montoSobrante;
            this.montoFaltante = data.montoFaltante;
            this.Cajero = data.Cajero;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.Cajero) {
                    nLog.error({ title: "Validación Fallida", details: "Cajero es requerido." });
                    return false;
                }
                return true;
            };

            /**
             * Convierte el DTO a un objeto plano.
             * @returns {Object} Objeto plano con los datos del DTO.
             */
            this.toObject = function () {
                return {
                    montoSobrante: this.montoSobrante,
                    montoFaltante: this.montoFaltante,
                    Cajero: this.Cajero
                };
            };
        }
    }

    return CierreCajaDTO;
});
