/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_etiqueta_articulo
 * @recordtype   inventoryitem, lotnumberedinventoryitem, serializedinventoryitem
 */
define(['./handlers/AS_EtiquetaArticuloHandler'],
    (etiquetaArticuloHandler) => {

    const beforeLoad = (context) => {
        try {
            if (context.type !== context.UserEventType.VIEW) {
                return;
            }

            etiquetaArticuloHandler.prepararVista(context.form, context.newRecord);
        } catch (fallo) {
            log.error({
                title  : 'ETIQUETA ERROR',
                details: 'articulo: ' + context.newRecord.id + ' | operacion: vista'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    };

    return { beforeLoad };
});
