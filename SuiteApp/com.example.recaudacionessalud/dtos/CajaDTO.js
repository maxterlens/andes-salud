/**
 * @module CajaDTO
 * @description Data Transfer Object para la información de una caja.
 */
define(["N/log", "./EncabezadoCajaDTO", "./MovimientoCajaDTO"], function(nLog, EncabezadoCajaDTO, MovimientoCajaDTO) {

    /**
     * @alias CajaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {Object} data.encabezado - Objeto EncabezadoCajaDTO.
     * @param {Array<Object>} data.detalle - Array de objetos MovimientoCajaDTO.
     */
    class CajaDTO {
        constructor(data) {
            this.encabezado = new EncabezadoCajaDTO(data.encabezado);
            this.detalle = (data.detalle || []).map(function (movimiento) {
                return new MovimientoCajaDTO(movimiento);
            });

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.encabezado || !this.encabezado.isValid()) {
                    nLog.error({ title: "Validación Fallida", details: "Encabezado de caja es requerido y debe ser válido." });
                    return false;
                }
                if (!Array.isArray(this.detalle) || this.detalle.length === 0) {
                    nLog.error({ title: "Validación Fallida", details: "Detalle de caja es requerido y debe ser un array no vacío." });
                    return false;
                }
                for (let i = 0; i < this.detalle.length; i++) {
                    if (!this.detalle[i].isValid()) {
                        nLog.error({ title: "Validación Fallida", details: `MovimientoCajaDTO en índice ${  i  } no es válido.` });
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
                    encabezado: this.encabezado.toObject(),
                    detalle: this.detalle.map(function (movimiento) {
                        return movimiento.toObject();
                    })
                };
            };
        }
    }

    return CajaDTO;
});
