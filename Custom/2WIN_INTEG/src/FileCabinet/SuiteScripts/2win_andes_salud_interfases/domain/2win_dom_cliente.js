/**
 * @NApiVersion 2.1
 * @module ./2win_dom_cliente.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_mapeo",
    "../lib/2win_lib_custodia",
    "../lib/2win_lib_hl7/index",
    "../dao/2win_dao_hl7",
    "../dao/2win_dao_cliente",
    "N/log",
    "N/runtime",
    "N/error"
], function (libAuditoria, libMapeo, libCustodia, hl7, hl7_dao, daoCliente, nLog, runtime, error) {
    // Variable para almacenar la respuesta
    let respuesta = {
        code_error: "",
        code_desc: "",
        data: {}
    };

    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "Interfaces andes salud",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    // Variable para almacenar datos de custodia
    let custodia = {};

    // Variable para almacenar datos de mensaje ack
    let camposAck = {};

    /**
     * @function crearRegistroNetsuite - Función para crear un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function crearRegistroNetsuite(parametro) {
        try {
            nLog.audit("crearRegistroNetsuite - parametro", parametro);

            // Marca de inicio
            let tiempoInicio = Date.now();

            // Ajustar objeto proceso
            proceso.etapa = crearRegistroNetsuite.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria

            // Parsear parametro
            let { messageRaw } = parametro;
            let mensajeParseado = hl7_dao.getMessageFromRawMessage(messageRaw ?? "");
            nLog.audit("crearRegistroNetsuite - mensajeParseado", mensajeParseado);

            // Mapear campos para registros en netsuite
            camposAck = libMapeo.mapearCamposAck(mensajeParseado);
            custodia = libMapeo.mapearCamposCustodia(mensajeParseado);
            proceso.datos = libMapeo.mapearCampos(mensajeParseado);
            custodia.custrecord_2win_as_tiempo_proceso = tiempoInicio;
            custodia.custrecord_2win_as_interface = "creacion";
            custodia.datosEntrada = messageRaw;

            // Crear el mensaje HL7
            const { Message, Segment } = hl7.Hl7Builder;
            const message = new Message({
                sendingApplication: camposAck.sendingApplication,
                sendingFacility: camposAck.sendingFacility,
                receivingApplication: camposAck.receivingApplication,
                receivingFacility: camposAck.receivingFacility,
                messageType: "ACK",
                messageEvent: "A04", // Ajustar evento según sea necesario
                messageId: `ACK${String(Math.floor(Math.random() * 90000) + 10000)}`,
                version: "2.5"
            });

            // Crear el segmento MSA (Acknowledgment Segment)
            const msa = new Segment("MSA");

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Validar si existe cliente con el mismo RUT antes de crear
            let registroExistente = null;
            try {
                if (proceso.datos.custentity_2wrut) {
                    registroExistente = daoCliente.busquedaRegistroPorRut(proceso.datos.custentity_2wrut, true);
                }
            } catch (e) {
                // No existe registro con ese RUT, continuar con creación normal
                nLog.debug("crearRegistroNetsuite - validacion RUT", "No existe cliente con el RUT proporcionado");
            }

            // Crear o actualizar registro en netsuite
            if (registroExistente && registroExistente.length > 0) {
                // Cliente existe con ese RUT, actualizar registro existente
                proceso.idRegistroNetsuite = registroExistente[0].internalid;
                proceso = daoCliente.editarRegistro(proceso);
                proceso.descripcionResultado = "Registro actualizado correctamente (RUT existente)";
                nLog.audit("crearRegistroNetsuite - actualizacion", `Cliente actualizado con RUT: ${proceso.datos.custentity_2wrut}, ID: ${proceso.idRegistroNetsuite}`);
            } else {
                // No existe cliente, crear nuevo registro
                proceso = daoCliente.creaRegistro(proceso);
                proceso.descripcionResultado = "Registro creado correctamente";
                nLog.audit("crearRegistroNetsuite - creacion", `Nuevo cliente creado con RUT: ${proceso.datos.custentity_2wrut}`);
            }

            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);

            // Ajustar propiedades de respuesta
            msa.set(1, "AA"); // Código de respuesta: AA (accept), AE (error), AR (reject)
            msa.set(2, camposAck.idMensajeOriginal); // ID del mensaje original al que se responde

            // Agregar el segmento MSA al mensaje
            message.add(msa);

            // Obtener el mensaje HL7 como string
            const hl7MessageString = message.toString();
            nLog.debug("crearRegistroNetsuite - hl7MessageString", hl7MessageString);

            // Ajustar propiedades de respuesta
            respuesta.code_error = "000";
            respuesta.code_desc = "ejecucion exitosa";
            custodia.codigoRespuesta = respuesta.code_error;
            custodia.respuesta = respuesta.code_desc;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }

            // Ajustar propiedades de respuesta
            respuesta.data = proceso;
            respuesta.id = proceso.id;
            return hl7MessageString;
        } catch (err) {
            nLog.error("crearRegistroNetsuite - error", err);

            // Crear el mensaje HL7
            const { Message, Segment } = hl7.Hl7Builder;
            const message = new Message({
                sendingApplication: camposAck.sendingApplication ? camposAck.sendingApplication : "SISTEMA_RECEPTOR",
                sendingFacility: camposAck.sendingFacility ? camposAck.sendingFacility : "ORGANIZACION_RECEPTORA",
                receivingApplication: camposAck.receivingApplication ? camposAck.receivingApplication : "SISTEMA_EMISOR",
                receivingFacility: camposAck.receivingFacility ? camposAck.receivingFacility : "ORGANIZACION_EMISORA",
                messageType: "ACK",
                messageEvent: "A04", // Ajustar evento según sea necesario
                messageId: `ACK${String(Math.floor(Math.random() * 90000) + 10000)}`,
                version: "2.5"
            });

            // Crear el segmento MSA (Acknowledgment Segment)
            const msa = new Segment("MSA");

            // Ajustar propiedades de ack
            msa.set(1, "AE"); // Código de respuesta: AA (accept), AE (error), AR (reject)
            msa.set(2, camposAck.idMensajeOriginal ? camposAck.idMensajeOriginal : "sin id"); // ID del mensaje original al que se responde

            // Agregar el segmento MSA al mensaje
            message.add(msa);

            // Obtener el mensaje HL7 como string
            const hl7MessageString = message.toString();
            nLog.debug("crearRegistroNetsuite - hl7MessageString", hl7MessageString);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = err.message;
            libAuditoria.crearReporteAuditoria(proceso);

            // Ajustar propiedades de respuesta
            respuesta.code_error = "001";
            respuesta.code_desc = "Error durante la ejecucion";
            custodia.codigoRespuesta = respuesta.code_error;
            custodia.respuesta = err.message;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            // Ajustar propiedades de respuesta
            respuesta.data = proceso;

            throw err;
        }
    }

    /**
     * @function editarRegistroNetsuite - Función para editar un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function editarRegistroNetsuite(parametro) {
        try {
            nLog.audit("editarRegistroNetsuite - parametro", parametro);

            // Marca de inicio
            let tiempoInicio = Date.now();

            // Ajustar objeto proceso
            proceso.etapa = editarRegistroNetsuite.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria

            // Parsear parametro
            let { messageRaw } = parametro;
            let mensajeParseado = hl7_dao.getMessageFromRawMessage(messageRaw ?? "");
            nLog.audit("editarRegistroNetsuite - mensajeParseado", mensajeParseado);

            // Mapear campos para registros en netsuite
            camposAck = libMapeo.mapearCamposAck(mensajeParseado);
            custodia = libMapeo.mapearCamposCustodia(mensajeParseado);
            proceso.datos = libMapeo.mapearCampos(mensajeParseado);
            custodia.custrecord_2win_as_tiempo_proceso = tiempoInicio;
            custodia.custrecord_2win_as_interface = "edicion";
            custodia.datosEntrada = messageRaw;

            // Crear el mensaje HL7
            const { Message, Segment } = hl7.Hl7Builder;
            const message = new Message({
                sendingApplication: camposAck.sendingApplication,
                sendingFacility: camposAck.sendingFacility,
                receivingApplication: camposAck.receivingApplication,
                receivingFacility: camposAck.receivingFacility,
                messageType: "ACK",
                messageEvent: "A08", // Ajustar evento según sea necesario
                messageId: `ACK${String(Math.floor(Math.random() * 90000) + 10000)}`,
                version: "2.5"
            });

            // Crear el segmento MSA (Acknowledgment Segment)
            const msa = new Segment("MSA");

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Ejecutar busqueda para obtener internalid de registro a editar
            let registroNetsuite = daoCliente.busquedaRegistroPorIdExterno(proceso.datos.externalid);
            // if (!registroNetsuite[0]?.internalid) throw new Error("No existe el registro a actualizar");
            proceso.idRegistroNetsuite = registroNetsuite[0]?.internalid;

            // Editar registro en netsuite
            proceso = daoCliente.editarRegistro(proceso);
            proceso.descripcionResultado = "Registro editado correctamente";

            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);

            // Ajustar propiedades de respuesta
            msa.set(1, "AA"); // Código de respuesta: AA (accept), AE (error), AR (reject)
            msa.set(2, camposAck.idMensajeOriginal); // ID del mensaje original al que se responde

            // Agregar el segmento MSA al mensaje
            message.add(msa);

            // Obtener el mensaje HL7 como string
            const hl7MessageString = message.toString();
            nLog.debug("editarRegistroNetsuite - hl7MessageString", hl7MessageString);

            // Ajustar propiedades de respuesta
            respuesta.code_error = "000";
            respuesta.code_desc = "ejecucion exitosa";
            custodia.codigoRespuesta = respuesta.code_error;
            custodia.respuesta = respuesta.code_desc;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }

            // Ajustar propiedades de respuesta
            respuesta.data = proceso;
            respuesta.id = proceso.id;
            return hl7MessageString;
        } catch (err) {
            nLog.error("editarRegistroNetsuite - error", err);

            // Crear el mensaje HL7
            const { Message, Segment } = hl7.Hl7Builder;
            const message = new Message({
                sendingApplication: camposAck.sendingApplication ? camposAck.sendingApplication : "SISTEMA_RECEPTOR",
                sendingFacility: camposAck.sendingFacility ? camposAck.sendingFacility : "ORGANIZACION_RECEPTORA",
                receivingApplication: camposAck.receivingApplication ? camposAck.receivingApplication : "SISTEMA_EMISOR",
                receivingFacility: camposAck.receivingFacility ? camposAck.receivingFacility : "ORGANIZACION_EMISORA",
                messageType: "ACK",
                messageEvent: "A08", // Ajustar evento según sea necesario
                messageId: `ACK${String(Math.floor(Math.random() * 90000) + 10000)}`,
                version: "2.5"
            });

            // Crear el segmento MSA (Acknowledgment Segment)
            const msa = new Segment("MSA");

            // Ajustar propiedades de ack
            msa.set(1, "AE"); // Código de respuesta: AA (accept), AE (error), AR (reject)
            msa.set(2, camposAck.idMensajeOriginal ? camposAck.idMensajeOriginal : "sin id"); // ID del mensaje original al que se responde

            // Agregar el segmento MSA al mensaje
            message.add(msa);

            // Obtener el mensaje HL7 como string
            const hl7MessageString = message.toString();
            nLog.debug("editarRegistroNetsuite - hl7MessageString", hl7MessageString);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = err.message;
            libAuditoria.crearReporteAuditoria(proceso);

            // Ajustar propiedades de respuesta
            respuesta.code_error = "001";
            respuesta.code_desc = "Error durante la ejecucion";
            custodia.codigoRespuesta = respuesta.code_error;
            custodia.respuesta = err.message;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            // Ajustar propiedades de respuesta
            respuesta.data = proceso;

            throw err;
        }
    }

    /**
     * @function fusionarRegistroNetsuite - Función para fusionar un registro en netsuite.
     * @param {Object} parametro - parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function fusionarRegistroNetsuite(parametro) {
        try {
            nLog.audit("fusionarRegistroNetsuite - parametro", parametro);
            const tiempoInicio = Date.now(); // Marca de inicio
            // Ajustar objeto proceso
            proceso.etapa = "fusionarRegistroNetsuite";
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Obtener token de auditoria
            // Parsear parametro
            let { messageRaw } = parametro;
            let mensajeParseado = hl7_dao.getMessageFromRawMessage(messageRaw ?? "");
            nLog.audit("fusionarRegistroNetsuite - mensajeParseado", mensajeParseado);
            custodia = libMapeo.mapearCamposCustodia(mensajeParseado);
            // Mapear campos para registros en netsuite
            camposAck = libMapeo.mapearCamposAck(mensajeParseado);
            // Mapear campos para fusionar registro
            let camposMapeados = libMapeo.mapearCampos(mensajeParseado);
            proceso.datos = camposMapeados;
            custodia.custrecord_2win_as_tiempo_proceso = tiempoInicio;
            custodia.custrecord_2win_as_interface = "merge";
            custodia.datosEntrada = messageRaw;
            // Crear el mensaje HL7
            const { Message, Segment } = hl7.Hl7Builder;
            const message = new Message({
                sendingApplication: camposAck.sendingApplication,
                sendingFacility: camposAck.sendingFacility,
                receivingApplication: camposAck.receivingApplication,
                receivingFacility: camposAck.receivingFacility,
                messageType: "ACK",
                messageEvent: "A40", // Ajustar evento según sea necesario
                messageId: `ACK${String(Math.floor(Math.random() * 90000) + 10000)}`,
                version: "2.5"
            });

            // Crear el segmento MSA (Acknowledgment Segment)
            const msa = new Segment("MSA");
            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);
            // Ejecutar busqueda para obtener registros duplicados
            const { master, duplicates } = daoCliente.busquedaRegistrosDuplicados(proceso.datos);
            proceso.idRegistroNetsuite = master;
            if (!proceso.idRegistroNetsuite) throw new Error("No se encontro registro maestro para fusionar");
            if (duplicates.length === 0) throw new Error("No se encontraron registros duplicados para fusionar");
            // actualizar registro maestro con los ultimos datos registrados
            const successfullUpdate = daoCliente.actualizarUltimosDatosRegistro(proceso.idRegistroNetsuite, duplicates[duplicates.length - 1]);
            if (!successfullUpdate) throw new Error("No se pudo actualizar el registro maestro con los ultimos datos registrados");
            // fusionar registros en netsuite
            daoCliente.fusionarRegistros(proceso.idRegistroNetsuite, duplicates);
            proceso.idRegistroCreado = master;
            proceso.tipoRegistroCreado = "Customer";
            proceso.descripcionResultado = "Registro fusionado correctamente";
            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);
            // Ajustar propiedades de respuesta
            msa.set(1, "AA"); // Código de respuesta: AA (accept), AE (error), AR (reject)
            msa.set(2, camposAck.idMensajeOriginal); // ID del mensaje original al que se responde

            // Agregar el segmento MSA al mensaje
            message.add(msa);

            // Obtener el mensaje HL7 como string
            const hl7MessageString = message.toString();
            nLog.debug("fusionarRegistroNetsuite - hl7MessageString", hl7MessageString);
            // Ajustar propiedades de respuesta
            respuesta.code_error = "000";
            respuesta.code_desc = "ejecucion exitosa";
            custodia.respuesta = respuesta.code_desc;
            custodia.codigoRespuesta = respuesta.code_error;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }
            respuesta.data.cliente = proceso;
            respuesta.id = master;
            return hl7MessageString;
        } catch (err) {
            nLog.error("fusionarRegistroNetsuite - error", err);
            // Crear el mensaje HL7
            const { Message, Segment } = hl7.Hl7Builder;
            const message = new Message({
                sendingApplication: camposAck.sendingApplication ? camposAck.sendingApplication : "SISTEMA_RECEPTOR",
                sendingFacility: camposAck.sendingFacility ? camposAck.sendingFacility : "ORGANIZACION_RECEPTORA",
                receivingApplication: camposAck.receivingApplication ? camposAck.receivingApplication : "SISTEMA_EMISOR",
                receivingFacility: camposAck.receivingFacility ? camposAck.receivingFacility : "ORGANIZACION_EMISORA",
                messageType: "ACK",
                messageEvent: "A40", // Ajustar evento según sea necesario
                messageId: `ACK${String(Math.floor(Math.random() * 90000) + 10000)}`,
                version: "2.5"
            });

            // Crear el segmento MSA (Acknowledgment Segment)
            const msa = new Segment("MSA");

            // Ajustar propiedades de ack
            msa.set(1, "AE"); // Código de respuesta: AA (accept), AE (error), AR (reject)
            msa.set(2, camposAck.idMensajeOriginal ? camposAck.idMensajeOriginal : "sin id"); // ID del mensaje original al que se responde

            // Agregar el segmento MSA al mensaje
            message.add(msa);

            // Obtener el mensaje HL7 como string
            const hl7MessageString = message.toString();
            nLog.debug("fusionarRegistroNetsuite - hl7MessageString", hl7MessageString);
            // Crear registro auditoria
            proceso.descripcionResultado = err.message;
            proceso.estado = "001";

            respuesta.code_error = "001";
            respuesta.code_desc = "error durante la ejecucion";
            respuesta.data.cliente = proceso;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = err.message;
            custodia.codigoRespuesta = respuesta.code_error;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }
            throw err;
        }
    }

    return {
        crearRegistroNetsuite: crearRegistroNetsuite,
        editarRegistroNetsuite: editarRegistroNetsuite,
        fusionarRegistroNetsuite: fusionarRegistroNetsuite
    };
});
