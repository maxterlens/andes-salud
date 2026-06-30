/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dom_precargas
 */

define([
    'N/log',
    '../dao/2win_dao_search_all_subsidiarias',
    '../dao/2win_dao_search_all_ubicaciones',
    '../dao/2win_dao_search_all_tipos_dte',
    '../dao/2win_dao_search_all_cuentas_forma_pago',
    '../dao/2win_dao_search_all_parametros',
    '../dao/2win_dao_search_all_centros_costo',
    '../dao/2win_dao_search_all_tax_codes',
    '../dao/2win_dao_search_all_discounts'
],
    function (
        log,
        daoSearchAllSubsidiarias,
        daoSearchAllUbicaciones,
        daoSearchAllTiposDTE,
        daoSearchAllCuentasFormaPago,
        daoSearchAllParametros,
        daoSearchAllCentrosCosto,
        daoSearchAllTaxCodes,
        daoSearchAllDiscounts
    ) {

        function getAllSubsidiarias(){
            var resultados = daoSearchAllSubsidiarias.obtenerSubsidiarias();

            if(!resultados.success){
                log.error('getAllSubsidiarias', 'Error al obtener subsidiarias: ' + resultados.error);
                throw new Error('Error al obtener subsidiarias: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllSubsidiarias', 'No se encontraron subsidiarias.');
            }
            return resultados;
        }

        function getAllUbicaciones(){
            var resultados = daoSearchAllUbicaciones.obtenerUbicaciones();

            if(!resultados.success){
                log.error('getAllUbicaciones', 'Error al obtener ubicaciones: ' + resultados.error);
                throw new Error('Error al obtener ubicaciones: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllUbicaciones', 'No se encontraron ubicaciones.');
            }
            return resultados;
        }

        function getAllTiposDTE(){
            var resultados = daoSearchAllTiposDTE.obtenerTiposDTE();

            if(!resultados.success){
                log.error('getAllTiposDTE', 'Error al obtener tipos DTE: ' + resultados.error);
                throw new Error('Error al obtener tipos DTE: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllTiposDTE', 'No se encontraron tipos DTE.');
            }
            return resultados;
        }

        function getAllCuentasFormaPago(){
            var resultados = daoSearchAllCuentasFormaPago.obtenerCuentasFormaPago();

            if(!resultados.success){
                log.error('getAllCuentasFormaPago', 'Error al obtener cuentas por forma de pago: ' + resultados.error);
                throw new Error('Error al obtener cuentas por forma de pago: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllCuentasFormaPago', 'No se encontraron cuentas por forma de pago.');
            }
            return resultados;
        }

        function getAllParametros(){
            var resultados = daoSearchAllParametros.obtenerParametros();

            if(!resultados.success){
                log.error('getAllParametros', 'Error al obtener parámetros: ' + resultados.error);
                throw new Error('Error al obtener parámetros: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllParametros', 'No se encontraron parámetros.');
            }
            return resultados;
        }

        function getAllCentrosCosto(){
            var resultados = daoSearchAllCentrosCosto.obtenerCentrosCosto();

            if(!resultados.success){
                log.error('getAllCentrosCosto', 'Error al obtener centros de costo: ' + resultados.error);
                throw new Error('Error al obtener centros de costo: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllCentrosCosto', 'No se encontraron centros de costo.');
            }
            return resultados;
        }

        function getAllTaxCodes(){
            var resultados = daoSearchAllTaxCodes.obtenerTaxCodes();

            if(!resultados.success){
                log.error('getAllTaxCodes', 'Error al obtener tax codes: ' + resultados.error);
                throw new Error('Error al obtener tax codes: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllTaxCodes', 'No se encontraron tax codes.');
            }
            return resultados;
        }

        function getAllDiscounts(){
            var resultados = daoSearchAllDiscounts.obtenerDiscounts();

            if(!resultados.success){
                log.error('getAllDiscounts', 'Error al obtener descuentos: ' + resultados.error);
                throw new Error('Error al obtener descuentos: ' + resultados.error);
            } else if(resultados.result.length === 0){
                log.audit('getAllDiscounts', 'No se encontraron descuentos.');
            }
            return resultados;
        }

        return {
            getAllSubsidiarias: getAllSubsidiarias,
            getAllUbicaciones: getAllUbicaciones,
            getAllTiposDTE: getAllTiposDTE,
            getAllCuentasFormaPago: getAllCuentasFormaPago,
            getAllParametros: getAllParametros,
            getAllCentrosCosto: getAllCentrosCosto,
            getAllTaxCodes: getAllTaxCodes,
            getAllDiscounts: getAllDiscounts
        };
    }
)