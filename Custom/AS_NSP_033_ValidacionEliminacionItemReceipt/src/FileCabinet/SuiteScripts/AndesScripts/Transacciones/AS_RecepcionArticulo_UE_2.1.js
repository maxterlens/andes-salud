/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @file AS_RecepcionArticulo_UE_2.1.js
 * @description Entry Point — User Event Script sobre Recepción de Artículo (Item Receipt).
 *              Bloquea la eliminación de recepciones cuyos lotes ya fueron consumidos
 *              y quedarían con saldo físico negativo en su ubicación.
 */
define([
    'N/log',
    './handlers/RecepcionArticuloHandler',
    './services/RecepcionArticuloService'
], (log, RecepcionArticuloHandler, RecepcionArticuloService) => {

    const beforeSubmit = (context) => {
        try {
            RecepcionArticuloHandler.validarEliminacion(context);
        } catch (e) {
            // Error de negocio: se relanza como texto para bloquear la eliminación.
            // Se lanza el mensaje (string) y no el objeto, para que NetSuite muestre
            // solo el texto y no el JSON completo del SuiteScriptError.
            if (e && e.name === RecepcionArticuloService.ERROR_LOTE_CONSUMIDO) {
                throw e.message;
            }
            // Error técnico: solo se registra; no se bloquea la operación.
            log.error({
                title: 'UE beforeSubmit - AS_RecepcionArticulo',
                details: `${(e && e.name) || ''} - ${(e && e.message) || e}`
            });
        }
    };

    return { beforeSubmit };
});
