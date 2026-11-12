/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Entry point de la pantalla Generar Nomina de Reembolso. Solo
 *              recibe la peticion y se la pasa al handler.
 *
 *              GET                 → la pantalla vacia.
 *              GET custpage_nomina → boton Descargar TXT de la nomina: baja
 *                                    el archivo del banco.
 *              POST op=buscar      → al elegir la Cuenta Banco: lista los
 *                                    reembolsos pendientes.
 *              POST (por defecto)  → Generar: crea la nomina con los marcados.
 *
 * CHANGELOG v1.1.0 (2026-11-11):
 * - [FEAT] GET con custpage_nomina: descarga el TXT del banco.
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] Mostrar, buscar reembolsos y generar la nomina.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_nom_reemb_generar_stlt
 * @deploymentid customdeploy_as_nom_reemb_generar_stlt
 * @author Andes Salud
 * @version 1.1.0
 *
 */
define(['./handler/AS_NominaReembolsoHandler', './handler/AS_ArchivoBancoHandler', './constants/AS_NominaReembolsoConstants'],
    (nominaReembolsoHandler, archivoBancoHandler, CONSTANTES) => {

    function onRequest(context) {
        try {
            const operacion = context.request.parameters[CONSTANTES.CAMPOS.OPERACION];
            const nominaId  = context.request.parameters[CONSTANTES.CAMPOS.NOMINA];

            if (context.request.method === 'GET' && nominaId) {
                archivoBancoHandler.descargarArchivo(context, nominaId);
            } else if (context.request.method === 'GET') {
                nominaReembolsoHandler.mostrarFormulario(context);
            } else if (operacion === CONSTANTES.OPERACIONES.BUSCAR) {
                nominaReembolsoHandler.buscarReembolsos(context);
            } else {
                nominaReembolsoHandler.generarNomina(context);
            }
        } catch (fallo) {
            log.error({
                title  : 'NOMINA REEMBOLSO ERROR',
                details: 'metodo: ' + context.request.method
                       + ' | nomina: ' + (context.request.parameters[CONSTANTES.CAMPOS.NOMINA] || '')
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { onRequest };
});
