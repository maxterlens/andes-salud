/**
 * @module DetalleIngresoAnuladoDTO
 * @description Data Transfer Object para un detalle de ingreso anulado.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias DetalleIngresoAnuladoDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.codigoIngreso - Código del ingreso anulado.
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     * @param {string} data.afectoBoleta - 'S' o 'N' si está afecto a boleta.
     */
    class DetalleIngresoAnuladoDTO {
        constructor(data) {
            this.codigoIngreso = data.codigoIngreso;
            this.razonSocialCobro = data.razonSocialCobro;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;
            this.afectoBoleta = data.afectoBoleta;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.codigoIngreso) {
                    nLog.error({ title: "Validación Fallida", details: "codigoIngreso es requerido." });
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
                    codigoIngreso: this.codigoIngreso,
                    razonSocialCobro: this.razonSocialCobro,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal,
                    afectoBoleta: this.afectoBoleta
                };
            };
        }
    }

    return DetalleIngresoAnuladoDTO;
});
