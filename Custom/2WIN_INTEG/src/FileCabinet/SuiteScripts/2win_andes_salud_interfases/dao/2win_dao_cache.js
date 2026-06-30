/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description DAO optimizado para carga masiva de caché - Evita múltiples búsquedas individuales
 */
define(["N/search", "N/query", "N/log"], function (search, query, nLog) {
    /**
     * Carga todas las subsidiarias en un caché indexado por RUT
     * @returns {Object} Cache { rutFormateado: internalid }
     */
    function cargarCacheSubsidiarias() {
        const cache = {};
        try {
            const suiteQL = `
                SELECT 
                    s.id,
                    s.custrecord_2winrutsubsiudiaria as rut
                FROM subsidiary s
                WHERE s.isinactive = 'F'
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            
            results.forEach((row) => {
                if (row.rut) {
                    // Indexar por RUT formateado (sin puntos, con guión)
                    const rutLimpio = String(row.rut).replace(/[^0-9Kk]/g, "");
                    const cuerpo = rutLimpio.slice(0, -1);
                    const dv = rutLimpio.slice(-1).toUpperCase();
                    const rutFormateado = `${cuerpo}-${dv}`;
                    
                    cache[rutFormateado] = row.id;
                    // También indexar sin formato para flexibilidad
                    cache[rutLimpio] = row.id;
                }
            });
            
            nLog.audit("cargarCacheSubsidiarias", `Cargadas ${Object.keys(cache).length} subsidiarias`);
        } catch (error) {
            nLog.error("cargarCacheSubsidiarias - Error", error);
        }
        return cache;
    }

    /**
     * Carga clientes por externalId y RUT en un caché
     * @param {Array} listaExternalIds - Lista de externalIds a cargar
     * @param {Array} listaRuts - Lista de RUTs a cargar
     * @returns {Object} Cache { externalId: internalid, rutFormateado: internalid }
     */
    function cargarCacheClientes(listaExternalIds = [], listaRuts = []) {
        const cache = {};
        try {
            // Cargar por externalId
            if (listaExternalIds.length > 0) {
                const externalIdsStr = listaExternalIds.map(id => `'${id}'`).join(",");
                const suiteQL = `
                    SELECT 
                        c.id,
                        c.externalid
                    FROM customer c
                    WHERE c.isinactive = 'F'
                    AND c.externalid IN (${externalIdsStr})
                `;
                
                const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
                results.forEach((row) => {
                    cache[row.externalid] = row.id;
                });
            }
            
            // Cargar por RUT (custentity_2wrut)
            if (listaRuts.length > 0) {
                const rutsStr = listaRuts.map(rut => {
                    const limpio = String(rut).replace(/[^0-9Kk]/g, "");
                    return `'${limpio}'`;
                }).join(",");
                
                const suiteQL = `
                    SELECT 
                        c.id,
                        c.custentity_2wrut as rut
                    FROM customer c
                    WHERE c.isinactive = 'F'
                    AND c.custentity_2wrut IN (${rutsStr})
                `;
                
                const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
                results.forEach((row) => {
                    if (row.rut) {
                        const rutLimpio = String(row.rut).replace(/[^0-9Kk]/g, "");
                        const cuerpo = rutLimpio.slice(0, -1);
                        const dv = rutLimpio.slice(-1).toUpperCase();
                        const rutFormateado = `${cuerpo}-${dv}`;
                        
                        cache[rutFormateado] = row.id;
                        cache[rutLimpio] = row.id;
                    }
                });
            }
            
            nLog.audit("cargarCacheClientes", `Cargados ${Object.keys(cache).length} clientes`);
        } catch (error) {
            nLog.error("cargarCacheClientes - Error", error);
        }
        return cache;
    }

    /**
     * Carga TODOS los clientes en caché (para casos donde no se conoce la lista previa)
     * @returns {Object} Cache { externalId: internalid, rutFormateado: internalid }
     */
    function cargarCacheTodosClientes() {
        const cache = {};
        try {
            const suiteQL = `
                SELECT 
                    c.id,
                    c.externalid,
                    c.custentity_2wrut as rut
                FROM customer c
                WHERE c.isinactive = 'F'
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.externalid) {
                    cache[row.externalid] = row.id;
                }
                if (row.rut) {
                    const rutLimpio = String(row.rut).replace(/[^0-9Kk]/g, "");
                    const cuerpo = rutLimpio.slice(0, -1);
                    const dv = rutLimpio.slice(-1).toUpperCase();
                    const rutFormateado = `${cuerpo}-${dv}`;
                    
                    cache[rutFormateado] = row.id;
                    cache[rutLimpio] = row.id;
                }
            });
            
            nLog.audit("cargarCacheTodosClientes", `Cargados ${Object.keys(cache).length} clientes`);
        } catch (error) {
            nLog.error("cargarCacheTodosClientes - Error", error);
        }
        return cache;
    }

    /**
     * Carga productos por UPC code en un caché
     * @param {Array} listaUpcCodes - Lista de códigos UPC a cargar
     * @returns {Object} Cache { upcCode: internalid }
     */
    function cargarCacheProductos(listaUpcCodes = []) {
        const cache = {};
        try {
            if (listaUpcCodes.length === 0) {
                return cache;
            }
            
            // Escapar comillas y construir lista
            const codesStr = listaUpcCodes
                .filter(c => c && c.trim() !== "")
                .map(c => `'${String(c).replace(/'/g, "''")}'`)
                .join(",");
            
            if (!codesStr) {
                return cache;
            }
            
            const suiteQL = `
                SELECT 
                    i.id,
                    i.upccode
                FROM item i
                WHERE i.isinactive = 'F'
                AND i.upccode IN (${codesStr})
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.upccode) {
                    cache[row.upccode] = row.id;
                }
            });
            
            nLog.audit("cargarCacheProductos", `Cargados ${Object.keys(cache).length} productos`);
        } catch (error) {
            nLog.error("cargarCacheProductos - Error", error);
        }
        return cache;
    }

    /**
     * Carga TODOS los productos con UPC en caché
     * @returns {Object} Cache { upcCode: internalid }
     */
    function cargarCacheTodosProductos() {
        const cache = {};
        try {
            const suiteQL = `
                SELECT 
                    i.id,
                    i.upccode
                FROM item i
                WHERE i.isinactive = 'F'
                AND i.upccode IS NOT NULL
                AND i.upccode != ''
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.upccode) {
                    cache[row.upccode] = row.id;
                }
            });
            
            nLog.audit("cargarCacheTodosProductos", `Cargados ${Object.keys(cache).length} productos`);
        } catch (error) {
            nLog.error("cargarCacheTodosProductos - Error", error);
        }
        return cache;
    }

    /**
     * Carga tipos de atención (classification) por externalId/scriptid
     * @returns {Object} Cache { scriptid: internalid }
     */
    function cargarCacheTiposAtencion() {
        const cache = {};
        try {
            const suiteQL = `
                SELECT 
                    c.id,
                    c.externalid,
                    c.name
                FROM classification c
                WHERE c.isinactive = 'F'
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.externalid) {
                    cache[row.externalid] = row.id;
                    cache[row.externalid.toLowerCase()] = row.id;
                    cache[row.externalid.toUpperCase()] = row.id;
                }
            });
            
            nLog.audit("cargarCacheTiposAtencion", `Cargados ${Object.keys(cache).length} tipos de atención`);
        } catch (error) {
            nLog.error("cargarCacheTiposAtencion - Error", error);
        }
        return cache;
    }

    /**
     * Cacha departamentos por nombre
     * @returns {Object} Cache { nombreUpper: internalid }
     */
    function cargarCacheDepartamentos() {
        const cache = {};
        try {
            const suiteQL = `
                SELECT 
                    d.id,
                    d.name
                FROM department d
                WHERE d.isinactive = 'F'
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.name) {
                    cache[row.name.toUpperCase()] = row.id;
                }
            });
            
            nLog.audit("cargarCacheDepartamentos", `Cargados ${Object.keys(cache).length} departamentos`);
        } catch (error) {
            nLog.error("cargarCacheDepartamentos - Error", error);
        }
        return cache;
    }

    /**
     * Carga códigos de impuestos
     * @returns {Object} Cache { codigo: internalid }
     */
    function cargarCacheImpuestos() {
        const cache = {};
        try {
            const suiteQL = `
                SELECT 
                    t.id,
                    t.itemid as name
                FROM salestaxitem t
                WHERE t.isinactive = 'F'
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.name) {
                    cache[row.name] = row.id;
                    cache[row.name.toUpperCase()] = row.id;
                }
            });
            
            nLog.audit("cargarCacheImpuestos", `Cargados ${Object.keys(cache).length} impuestos`);
        } catch (error) {
            nLog.error("cargarCacheImpuestos - Error", error);
        }
        return cache;
    }

    /**
     * Carga órdenes de venta por número de cuenta paciente
     * @param {Array} listaCuentas - Lista de números de cuenta
     * @returns {Object} Cache { nroCuentaPaciente: { internalid, subsidiary } }
     */
    function cargarCacheOrdenesVenta(listaCuentas = []) {
        const cache = {};
        try {
            if (listaCuentas.length === 0) {
                return cache;
            }
            
            const cuentasStr = listaCuentas
                .map(c => `'${String(c).replace(/'/g, "''")}'`)
                .join(",");
            
            const suiteQL = `
                SELECT 
                    t.id,
                    t.custbody_2win_nro_cuenta_paciente as cuenta,
                    tl.subsidiary
                FROM transaction t
                INNER JOIN transactionline tl ON tl.transaction = t.id
                WHERE t.type = 'SalesOrd'
                AND tl.mainline = 'T'
                AND t.custbody_2win_nro_cuenta_paciente IN (${cuentasStr})
            `;
            
            const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();
            results.forEach((row) => {
                if (row.cuenta) {
                    cache[row.cuenta] = {
                        internalid: row.id,
                        subsidiary: row.subsidiary
                    };
                }
            });
            
            nLog.audit("cargarCacheOrdenesVenta", `Cargadas ${Object.keys(cache).length} órdenes de venta`);
        } catch (error) {
            nLog.error("cargarCacheOrdenesVenta - Error", error);
        }
        return cache;
    }

    /**
     * Crea un caché completo para el procesamiento de líneas
     * @param {Array} pacientes - Lista de pacientes a procesar
     * @returns {Object} Cache completo con todas las entidades necesarias
     */
    function crearCacheCompleto(pacientes = []) {
        const startTime = Date.now();
        
        // Extraer datos únicos de los pacientes
        const externalIdsPacientes = new Set();
        const rutsFinanciadores = new Set();
        const rutsEmpresas = new Set();
        const upcCodes = new Set();
        const cuentasPaciente = new Set();
        
        pacientes.forEach(paciente => {
            // ExternalId del paciente
            if (paciente.IdPaciente) {
                externalIdsPacientes.add(paciente.IdPaciente);
            }
            
            // RUTs de financiadores
            if (paciente.detallePrestaciones) {
                paciente.detallePrestaciones.forEach(prestacion => {
                    if (prestacion.RutFinanciador) {
                        const rutLimpio = String(prestacion.RutFinanciador).replace(/[^0-9Kk]/g, "");
                        rutsFinanciadores.add(rutLimpio);
                    }
                    if (prestacion.CodigoGrupoPrefactura) {
                        upcCodes.add(prestacion.CodigoGrupoPrefactura);
                    }
                });
            }
            
            // RUT de empresa/subsidiaria
            if (paciente.RutEmpresa) {
                const rutLimpio = String(paciente.RutEmpresa).replace(/[^0-9Kk]/g, "");
                rutsEmpresas.add(rutLimpio);
            }
            
            // Cuenta paciente
            if (paciente.CuentaPaciente) {
                cuentasPaciente.add(paciente.CuentaPaciente);
            }
        });
        
        // Cargar cachés
        const cache = {
            subsidiarias: cargarCacheSubsidiarias(),
            clientes: cargarCacheClientes(
                Array.from(externalIdsPacientes),
                Array.from(rutsFinanciadores)
            ),
            productos: cargarCacheProductos(Array.from(upcCodes)),
            tiposAtencion: cargarCacheTiposAtencion(),
            departamentos: cargarCacheDepartamentos(),
            impuestos: cargarCacheImpuestos(),
            ordenesVenta: cargarCacheOrdenesVenta(Array.from(cuentasPaciente))
        };
        
        const elapsed = Date.now() - startTime;
        nLog.audit("crearCacheCompleto", `Cache creado en ${elapsed}ms`);
        
        return cache;
    }

    /**
     * Formatea un RUT al formato estándar (XXXXXXXX-X)
     * @param {string|number} rut - RUT a formatear
     * @returns {string} RUT formateado
     */
    function formatearRut(rut) {
        if (!rut) return "";
        const rutLimpio = String(rut).replace(/[^0-9Kk]/g, "");
        if (rutLimpio.length < 2) return rutLimpio;
        const cuerpo = rutLimpio.slice(0, -1);
        const dv = rutLimpio.slice(-1).toUpperCase();
        return `${cuerpo}-${dv}`;
    }

    return {
        cargarCacheSubsidiarias,
        cargarCacheClientes,
        cargarCacheTodosClientes,
        cargarCacheProductos,
        cargarCacheTodosProductos,
        cargarCacheTiposAtencion,
        cargarCacheDepartamentos,
        cargarCacheImpuestos,
        cargarCacheOrdenesVenta,
        crearCacheCompleto,
        formatearRut
    };
});