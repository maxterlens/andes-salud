/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_etiqueta_articulo
 * @recordtype   inventoryitem, lotnumberedinventoryitem, serializedinventoryitem
 */
define(['N/ui/serverWidget', './lib/EtiquetaArticuloConstants'],
    (serverWidget, CONSTANTES) => {

    const beforeLoad = (context) => {
        try {
            if (context.type !== context.UserEventType.VIEW) {
                return;
            }

            const botonNativoOculto = ocultarBotonNativo(context.form);

            const datos = agregarDatosArticulo(context.form, context.newRecord);

            agregarBotonEtiqueta(context.form);

            log.debug({
                title  : 'ETIQUETA VISTA',
                details: 'articulo: ' + context.newRecord.id
                       + ' | tipo: ' + context.newRecord.type
                       + ' | boton nativo oculto: ' + botonNativoOculto
                       + ' | nombre: [' + datos.NOMBRE + ']'
                       + ' | upc: [' + datos.UPC + ']',
            });
        } catch (fallo) {
            log.error({
                title  : 'ETIQUETA ERROR',
                details: 'articulo: ' + context.newRecord.id + ' | operacion: vista'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    };

    const ocultarBotonNativo = (form) => {
        try {
            form.getButton({ id: CONSTANTES.BOTON_NATIVO }).isHidden = true;

            return true;
        } catch (fallo) {
            return false;
        }
    };

    const agregarBotonEtiqueta = (form) => {
        form.addButton({
            id          : CONSTANTES.BOTON_ETIQUETA.ID,
            label       : CONSTANTES.BOTON_ETIQUETA.LABEL,
            functionName: CONSTANTES.BOTON_ETIQUETA.ACCION,
        });

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;
    };

    const agregarDatosArticulo = (form, articulo) => {
        const datos = {};

        Object.keys(CONSTANTES.CAMPOS_OCULTOS).forEach((nivel) => {
            const campo = form.addField({
                id   : CONSTANTES.CAMPOS_OCULTOS[nivel],
                type : serverWidget.FieldType.TEXT,
                label: nivel,
            });

            campo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            datos[nivel] = articulo.getValue({ fieldId: CONSTANTES.CAMPOS[nivel] });

            campo.defaultValue = datos[nivel];
        });

        return datos;
    };

    return { beforeLoad };
});
