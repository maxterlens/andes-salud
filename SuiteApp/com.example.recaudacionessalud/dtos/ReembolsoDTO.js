/**
 * @module ReembolsoDTO
 * @description Data Transfer Object para un reembolso.
 */
define(["N/log"], function (nLog) {
    /**
     * @alias ReembolsoDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.rutReembolso - RUT del beneficiario del reembolso.
     * @param {string} data.montoReembolso - Monto del reembolso.
     * @param {string} data.folioNC - Folio de la nota de crédito asociada.
     * @param {string} data.rutPrestador - RUT del prestador.
     */
    class ReembolsoDTO {
        constructor(data) {
            this.rutReembolso = data.rutReembolso;
            this.montoReembolso = data.montoReembolso;
            this.folioNC = data.folioNC;
            this.rutPrestador = data.rutPrestador;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.rutReembolso) {
                    nLog.error({ title: "Validación Fallida", details: "rutReembolso es requerido." });
                    return false;
                }
                if (!this.montoReembolso) {
                    nLog.error({ title: "Validación Fallida", details: "montoReembolso es requerido." });
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
                    rutReembolso: this.rutReembolso,
                    montoReembolso: this.montoReembolso,
                    folioNC: this.folioNC,
                    rutPrestador: this.rutPrestador
                };
            };
        }
    }

    return ReembolsoDTO;
});
