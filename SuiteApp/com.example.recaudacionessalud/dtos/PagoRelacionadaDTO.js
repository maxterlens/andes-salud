/**
 * @module PagoRelacionadaDTO
 * @description Data Transfer Object para un pago relacionado.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias PagoRelacionadaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.rutRelacionada - RUT de la entidad relacionada.
     * @param {string} data.montoRelacionada - Monto relacionado.
     * @param {string} data.tipoDocumento - Tipo de documento ('Boleta', 'Copago', 'Otros').
     * @param {string} data.folioDocumento - Folio del documento.
     */
    class PagoRelacionadaDTO {
        constructor(data) {
            this.rutRelacionada = data.rutRelacionada;
            this.montoRelacionada = data.montoRelacionada;
            this.tipoDocumento = data.tipoDocumento;
            this.folioDocumento = data.folioDocumento;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.rutRelacionada) {
                    nLog.error({ title: "Validación Fallida", details: "rutRelacionada es requerido." });
                    return false;
                }
                if (!this.montoRelacionada) {
                    nLog.error({ title: "Validación Fallida", details: "montoRelacionada es requerido." });
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
                    rutRelacionada: this.rutRelacionada,
                    montoRelacionada: this.montoRelacionada,
                    tipoDocumento: this.tipoDocumento,
                    folioDocumento: this.folioDocumento
                };
            };
        }
    }

    return PagoRelacionadaDTO;
});
