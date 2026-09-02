/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @description Entry point del User Event sobre el articulo. Solo interviene la
 *              vista: oculta el boton nativo "Print Label", que abre
 *              barcodeprinter.nl y no da el formato que necesita bodega, deja
 *              los datos del articulo escritos en el formulario y pone el boton
 *              que imprime la etiqueta en la Zebra.
 *
 *              No sabe que existe el ZPL ni Text2 Barcode. Toda la impresion
 *              ocurre del lado del cliente: el servidor de NetSuite no tiene
 *              forma de hablar con una impresora de la bodega.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_etiqueta_articulo
 * @deploymentid customdeploy_as_ue_etiq_art_inv
 * @recordtype   inventoryitem, lotnumberedinventoryitem, serializedinventoryitem
 */
define(['N/ui/serverWidget', './lib/EtiquetaArticuloConstants'],
    (serverWidget, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // HOOK beforeLoad — solo VIEW
    // ─────────────────────────────────────────────────────────────────────────

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
                       + ' | descripcion: [' + datos.DESCRIPCION + ']'
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

    // ─────────────────────────────────────────────────────────────────────────
    // Datos para el Client Script
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Escribe los datos del articulo en campos ocultos del formulario, que es de
     * donde los lee el Client Script. Ver CAMPOS_OCULTOS en las constantes para
     * el motivo: en modo vista el navegador no puede leer los campos nativos.
     *
     * @param  {Object} form
     * @param  {Object} articulo
     * @return {Object} los valores escritos, por nivel
     */
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

    // ─────────────────────────────────────────────────────────────────────────
    // Exports
    // ─────────────────────────────────────────────────────────────────────────

    return { beforeLoad };
});
