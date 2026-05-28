/**
 * @module CargoCobradoAnticipoDTO
 * @description Data Transfer Object para un cargo cobrado como anticipo.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias CargoCobradoAnticipoDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.folioAnticipo - Folio del anticipo.
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     * @param {string} data.TipoAnticipo - Tipo de anticipo ('Emision' o 'Imputacion').
     */
    class CargoCobradoAnticipoDTO {
        constructor(data) {
            this.razonSocialCobro = data.razonSocialCobro;
            this.folioAnticipo = data.folioAnticipo;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;
            this.TipoAnticipo = data.TipoAnticipo;

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
                    folioAnticipo: this.folioAnticipo,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal,
                    TipoAnticipo: this.TipoAnticipo
                };
            };
        }
    }

    return CargoCobradoAnticipoDTO;
});
