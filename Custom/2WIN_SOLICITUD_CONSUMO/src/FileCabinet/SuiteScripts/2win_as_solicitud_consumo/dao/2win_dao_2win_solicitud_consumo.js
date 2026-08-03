/**
 * @NApiVersion 2.1
 * @module ./2win_dao_2win_solicitud_consumo.js
 * @NModuleScope Public
 */
define([
    "N/log", 
    "N/record", 
    "N/runtime", 
    "N/search", 
    "N/ui/serverWidget",
    "./2win_dao_config",
    "./2win_dao_ubicacion"
], function (
    nLog, 
    record, 
    runtime, 
    search, 
    serverWidget,
    daoConfig,
    daoUbicacion
) {

    /**
     * @function definirValoresPorDefectoCreacion
     * @param {object} parametro - registro
     */
    function definirValoresPorDefectoCreacion(parametro) {
        try {
            nLog.debug("definirValoresPorDefectoCreacion - parametros", {
                parametro: parametro,
            });

            const currentUser = runtime.getCurrentUser();
            const currentRecord = parametro
            
            // Auto-poblar solicitante
            currentRecord.setValue({ fieldId: "custrecord_2win_consumo_solicitante", value: currentUser.id });

            // Auto-poblar fecha
            currentRecord.setValue({ fieldId: "custrecord_2win_consumo_fecha", value: new Date() });

            // Auto-poblar subsidiaria del usuario
            const empleadoData = search.lookupFields({
                type: search.Type.EMPLOYEE,
                id: currentUser.id,
                columns: ["subsidiary"]
            });

            // Validar si se recupero subsidiaria
            if (empleadoData.subsidiary && empleadoData.subsidiary.length > 0) {
                currentRecord.setValue({ fieldId: "custrecord_2win_consumo_subsidiaria", value: empleadoData.subsidiary[0].value });
            }

            // Auto-poblar cuenta de consumo desde config contable
            const cuentaConsumo = daoConfig.recuperarCuentaConsumo();
            if (cuentaConsumo) {
                currentRecord.setValue({ fieldId: "custrecord_2win_consumo_cuenta_consumo", value: cuentaConsumo });
            };
        } catch (error) {
            nLog.error("definirValoresPorDefectoCreacion - error", error);
            throw error;
        }
    }

    /**
     * @function bloquearCamposAntesDeCargarRegistro - Bloquea campos especificos previa carga de registro
     * @param {object} form - Formulario de registro
     * @param {string} estado - Id de estado actual de registro
     * @param {object} ESTADOS - Ids de estados posibles
     * @param {object} registro - Datos del registro
     */
    function bloquearCamposAntesDeCargarRegistro(form, estado, ESTADOS, registro) {
        try {
            nLog.audit("bloquearCamposAntesDeCargarRegistro - parametro", {
                form: form,
                estado: estado,
                ESTADOS: ESTADOS
            }); 

            // Bloquear cuenta de consumo siempre
            const accountField = form.getField("custrecord_2win_consumo_cuenta_consumo");
            nLog.debug("bloquearCamposAntesDeCargarRegistro - accountField", { accountField: accountField });
            if (accountField) {
                accountField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            };

            // Recuperar ubicacion seleccionada en registro
            const ubicacionId = registro.getValue("custrecord_2win_consumo_ubicacion");
            
            // Recuperar responsable de ubicacion
            const idResponsableUbicacion = daoUbicacion.determinarResponsableUbicacion(ubicacionId);
            
            // Recuperar id de solicitante
            const solicitanteId = registro.getValue("custrecord_2win_consumo_solicitante");

            // Recuperar id de usuario actual
            const idUsuarioActual = String(runtime.getCurrentUser().id);

            // Si estado es  bloquear todo el encabezado y impedir edicion de lineas detalle consumo
            if (
                (estado === ESTADOS.ENVIO_PENDIENTE && idUsuarioActual !== solicitanteId) || // ENVIO_PENDIENTE, y el usuario actual no es el solicitante
                (estado === ESTADOS.ENVIADA && idUsuarioActual !== idResponsableUbicacion) || // ENVIADO, y el usuario actual no es el responsable de bodega
                (estado === ESTADOS.CERRADA) // CERRADA
            ) {
                const camposBloquear = [
                    "custrecord_2win_consumo_solicitante",
                    "custrecord_2win_consumo_fecha",
                    "custrecord_2win_consumo_nota",
                    "custrecord_2win_consumo_subsidiaria",
                    "custrecord_2win_consumo_departamento",
                    "custrecord_2win_consumo_clase",
                    "custrecord_2win_consumo_ubicacion",
                    "isinactive"
                ];

                camposBloquear.forEach((fieldId) => {
                    const field = form.getField(fieldId);
                    if (field) {
                        field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
                    }
                });

                nLog.debug("bloquearCamposAntesDeCargarRegistro - estado", {
                    estado: estado,
                    form: form
                });
    
                // Recuperar sublista
                const sublist = form.getSublist({ id: "recmachcustrecord_2win_consumo_det_ref" });
                nLog.debug("bloquearCamposAntesDeCargarRegistro - sublist", { sublist: sublist });
    
                // Si hay sublista y conteo de lineas, desactivar campos
                if (sublist && sublist.lineCount > 0) {
                    // Listado de campo a desactivar
                    const sublistFields = [
                        'custrecord_2win_consumo_det_articulo',
                        'custrecord_2win_consumo_det_cantidad',
                        'custrecord_2win_consumo_det_ubicacion',
                        'custrecord_2win_consumo_det_departamento'
                    ];
    
                    // Desactivar cada campo del listado
                    sublistFields.forEach((fieldId) => {
                        const field = sublist.getField({ id: fieldId });
                        if (field) {
                            field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
                        };
                    });
                }
            } else if (estado === ESTADOS.ENVIADA) {
                const camposBloquear = [
                    "custrecord_2win_consumo_solicitante",
                    "custrecord_2win_consumo_fecha",
                    "custrecord_2win_consumo_nota",
                    "custrecord_2win_consumo_subsidiaria",
                    "custrecord_2win_consumo_departamento",
                    "custrecord_2win_consumo_clase",
                    "custrecord_2win_consumo_ubicacion",
                    "isinactive"
                ];

                camposBloquear.forEach((fieldId) => {
                    const field = form.getField(fieldId);
                    if (field) {
                        field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
                    }
                });
            }
        } catch (error) {
            nLog.error("bloquearCamposAntesDeCargarRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function recuperarCamposRegistro
     * @param {object} parametro - Parametros necesarios para cargar registro
     * @returns {object} - Valores de campos recuperados
     */
    function recuperarCamposRegistro(parametro) {
        try {
            nLog.debug("recuperarCamposRegistro - parametro", { parametro: parametro});

            // Cargar registro
            const registro = record.load({ type: parametro.type, id: parametro.id });

            // Recuperar campos de cuerpo registro
            const camposCuerpoRegistro = {
                custrecord_2win_consumo_estado: registro.getValue("custrecord_2win_consumo_estado"),
                custrecord_2win_consumo_solicitante: registro.getText("custrecord_2win_consumo_solicitante"),
                custrecord_2win_consumo_fecha: registro.getValue("custrecord_2win_consumo_fecha"),
                custrecord_2win_consumo_nota: registro.getValue("custrecord_2win_consumo_nota")
            };

            return camposCuerpoRegistro;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }

    /**
     * 
     * @param {object} registro 
     */
    function recuperarLineasSublistaDetalleSolictudConsumo(registro) {
        try {
            nLog.debug("recuperarLineasSublistaDetalleSolictudConsumo - registro", {
                registro: registro
            });

            const SUBLISTA_ID = 'recmachcustrecord_2win_consumo_det_ref';
            const CAMPO_ID_DETALLE = 'id'; // Campo que guarda el ID del registro a eliminar

            // Obtener todos los internalid de los registros relacionados a la sublista
            let internalidRegistrosSolicitudConsumoDetalle = [];
            let conteoLineasDetalle = newRecord.getLineCount({ sublistId: SUBLISTA_ID });

            for (let i = 0; i < conteoLineasDetalle; i++) {
                let internalid = newRecord.getSublistValue({
                    sublistId: SUBLISTA_ID,
                    fieldId: CAMPO_ID_DETALLE,
                    line: i
                });
                nLog.debug("recuperarLineasSublistaDetalleSolictudConsumo - internalid", {
                    internalid: internalid  
                }); 

                if (internalid) {
                    internalidRegistrosSolicitudConsumoDetalle.push(internalid.toString());
                };
            };

            nLog.debug("recuperarLineasSublistaDetalleSolictudConsumo - internalidRegistrosSolicitudConsumoDetalle", {
                extension: internalidRegistrosSolicitudConsumoDetalle.length,
                internalidRegistrosSolicitudConsumoDetalle: internalidRegistrosSolicitudConsumoDetalle
            });
            return internalidRegistrosSolicitudConsumoDetalle;
        } catch (error) {
            nLog.error("recuperarLineasSublistaDetalleSolictudConsumo - error", error);
            throw error;
        }
    }

    return {
        definirValoresPorDefectoCreacion: definirValoresPorDefectoCreacion,
        bloquearCamposAntesDeCargarRegistro: bloquearCamposAntesDeCargarRegistro,
        recuperarCamposRegistro: recuperarCamposRegistro,
        recuperarLineasSublistaDetalleSolictudConsumo: recuperarLineasSublistaDetalleSolictudConsumo
    };
});
