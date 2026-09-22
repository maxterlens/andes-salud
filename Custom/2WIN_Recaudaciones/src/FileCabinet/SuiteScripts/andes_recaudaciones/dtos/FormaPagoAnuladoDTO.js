/**
 * @module FormaPagoAnuladoDTO
 * @description Data Transfer Object para una forma de pago anulada.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias FormaPagoAnuladoDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.tipo - Tipo de pago ('Efectivo', 'TRC', 'TEF').
     * @param {string} data.folioTipoPago - Folio del tipo de pago.
     * @param {string} data.fechaDoc - Fecha del documento (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.montoPago - Monto del pago.
     * @param {string} data.rutPago - RUT del pagador.
     * @param {string} data.fechaVencimiento - Fecha de vencimiento (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.rutPrestador - RUT del prestador.
     * @param {string} data.numeroCuotas - Número de cuotas.
     * @param {string} data.tipoDocPago - Tipo de documento de pago.
     * @param {string} data.razonSocialDoc - Razón social del documento.
     * @param {string} data.folioDoc - Folio del documento.
     * @param {string} data.montoDoc - Monto del documento.
     */
    class FormaPagoAnuladoDTO {
        constructor(data) {
            this.tipo = data.tipo;
            this.folioTipoPago = data.folioTipoPago;
            this.fechaDoc = data.fechaDoc;
            this.montoPago = data.montoPago;
            this.rutPago = data.rutPago;
            this.fechaVencimiento = data.fechaVencimiento;
            this.rutPrestador = data.rutPrestador;
            this.numeroCuotas = data.numeroCuotas;
            this.tipoDocPago = data.tipoDocPago;
            this.razonSocialDoc = data.razonSocialDoc;
            this.folioDoc = data.folioDoc;
            this.montoDoc = data.montoDoc;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.tipo) {
                    nLog.error({ title: "Validación Fallida", details: "tipo de pago es requerido." });
                    return false;
                }
                if (!this.montoPago) {
                    nLog.error({ title: "Validación Fallida", details: "montoPago es requerido." });
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
                    tipo: this.tipo,
                    folioTipoPago: this.folioTipoPago,
                    fechaDoc: this.fechaDoc,
                    montoPago: this.montoPago,
                    rutPago: this.rutPago,
                    fechaVencimiento: this.fechaVencimiento,
                    rutPrestador: this.rutPrestador,
                    numeroCuotas: this.numeroCuotas,
                    tipoDocPago: this.tipoDocPago,
                    razonSocialDoc: this.razonSocialDoc,
                    folioDoc: this.folioDoc,
                    montoDoc: this.montoDoc
                };
            };
        }
    }

    return FormaPagoAnuladoDTO;
});
