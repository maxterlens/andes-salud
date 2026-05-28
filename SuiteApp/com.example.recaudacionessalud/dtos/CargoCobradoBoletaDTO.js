/**
 * @module CargoCobradoBoletaDTO
 * @description Data Transfer Object para un cargo cobrado en boleta.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias CargoCobradoBoletaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     */
    class CargoCobradoBoletaDTO {
        constructor(data) {
            this.razonSocialCobro = data.razonSocialCobro;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.razonSocialCobro) {
                    nLog.error({ title: "Validación Fallida", details: "razonSocialCobro es requerido." });
                    return false;
                }
                if (!this.montoTotal) {
                    nLog.error({ title: "Validación Fallida", details: "montoTotal es requerido." });
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
                    razonSocialCobro: this.razonSocialCobro,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal
                };
            };
        }
    }

    return CargoCobradoBoletaDTO;
});
