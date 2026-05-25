/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["../dao/2win_dao_cliente", "../dao/2win_dao_orden_venta", "../dao/2win_dao_producto", "../dao/2win_dao_tipo_atencion", "../dao/2win_dao_subsidiaria", "./moment", "N/log", "./2win_lib_mapeo", "N/runtime"], function (daoCliente, daoOrdenVenta, daoProducto, daoTipoAtencion, daoSubsidiaria, moment, nLog, libMapeo, runtime) {
    /**
     * @function mapearCamposJSON
     * @description Extrae y mapea los datos de un paciente desde un objeto JSON a un formato compatible con NetSuite.
     * @param {Object} jsonBody - El cuerpo de la solicitud en formato JSON, estructurado según el esquema de la API.
     * @returns {Object|null} - Un objeto con los datos del cliente mapeados o null si ocurre un error.
     */
    function mapearCamposJSON(jsonBody) {
        try {
            const datos = {
                addressbook: [],
                mrg: []
            };

            const { PID, MRG } = jsonBody;

            if (PID) {
                // Mapeo de campos de NetSuite desde el segmento PID
                datos.custentity_2wrut = PID.patientID; // Asumiendo que patientID es el RUT
                datos.custentity_2win_tipo_documento = PID.patientID?.typeCode || "RUT"; // Opcional, si se especifica un tipo
                datos.externalid = `${datos.custentity_2win_tipo_documento}_${PID.patientID}`;
                datos.lastname = PID.patientName?.familyName || "";
                datos.firstname = PID.patientName?.givenName || "";
                if (PID.patientName?.middleName) {
                    datos.firstname += ` ${PID.patientName.middleName}`;
                }
                datos.custentity_2win_fecha_nacimiento = PID.dateTimeOfBirth ? new Date(PID.dateTimeOfBirth) : null;
                datos.custentity_2win_sexo = PID.administrativeSex;
                datos.email = PID.phoneNumberHome?.emailAddress;
                datos.phone = PID.phoneNumberHome?.phoneNumber;

                // Mapeo de la dirección
                if (PID.patientAddress) {
                    const addressbook = {
                        defaultbilling: true,
                        defaultshipping: true,
                        label: "Principal",
                        addressbookaddress: {
                            label: "Principal",
                            addressee: `${datos.firstname} ${datos.lastname}`,
                            addrphone: datos.phone || "",
                            addr1: PID.patientAddress.streetAddress || "",
                            city: PID.patientAddress.city || "",
                            state: PID.patientAddress.stateOrProvince || ""
                        }
                    };
                    datos.addressbook.push(addressbook);
                }
            }

            if (MRG) {
                // Mapeo del segmento MRG para fusión de clientes
                const mrgObj = {
                    externalid_a_fusionar: `${MRG.priorPatientIdentifierList?.typeCode || "RUT"}_${MRG.priorPatientIdentifierList?.idNumber}`
                };
                datos.mrg.push(mrgObj);
            }

            nLog.debug("mapearCamposJSON - datos", datos);
            return datos;
        } catch (error) {
            nLog.error("mapearCamposJSON - error", error);
            return null;
        }
    }

    /**
     * @function mapearCamposCustodiaJSON
     * @description Extrae y mapea los datos de auditoría (custodia) desde un objeto JSON.
     * @param {Object} jsonBody - El cuerpo de la solicitud en formato JSON.
     * @returns {Object|null} - Un objeto con los datos de custodia mapeados o null si ocurre un error.
     */
    function mapearCamposCustodiaJSON(jsonBody) {
        try {
            const datos = {};
            const { MSH, PID } = jsonBody;

            if (MSH) {
                datos.custrecord_2win_as_emisor = MSH.sendingApplication;
                datos.custrecord_2win_as_receptor = MSH.receivingApplication;
                datos.custrecord_2win_as_fecha_mensaje = MSH.timestamp ? new Date(MSH.timestamp) : new Date();
                datos.custrecord_2win_as_interface = MSH.messageType; // ej: "ADT^A04"
                datos.externalid = MSH.controlID;
            }

            if (PID) {
                const idTypeCode = PID.patientID?.typeCode || "RUT";
                const idValue = PID.patientID?.idNumber || PID.patientID;
                datos.custrecord_2win_as_id_registro = `${idTypeCode}_${idValue}`;
            }

            nLog.debug("mapearCamposCustodiaJSON - datos", datos);
            return datos;
        } catch (error) {
            nLog.error("mapearCamposCustodiaJSON - error", error);
            return null;
        }
    }

    /**
     * @function mapearCamposAckJSON
     * @description Extrae los datos necesarios para construir un mensaje ACK desde un objeto JSON.
     * @param {Object} jsonBody - El cuerpo de la solicitud en formato JSON.
     * @returns {Object|null} - Un objeto con los datos para el ACK o null si ocurre un error.
     */
    function mapearCamposAckJSON(jsonBody) {
        try {
            const datos = {};
            const { MSH } = jsonBody;

            if (MSH) {
                datos.sendingApplication = MSH.receivingApplication; // Invertimos emisor y receptor
                datos.sendingFacility = MSH.receivingFacility;
                datos.receivingApplication = MSH.sendingApplication;
                datos.receivingFacility = MSH.sendingFacility;
                datos.idMensajeOriginal = MSH.controlID;
            }

            nLog.debug("mapearCamposAckJSON - datos", datos);
            return datos;
        } catch (error) {
            nLog.error("mapearCamposAckJSON - error", error);
            return null;
        }
    }

    /**
     * @function mapearCamposOrdenDeVentaJSON
     * @description Extrae y mapea una estructura compleja de datos de órdenes de venta desde un objeto JSON.
     * @param {Object} jsonBody - El cuerpo de la solicitud en formato JSON.
     * @returns {Object|null} - Un objeto con toda la estructura de la orden de venta mapeada o null si ocurre un error.
     */
    function mapearCamposOrdenDeVentaJSON(jsonBody) {
        try {
            const { MSH, EVN, PID, PV1, OBX, RDE } = jsonBody;
            const respuesta = {
                mensaje: {},
                evento: {},
                paciente: {},
                admision: {},
                observaciones: [],
                ordenes: []
            };

            if (MSH) {
                respuesta.mensaje = {
                    tipoMensaje: MSH.messageType,
                    aplicacionEnvio: MSH.sendingApplication,
                    clinicaEnvio: MSH.sendingFacility,
                    aplicacionRecepcion: MSH.receivingApplication,
                    instalacionRecepcion: MSH.receivingFacility,
                    fechaHoraMensaje: MSH.timestamp,
                    identificadorUnicoMensaje: MSH.controlID,
                    prioridadMensaje: MSH.messagePriority
                };
            }

            if (EVN) {
                respuesta.evento = {
                    tipoEvento: EVN.eventTypeCode,
                    fechaHoraEvento: EVN.recordedDateTime
                };
            }

            if (PID) {
                respuesta.paciente.idUnicoPaciente = PID.patientID;
            }

            if (PV1) {
                respuesta.admision = { ...PV1 }; // Copia directa si los nombres coinciden
            }

            if (OBX && Array.isArray(OBX)) {
                respuesta.observaciones = OBX.map((obs) => ({ ...obs }));
            }

            if (RDE && Array.isArray(RDE)) {
                respuesta.ordenes = RDE.map((orden) => ({ ...orden }));
            }

            return respuesta;
        } catch (error) {
            nLog.error("mapearCamposOrdenDeVentaJSON - error", error);
            return null;
        }
    }

    /**
     * @function mapearCamposCuerpoIngresoAmbulatorio
     * @description Construye el objeto con campos para registro.
     * @param {Object} parametro - Datos de entrada a mapear.
     * @returns {Object} - Un objeto con estructura para campos de cuerpo mapeada.
     * @throws {Error} - Lanza un error si algún valor es inválido.
     */
    function mapearCamposCuerpoIngresoAmbulatorio(parametro) {
        try {
            nLog.audit("mapearCamposCuerpoIngresoAmbulatorio - parametro", parametro);

            // Objeto para campos de registro mapeados
            let camposRegistro = {
                item: [],
            };

            // Validar existencia de dato para campos de cuerpo para registro
            if (parametro.hasOwnProperty("IdPaciente") && parametro.IdPaciente !== "") {
                // Valor IdPaciente corresponde a externalid de customer del lado de netsuite
                camposRegistro.entity = daoCliente.busquedaRegistroPorIdExterno(parametro.IdPaciente)[0].internalid;
            };
            if (parametro.hasOwnProperty("RutEmpresa") && parametro.RutEmpresa !== "") {
                // Ajustar RUT para agregar - a identificador
                let rutFormateado = daoOrdenVenta.formatearRut(parametro.RutEmpresa);

                // Ejecutar busqueda con valor formateado
                camposRegistro.subsidiary = daoSubsidiaria.busquedaRegistroPorRut(rutFormateado)[0].internalid;
            };
            if (parametro.hasOwnProperty("Ficha") && parametro.Ficha !== "") {
                camposRegistro.custbody_2w_ficha_paciente = parametro.Ficha;
            };
            if (parametro.hasOwnProperty("Ingreso") && parametro.Ingreso !== "") {
                camposRegistro.custbody_2w_ingreso_paciente = parametro.Ingreso;
            };
            if (parametro.hasOwnProperty("CuentaPaciente") && parametro.CuentaPaciente !== "") {
                camposRegistro.custbody_2win_nro_cuenta_paciente = parametro.CuentaPaciente;
            };
            if (parametro.hasOwnProperty("CodServicio") && parametro.CodServicio !== "") {
                camposRegistro.department = parametro.detallePrestaciones[0].CodServicio; // Asignar departamento desde el primer elemento detallePrestaciones
            };
            if (parametro.hasOwnProperty("TipoAtencion") && parametro.TipoAtencion !== "") {
                // Recuperar atencion 
                camposRegistro.custbody_2win_tipo_atencion = daoTipoAtencion.busquedaRegistroPorScriptid(parametro.TipoAtencion)[0].internalid;
                const idClase = daoOrdenVenta.getTipoAtencion(parametro.TipoAtencion);
                nLog.debug("mapearCamposCuerpoIngresoAmbulatorio - idclase", { idClase: idClase });
                camposRegistro.class = idClase;
            };
            if (parametro.hasOwnProperty("FechaEnvio") && parametro.FechaEnvio !== "") {
                camposRegistro.custbody_2win_as_fecha_envio = parametro.FechaEnvio
            };
            if (parametro.hasOwnProperty("FechaAlta") && parametro.FechaAlta !== "") {
                camposRegistro.custbody_2win_as_fecha_alta = parametro.FechaAlta
            };

            nLog.audit("mapearCamposCuerpoIngresoAmbulatorio - camposRegistro", camposRegistro);
            return camposRegistro;
        } catch (error) {
            nLog.error("mapearCamposCuerpoIngresoAmbulatorio - error", error);
            throw error;
        }
    }

    /**
     * @function mapearCamposLineaIngresoAmbulatorio
     * @description Construye el objeto con campos para registro, OPTIMIZADA para usar caché de productos.
     * @param {Object} parametro - Datos de entrada a mapear.
     * @param {Object} cacheProductos - Caché de productos (opcional, creado con busquedaMasivaPorUpcCode).
     * @returns {Object} - Un objeto con toda la estructura para linea de mapeada.
     * @throws {Error} - Lanza un error si algún valor es inválido.
     */
    function mapearCamposLineaIngresoAmbulatorio(parametro, cacheProductos) {
        try {
            nLog.audit("mapearCamposLineaIngresoAmbulatorio - parametro", parametro);

            // Variable para almacenar campos de lineas
            let camposLinea = {};

            if (parametro.hasOwnProperty("CrgCorrel") && parametro.CrgCorrel !== "") {
                camposLinea.custcol_2win_as_identificador_fila = parametro.CrgCorrel;
            };
            if (parametro.hasOwnProperty("CodigoGrupoPrefactura") && parametro.CodigoGrupoPrefactura !== "") {
                if (cacheProductos && cacheProductos[parametro.CodigoGrupoPrefactura]) {
                    // Usar producto del caché (SIN consumo de governanza adicional)
                    camposLinea.item = cacheProductos[parametro.CodigoGrupoPrefactura];
                    nLog.debug("mapearCamposLineaIngresoAmbulatorio - producto desde caché", {
                        codigo: parametro.CodigoGrupoPrefactura,
                        internalid: camposLinea.item
                    });
                } else {
                    // Fallback: buscar individualmente (método original)
                    nLog.debug("mapearCamposLineaIngresoAmbulatorio - producto NO encontrado en caché, buscando individualmente", {
                        codigo: parametro.CodigoGrupoPrefactura
                    });
                    camposLinea.item = daoProducto.busquedaRegistroPorUpcCode(parametro.CodigoGrupoPrefactura)[0].internalid;
                }
            };
            if (parametro.hasOwnProperty("RutFinanciador") && parametro.RutFinanciador !== "") {
                // Formatear valor del RUT para que coincida con formato netsuite
                let rutFormateado = daoOrdenVenta.formatearRut(parametro.RutFinanciador);

                // Ejecutar busqueda con valor formateado
                camposLinea.custcol_2win_as_rut_financiador = daoCliente.busquedaRegistroPorRut(rutFormateado)[0].internalid;
            };
            if (parametro.hasOwnProperty("CodigoConvenio") && parametro.CodigoConvenio !== "") {
                camposLinea.custcol_2win_as_codigo_convenio = parametro.CodigoConvenio;
            };
            if (parametro.hasOwnProperty("NombreConvenio") && parametro.NombreConvenio !== "") {
                camposLinea.custcol_2win_as_nombre_convenio = parametro.NombreConvenio;
            };
            if (parametro.hasOwnProperty("CodigoPaquete") && parametro.CodigoPaquete !== "") {
                camposLinea.custcol_2win_as_codigo_paquete = parametro.CodigoPaquete;
            };
            if (parametro.hasOwnProperty("NombrePaquete") && parametro.NombrePaquete !== "") {
                camposLinea.custcol_2win_as_nombre_paquete = parametro.NombrePaquete;
            };
            if (parametro.hasOwnProperty("MontoAfecto") && parametro.MontoAfecto !== "") { // && parametro.MontoAfecto > 0
                camposLinea.MontoAfecto = parametro.MontoAfecto;
            };
            if (parametro.hasOwnProperty("MontoExento") && parametro.MontoExento !== "") { // && parametro.MontoExento > 0
                camposLinea.MontoExento = parametro.MontoExento;
            };
            if (parametro.hasOwnProperty("Iva") && parametro.Iva !== "") { // && parametro.Iva > 0
                camposLinea.Iva = parametro.Iva;
            };
            if (parametro.hasOwnProperty("CodServicio") && parametro.CodServicio !== "") {
                // Validar que el CodServicio sea numerico
                if (!/^[0-9]+$/.test(parametro.CodServicio)) {
                    throw new Error ("Valor invalido para CodServicio, debe ser numerico");
                }
                camposLinea.custcol_2win_as_codigo_servicio = parametro.CodServicio;
            };

            nLog.audit("mapearCamposLineaIngresoAmbulatorio - camposLinea", camposLinea);
            return camposLinea;
        } catch (error) {
            nLog.error("mapearCamposLineaIngresoAmbulatorio - error", error);
            throw error;
        }
    }

    return {
        mapearCampos: mapearCamposJSON,
        mapearCamposCustodia: mapearCamposCustodiaJSON,
        mapearCamposAck: mapearCamposAckJSON,
        mapearCamposOrdenDeVenta: mapearCamposOrdenDeVentaJSON,
        mapearCamposCuerpoIngresoAmbulatorio: mapearCamposCuerpoIngresoAmbulatorio,
        mapearCamposLineaIngresoAmbulatorio: mapearCamposLineaIngresoAmbulatorio
    };
});