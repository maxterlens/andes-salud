/**
 * @NApiVersion 2.1
 * @module ./2win_dom_evento.js
 * @NModuleScope Public
 */
define(["N/log", "N/runtime", "N/https", "../dao/2win_dao_evento"], function (nLog, runtime, https, { Evento, NivelEvento }) {
    /**
     * Servicio de dominio para manejar la lógica de negocio de los eventos.
     * @param {Object} adapters - Un objeto que contiene los adaptadores necesarios.
     * @param {ExternalEventServiceAdapter} adapters.externalAdapter - Adaptador para el servicio externo.
     * @param {NetSuiteEventRepository} [adapters.netsuiteRepository] - (Opcional) Si también quieres loggear localmente.
     */
    class EventService {
        constructor(adapters) {
            if (!adapters || !adapters.externalAdapter) {
                throw new Error("ExternalEventServiceAdapter es requerido para EventService.");
            }
            this.externalAdapter = adapters.externalAdapter;
            this.netsuiteRepository = adapters.netsuiteRepository; // Opcional
        }
        /**
         * Registra un nuevo evento enviándolo al servicio externo.
         * Opcionalmente, también puede guardarlo localmente en NetSuite.
         * @param {Object} options
         * @param {string} options.tipo - Tipo de evento.
         * @param {string} [options.fuente] - Fuente del evento.
         * @param {Object} options.datos - Datos del evento.
         * @param {string} [options.nivel] - Nivel del evento.
         * @param {string} [options.relatedRecordType]
         * @param {string|number} [options.relatedRecordId]
         * @param {boolean} [options.saveLocally=false] - Si se debe guardar también en NetSuite.
         * @return {Promise<Object>} Una promesa que se resuelve con el resultado del envío al servicio externo.
         */
        async registerEvent(options) {
            // Marcado como async para usar await
            let fuente = options.fuente || (runtime.getCurrentScript ? runtime.getCurrentScript().id : "UNKNOWN_SCRIPT");

            const evento = new Evento({
                // La entidad Event sigue siendo la misma
                tipo: options.tipo,
                fuente: fuente,
                datos: options.datos,
                nivel: options.nivel || NivelEvento.INFO,
                timestamp: new Date(),
                relatedRecordType: options.relatedRecordType,
                relatedRecordId: options.relatedRecordId,
                uuid: `${options.tipo}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` // Un UUID simple si lo necesitas
            });

            let externalResponse;
            try {
                nLog.audit("EventService: Intentando enviar evento a servicio externo", { tipo: evento.tipo, fuente: evento.fuente });
                // La llamada al adaptador ahora devuelve una Promesa
                externalResponse = await this.externalAdapter.sendEvent(evento);
                nLog.audit("EventService: Evento enviado exitosamente a servicio externo", { response: externalResponse });
            } catch (e) {
                nLog.error("EventService: Error al enviar evento a servicio externo", {
                    error: e.name,
                    message: e.message,
                    evento: evento
                });
                // Decide cómo manejar el error: ¿reintentar? ¿loggear localmente como fallback?
                // if (this.netsuiteRepository) {
                //     // Fallback: si el envío externo falla, intenta guardar localmente
                //     try {
                //         nlog.warn("EventService: Fallback - Intentando guardar evento localmente en NetSuite");
                //         evento.datos.externalSendError = { name: e.name, message: e.message }; // Añade info del error
                //         const localId = this.netsuiteRepository.save(evento);
                //         nlog.audit("EventService: Evento de fallback guardado localmente", { localId: localId });
                //     } catch (localError) {
                //         nlog.error("EventService: Error al guardar evento de fallback localmente", { error: localError.name, message: localError.message });
                //     }
                // }
                throw e; // Re-lanza el error original del envío externo para que el llamador lo sepa
            }

            // Opcionalmente, si también quieres guardar en NetSuite después de un envío exitoso
            // if (options.saveLocally && this.netsuiteRepository) {
            //     try {
            //         const localId = this.netsuiteRepository.save(evento);
            //         nlog.audit("EventService: Evento también guardado localmente en NetSuite", { localId: localId });
            //     } catch (localError) {
            //         nlog.error("EventService: Error al guardar evento localmente (post-envío externo)", { error: localError.name, message: localError.message });
            //         // No re-lanzar aquí, ya que el envío externo fue exitoso. Solo loggear.
            //     }
            // }
            return externalResponse; // Devuelve la respuesta del servicio externo
        }
    }
    /**
     * Adaptador para enviar entidades Evento a un servicio externo vía HTTPS POST.
     */
    class ExternalEventServiceAdapter {
        constructor(options) {
            // Opciones para configurar la URL y el token si no se usan las constantes globales
            this.serviceUrl = options && options.url;
            this.authToken = options && options.token;

            if (!this.serviceUrl) {
                throw new Error("ExternalEventServiceAdapter: La URL del servicio externo no está configurada.");
            }
        }
        /**
         * Envía un objeto Evento al servicio externo.
         * @param {Event} evento - La entidad Evento a enviar.
         * @return {Promise<Object|string>} Una promesa que se resuelve con la respuesta del servicio
         *                                   o se rechaza con un error.
         *                                   Podría ser el ID del evento en el sistema externo o un ack.
         */
        sendEvent(evento) {
            let self = this; // Para acceso dentro de la Promesa
            return new Promise(function (resolve, reject) {
                try {
                    let payload = {
                        tipo_peticion: "POST",
                        endpoint: evento.fuente,
                        parametros: {
                            id: evento.uuid || evento.id,
                            type: evento.tipo,
                            relatedRecordType: evento.relatedRecordType,
                            relatedRecordId: evento.relatedRecordId,
                            accountId: runtime.accountId
                        },
                        data: evento.datos,
                        codigo_estado: 200,
                        exito: true,
                        mensaje_error: null
                    };

                    let headers = {
                        "Content-Type": "application/json"
                    };
                    if (self.authToken) {
                        headers["Authorization"] = `Bearer ${self.authToken}`; // O el esquema de auth que use tu servicio
                    }

                    nLog.debug("ExternalEventServiceAdapter: Enviando evento", { url: self.serviceUrl, payload: payload });

                    let httpResponse = https.post({
                        url: self.serviceUrl,
                        headers: headers,
                        body: JSON.stringify(payload)
                    });

                    nLog.debug("ExternalEventServiceAdapter: Respuesta recibida", {
                        code: httpResponse.code,
                        body: httpResponse.body // Cuidado con loggear bodies muy grandes o sensibles
                    });

                    if (httpResponse.code === 200 || httpResponse.code === 201 || httpResponse.code === 202) {
                        // Intenta parsear la respuesta si es JSON, o devuelve el body tal cual
                        let responseBody;
                        try {
                            responseBody = JSON.parse(httpResponse.body);
                        } catch (parseError) {
                            responseBody = httpResponse.body; // Si no es JSON, usa el string
                        }
                        resolve(responseBody);
                    } else {
                        let errorMsg = `Error del servicio externo: ${httpResponse.code} - ${httpResponse.body}`;
                        nLog.error("ExternalEventServiceAdapter: Error", errorMsg);
                        reject(new Error(errorMsg));
                    }
                } catch (e) {
                    nLog.error("ExternalEventServiceAdapter: Excepción al enviar evento", {
                        error: e.name,
                        message: e.message,
                        stack: e.stack,
                        evento: evento
                    });
                    reject(e); // Re-lanza la excepción
                }
            });
        }
    }

    return { EventService, NivelEvento, ExternalEventServiceAdapter };
});
