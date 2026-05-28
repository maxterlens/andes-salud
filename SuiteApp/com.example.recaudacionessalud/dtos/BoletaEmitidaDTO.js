/**
 * @module BoletaEmitidaDTO
 * @description Data Transfer Object para una boleta emitida.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias BoletaEmitidaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.folioBoleta - Folio de la boleta.
     * @param {string} data.fechaEmision - Fecha de emisión de la boleta (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.anticipo - 'S' o 'N' si es anticipo.
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     * @param {string} data.tipoDocumento - Tipo de documento ('afecto' o 'exento').
     */
    class BoletaEmitidaDTO {
        constructor(data) {
            this.folioBoleta = data.folioBoleta;
            this.fechaEmision = data.fechaEmision;
            this.razonSocialCobro = data.razonSocialCobro;
            this.anticipo = data.anticipo;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;
            this.tipoDocumento = data.tipoDocumento;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.folioBoleta) {
                    nLog.error({ title: "Validación Fallida", details: "folioBoleta es requerido." });
                    return false;
                }
                if (!this.fechaEmision) {
                    nLog.error({ title: "Validación Fallida", details: "fechaEmision es requerida." });
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
                    folioBoleta: this.folioBoleta,
                    fechaEmision: this.fechaEmision,
                    razonSocialCobro: this.razonSocialCobro,
                    anticipo: this.anticipo,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal,
                    tipoDocumento: this.tipoDocumento
                };
            };
        }
    }

    return BoletaEmitidaDTO;
});
