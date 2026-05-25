/**
 * @NApiVersion 2.1
 * @description Helper para validación de campos personalizados
 * @author 2Win
 * @version 1.0.0
 */
define(["N/search", "N/record", "N/log"], function (search, record, nLog) {
    /**
     * Campos personalizados requeridos por tabla
     */
    const CAMPOS_REQUERIDOS = [
        // Tabla: customer (Cliente/Paciente)
        {
            tabla: "customer",
            nombreTabla: "Cliente/Paciente",
            campos: ["custentity_2wrut", "custentity_2win_codigo_nacionalidad", "custentity_2win_fecha_nacimiento", "custentity_2win_sexo", "custentity_2win_tipo_documento"]
        },
        // Tabla: subsidiary (Subsidiaria)
        {
            tabla: "subsidiary",
            nombreTabla: "Subsidiaria",
            campos: ["custrecord_2w_actividad_economica_prelim", "custrecord_2w_cod_act_econ_prelim", "custrecord_2w_esclinica", "custrecord_2wingiroempresa", "custrecord_2winrutsubsiudiaria", "custrecord_2win_fecha_fin_vigencia", "custrecord_2win_fecha_inicio_vigencia"]
        },
        // Tabla: transaction (Transacción)
        {
            tabla: "transaction",
            nombreTabla: "Transacción",
            campos: ["custbody_2w_ficha_paciente", "custbody_2w_ingreso_paciente", "custbody_2win_nro_cuenta_paciente", "custbody_2win_tipo_atencion", "custbody_2winfolioacepta", "custbody_2wintipodtesii"]
        },
        // Tabla: location (Ubicación)
        {
            tabla: "location",
            nombreTabla: "Ubicación",
            campos: ["custrecord_2w_codigo_ubicacion", "custrecord_2win_as_ubi_clinica", "custrecord_2win_as_ubi_inicio_vigencia", "custrecord_2win_as_ubi_stock_negativo"]
        },
        // Tabla: item (Item/Producto)
        {
            tabla: "item",
            nombreTabla: "Item/Producto",
            campos: ["custitem_2win_as_codigo_producto"]
        },
        // Tabla: entity (Entidad)
        {
            tabla: "entity",
            nombreTabla: "Entidad",
            campos: ["custentity_2win_rut_entidad"]
        }
    ];

    /**
     * Valida la existencia de campos personalizados requeridos
     * @returns {Array<Object>} - Array con resultados de validación
     */
    function validarCamposRequeridos() {
        const resultados = [];

        CAMPOS_REQUERIDOS.forEach(function (tablaConfig) {
            tablaConfig.campos.forEach(function (campoId) {
                const existe = existeCampo(tablaConfig.tabla, campoId);

                resultados.push({
                    tabla: tablaConfig.nombreTabla,
                    id: campoId,
                    existe: existe
                });

                nLog.debug("Validación campo", tablaConfig.nombreTabla + "." + campoId + " - " + (existe ? "EXISTS" : "NOT EXISTS"));
            });
        });

        return resultados;
    }

    /**
     * Verifica si un campo personalizado existe en una tabla
     * @param {string} recordType - Tipo de registro (customer, transaction, etc.)
     * @param {string} fieldId - ID del campo personalizado
     * @returns {boolean} - True si existe, false si no
     */
    function existeCampo(recordType, fieldId) {
        try {
            // Intentar crear una búsqueda que use el campo
            const busqueda = search.create({
                type: recordType,
                filters: [],
                columns: [fieldId]
            });

            // Ejecutar búsqueda
            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            // Si no da error, el campo existe
            return resultado !== null;
        } catch (error) {
            // Si da error, el campo no existe
            nLog.debug("Campo no existe", recordType + "." + fieldId);
            return false;
        }
    }

    /**
     * Valida campos de una tabla específica
     * @param {string} recordType - Tipo de registro
     * @param {Array<string>} campos - Lista de campos a validar
     * @returns {Object} - Resultado de validación
     */
    function validarCamposTabla(recordType, campos) {
        const resultado = {
            tabla: recordType,
            totalCampos: campos.length,
            camposExistentes: [],
            camposFaltantes: [],
            todosExisten: false
        };

        campos.forEach(function (campo) {
            if (existeCampo(recordType, campo)) {
                resultado.camposExistentes.push(campo);
            } else {
                resultado.camposFaltantes.push(campo);
            }
        });

        resultado.todosExisten = resultado.camposFaltantes.length === 0;
        resultado.cantidadExistentes = resultado.camposExistentes.length;
        resultado.cantidadFaltantes = resultado.camposFaltantes.length;

        return resultado;
    }

    /**
     * Obtiene todos los campos personalizados de una tabla
     * @param {string} recordType - Tipo de registro
     * @returns {Array<Object>} - Lista de campos personalizados
     */
    function obtenerCamposPersonalizados(recordType) {
        try {
            const busqueda = search.create({
                type: recordType,
                filters: [],
                columns: search.getAllColumns()
            });

            const resultado = busqueda.run().getRange({ start: 0, end: 1 });

            if (resultado && resultado.length > 0) {
                const columnas = resultado[0].columns;
                const camposPersonalizados = [];

                columnas.forEach(function (columna) {
                    // Filtrar solo campos personalizados (cust*)
                    if (columna.name && columna.name.indexOf("cust") === 0) {
                        camposPersonalizados.push({
                            id: columna.name,
                            label: columna.label || columna.name,
                            type: columna.type
                        });
                    }
                });

                return camposPersonalizados;
            }

            return [];
        } catch (error) {
            nLog.error("Error al obtener campos personalizados", error);
            return [];
        }
    }

    /**
     * Genera reporte de campos faltantes
     * @returns {Object} - Reporte con campos faltantes agrupados por tabla
     */
    function generarReporteCamposFaltantes() {
        const reporte = {
            totalTablas: 0,
            tablasConCamposFaltantes: [],
            totalCamposFaltantes: 0,
            detalle: []
        };

        CAMPOS_REQUERIDOS.forEach(function (tablaConfig) {
            const validacion = validarCamposTabla(tablaConfig.tabla, tablaConfig.campos);

            if (!validacion.todosExisten) {
                reporte.totalTablas++;
                reporte.tablasConCamposFaltantes.push(tablaConfig.nombreTabla);
                reporte.totalCamposFaltantes += validacion.cantidadFaltantes;

                reporte.detalle.push({
                    tabla: tablaConfig.nombreTabla,
                    camposExistentes: validacion.cantidadExistentes,
                    camposFaltantes: validacion.cantidadFaltantes,
                    camposFaltantesLista: validacion.camposFaltantes
                });
            }
        });

        return reporte;
    }

    /**
     * Genera código SQL/XML para crear campos faltantes
     * @returns {string} - Código generado
     */
    function generarCodigoCreacionCampos() {
        let codigo = "-- Campos personalizados faltantes para crear\n";
        codigo += "-- Generado por Asistente de Configuración Andes Salud\n\n";

        const reporte = generarReporteCamposFaltantes();

        reporte.detalle.forEach(function (tabla) {
            codigo += "-- Tabla: " + tabla.tabla + "\n";
            tabla.camposFaltantesLista.forEach(function (campo) {
                codigo += "-- TODO: Crear campo " + campo + " en la tabla\n";
            });
            codigo += "\n";
        });

        return codigo;
    }

    /**
     * Valida campos críticos para el funcionamiento
     * @returns {Object} - Resultado de validación de campos críticos
     */
    function validarCamposCriticos() {
        const camposCriticos = [
            { tabla: "customer", campo: "custentity_2wrut", critico: true },
            { tabla: "customer", campo: "custentity_2win_tipo_documento", critico: true },
            { tabla: "transaction", campo: "custbody_2w_ficha_paciente", critico: true },
            { tabla: "transaction", campo: "custbody_2win_tipo_atencion", critico: true },
            { tabla: "location", campo: "custrecord_2w_codigo_ubicacion", critico: true }
        ];

        const resultado = {
            totalCriticos: camposCriticos.length,
            criticosExistentes: 0,
            criticosFaltantes: 0,
            detalle: []
        };

        camposCriticos.forEach(function (campoCritico) {
            const existe = existeCampo(campoCritico.tabla, campoCritico.campo);

            if (existe) {
                resultado.criticosExistentes++;
            } else {
                resultado.criticosFaltantes++;
            }

            resultado.detalle.push({
                tabla: campoCritico.tabla,
                campo: campoCritico.campo,
                existe: existe,
                critico: campoCritico.critico
            });
        });

        resultado.todosCriticosExistentes = resultado.criticosFaltantes === 0;

        return resultado;
    }

    return {
        validarCamposRequeridos: validarCamposRequeridos,
        existeCampo: existeCampo,
        validarCamposTabla: validarCamposTabla,
        obtenerCamposPersonalizados: obtenerCamposPersonalizados,
        generarReporteCamposFaltantes: generarReporteCamposFaltantes,
        generarCodigoCreacionCampos: generarCodigoCreacionCampos,
        validarCamposCriticos: validarCamposCriticos
    };
});