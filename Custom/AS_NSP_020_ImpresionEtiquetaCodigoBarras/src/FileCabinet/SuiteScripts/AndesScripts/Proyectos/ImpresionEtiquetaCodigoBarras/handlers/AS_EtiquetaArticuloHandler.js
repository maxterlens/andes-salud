/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', '../lib/AS_EtiquetaArticuloConstants', '../repositories/AS_FormatoEtiquetaRepository'],
    (serverWidget, CONSTANTES, formatoEtiquetaRepository) => {

    const prepararVista = (form, articulo) => {
        const botonNativoOculto = ocultarBotonNativo(form);

        const datos         = agregarDatosArticulo(form, articulo);
        const subsidiaria   = agregarSubsidiariaArticulo(form, articulo);
        const configuracion = agregarConfiguracionEtiqueta(form);

        agregarBotonEtiqueta(form);

        log.debug({
            title  : 'ETIQUETA VISTA',
            details: 'articulo: ' + articulo.id
                   + ' | tipo: ' + articulo.type
                   + ' | boton nativo oculto: ' + botonNativoOculto
                   + ' | nombre: [' + datos.NOMBRE + ']'
                   + ' | upc: [' + datos.UPC + ']'
                   + ' | subsidiaria: ' + subsidiaria
                   + ' | formatos: ' + configuracion.formatos.length
                   + ' | subsidiarias: ' + configuracion.subsidiarias.length,
        });
    };

    const ocultarBotonNativo = (form) => {
        try {
            form.getButton({ id: CONSTANTES.BOTON_NATIVO }).isHidden = true;

            return true;
        } catch (fallo) {
            return false;
        }
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

    const agregarSubsidiariaArticulo = (form, articulo) => {
        const valor       = articulo.getValue({ fieldId: CONSTANTES.CAMPO_SUBSIDIARIA.ORIGEN });
        const subsidiaria = Array.isArray(valor) ? valor[0] : valor;

        const campo = form.addField({
            id   : CONSTANTES.CAMPO_SUBSIDIARIA.OCULTO,
            type : serverWidget.FieldType.TEXT,
            label: 'Subsidiaria del articulo',
        });

        campo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campo.defaultValue = subsidiaria;

        return subsidiaria;
    };

    const agregarConfiguracionEtiqueta = (form) => {
        const configuracion = {
            subsidiarias: formatoEtiquetaRepository.buscarSubsidiarias(),
            formatos    : formatoEtiquetaRepository.buscarFormatos(),
        };

        const campo = form.addField({
            id   : CONSTANTES.CAMPO_CONFIGURACION,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Configuracion de etiquetas',
        });

        campo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campo.defaultValue = JSON.stringify(configuracion);

        return configuracion;
    };

    const agregarBotonEtiqueta = (form) => {
        form.addButton({
            id          : CONSTANTES.BOTON_ETIQUETA.ID,
            label       : CONSTANTES.BOTON_ETIQUETA.LABEL,
            functionName: CONSTANTES.BOTON_ETIQUETA.ACCION,
        });

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;
    };

    return { prepararVista: prepararVista };
});
