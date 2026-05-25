/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["./moment", "N/format", "N/log", "N/query"], function (moment, format, nLog, query) {
    const searchNationalityIdByKey = (uniqueKey) => {
        nLog.debug("searchNationalityIdByKey", uniqueKey);
        if (!uniqueKey) return null;
        return query
            .runSuiteQL({
                query: `
            select
                id,
                name
            from customrecord_2win_nacionalidades
            where
                custrecord_2wincodigosnacionalidadhl7 = ?`,
                params: [uniqueKey]
            })
            .asMappedResults()[0]?.id;
    };
    const searchComunaByCode = (code) => {
        return query
            .runSuiteQL({
                query: `
            SELECT id
            FROM customrecord_2w_comunas_chile
            where
            custrecord_2wincodigoscomunashl7 = ?`,
                params: [code]
            })
            .asMappedResults()[0]?.id;
    };
    const searchRegionByCode = (code) => {
        return query
            .runSuiteQL({
                query: `
            SELECT id
            FROM customrecord_2w_regiones_chile
            where
            custrecord_2w_regiones_chile_hl7 = ?`,
                params: [code]
            })
            .asMappedResults()[0]?.id;
    };
    const searchCiudadByCode = (code) => {
        return query
            .runSuiteQL({
                query: `
            SELECT id
            FROM customrecord_2win_ciudades_chile
            where
            custrecord_2wincodigosciudadeshl7 = ?`,
                params: [code]
            })
            .asMappedResults()[0]?.id;
    };

    function convertirFecha(cadenaFecha) {
        const anio = parseInt(cadenaFecha.substring(0, 4), 10);
        const mes = parseInt(cadenaFecha.substring(4, 6), 10) - 1; // Los meses en JS van de 0 a 11
        const dia = parseInt(cadenaFecha.substring(6, 8), 10);

        return new Date(anio, mes, dia);
    }
    /**
     * @function mapearCampos - Construye el objeto con campos para registro
     * @param {Object} parametro - Objeto con datos a mapear
     */
    function mapearCampos(parametro) {
        try {
            nLog.debug("mapearCampos - parametro", parametro);

            // Definir variable que almacenará campos mapeados
            let datos = {
                addressbook: [],
                mrg: []
            };

            // La ruta a los segmentos es parametro.children[0].children en tu estructura
            const segmentos = parametro.children;

            // Recorrer segmentos (PID, MRG, etc.)
            segmentos.forEach(function (segmento) {
                if (!segmento) return; // Si el segmento es nulo, continuar

                // --- Mapeo de Datos del Paciente (Segmento PID) ---
                if (segmento.name === "PID") {
                    // Recorrer campos de segmento PID
                    segmento.children?.forEach(function (campo) {
                        // PID-2 (Patient ID): Usado para RUT en tu caso. Es no estándar pero se respeta tu lógica.
                        // El estándar suele usar PID-3 para el ID principal.
                        if (campo.name === "PID-2" && campo.children) {
                            campo.children?.forEach(function (subcampo) {
                                if (subcampo.name === "PID-2.4" && subcampo.value) datos.custentity_2win_tipo_documento = subcampo.value;
                                if (datos.custentity_2win_tipo_documento && datos.custentity_2win_tipo_documento.trim() === "PAS") {
                                    datos.custentity_2win_pasaporte = datos.custentity_2wrut;
                                    delete datos.custentity_2wrut;
                                } else {
                                    if (subcampo.name === "PID-2.0" && subcampo.value) datos.custentity_2wrut = subcampo.value;
                                }
                            });
                        }

                        // PID-3 (Patient Identifier List): ID principal del paciente.
                        if (campo.name === "PID-3" && campo.value) {
                            campo.children?.forEach(function (subcampo) {
                                if (subcampo.name === "PID-3.0" && subcampo.value) datos.externalid = subcampo.value;
                                // if (subcampo.name === "PID-2.4" && subcampo.value) datos.custentity_2win_tipo_documento = subcampo.value;
                            });
                            if (!campo.children) datos.externalid = campo.value;
                        }

                        // PID-5 (Patient Name): Nombre del paciente.
                        if (campo.name === "PID-5" && campo.children) {
                            campo.children?.forEach(function (subcampo) {
                                if (subcampo.name === "PID-5.0" && subcampo.value) {
                                    datos.lastname = subcampo.value.trim().substring(0, 32);
                                }
                                if (subcampo.name === "PID-5.1" && subcampo.value) {
                                    datos.firstname = subcampo.value.trim().substring(0, 32);
                                }
                                if (subcampo.name === "PID-5.2" && subcampo.value) {
                                    // Concatenar y luego limitar a 32 caracteres
                                    datos.lastname = (`${datos.lastname} ${subcampo.value.trim()}`).substring(0, 32);
                                }
                            });
                        }

                        // PID-7 (Date/Time of Birth): Fecha de nacimiento.
                        if (campo.name === "PID-7" && campo.value) {
                            let fechaFormateada = convertirFecha(campo.value);
                            nLog.debug("PID-7 - fechas", {
                                fechaOriginal: campo.value,
                                fechaFormateada: fechaFormateada
                            });
                            datos.custentity_2win_fecha_nacimiento = fechaFormateada;
                        }

                        // PID-8 (Administrative Sex): Sexo.
                        if (campo.name === "PID-8" && campo.value) datos.custentity_2win_sexo = campo.value;

                        // PID-13 (Phone Number - Home): Puede contener teléfono y/o email.
                        if (campo.name === "PID-13" && campo.value) {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "PID-13.0") datos.phone = subcampo.value;
                                if (subcampo.name === "PID-13.3") datos.email = subcampo.value;
                            });
                            // if (campo.value.includes("@")) {
                            //     datos.email = campo.value;
                            // } else {
                            //     datos.phone = campo.value;
                            // }
                        }
                        // PID-14 (Phone Number - Business): Es para teléfono de trabajo, no para email.
                        if (campo.name === "PID-14" && campo.value && !datos.phone) {
                            // Solo lo asignamos si el teléfono principal (PID-13) no vino.
                            datos.phone = campo.value;
                        }

                        // Este es el campo estándar para la dirección.
                        if (campo.name === "PID-11") {
                            let addressbook = {
                                defaultbilling: true,
                                defaultshipping: true,
                                label: "Principal", // Usamos una etiqueta por defecto
                                addressbookaddress: {
                                    label: "Principal",
                                    addressee: "",
                                    addrphone: "", // Se asignará más adelante si se encuentra un teléfono
                                    addr1: "",
                                    addr2: "",
                                    state: "",
                                    city: "",
                                    // country: "",
                                    custrecord_2w_ciudad_chile: "",
                                    custrecord_2w_region_chile: "",
                                    custrecord_2win_comunas_chile: "",
                                    custrecord_2w_nacionalidad: "72"
                                }
                            };

                            // Si la dirección es simple (solo texto)
                            if (campo.value && !campo.children) {
                                addressbook.addressbookaddress.addr1 = campo.value;
                            }

                            // Si la dirección es compleja (con sub-campos)
                            if (campo.children) {
                                campo.children?.forEach(function (subcampo) {
                                    // Mapeo estándar para XAD (Dirección Extendida)
                                    if (subcampo.name === "PID-11.0" && subcampo.value) addressbook.addressbookaddress.addr1 = subcampo.value; // Calle y número
                                    if (subcampo.name === "PID-11.2" && subcampo.value) addressbook.addressbookaddress.city = subcampo.value; // Ciudad
                                    if (subcampo.name === "PID-11.3" && subcampo.value) addressbook.addressbookaddress.state = subcampo.value; // Estado o Región
                                });
                            }
                            datos.addressbook.push(addressbook);
                        }
                        if (campo.name === "PID-23") {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "PID-23.0") {
                                    if (subcampo.value && datos.addressbook.length > 0) {
                                        datos.addressbook[0].addressbookaddress.city = subcampo.value;
                                    }
                                }
                            });
                            if (campo.value && !campo.children && datos.addressbook.length > 0) {
                                datos.addressbook[0].addressbookaddress.city = campo.value;
                            }
                            if (datos.addressbook[0].addressbookaddress.city)
                                datos.addressbook[0].addressbookaddress.custrecord_2w_ciudad_chile = searchCiudadByCode(datos.addressbook[0].addressbookaddress.city);
                        }
                        if (campo.name === "PID-24") {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "PID-24.0") {
                                    if (subcampo.value && datos.addressbook.length > 0) {
                                        datos.addressbook[0].addressbookaddress.state = subcampo.value;
                                    }
                                }
                            });
                            if (campo.value && !campo.children && datos.addressbook.length > 0) {
                                datos.addressbook[0].addressbookaddress.state = campo.value;
                            }
                            if (datos.addressbook[0].addressbookaddress.state)
                                datos.addressbook[0].addressbookaddress.custrecord_2w_region_chile = searchRegionByCode(datos.addressbook[0].addressbookaddress.state) || "";
                        }
                        /**Campo Nuevo */
                        if (campo.name === "PID-25") {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "PID-25.0") {
                                    if (subcampo.value && datos.addressbook.length > 0) {
                                        datos.addressbook[0].addressbookaddress.custrecord_2w_nacionalidad = searchNationalityIdByKey(subcampo.value) || "72";
                                        datos.custentity_2win_codigo_nacionalidad = subcampo.value;
                                    }
                                }
                            });
                            if (campo.value && !campo.children && datos.addressbook.length > 0) {
                                datos.custentity_2win_codigo_nacionalidad = campo.value;
                                datos.addressbook[0].addressbookaddress.custrecord_2w_nacionalidad = searchNationalityIdByKey(campo.value) || "72";
                            }
                        }
                        if (campo.name === "PID-17") {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "PID-17.0") {
                                    if (subcampo.value && datos.addressbook.length > 0) {
                                        datos.addressbook[0].addressbookaddress.addr2 = subcampo.value;
                                        datos.addressbook[0].addressbookaddress.custrecord_2win_comunas_chile = searchComunaByCode(subcampo.value) || "";
                                    }
                                }
                                // if (subcampo.name === "PID-17.1") {
                                //     if (subcampo.value && datos.addressbook.length > 0) {
                                //         datos.addressbook[0].addressbookaddress.country = searchCountryIdByKey(subcampo.value);
                                //     }
                                // }
                            });
                        }
                    });
                }

                // <-- NUEVO: Soporte para Segmento MRG (Merge) ---
                if (segmento.name === "MRG") {
                    segmento.children?.forEach(function (campo) {
                        // MRG-1 contiene el ID del paciente "incorrecto" o "fuente" que se va a fusionar.
                        if (campo.name === "MRG-1" && campo.value) {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "MRG-1.0") datos.mrg.push({ externalid_a_fusionar: subcampo.value });
                            });
                            if (!campo.children && campo.value) datos.mrg.push({ externalid_a_fusionar: campo.value });
                        }
                        if (campo.name === "MRG-2" && campo.value) {
                            campo.children?.forEach((subcampo) => {
                                if (subcampo.name === "MRG-2.0") datos.mrg.push({ externalid_a_fusionar: subcampo.value });
                            });
                            if (!campo.children && campo.value) datos.mrg.push({ externalid_a_fusionar: campo.value });
                        }
                    });
                }
                if (segmento.name === "PV1") {
                    segmento.children?.forEach(function (campo) {
                        if (campo.name === "PV1-43" && campo.value) {
                            datos.rutSubsidiaria = campo.value;
                        }
                    });
                }
            });

            // Asignar el teléfono del paciente a su dirección principal si existe
            if (datos.phone && datos.addressbook.length > 0) {
                datos.addressbook[0].addressbookaddress.addrphone = datos.phone;
            }

            // Asignar nombre completo del paciente como destinatario en la dirección
            if (datos.firstname && datos.lastname && datos.addressbook.length > 0) {
                datos.addressbook[0].addressbookaddress.addressee = `${datos.firstname} ${datos.lastname}`;
            }
            datos.entityid = `${datos.firstname} ${datos.lastname} - ${datos.externalid}`;
            datos.custentity_pac_numficha = datos.externalid;
            nLog.debug("mapearCampos - datos", datos);
            return datos;
        } catch (error) {
            nLog.error("mapearCampos - error", error);
            return null; // Devolver null para indicar que el mapeo falló
        }
    }

    /**
     * @function mapearCamposCustodia - Construye el objeto con campos para registro
     * @param {Object} parametro - Objeto con datos a mapear
     * @returns {Object} - Objeto con campos mapeados
     */
    function mapearCamposCustodia(parametro) {
        try {
            nLog.debug("mapearCamposCustodia - parametro", parametro);

            // Definir variable que almacenara campos mapeados
            let datos = {};

            let interfaces = {
                "ADT^A04": "creacion",
                "ADT^A08": "edicion",
                "ADT^A40": "merge",
                "ADT^A23": "anulacion",
                "ADT^A31": "modificacion ingreso"
            };

            // Recorrer segmentos y campos de mensaje HL7 parseado
            parametro.children?.forEach(function (segmento) {
                if (segmento && segmento !== null) {
                    if (segmento.name === "MSH") {
                        // Recorrer campos de segmento
                        segmento.children?.forEach(function (campo) {
                            // Evaluar nombre de campo y definir propiedades de campo
                            if (campo.name === "MSH-3" && campo.value) datos.custrecord_2win_as_emisor = campo.value;
                            if (campo.name === "MSH-5" && campo.value) datos.custrecord_2win_as_receptor = campo.value;
                            if (campo.name === "MSH-7" && campo.value) {
                                datos.custrecord_2win_as_fecha_mensaje = campo.value;
                            }
                            if (campo.name === "MSH-9" && campo.value) datos.custrecord_2win_as_interface = interfaces[campo.value];
                            if (campo.name === "MSH-10" && campo.value) datos.externalid = campo.value;
                        });
                    }
                    // Evaluar nombre de segmento
                    if (segmento.name === "PID") {
                        // Recorrer campos de segmento
                        segmento.children?.forEach(function (campo) {
                            // Evaluar nombre de campo y definir propiedades de campos
                            // PID-3 (Patient Identifier List): ID principal del paciente.
                            if (campo.name === "PID-3" && campo.value) {
                                datos.custrecord_2win_as_id_registro = campo.value;
                            }
                        });
                    }
                }
            });
            nLog.debug("mapearCamposCustodia - datos", datos);

            return datos;
        } catch (error) {
            nLog.error("mapearCamposCustodia - error", error);
        }
    }

    /**
     * @function mapearCamposAck - Construye el objeto con campos para registro
     * @param {Object} parametro - Objeto con datos a mapear
     * @returns {Object} - Objeto con campos mapeados
     */
    function mapearCamposAck(parametro) {
        try {
            nLog.debug("mapearCamposAck - parametro", parametro);

            // Definir variable que almacenara campos mapeados
            let datos = {};

            // Recorrer segmentos y campos de mensaje HL7 parseado
            parametro.children?.forEach(function (segmento) {
                if (segmento && segmento !== null) {
                    if (segmento.name === "MSH") {
                        // Recorrer campos de segmento
                        segmento.children?.forEach(function (campo) {
                            // Evaluar nombre de campo y definir propiedades de campo
                            if (campo.name === "MSH-3" && campo.value) datos.sendingApplication = campo.value;
                            if (campo.name === "MSH-4" && campo.value) datos.sendingFacility = campo.value;
                            if (campo.name === "MSH-5" && campo.value) datos.receivingApplication = campo.value;
                            if (campo.name === "MSH-6" && campo.value) datos.receivingFacility = campo.value;
                            if (campo.name === "MSH-10" && campo.value) datos.idMensajeOriginal = campo.value;
                        });
                    }
                }
            });
            nLog.debug("mapearCamposAck - datos", datos);

            return datos;
        } catch (error) {
            nLog.error("mapearCamposAck - error", error);
        }
    }
    function mapearCamposOrdenDeVenta(parametro) {
        // Estructura de respuesta unificada que cubre todos los tipos de mensajes
        const respuesta = {
            // MSH Segment: Datos del mensaje (común a todos)
            mensaje: {},
            // EVN Segment: Datos del evento (común a ADT)
            evento: {},
            // PID Segment: Datos del paciente (común a todos)
            paciente: {},
            // PV1 Segment: Datos de la admisión/visita (varía según el mensaje)
            admision: {},
            // OBX Segment: Observaciones (para ADT^A01, ADT^A31)
            observaciones: [],
            // RDE Group: Ordenes de farmacia (para RDE^025)
            ordenes: []
        };

        if (!parametro || !parametro.children) {
            return respuesta; // Devuelve la estructura vacía si el parámetro es inválido
        }

        const segmentos = parametro.children;

        // --- 1. Identificar el tipo de mensaje ---
        let tipoMensaje = "";
        const mshSegment = segmentos.find((s) => s?.name === "MSH");
        if (mshSegment) {
            const msh9 = mshSegment.children.find((f) => f?.name === "MSH-9");
            if (msh9) {
                tipoMensaje = msh9.children?.find((sf) => sf?.name === "MSH-9.1")?.value ?? msh9.value;
            }
        }
        respuesta.mensaje.tipoMensaje = tipoMensaje;

        // --- 2. Función auxiliar para encontrar valores de forma segura ---
        const findValue = (field, subFieldName = null) => {
            if (!field) return undefined;
            if (subFieldName) {
                const subField = field.children?.find((sf) => sf?.name === subFieldName);
                return subField?.value ?? field.value ?? undefined;
            }
            return field.value;
        };

        // Variable para agrupar las órdenes de farmacia
        let currentOrder = null;

        // --- 3. Recorrer y mapear cada segmento ---
        segmentos.forEach(function (segmento) {
            if (!segmento) return;

            const getField = (fieldName) => segmento.children.find((f) => f?.name === fieldName);

            switch (segmento.name) {
                // --- Mapeo de MSH (Común a todos) ---
                case "MSH":
                    respuesta.mensaje.separadorCampo = findValue(getField("MSH-1"));
                    respuesta.mensaje.caracteresCodificacion = findValue(getField("MSH-2"));
                    respuesta.mensaje.aplicacionEnvio = findValue(getField("MSH-3"), "MSH-3.1");
                    respuesta.mensaje.clinicaEnvio = findValue(getField("MSH-4"), "MSH-4.1");
                    respuesta.mensaje.aplicacionRecepcion = findValue(getField("MSH-5"), "MSH-5.1");
                    respuesta.mensaje.instalacionRecepcion = findValue(getField("MSH-6"), "MSH-6.1");
                    respuesta.mensaje.fechaHoraMensaje = findValue(getField("MSH-7"), "MSH-7.1");
                    respuesta.mensaje.identificadorUnicoMensaje = findValue(getField("MSH-10"), "MSH-10.1");
                    respuesta.mensaje.prioridadMensaje = findValue(getField("MSH-11"), "MSH-11.1");
                    break;

                // --- Mapeo de EVN (Común a mensajes ADT) ---
                case "EVN":
                    respuesta.evento.tipoEvento = findValue(getField("EVN-1"), "EVN-1.1");
                    respuesta.evento.fechaHoraEvento = findValue(getField("EVN-2"), "EVN-2.1");
                    break;

                // --- Mapeo de PID (Común a todos) ---
                case "PID":
                    // externalid es el identificador único del paciente
                    respuesta.paciente.idUnicoPaciente = findValue(getField("PID-2"), "PID-2.1");
                    break;

                // --- Mapeo de PV1 (Varía según el tipo de mensaje) ---
                case "PV1":
                    // Campos comunes a casi todos los ADT
                    respuesta.admision.numeroRegistro = findValue(getField("PV1-2"), "PV1-2.1");
                    respuesta.admision.numeroAdmision = findValue(getField("PV1-5"), "PV1-5.1");
                    respuesta.admision.numeroCuentaPaciente = findValue(getField("PV1-19"), "PV1-19.1");

                    // Lógica específica por tipo de mensaje para PV1
                    if (tipoMensaje === "ADT^A01" || tipoMensaje === "ADT^A31") {
                        Object.assign(respuesta.admision, {
                            servicioIngresoCodigo: findValue(getField("PV1-3"), "PV1-3.1"),
                            servicioIngresoNombre: findValue(getField("PV1-3"), "PV1-3.2"),
                            procedencia: findValue(getField("PV1-3"), "PV1-3.3"),
                            leyPrevisional: findValue(getField("PV1-3"), "PV1-3.4"),
                            companiaSeguro: findValue(getField("PV1-3"), "PV1-3.5"),
                            fechaIngreso: findValue(getField("PV1-5"), "PV1-5.2"),
                            horaIngreso: findValue(getField("PV1-5"), "PV1-5.3"),
                            prestadorTratanteRUT: findValue(getField("PV1-7"), "PV1-7.1"),
                            prestadorTratanteNombre: findValue(getField("PV1-7"), "PV1-7.2"),
                            responsableCuentaRUT: findValue(getField("PV1-8"), "PV1-8.1"),
                            responsableCuentaNombre: findValue(getField("PV1-8"), "PV1-8.2"),
                            previsionCodigo: findValue(getField("PV1-11"), "PV1-11.1"),
                            previsionNombre: findValue(getField("PV1-11"), "PV1-11.2"),
                            tramoFonasa: findValue(getField("PV1-11"), "PV1-11.3"),
                            ramaFFAA: findValue(getField("PV1-11"), "PV1-11.5"),
                            convenioCodigo: findValue(getField("PV1-11"), "PV1-11.6"),
                            convenioNombre: findValue(getField("PV1-11"), "PV1-11.7"),
                            paqueteCodigo: findValue(getField("PV1-11"), "PV1-11.8"),
                            paqueteNombre: findValue(getField("PV1-11"), "PV1-11.9"),
                            tipoAtencion: findValue(getField("PV1-18"), "PV1-18.1")
                        });
                    } else if (tipoMensaje === "ADT^A23") {
                        respuesta.admision.fechaAnulacion = findValue(getField("PV1-10"), "PV1-10.1");
                    } else if (tipoMensaje === "ADT^A06") {
                        respuesta.admision.numeroRegistroUrgencia = findValue(getField("PV1-4"), "PV1-4.1");
                        respuesta.admision.numeroIngresoUrgencia = findValue(getField("PV1-6"), "PV1-6.1");
                        respuesta.admision.numeroCuentaPacienteUrgencia = findValue(getField("PV1-20"), "PV1-20.1");
                    } else if (tipoMensaje === "RDE^025") {
                        respuesta.admision.identificadorConsumo = findValue(getField("PV1-4"), "PV1-4.1");
                    }
                    break;

                // --- Mapeo de OBX (para ADT^A01 y ADT^A31) ---
                case "OBX":
                    const observacion = {
                        tipoDocumento: findValue(getField("OBX-3"), "OBX-3.2"),
                        folioDocumento: findValue(getField("OBX-4"), "OBX-4.1"),
                        rutTitular: findValue(getField("OBX-7"), "OBX-7.1"),
                        nombreTitular: findValue(getField("OBX-13"), "OBX-13.1")
                    };
                    respuesta.observaciones.push(observacion);
                    break;

                // --- Mapeo de Grupo de Orden de Farmacia (RDE^025) ---
                case "ORC":
                    if (currentOrder) {
                        // Si ya había una orden, la guardamos
                        respuesta.ordenes.push(currentOrder);
                    }
                    currentOrder = {
                        // Iniciamos una nueva orden
                        control: { numeroSolicitud: findValue(getField("ORC-2"), "ORC-2.1") },
                        receta: {},
                        detalleReceta: {}
                    };
                    break;
                case "RXE":
                    if (currentOrder) {
                        currentOrder.receta = {
                            unidadMedida: findValue(getField("RXE-2"), "RXE-2.1"),
                            codProducto: findValue(getField("RXE-3"), "RXE-3.1"),
                            cantidad: findValue(getField("RXE-4"), "RXE-4.1"),
                            servicioSolicitante: findValue(getField("RXE-5"), "RXE-5.1"),
                            bodegaDestino: findValue(getField("RXE-7"), "RXE-7.1")
                        };
                    }
                    break;
                case "RXD":
                    if (currentOrder) {
                        currentOrder.detalleReceta = {
                            precioUnitarioNeto: findValue(getField("RXD-10"), "RXD-10.1"),
                            precioVentaNeto: findValue(getField("RXD-12"), "RXD-12.1")
                        };
                    }
                    break;
            }
        });

        // Asegurarse de agregar la última orden del bucle
        if (currentOrder) {
            respuesta.ordenes.push(currentOrder);
        }

        return respuesta;
    }
    return {
        mapearCampos: mapearCampos,
        mapearCamposCustodia: mapearCamposCustodia,
        mapearCamposAck: mapearCamposAck,
        mapearCamposOrdenDeVenta: mapearCamposOrdenDeVenta,
        convertirFecha: convertirFecha
    };
});
