/**
 * @module MovimientoCajaDTO
 * @description Data Transfer Object para un movimiento de caja.
 */
define([
    "N/log",
    "./BoletaEmitidaDTO",
    "./NcEmitidaDTO",
    "./BonoEmitidoDTO",
    "./BonoAnuladoDTO",
    "./CoberturaEmitidaDTO",
    "./DetalleEgresoDTO",
    "./DetalleEgresoAnuladoDTO",
    "./DetalleIngresoDTO",
    "./DetalleIngresoAnuladoDTO",
    "./CargoCobradoBoletaDTO",
    "./CargoCobradoBonosDTO",
    "./CargoCobradoAnticipoDTO",
    "./FormaPagoDTO",
    "./FormaPagoAnuladoDTO",
    "./ReembolsoDTO",
    "./PagoRelacionadaDTO",
    "./CierreCajaDTO"
], function(
    nLog,
    BoletaEmitidaDTO,
    NcEmitidaDTO,
    BonoEmitidoDTO,
    BonoAnuladoDTO,
    CoberturaEmitidaDTO,
    DetalleEgresoDTO,
    DetalleEgresoAnuladoDTO,
    DetalleIngresoDTO,
    DetalleIngresoAnuladoDTO,
    CargoCobradoBoletaDTO,
    CargoCobradoBonosDTO,
    CargoCobradoAnticipoDTO,
    FormaPagoDTO,
    FormaPagoAnuladoDTO,
    ReembolsoDTO,
    PagoRelacionadaDTO,
    CierreCajaDTO
) {

    /**
     * @alias MovimientoCajaDTO
     * @class
     * @param {Object} data - Objeto con los datos para inicializar el DTO.
     * @param {string} data.numeroMovimiento - Número de movimiento.
     * @param {string} data.IdPaciente - ID del paciente.
     * @param {string} data.Ficha - Ficha del paciente.
     * @param {string} data.Ingreso - Ingreso.
     * @param {string} data.prefactura - Prefactura.
     * @param {string} data.CuentaPaciente - Cuenta del paciente.
     * @param {string} data.MovimientoAnulado - 'S' o 'N' si el movimiento fue anulado.
     * @param {Array<Object>} data.boletasEmitidas - Array de BoletaEmitidaDTO.
     * @param {Array<Object>} data.NCEmitidas - Array de NcEmitidaDTO.
     * @param {Array<Object>} data.bonosEmitidos - Array de BonoEmitidoDTO.
     * @param {Array<Object>} data.bonosAnulados - Array de BonoAnuladoDTO.
     * @param {Array<Object>} data.coberturasEmitidas - Array de CoberturaEmitidaDTO.
     * @param {Array<Object>} data.detalleEgresos - Array de DetalleEgresoDTO.
     * @param {Array<Object>} data.detalleEgresosAnulados - Array de DetalleEgresoAnuladoDTO.
     * @param {Array<Object>} data.detalleIngresos - Array de DetalleIngresoDTO.
     * @param {Array<Object>} data.detalleIngresosAnulados - Array de DetalleIngresoAnuladoDTO.
     * @param {Array<Object>} data.cargosCobradosBoleta - Array de CargoCobradoBoletaDTO.
     * @param {Array<Object>} data.cargosCobradosBonos - Array de CargoCobradoBonosDTO.
     * @param {Array<Object>} data.cargosCobradosAnticipo - Array de CargoCobradoAnticipoDTO.
     * @param {Array<Object>} data.formaPago - Array de FormaPagoDTO.
     * @param {Array<Object>} data.formaPagoAnulado - Array de FormaPagoAnuladoDTO.
     * @param {Array<Object>} data.reembolso - Array de ReembolsoDTO.
     * @param {Array<Object>} data.pagosRelacionadas - Array de PagoRelacionadaDTO.
     * @param {Array<Object>} data.cierreCaja - Array de CierreCajaDTO.
     */
    class MovimientoCajaDTO {
        constructor(data) {
            this.numeroMovimiento = data.numeroMovimiento;
            this.IdPaciente = data.IdPaciente;
            this.Ficha = data.Ficha;
            this.Ingreso = data.Ingreso;
            this.prefactura = data.prefactura;
            this.CuentaPaciente = data.CuentaPaciente;
            this.MovimientoAnulado = data.MovimientoAnulado;

            this.boletasEmitidas = (data.boletasEmitidas || []).map(function (item) { return new BoletaEmitidaDTO(item); });
            this.NCEmitidas = (data.NCEmitidas || []).map(function (item) { return new NcEmitidaDTO(item); });
            this.bonosEmitidos = (data.bonosEmitidos || []).map(function (item) { return new BonoEmitidoDTO(item); });
            this.bonosAnulados = (data.bonosAnulados || []).map(function (item) { return new BonoAnuladoDTO(item); });
            this.coberturasEmitidas = (data.coberturasEmitidas || []).map(function (item) { return new CoberturaEmitidaDTO(item); });
            this.detalleEgresos = (data.detalleEgresos || []).map(function (item) { return new DetalleEgresoDTO(item); });
            this.detalleEgresosAnulados = (data.detalleEgresosAnulados || []).map(function (item) { return new DetalleEgresoAnuladoDTO(item); });
            this.detalleIngresos = (data.detalleIngresos || []).map(function (item) { return new DetalleIngresoDTO(item); });
            this.detalleIngresosAnulados = (data.detalleIngresosAnulados || []).map(function (item) { return new DetalleIngresoAnuladoDTO(item); });
            this.cargosCobradosBoleta = (data.cargosCobradosBoleta || []).map(function (item) { return new CargoCobradoBoletaDTO(item); });
            this.cargosCobradosBonos = (data.cargosCobradosBonos || []).map(function (item) { return new CargoCobradoBonosDTO(item); });
            this.cargosCobradosAnticipo = (data.cargosCobradosAnticipo || []).map(function (item) { return new CargoCobradoAnticipoDTO(item); });
            this.formaPago = (data.formaPago || []).map(function (item) { return new FormaPagoDTO(item); });
            this.formaPagoAnulado = (data.formaPagoAnulado || []).map(function (item) { return new FormaPagoAnuladoDTO(item); });
            this.reembolso = (data.reembolso || []).map(function (item) { return new ReembolsoDTO(item); });
            this.pagosRelacionadas = (data.pagosRelacionadas || []).map(function (item) { return new PagoRelacionadaDTO(item); });
            this.cierreCaja = (data.cierreCaja || []).map(function (item) { return new CierreCajaDTO(item); });

            /**
             * Valida que los datos del DTO sean correctos.
             * @returns {boolean} True si es válido, False en caso contrario.
             */
            this.isValid = function () {
                if (!this.numeroMovimiento) {
                    nLog.error({ title: "Validación Fallida", details: "numeroMovimiento es requerido." });
                    return false;
                }
                if (!this.IdPaciente) {
                    nLog.error({ title: "Validación Fallida", details: "IdPaciente es requerido." });
                    return false;
                }
                // Agrega validaciones para los sub-DTOs si es necesario
                return true;
            };

            /**
             * Convierte el DTO a un objeto plano.
             * @returns {Object} Objeto plano con los datos del DTO.
             */
            this.toObject = function () {
                return {
                    numeroMovimiento: this.numeroMovimiento,
                    IdPaciente: this.IdPaciente,
                    Ficha: this.Ficha,
                    Ingreso: this.Ingreso,
                    prefactura: this.prefactura,
                    CuentaPaciente: this.CuentaPaciente,
                    MovimientoAnulado: this.MovimientoAnulado,
                    boletasEmitidas: this.boletasEmitidas.map(function (item) { return item.toObject(); }),
                    NCEmitidas: this.NCEmitidas.map(function (item) { return item.toObject(); }),
                    bonosEmitidos: this.bonosEmitidos.map(function (item) { return item.toObject(); }),
                    bonosAnulados: this.bonosAnulados.map(function (item) { return item.toObject(); }),
                    coberturasEmitidas: this.coberturasEmitidas.map(function (item) { return item.toObject(); }),
                    detalleEgresos: this.detalleEgresos.map(function (item) { return item.toObject(); }),
                    detalleEgresosAnulados: this.detalleEgresosAnulados.map(function (item) { return item.toObject(); }),
                    detalleIngresos: this.detalleIngresos.map(function (item) { return item.toObject(); }),
                    detalleIngresosAnulados: this.detalleIngresosAnulados.map(function (item) { return item.toObject(); }),
                    cargosCobradosBoleta: this.cargosCobradosBoleta.map(function (item) { return item.toObject(); }),
                    cargosCobradosBonos: this.cargosCobradosBonos.map(function (item) { return item.toObject(); }),
                    cargosCobradosAnticipo: this.cargosCobradosAnticipo.map(function (item) { return item.toObject(); }),
                    formaPago: this.formaPago.map(function (item) { return item.toObject(); }),
                    formaPagoAnulado: this.formaPagoAnulado.map(function (item) { return item.toObject(); }),
                    reembolso: this.reembolso.map(function (item) { return item.toObject(); }),
                    pagosRelacionadas: this.pagosRelacionadas.map(function (item) { return item.toObject(); }),
                    cierreCaja: this.cierreCaja.map(function (item) { return item.toObject(); })
                };
            };
        }
    }

    return MovimientoCajaDTO;
});
