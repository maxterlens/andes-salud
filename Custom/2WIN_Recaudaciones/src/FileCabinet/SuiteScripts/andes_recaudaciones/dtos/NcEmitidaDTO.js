/**
 * @module NcEmitidaDTO
 * @description Data Transfer Object para una nota de crédito emitida.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias NcEmitidaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.folioNC - Folio de la nota de crédito.
     * @param {string} data.rutReceptor - RUT del receptor.
     * @param {string} data.tipoDocRef - Tipo de documento de referencia.
     * @param {string} data.folioRef - Folio de referencia.
     * @param {string} data.fechaRef - Fecha de referencia (YYYYMMDD).
     * @param {string} data.codRef - Código de referencia.
     * @param {string} data.fechaEmision - Fecha de emisión (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.anticipo - 'S' o 'N' si es anticipo.
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     */
    class NcEmitidaDTO {
        constructor(data) {
            this.folioNC = data.folioNC;
            this.rutReceptor = data.rutReceptor;
            this.tipoDocRef = data.tipoDocRef;
            this.folioRef = data.folioRef;
            this.fechaRef = data.fechaRef;
            this.codRef = data.codRef;
            this.fechaEmision = data.fechaEmision;
            this.razonSocialCobro = data.razonSocialCobro;
            this.anticipo = data.anticipo;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.folioNC) {
                    nLog.error({ title: "Validación Fallida", details: "folioNC es requerido." });
                    return false;
                }
                if (!this.rutReceptor) {
                    nLog.error({ title: "Validación Fallida", details: "rutReceptor es requerido." });
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
                    folioNC: this.folioNC,
                    rutReceptor: this.rutReceptor,
                    tipoDocRef: this.tipoDocRef,
                    folioRef: this.folioRef,
                    fechaRef: this.fechaRef,
                    codRef: this.codRef,
                    fechaEmision: this.fechaEmision,
                    razonSocialCobro: this.razonSocialCobro,
                    anticipo: this.anticipo,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal
                };
            };
        }
    }

    return NcEmitidaDTO;
});
