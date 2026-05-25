/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 */
define(['N/log', 'N/cache', '../domain/2win_dom_precargas'], function(log, cache, domPrecargas) {

    function execute(context) {
        try{
            log.audit('CACHE_WARMUP', 'Iniciando pre-carga de caché');

            // 1. Pre-cargar TODAS las subsidiarias
            preloadSubsidiarias();

            // 2. Pre-cargar TODAS las ubicaciones
            preloadUbicaciones();

            // 3. Pre-cargar TODOS los tipos DTE
            preloadTiposDTE();

            // 4. Pre-cargar TODOS los parámetros (incluye item de descuento)
            preloadParametros();

            // 5. Pre-cargar centros de costo
            preloadCentrosCosto();

            // 6. Pre-cargar cuentas por forma de pago
            preloadCuentasFormaPago();

            // 7. Pre-cargar tax codes
            preloadTaxCodes();

            // 8. Pre-cargar descuentos
            preloadDiscounts();

            // // 9. Pre-cargar clientes frecuentes (opcional - comentado por ahora)
            // preloadClientesFrecuentes();

            log.audit('CACHE_WARMUP', 'Pre-carga completada');
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error en pre-carga de caché: ' + e.message);
        }
    }

    return { execute: execute };

    function preloadSubsidiarias() {
        try {
            var subsidiarias = domPrecargas.getAllSubsidiarias();

            if(subsidiarias.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron subsidiarias para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'SUBSIDIARIAS_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_SUBSIDIARIAS',
                value: JSON.stringify(subsidiarias.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Subsidiarias pre-cargadas: ' + subsidiarias.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando subsidiarias: ' + e.message);
        }
    }

    function preloadUbicaciones() {
        try {
            var ubicaciones = domPrecargas.getAllUbicaciones();

            if(ubicaciones.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron ubicaciones para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'UBICACIONES_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_UBICACIONES',
                value: JSON.stringify(ubicaciones.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Ubicaciones pre-cargadas: ' + ubicaciones.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando ubicaciones: ' + e.message);
        }
    }

    function preloadTiposDTE() {
        try {
            var tiposDTE = domPrecargas.getAllTiposDTE();

            if(tiposDTE.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron tipos DTE para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'TIPOS_DTE_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_TIPOS_DTE',
                value: JSON.stringify(tiposDTE.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Tipos DTE pre-cargados: ' + tiposDTE.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando tipos DTE: ' + e.message);
        }
    }

    function preloadParametros() {
        try {
            var parametros = domPrecargas.getAllParametros();

            if(parametros.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron parámetros para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'PARAMETROS_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_PARAMETROS',
                value: JSON.stringify(parametros.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Parámetros pre-cargados: ' + parametros.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando parámetros: ' + e.message);
        }
    }

    function preloadCentrosCosto() {
        try {
            var centrosCosto = domPrecargas.getAllCentrosCosto();

            if(centrosCosto.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron centros de costo para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'CENTROS_COSTO_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_CENTROS_COSTO',
                value: JSON.stringify(centrosCosto.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Centros de costo pre-cargados: ' + centrosCosto.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando centros de costo: ' + e.message);
        }
    }

    function preloadCuentasFormaPago() {
        try {
            var cuentas = domPrecargas.getAllCuentasFormaPago();

            if(cuentas.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron cuentas por forma de pago para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'CUENTAS_FORMA_PAGO_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_CUENTAS_FORMA_PAGO',
                value: JSON.stringify(cuentas.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Cuentas por forma de pago pre-cargadas: ' + cuentas.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando cuentas por forma de pago: ' + e.message);
        }
    }

    function preloadTaxCodes() {
        try {
            var taxCodes = domPrecargas.getAllTaxCodes();

            if(taxCodes.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron tax codes para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'TAX_CODES_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_TAX_CODES',
                value: JSON.stringify(taxCodes.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Tax codes pre-cargados: ' + taxCodes.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando tax codes: ' + e.message);
        }
    }

    function preloadDiscounts() {
        try {
            var discounts = domPrecargas.getAllDiscounts();

            if(discounts.result.length === 0){
                log.audit('CACHE_WARMUP', 'No se encontraron descuentos para pre-cargar');
                return;
            }

            var cacheObj = cache.getCache({ name: 'DISCOUNTS_POS_FARMACIA', scope: cache.Scope.PROTECTED });
            cacheObj.put({
                key: 'ALL_DISCOUNTS',
                value: JSON.stringify(discounts.result),
                ttl: 1200 //15 Min. //86400 // 24 horas
            });

            log.audit('CACHE_WARMUP', 'Descuentos pre-cargados: ' + discounts.result.length);
        } catch (e) {
            log.error('CACHE_WARMUP', 'Error pre-cargando descuentos: ' + e.message);
        }
    }

    // Función comentada - descomentar cuando se necesite
    // function preloadClientesFrecuentes() {
    //     try {
    //         var clientes = domPrecargas.getAllClientesFrecuentes();
    //
    //         if(clientes.result.length === 0){
    //             log.audit('CACHE_WARMUP', 'No se encontraron clientes frecuentes para pre-cargar');
    //             return;
    //         }
    //
    //         var cacheObj = cache.getCache({ name: 'CLIENTES_FRECUENTES_POS_FARMACIA', scope: cache.Scope.PROTECTED });
    //         cacheObj.put({
    //             key: 'ALL_CLIENTES_FRECUENTES',
    //             value: JSON.stringify(clientes.result),
    //             ttl: 300 // 5 minutos - //86400 // 24 horas
    //         });
    //
    //         log.audit('CACHE_WARMUP', 'Clientes frecuentes pre-cargados: ' + clientes.result.length);
    //     } catch (e) {
    //         log.error('CACHE_WARMUP', 'Error pre-cargando clientes frecuentes: ' + e.message);
    //     }
    // }

});
