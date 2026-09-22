/**
 * @module EncabezadoCajaDTO
 * @description Data Transfer Object para el encabezado de la caja.
 */
define(["N/log"], function(nLog) {

    /**
     * @alias EncabezadoCajaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.unidadCaja - Unidad de la caja.
     * @param {string} data.fechaCaja - Fecha de la caja (YYYY-MM-DD HH:MM:SS.0).
     * @param {string} data.aperturaCaja - Indicador de apertura de caja.
     * @param {string} data.razonSocialCaja - Razón social de la caja.
     */
    class EncabezadoCajaDTO {
        constructor(data) {
            this.unidadCaja = data.unidadCaja;
            this.fechaCaja = data.fechaCaja;
            this.aperturaCaja = data.aperturaCaja;
            this.razonSocialCaja = data.razonSocialCaja;

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.unidadCaja) {
                    nLog.error({ title: "Validación Fallida", details: "unidadCaja es requerida." });
                    return false;
                }
                if (!this.fechaCaja) {
                    nLog.error({ title: "Validación Fallida", details: "fechaCaja es requerida." });
                    return false;
                }
                if (!this.aperturaCaja) {
                    nLog.error({ title: "Validación Fallida", details: "aperturaCaja es requerida." });
                    return false;
                }
                if (!this.razonSocialCaja) {
                    nLog.error({ title: "Validación Fallida", details: "razonSocialCaja es requerida." });
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
                    unidadCaja: this.unidadCaja,
                    fechaCaja: this.fechaCaja,
                    aperturaCaja: this.aperturaCaja,
                    razonSocialCaja: this.razonSocialCaja
                };
            };
        }
    }

    return EncabezadoCajaDTO;
});
