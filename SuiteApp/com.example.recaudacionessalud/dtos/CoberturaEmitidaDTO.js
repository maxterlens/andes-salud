/**
 * @module CoberturaEmitidaDTO
 * @description Data Transfer Object para una cobertura emitida.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias CoberturaEmitidaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {number} data.folio - Folio de la cobertura.
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.fechaEmision - Fecha de emisión (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     * @param {number} data.rutFinanciador - RUT del financiador.
     * @param {string} data.tipoFinanciador - Tipo de financiador ('Soap', 'Seguro' o 'Convenio').
     * @param {string} data.coberturaAnulada - 'S' o 'N' si la cobertura fue anulada.
     */
    class CoberturaEmitidaDTO {
        constructor(data) {
            this.folio = data.folio;
            this.razonSocialCobro = data.razonSocialCobro;
            this.fechaEmision = data.fechaEmision;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;
            this.rutFinanciador = data.rutFinanciador;
            this.tipoFinanciador = data.tipoFinanciador;
            this.coberturaAnulada = data.coberturaAnulada;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.folio) {
                    nLog.error({ title: "Validación Fallida", details: "folio es requerido." });
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
                    folio: this.folio,
                    razonSocialCobro: this.razonSocialCobro,
                    fechaEmision: this.fechaEmision,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal,
                    rutFinanciador: this.rutFinanciador,
                    tipoFinanciador: this.tipoFinanciador,
                    coberturaAnulada: this.coberturaAnulada
                };
            };
        }
    }

    return CoberturaEmitidaDTO;
});
