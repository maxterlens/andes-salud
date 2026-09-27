/**
 * AS_NSP_025 — Consulta MCP de solo lectura
 * @description Entry point del RESTlet que atiende al servidor MCP local. Solo
 *              rutea: la decision de que se puede consultar vive en
 *              AS_ConsultaMCPHandler.
 *
 *              Expone unicamente post. No hay get, put ni delete a proposito: sin
 *              esos entry points NetSuite responde con error a cualquier verbo que
 *              no sea POST, y el modulo no tiene forma de escribir nada.
 *
 *              El catch devuelve el fallo como JSON en vez de relanzarlo. El que
 *              consume esto es un proceso, no una pantalla: un objeto con error se
 *              lee y se explica, mientras que un 500 de NetSuite llega sin motivo.
 *
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 * @scriptid     customscript_as_consulta_mcp
 * @deploymentid customdeploy_as_consulta_mcp
 */
define(['./handlers/AS_ConsultaMCPHandler', './lib/AS_ConsultaMCPConstants'],
    (consultaMCPHandler, CONSTANTES) => {

    const post = (payload) => {
        try {
            return consultaMCPHandler.atenderConsulta(payload);
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'operacion: ' + payload.operacion
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            return { error: fallo.message || String(fallo) };
        }
    };

    return { post };
});
