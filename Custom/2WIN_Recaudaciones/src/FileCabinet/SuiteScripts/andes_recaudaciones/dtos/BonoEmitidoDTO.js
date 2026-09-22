/**
 * @module BonoEmitidoDTO
 * @description Data Transfer Object para un bono emitido.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias BonoEmitidoDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.folioBono - Folio del bono.
     * @param {string} data.razonSocialCobro - Razón social de cobro.
     * @param {string} data.montoNeto - Monto neto.
     * @param {string} data.montoExento - Monto exento.
     * @param {string} data.montoIva - Monto IVA.
     * @param {string} data.montoTotal - Monto total.
     * @param {string} data.copagoBono - Copago del bono.
     * @param {string} data.copagoCobrado - 'S' o 'N' si el copago fue cobrado.
     * @param {string} data.bonifAdicional - Bonificación adicional.
     * @param {string} data.bonifRelacionada - 'S' o 'N' si es bonificación relacionada.
     * @param {string} data.fechaEmision - Fecha de emisión (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.rutPrevisión - RUT de previsión.
     * @param {string} data.tipoBono - Tipo de bono ('imed' o 'físico').
     * @param {string} data.rutEntidadFacturar - RUT de la entidad a facturar.
     */
    class BonoEmitidoDTO {
        constructor(data) {
            this.folioBono = data.folioBono;
            this.razonSocialCobro = data.razonSocialCobro;
            this.montoNeto = data.montoNeto;
            this.montoExento = data.montoExento;
            this.montoIva = data.montoIva;
            this.montoTotal = data.montoTotal;
            this.copagoBono = data.copagoBono;
            this.copagoCobrado = data.copagoCobrado;
            this.bonifAdicional = data.bonifAdicional;
            this.bonifRelacionada = data.bonifRelacionada;
            this.fechaEmision = data.fechaEmision;
            this.rutPrevisión = data.rutPrevisión;
            this.tipoBono = data.tipoBono;
            this.rutEntidadFacturar = data.rutEntidadFacturar;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.folioBono) {
                    nLog.error({ title: "Validación Fallida", details: "folioBono es requerido." });
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
                    folioBono: this.folioBono,
                    razonSocialCobro: this.razonSocialCobro,
                    montoNeto: this.montoNeto,
                    montoExento: this.montoExento,
                    montoIva: this.montoIva,
                    montoTotal: this.montoTotal,
                    copagoBono: this.copagoBono,
                    copagoCobrado: this.copagoCobrado,
                    bonifAdicional: this.bonifAdicional,
                    bonifRelacionada: this.bonifRelacionada,
                    fechaEmision: this.fechaEmision,
                    rutPrevisión: this.rutPrevisión,
                    tipoBono: this.tipoBono,
                    rutEntidadFacturar: this.rutEntidadFacturar
                };
            };
        }
    }

    return BonoEmitidoDTO;
});
