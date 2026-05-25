/**
 * @NApiVersion 2.1
 * @module ./2win_dom_admision.js
 * @NModuleScope Public
 * @description Dominio para gestionar las operaciones de Admisión (Crear, Modificar, Anular, Transferir).
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_cliente",
    "../dao/2win_dao_orden_venta",
    "../dao/2win_dao_hl7",
    "../lib/mapeo/2win_lib_mapeo_admision",
    "N/log",
    "N/runtime",
    "../dao/2win_dao_ingresos"
], (libAuditoria, libCustodia, daoCliente, daoOrdenVenta, hl7_dao, libMapeoAdmision, nLog, runtime, daoIngresos) => {
    /**
     * Inicializa los objetos de proceso y custodia para una operación.
     * @private
     * @param {string} nombreInterfaz - Nombre de la interfaz para la custodia.
     * @param {string} etapa - Nombre de la etapa del proceso para la auditoría.
     * @param {object} parametro - El objeto de datos de entrada.
     * @param {string} externalId - ID externo para el registro de custodia.
     * @returns {{proceso: object, custodia: object}} - Objetos de proceso y custodia inicializados.
     */
    const _inicializarContexto = (nombreInterfaz, etapa, parametro, externalId) => {
        const proceso = {
            nombreProceso: "Interfaces andes salud",
            scriptId: runtime.getCurrentScript().id,
            etapa: etapa,
            estado: "000",
            tokenProceso: libAuditoria.obtenerToken(),
            descripcionResultado: ""
        };

        const custodia = {
            custrecord_2win_as_tiempo_proceso: Date.now(),
            custrecord_2win_as_interface: nombreInterfaz,
            datosEntrada: JSON.stringify(parametro),
            externalid: externalId
        };

        // Busca si ya existe un registro de custodia para evitar duplicados
        custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);
        if (custodia.internalid && custodia.internalid.length > 0) {
            custodia.internalid = custodia.internalid[0].internalid;
        }

        return { proceso, custodia };
    };

    /**
     * Maneja la lógica de errores de forma centralizada.
     * @private
     * @param {Error} error - El objeto de error capturado.
     * @param {object} proceso - El objeto de proceso de auditoría.
     * @param {object} custodia - El objeto de custodia.
     * @param {string} mensajeErrorUsuario - Mensaje de error para la respuesta final.
     * @returns {{success: boolean, error: string}} - Objeto de respuesta de error.
     */
    const _manejarError = (error, proceso, custodia, mensajeErrorUsuario) => {
        nLog.error(`Error en ${proceso.etapa}`, error);

        // Configura el estado de error para auditoría y custodia
        proceso.estado = "001";
        proceso.descripcionResultado = error.message;
        custodia.respuesta = error.message;
        custodia.codigoRespuesta = proceso.estado;

        libAuditoria.crearReporteAuditoria(proceso);

        // Actualiza o crea el registro de custodia con el resultado del error
        if (custodia.internalid) {
            libCustodia.actualizarRegistro(custodia);
        } else {
            custodia.reintentos = 0;
            libCustodia.guardarOActualizarRegistro(custodia);
        }

        throw error;
    };

    /**
     * Maneja la lógica de éxito de forma centralizada.
     * @private
     * @param {object} proceso - El objeto de proceso de auditoría.
     * @param {object} custodia - El objeto de custodia.
     * @param {string} mensajeExito - Mensaje de éxito para la respuesta y auditoría.
     * @returns {{success: boolean, message: string}} - Objeto de respuesta de éxito.
     */
    const _manejarExito = (proceso, custodia, mensajeExito) => {
        proceso.descripcionResultado = "Operación realizada correctamente";
        custodia.respuesta = mensajeExito;
        custodia.codigoRespuesta = proceso.estado;

        libAuditoria.crearReporteAuditoria(proceso);

        // Si ya existía un registro de custodia, se actualiza
        if (custodia.internalid) {
            libCustodia.actualizarRegistro(custodia);
        }

        return {
            success: true,
            message: mensajeExito
        };
    };

    /**
     * Crea una nueva admisión (Orden de Venta).
     * @param {object} parametro - Parámetros de entrada, incluyendo el mensaje HL7 en `messageRaw`.
     * @returns {{success: boolean, message: string}|{success: boolean, error: string}}
     */
    const crear = (parametro) => {
        let proceso, custodia;
        try {
            // Parsea y mapea el mensaje HL7
            const mensajeParseado = hl7_dao.getMessageFromRawMessage(parametro.messageRaw ?? "");
            const parametroMapeado = libMapeoAdmision.mapearCampos(mensajeParseado);
            nLog.audit("crearAdmision - parametro", parametroMapeado);

            const externalId = `crearAdmision_${parametroMapeado.MSH["MSH-10.1"]}`;
            ({ proceso, custodia } = _inicializarContexto("Crear Admision", "Crear Registro Admision", parametroMapeado, externalId));

            // Lógica de negocio
            if (!parametroMapeado.PID || !parametroMapeado.PID["PID-2.1"]) {
                throw new Error("No se han recibido datos del paciente para la ejecución.");
            }

            const cliente = daoCliente.busquedaRegistroPorIdExterno(parametroMapeado.PID["PID-2.1"]);
            if (!cliente || cliente.length === 0) {
                throw new Error("El paciente no existe en NetSuite.");
            }

            const idOV = daoOrdenVenta.buscar(parametroMapeado.PV1["PV1-19.1"]);
            if (idOV) {
                throw new Error(`Ya existe un registro de admisión con el ID ${parametroMapeado.PV1["PV1-19.1"]}.`);
            }

            const { success, id } = daoOrdenVenta.crear({ context: parametroMapeado, isAdmition: true, entityId: cliente[0].internalid });
            if (!success) {
                throw new Error("No se pudo crear la admisión.");
            }
            nLog.debug("ID de Orden de Venta creada", id);

            return _manejarExito(proceso, custodia, "Admisión registrada correctamente.");
        } catch (error) {
            _manejarError(error, proceso, custodia, "No se pudo registrar la admisión.");
        }
    };

    /**
     * Modifica una admisión existente.
     * @param {object} parametro - Parámetros de entrada.
     * @returns {{success: boolean, message: string}|{success: boolean, error: string}}
     */
    const modificar = (parametro) => {
        let proceso, custodia;
        try {
            // Parsea y mapea el mensaje HL7
            const mensajeParseado = hl7_dao.getMessageFromRawMessage(parametro.messageRaw ?? "");
            const parametroMapeado = libMapeoAdmision.mapearCampos(mensajeParseado);
            nLog.audit("modificarAdmision - parametro", parametroMapeado);
            const externalId = `modificarAdmision_${parametroMapeado.MSH["MSH-10.1"]}`;
            ({ proceso, custodia } = _inicializarContexto("Modificar Admision", "Modificar Admision", parametroMapeado, externalId));

            const idOV = daoOrdenVenta.buscar(parametroMapeado.PV1["PV1-19.1"]);
            nLog.debug("idOV", idOV);
            if (!idOV) {
                throw new Error("No se ha encontrado la admisión a modificar.");
            }

            daoOrdenVenta.editar({
                id: idOV,
                mensaje: parametroMapeado
            });

            return _manejarExito(proceso, custodia, "Modificación aplicada correctamente.");
        } catch (error) {
            _manejarError(error, proceso, custodia, "Datos inválidos para modificación.");
        }
    };

    /**
     * Anula una admisión existente.
     * @param {object} parametro - Parámetros de entrada.
     * @returns {{success: boolean, message: string}|{success: boolean, error: string}}
     */
    const anular = (parametro) => {
        let proceso, custodia;
        try {
            // Parsea y mapea el mensaje HL7
            const mensajeParseado = hl7_dao.getMessageFromRawMessage(parametro.messageRaw ?? "");
            const parametroMapeado = libMapeoAdmision.mapearCampos(mensajeParseado);
            nLog.audit("anularAdmision - parametro", parametroMapeado);
            const externalId = `anularAdmision_${parametroMapeado.MSH["MSH-10.1"]}`;
            ({ proceso, custodia } = _inicializarContexto("Anular Admision", "Anular Admision", parametroMapeado, externalId));

            const idOV = daoOrdenVenta.buscar(parametroMapeado.PV1["PV1-19.1"]);
            if (!idOV) {
                throw new Error("No se ha encontrado la admisión a anular.");
            }

            daoOrdenVenta.anular({
                id: idOV,
                parametro: parametroMapeado
            });

            return _manejarExito(proceso, custodia, "Anulación de admisión procesada correctamente.");
        } catch (error) {
            _manejarError(error, proceso, custodia, "No se pudo registrar la anulación.");
        }
    };

    /**
     * Transfiere un episodio (admisión).
     * @param {object} parametro - Parámetros de entrada.
     * @returns {{success: boolean, message: string}|{success: boolean, error: string}}
     */
    const transferir = (parametro) => {
        let proceso, custodia;
        try {
            // Parsea y mapea el mensaje HL7
            const mensajeParseado = hl7_dao.getMessageFromRawMessage(parametro.messageRaw ?? "");
            const parametroMapeado = libMapeoAdmision.mapearCampos(mensajeParseado);
            nLog.audit("transferirEpisodio - parametro", parametroMapeado);
            const externalId = `transferirEpisodio_${parametroMapeado.MSH["MSH-10.1"]}`;
            ({ proceso, custodia } = _inicializarContexto("Transferir Episodio", "Transferir Episodio", parametroMapeado, externalId));

            const idOV = daoOrdenVenta.buscar(parametroMapeado.PV1["PV1-19.1"]);
            if (!idOV) {
                throw new Error("No se ha encontrado la admisión hospitalaria a transferir.");
            }
            const idOVUrgencia = daoOrdenVenta.buscar(parametroMapeado.PV1["PV1-21.1"]);
            if (!idOVUrgencia) {
                throw new Error("No se ha encontrado la admisión de urgencia a transferir.");
            }
            daoOrdenVenta.transferir({
                id: idOV,
                mensaje: parametroMapeado
            });

            return _manejarExito(proceso, custodia, "Transferencia de episodio procesada correctamente.");
        } catch (error) {
            _manejarError(error, proceso, custodia, "No se pudo registrar la transferencia del episodio.");
        }
    };

    return {
        crear,
        modificar,
        anular,
        transferir
    };
});
