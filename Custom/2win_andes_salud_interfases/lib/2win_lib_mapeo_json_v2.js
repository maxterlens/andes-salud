/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description Librería de mapeo optimizada V2 - Usa caché en lugar de búsquedas DAO individuales
 */
define(["N/log"], function (nLog) {
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

    /**
     * Obtiene un valor del caché con múltiples formatos de clave
     * @param {Object} cache - Objeto caché
     * @param {string} clave - Clave a buscar
     * @returns {*} Valor encontrado o null
     */
    function obtenerDeCache(cache, clave) {
        if (!cache || !clave) return null;
        
        // Intentar con la clave original
        if (cache[clave] !== undefined) return cache[clave];
        
        // Intentar con minúsculas
        const claveLower = String(clave).toLowerCase();
        if (cache[claveLower] !== undefined) return cache[claveLower];
        
        // Intentar con mayúsculas
        const claveUpper = String(clave).toUpperCase();
        if (cache[claveUpper] !== undefined) return cache[claveUpper];
        
        return null;
    }

    /**
     * @function mapearCamposCuerpoIngresoAmbulatorio
     * @description Construye el objeto con campos para registro usando caché
     * @param {Object} parametro - Datos de entrada a mapear
     * @param {Object} cache - Caché con datos precargados
     * @returns {Object} - Un objeto con estructura para campos de cuerpo mapeada
     * @throws {Error} - Lanza un error si algún valor es inválido
     */
    function mapearCamposCuerpoIngresoAmbulatorio(parametro, cache) {
        try {
            // Objeto para campos de registro mapeados
            let camposRegistro = {
                item: []
            };

            // Entity (cliente/paciente) - usar caché
            if (parametro.IdPaciente) {
                const entityId = obtenerDeCache(cache.clientes, parametro.IdPaciente);
                if (entityId) {
                    camposRegistro.entity = entityId;
                } else {
                    throw new Error(`Paciente no encontrado: ${parametro.IdPaciente}`);
                }
            }

            // Subsidiaria - usar caché
            if (parametro.RutEmpresa) {
                const rutFormateado = formatearRut(parametro.RutEmpresa);
                const subsidiaryId = obtenerDeCache(cache.subsidiarias, rutFormateado);
                if (subsidiaryId) {
                    camposRegistro.subsidiary = subsidiaryId;
                } else {
                    throw new Error(`Subsidiaria no encontrada para RUT: ${rutFormateado}`);
                }
            }

            // Campos directos
            if (parametro.Ficha) {
                camposRegistro.custbody_2w_ficha_paciente = parametro.Ficha;
            }
            if (parametro.Ingreso) {
                camposRegistro.custbody_2w_ingreso_paciente = parametro.Ingreso;
            }
            if (parametro.CuentaPaciente) {
                camposRegistro.custbody_2win_nro_cuenta_paciente = parametro.CuentaPaciente;
            }

            // Departamento - usar primer servicio de detallePrestaciones
            if (parametro.detallePrestaciones && parametro.detallePrestaciones.length > 0) {
                const primerServicio = parametro.detallePrestaciones[0].CodServicio;
                if (primerServicio) {
                    // Intentar como numérico primero
                    if (/^[0-9]+$/.test(primerServicio)) {
                        camposRegistro.department = primerServicio;
                    } else {
                        // Buscar por nombre en caché
                        const deptId = obtenerDeCache(cache.departamentos, primerServicio);
                        if (deptId) {
                            camposRegistro.department = deptId;
                        }
                    }
                }
            }

            // Tipo de atención - usar caché
            if (parametro.TipoAtencion) {
                const tipoAtencionId = obtenerDeCache(cache.tiposAtencion, parametro.TipoAtencion);
                if (tipoAtencionId) {
                    camposRegistro.custbody_2win_tipo_atencion = tipoAtencionId;
                    camposRegistro.class = tipoAtencionId;
                }
            }

            // Fechas
            if (parametro.FechaEnvio) {
                camposRegistro.custbody_2win_as_fecha_envio = parametro.FechaEnvio;
            }
            if (parametro.FechaAlta) {
                camposRegistro.custbody_2win_as_fecha_alta = parametro.FechaAlta;
            }

            return camposRegistro;
        } catch (error) {
            nLog.error("mapearCamposCuerpoIngresoAmbulatorio - error", error);
            throw error;
        }
    }

    /**
     * @function mapearCamposLineaIngresoAmbulatorio
     * @description Construye el objeto con campos para línea usando caché
     * @param {Object} prestacion - Datos de la prestación a mapear
     * @param {Object} cache - Caché con datos precargados
     * @returns {Object} - Objeto con campos de línea mapeados
     * @throws {Error} - Lanza un error si algún valor requerido es inválido
     */
    function mapearCamposLineaIngresoAmbulatorio(prestacion, cache) {
        try {
            let camposLinea = {};

            // Identificador de fila
            if (prestacion.CrgCorrel) {
                camposLinea.custcol_2win_as_identificador_fila = prestacion.CrgCorrel;
            }

            // Producto - usar caché
            if (prestacion.CodigoGrupoPrefactura) {
                const productoId = obtenerDeCache(cache.productos, prestacion.CodigoGrupoPrefactura);
                if (productoId) {
                    camposLinea.item = productoId;
                } else {
                    throw new Error(`Producto no encontrado: ${prestacion.CodigoGrupoPrefactura}`);
                }
            }

            // Financiador - usar caché
            if (prestacion.RutFinanciador) {
                const rutFormateado = formatearRut(prestacion.RutFinanciador);
                const financiadorId = obtenerDeCache(cache.clientes, rutFormateado);
                if (financiadorId) {
                    camposLinea.custcol_2win_as_rut_financiador = financiadorId;
                }
                // No lanzar error si no se encuentra, puede ser opcional
            }

            // Campos directos
            if (prestacion.CodigoConvenio) {
                camposLinea.custcol_2win_as_codigo_convenio = prestacion.CodigoConvenio;
            }
            if (prestacion.NombreConvenio) {
                camposLinea.custcol_2win_as_nombre_convenio = prestacion.NombreConvenio;
            }
            if (prestacion.CodigoPaquete) {
                camposLinea.custcol_2win_as_codigo_paquete = prestacion.CodigoPaquete;
            }
            if (prestacion.NombrePaquete) {
                camposLinea.custcol_2win_as_nombre_paquete = prestacion.NombrePaquete;
            }

            // Montos
            if (prestacion.MontoAfecto !== undefined && prestacion.MontoAfecto !== "") {
                camposLinea.MontoAfecto = Number(prestacion.MontoAfecto);
            }
            if (prestacion.MontoExento !== undefined && prestacion.MontoExento !== "") {
                camposLinea.MontoExento = Number(prestacion.MontoExento);
            }
            if (prestacion.Iva !== undefined && prestacion.Iva !== "") {
                camposLinea.Iva = Number(prestacion.Iva);
            }

            // Código de servicio
            if (prestacion.CodServicio) {
                if (!/^[0-9]+$/.test(prestacion.CodServicio)) {
                    throw new Error(`Valor inválido para CodServicio: ${prestacion.CodServicio}, debe ser numérico`);
                }
                camposLinea.custcol_2win_as_codigo_servicio = prestacion.CodServicio;
            }

            return camposLinea;
        } catch (error) {
            nLog.error("mapearCamposLineaIngresoAmbulatorio - error", error);
            throw error;
        }
    }

    /**
     * @function validarMapearPaciente
     * @description Valida y mapea todos los datos de un paciente con sus prestaciones
     * @param {Object} paciente - Datos del paciente
     * @param {Object} cache - Caché con datos precargados
     * @returns {Object} - { datosEntrada, camposMapeados, errores }
     */
    function validarMapearPaciente(paciente, cache) {
        const resultado = {
            datosEntrada: paciente,
            camposMapeados: null,
            errores: []
        };

        try {
            // Propiedades requeridas del paciente
            const propiedadesRequeridasPaciente = ["IdPaciente", "Ficha", "Ingreso", "CuentaPaciente", "RutEmpresa", "TipoAtencion"];
            const propiedadesFaltantes = propiedadesRequeridasPaciente.filter(prop => !paciente[prop]);
            
            if (propiedadesFaltantes.length > 0) {
                throw new Error(`Propiedades faltantes: ${propiedadesFaltantes.join(", ")}`);
            }

            // Mapear campos del cuerpo
            const camposMapeados = mapearCamposCuerpoIngresoAmbulatorio(paciente, cache);
            camposMapeados.item = [];

            // Propiedades requeridas de cada prestación
            const propiedadesRequeridasPrestacion = ["CrgCorrel", "CodigoGrupoPrefactura", "RutFinanciador", "CodigoConvenio", "Total", "CodServicio"];

            // Procesar cada prestación
            if (paciente.detallePrestaciones && paciente.detallePrestaciones.length > 0) {
                for (let i = 0; i < paciente.detallePrestaciones.length; i++) {
                    const prestacion = paciente.detallePrestaciones[i];
                    
                    try {
                        // Validar propiedades requeridas
                        const propsFaltantes = propiedadesRequeridasPrestacion.filter(prop => !prestacion[prop]);
                        if (propsFaltantes.length > 0) {
                            throw new Error(`Propiedades faltantes en prestación ${i}: ${propsFaltantes.join(", ")}`);
                        }

                        // Mapear línea
                        const linea = mapearCamposLineaIngresoAmbulatorio(prestacion, cache);
                        camposMapeados.item.push(linea);

                        // Marcar como procesada
                        paciente.detallePrestaciones[i].procesado = true;
                    } catch (error) {
                        paciente.detallePrestaciones[i].procesado = false;
                        paciente.detallePrestaciones[i].error = error.message;
                        resultado.errores.push({
                            linea: i,
                            CrgCorrel: prestacion.CrgCorrel,
                            error: error.message
                        });
                    }
                }
            } else {
                throw new Error("Se requiere detallePrestaciones");
            }

            resultado.camposMapeados = camposMapeados;

        } catch (error) {
            resultado.errores.push({
                error: error.message,
                esGeneral: true
            });
        }

        return resultado;
    }

    return {
        formatearRut,
        obtenerDeCache,
        mapearCamposCuerpoIngresoAmbulatorio,
        mapearCamposLineaIngresoAmbulatorio,
        validarMapearPaciente
    };
});