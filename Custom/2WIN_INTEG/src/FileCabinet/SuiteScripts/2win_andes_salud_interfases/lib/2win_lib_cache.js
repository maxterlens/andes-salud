/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_lib_cache
 * @description Librería para obtener datos desde caché de NetSuite
 */
define(['N/cache', 'N/log'], function (cache, log) {

    /**
     * Configuración de los cachés disponibles
     * Cada entrada define: nombre del caché, key y campo de filtro por defecto
     */
    var CACHE_CONFIG = {
        'SUBSIDIARIAS': {
            cacheName: 'SUBSIDIARIAS_POS_FARMACIA',
            cacheKey: 'ALL_SUBSIDIARIAS',
            filterField: 'rut_subsidiaria',
            resultField: 'internal_id'
        },
        'UBICACIONES': {
            cacheName: 'UBICACIONES_POS_FARMACIA',
            cacheKey: 'ALL_UBICACIONES',
            filterField: 'codigo_ubicacion',
            resultField: 'internal_id'
        },
        'TIPOS_DTE': {
            cacheName: 'TIPOS_DTE_POS_FARMACIA',
            cacheKey: 'ALL_TIPOS_DTE',
            filterField: 'codigo_dte',
            resultField: 'internal_id'
        },
        'PARAMETROS': {
            cacheName: 'PARAMETROS_POS_FARMACIA',
            cacheKey: 'ALL_PARAMETROS',
            filterField: 'name',
            resultField: null // Retorna el objeto completo
        },
        'CENTROS_COSTO': {
            cacheName: 'CENTROS_COSTO_POS_FARMACIA',
            cacheKey: 'ALL_CENTROS_COSTO',
            filterField: 'name', // Se usa 'name' como identificador del centro de costo
            resultField: 'internal_id'
        },
        'CUENTAS_FORMA_PAGO': {
            cacheName: 'CUENTAS_FORMA_PAGO_POS_FARMACIA',
            cacheKey: 'ALL_CUENTAS_FORMA_PAGO',
            filterField: 'forma_pago_nombre',
            resultField: null // Retorna el objeto completo
        },
        'TAX_CODES': {
            cacheName: 'TAX_CODES_POS_FARMACIA',
            cacheKey: 'ALL_TAX_CODES',
            filterField: 'name',
            resultField: 'internal_id'
        },
        'DISCOUNTS': {
            cacheName: 'DISCOUNTS_POS_FARMACIA',
            cacheKey: 'ALL_DISCOUNTS',
            filterField: 'discount_rate',
            resultField: null // Retorna el objeto completo
        }
    };

    /**
     * @description Obtiene todos los registros de un caché específico
     * @param {string} cacheType - Tipo de caché (SUBSIDIARIAS, UBICACIONES, TIPOS_DTE, PARAMETROS, CENTROS_COSTO, CUENTAS_FORMA_PAGO)
     * @returns {Object} - { success: boolean, result: Array, error: string }
     */
    function getAll(cacheType) {
        try {
            var config = CACHE_CONFIG[cacheType];

            if (!config) {
                return {
                    success: false,
                    error: 'Tipo de caché no válido: ' + cacheType + '. Tipos válidos: ' + Object.keys(CACHE_CONFIG).join(', ')
                };
            }

            var cacheObj = cache.getCache({
                name: config.cacheName,
                scope: cache.Scope.PROTECTED
            });

            var cachedData = cacheObj.get({ key: config.cacheKey });

            if (!cachedData) {
                return {
                    success: false,
                    error: 'Caché no disponible para: ' + cacheType + '. Ejecute el scheduled script de precarga.'
                };
            }

            var parsedData = JSON.parse(cachedData);

            log.audit('lib_cache.getAll', 'Obtenido ' + parsedData.length + ' registros desde caché ' + cacheType);

            return {
                success: true,
                result: parsedData
            };

        } catch (error) {
            log.error('lib_cache.getAll', 'Error obteniendo caché ' + cacheType + ': ' + error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * @description Busca un registro específico en el caché usando el campo de filtro por defecto
     * @param {string} cacheType - Tipo de caché (SUBSIDIARIAS, UBICACIONES, TIPOS_DTE, PARAMETROS, CENTROS_COSTO, CUENTAS_FORMA_PAGO)
     * @param {string} filterValue - Valor a buscar
     * @returns {Object} - { success: boolean, result: any, error: string }
     */
    function getByFilter(cacheType, filterValue) {
        try {
            var config = CACHE_CONFIG[cacheType];

            if (!config) {
                return {
                    success: false,
                    error: 'Tipo de caché no válido: ' + cacheType
                };
            }

            var allData = getAll(cacheType);

            if (!allData.success) {
                return allData;
            }

            var dataList = allData.result;
            var foundItem = null;

            for (var i = 0; i < dataList.length; i++) {
                if (dataList[i][config.filterField] === filterValue) {
                    foundItem = dataList[i];
                    break;
                }
            }

            if (!foundItem) {
                return {
                    success: false,
                    error: 'No se encontró registro en ' + cacheType + ' con ' + config.filterField + ' = ' + filterValue
                };
            }

            // Si hay un campo de resultado específico, retornar solo ese valor
            if (config.resultField) {

                log.audit('lib_cache.getByFilter', 'Encontrado en caché ' + cacheType + ': ' + filterValue + ' -> ' + foundItem[config.resultField]);
                return {
                    success: true,
                    result: foundItem[config.resultField]
                };
            }

            // Si no, retornar el objeto completo
            log.audit('lib_cache.getByFilter', 'Encontrado en caché ' + cacheType + ': ' + filterValue);
            return {
                success: true,
                result: foundItem
            };

        } catch (error) {
            log.error('lib_cache.getByFilter', 'Error buscando en caché ' + cacheType + ': ' + error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * @description Busca un registro específico en el caché usando un campo personalizado
     * @param {string} cacheType - Tipo de caché
     * @param {string} fieldName - Nombre del campo a filtrar
     * @param {string} fieldValue - Valor a buscar
     * @param {string} [returnField] - Campo específico a retornar (opcional, si no se especifica retorna el objeto completo)
     * @returns {Object} - { success: boolean, result: any, error: string }
     */
    function getByCustomFilter(cacheType, fieldName, fieldValue, returnField) {
        try {
            var allData = getAll(cacheType);

            if (!allData.success) {
                return allData;
            }

            var dataList = allData.result;
            var foundItem = null;

            for (var i = 0; i < dataList.length; i++) {
                if (dataList[i][fieldName] === fieldValue) {
                    foundItem = dataList[i];
                    break;
                }
            }

            if (!foundItem) {
                return {
                    success: false,
                    error: 'No se encontró registro en ' + cacheType + ' con ' + fieldName + ' = ' + fieldValue
                };
            }

            // Si se especifica un campo de retorno, devolver solo ese valor
            if (returnField) {
                if (foundItem.hasOwnProperty(returnField)) {
                    log.audit('lib_cache.getByCustomFilter', 'Encontrado en caché ' + cacheType + ': ' + fieldName + ' = ' + fieldValue + ' -> ' + foundItem[returnField]);
                    return {
                        success: true,
                        result: foundItem[returnField]
                    };
                } else {
                    return {
                        success: false,
                        error: 'El campo ' + returnField + ' no existe en el registro encontrado'
                    };
                }
            }

            // Si no, retornar el objeto completo
            log.audit('lib_cache.getByCustomFilter', 'Encontrado en caché ' + cacheType + ': ' + fieldName + ' = ' + fieldValue);
            return {
                success: true,
                result: foundItem
            };

        } catch (error) {
            log.error('lib_cache.getByCustomFilter', 'Error buscando en caché ' + cacheType + ': ' + error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * @description Obtiene el ID interno de una subsidiaria por su RUT
     * @param {string} rutSubsidiaria - RUT de la subsidiaria (formato: 12345678-9)
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getSubsidiariaByRut(rutSubsidiaria) {
        log.audit('lib_cache.getSubsidiariaByRut', 'Buscando subsidiaria por RUT: ' + rutSubsidiaria);
        return getByFilter('SUBSIDIARIAS', rutSubsidiaria);
    }

    /**
     * @description Obtiene el ID interno de una ubicación por su código
     * @param {string} codigoUbicacion - Código de la ubicación
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getUbicacionByCodigo(codigoUbicacion) {
        log.audit('lib_cache.getUbicacionByCodigo', 'Buscando ubicación por código: ' + codigoUbicacion);
        return getByFilter('UBICACIONES', codigoUbicacion);
    }

    /**
     * @description Obtiene el registro completo de una ubicación por su código (incluye centro de costo)
     * @param {string} codigoUbicacion - Código de la ubicación
     * @returns {Object} - { success: boolean, result: Object, error: string }
     */
    function getUbicacionCompletaByCodigo(codigoUbicacion) {
        log.audit('lib_cache.getUbicacionCompletaByCodigo', 'Buscando ubicación completa por código: ' + codigoUbicacion);
        return getByCustomFilter('UBICACIONES', 'codigo_ubicacion', codigoUbicacion, null);
    }

    /**
     * @description Obtiene el ID interno de un tipo DTE por su código
     * @param {string} codigoDTE - Código del tipo DTE
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getTipoDTEByCodigo(codigoDTE) {
        log.audit('lib_cache.getTipoDTEByCodigo', 'Buscando tipo DTE por código: ' + codigoDTE);
        return getByFilter('TIPOS_DTE', codigoDTE);
    }

    /**
     * @description Obtiene un parámetro por su nombre
     * @param {string} nombreParametro - Nombre del parámetro
     * @returns {Object} - { success: boolean, result: Object, error: string }
     */
    function getParametroByNombre(nombreParametro) {
        log.audit('lib_cache.getParametroByNombre', 'Buscando parámetro por nombre: ' + nombreParametro);
        return getByFilter('PARAMETROS', nombreParametro);
    }

    /**
     * @description Obtiene el ID interno de un centro de costo por su código
     * @param {string} codigoCentroCosto - Código del centro de costo
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getCentroCostoByCodigo(codigoCentroCosto) {
        log.audit('lib_cache.getCentroCostoByCodigo', 'Buscando centro de costo por código: ' + codigoCentroCosto);
        return getByFilter('CENTROS_COSTO', codigoCentroCosto);
    }

    /**
     * @description Obtiene la cuenta contable por forma de pago (para VENTA)
     * @param {string} nombreFormaPago - Nombre de la forma de pago
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getCuentaByFormaPagoVenta(nombreFormaPago) {
        var resultado = getByFilter('CUENTAS_FORMA_PAGO', nombreFormaPago);

        if (!resultado.success) {
            return resultado;
        }

        var cuenta = resultado.result.cta_contable_debito || resultado.result.cta_contable_credito || null;

        if (!cuenta) {
            return {
                success: false,
                error: 'No se encontró cuenta contable para forma de pago: ' + nombreFormaPago
            };
        }

        log.audit('lib_cache.getCuentaByFormaPagoVenta', 'Cuenta contable encontrada para forma de pago ' + nombreFormaPago + ': ' + cuenta);

        return {
            success: true,
            result: cuenta
        };
    }

    /**
     * @description Obtiene la cuenta contable por código (para DEVO)
     * @param {string} codigoFormaPago - Código de la forma de pago
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getCuentaByCodigoDevo(codigoFormaPago) {
        var resultado = getByCustomFilter('CUENTAS_FORMA_PAGO', 'codigo', codigoFormaPago, null);

        if (!resultado.success) {
            return resultado;
        }

        var cuenta = resultado.result.cta_contable_debito || resultado.result.cta_contable_credito || null;

        if (!cuenta) {
            return {
                success: false,
                error: 'No se encontró cuenta contable para código: ' + codigoFormaPago
            };
        }

        log.audit('lib_cache.getCuentaByCodigoDevo', 'Cuenta contable encontrada para código ' + codigoFormaPago + ': ' + cuenta);

        return {
            success: true,
            result: cuenta
        };
    }

    /**
     * @description Obtiene la configuración de cachés disponibles
     * @returns {Object} - Objeto con la configuración de todos los cachés
     */
    function getCacheConfig() {
        log.audit('lib_cache.getCacheConfig', 'Obteniendo configuración de cachés');
        return CACHE_CONFIG;
    }

    /**
     * @description Obtiene el mapa de tax codes (código IVA -> internal_id)
     * @returns {Object} - { success: boolean, result: Object, error: string }
     */
    function getTaxCodeMap() {
        log.audit('lib_cache.getTaxCodeMap', 'Obteniendo mapa de tax codes');

        var allData = getAll('TAX_CODES');

        if (!allData.success) {
            return allData;
        }

        var taxCodeMap = {};
        var dataList = allData.result;

        for (var i = 0; i < dataList.length; i++) {
            var taxCode = dataList[i];
            var name = taxCode.name;

            // Mapear nombre a código
            if (name === 'IVA Afecto') {
                taxCodeMap['19'] = taxCode.internal_id;
            } else if (name === 'IVA Exento') {
                taxCodeMap['0'] = taxCode.internal_id;
            }
        }

        log.audit('lib_cache.getTaxCodeMap', 'Mapa de tax codes obtenido: ' + JSON.stringify(taxCodeMap));

        return {
            success: true,
            result: taxCodeMap
        };
    }

    /**
     * @description Obtiene todos los descuentos como array
     * @returns {Object} - { success: boolean, result: Array, error: string }
     */
    function getAllDiscounts() {
        log.audit('lib_cache.getAllDiscounts', 'Obteniendo todos los descuentos');
        return getAll('DISCOUNTS');
    }

    /**
     * @description Obtiene la cuenta contable de redondeo para ajustes POS Farmacia
     * Busca el parámetro "andessalud_pos_farmacia_cuenta_redondeo" en el caché de PARAMETROS
     * El valor del parámetro debe ser el Internal ID de la cuenta contable de redondeo
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getCuentaRedondeo() {
        log.audit("lib_cache.getCuentaRedondeo", "Buscando cuenta de redondeo en parámetros");
        var resultado = getByFilter("PARAMETROS", "andessalud_pos_farmacia_cuenta_redondeo");

        if (!resultado.success) {
            return resultado;
        }

        var cuenta = resultado.result.value || resultado.result.internal_id || null;

        if (!cuenta) {
            return {
                success: false,
                error: "No se encontró el valor de la cuenta de redondeo en el parámetro andessalud_pos_farmacia_cuenta_redondeo"
            };
        }

        log.audit("lib_cache.getCuentaRedondeo", "Cuenta de redondeo encontrada: " + cuenta);

        return {
            success: true,
            result: cuenta
        };
    }

    /**
     * @description Obtiene el centro de costo asociado a una ubicación por su internal_id
     * @param {string} ubicacionId - Internal ID de la ubicación
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function getCentroCostoByUbicacionId(ubicacionId) {
        log.audit('lib_cache.getCentroCostoByUbicacionId', 'Buscando centro de costo para ubicación ID: ' + ubicacionId);

        var allData = getAll('UBICACIONES');

        if (!allData.success) {
            return allData;
        }

        var dataList = allData.result;
        var foundItem = null;

        for (var i = 0; i < dataList.length; i++) {
            if (dataList[i].internal_id === ubicacionId || dataList[i].internal_id === String(ubicacionId)) {
                foundItem = dataList[i];
                break;
            }
        }

        if (!foundItem) {
            return {
                success: false,
                error: 'No se encontró ubicación con internal_id: ' + ubicacionId
            };
        }

        if (!foundItem.centro_costo) {
            return {
                success: false,
                error: 'La ubicación ' + ubicacionId + ' no tiene centro de costo asignado'
            };
        }

        log.audit('lib_cache.getCentroCostoByUbicacionId', 'Centro de costo encontrado: ' + foundItem.centro_costo);

        return {
            success: true,
            result: foundItem.centro_costo
        };
    }

    return {
        // Funciones genéricas
        getAll: getAll,
        getByFilter: getByFilter,
        getByCustomFilter: getByCustomFilter,
        getCacheConfig: getCacheConfig,

        // Funciones específicas (shortcuts)
        getSubsidiariaByRut: getSubsidiariaByRut,
        getUbicacionByCodigo: getUbicacionByCodigo,
        getUbicacionCompletaByCodigo: getUbicacionCompletaByCodigo,
        getTipoDTEByCodigo: getTipoDTEByCodigo,
        getParametroByNombre: getParametroByNombre,
        getCentroCostoByCodigo: getCentroCostoByCodigo,
        getCuentaByFormaPagoVenta: getCuentaByFormaPagoVenta,
        getCuentaByCodigoDevo: getCuentaByCodigoDevo,
        getTaxCodeMap: getTaxCodeMap,
        getAllDiscounts: getAllDiscounts,
        getCentroCostoByUbicacionId: getCentroCostoByUbicacionId,
        getCuentaRedondeo: getCuentaRedondeo
    };
});
