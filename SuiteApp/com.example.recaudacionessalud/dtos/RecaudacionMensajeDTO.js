/**
 * @module RecaudacionMensajeDTO
 * @description Data Transfer Object para el mensaje de recaudación principal.
 */
define(["N/log"], function (nLog) {
    /**
     * @alias RecaudacionMensajeDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.tipoMensaje - Tipo de mensaje, ejemplo "SEND^RECAUDACION^CAJA".
     * @param {Array<Object>} data.cajas - Array de objetos CajaDTO.
     */
    class RecaudacionMensajeDTO {
        constructor(data) {
            this.tipoMensaje = data.tipoMensaje;
            this.cajas = data.cajas || [];

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.tipoMensaje) {
                    nLog.error({ title: "Validación Fallida", details: "tipoMensaje es requerido." });
                    return false;
                }
                if (!Array.isArray(this.cajas) || this.cajas.length === 0) {
                    nLog.error({ title: "Validación Fallida", details: "cajas es requerido y debe ser un array no vacío." });
                    return false;
                }
                for (let i = 0; i < this.cajas.length; i++) {
                    if (!this.cajas[i].isValid()) {
                        nLog.error({ title: "Validación Fallida", details: "CajaDTO en índice " + i + " no es válida." });
                        return false;
                    }
                }
                return true;
            };

            /**
             * Convierte el DTO a un objeto plano.
             * @returns {Object} Objeto plano con los datos del DTO.
             */
            this.toObject = function () {
                return {
                    tipoMensaje: this.tipoMensaje,
                    cajas: this.cajas.map(function (caja) {
                        return caja.toObject();
                    })
                };
            };
        }
    }

    return RecaudacionMensajeDTO;
});
