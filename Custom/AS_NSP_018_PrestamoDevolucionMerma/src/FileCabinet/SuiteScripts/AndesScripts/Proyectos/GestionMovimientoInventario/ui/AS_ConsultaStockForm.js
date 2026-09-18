/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Arma la pantalla de la consulta de stock. Es una herramienta de
 *              apoyo a desarrollo y QA: sirve para encontrar articulos con stock
 *              real antes de armar un Prestamo, una Devolucion o una Merma de
 *              prueba. No crea ni modifica nada.
 *
 *              El filtrado de ubicaciones por subsidiaria se resuelve en el
 *              servidor: al cambiar cualquiera de los dos combos el client script
 *              vuelve a pedir la pagina con los parametros, asi que cada request
 *              arma el combo que corresponde. Por eso aca no hay JSON escondido
 *              como en el formulario de movimientos.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', '../repositories/AS_ConsultaStockRepository'],
    (serverWidget, consultaStockRepository) => {

    const TOPE_ARTICULOS = 200;

    const CLIENT_SCRIPT = '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/AS_ConsultaStock_CS_2.1.js';

    function construirVista(context) {
        const parametros = obtenerParametros(context.request);

        const form = serverWidget.createForm({ title: 'Consulta de Stock por Ubicacion' });

        form.clientScriptModulePath = CLIENT_SCRIPT;

        agregarFiltros(form, parametros);

        if (parametros.ubicacion) {
            agregarArticulos(form, parametros.ubicacion);
        }

        context.response.writePage(form);
    }

    function obtenerParametros(request) {
        return {
            subsidiaria: request.parameters.subsidiaria || '',
            ubicacion  : request.parameters.ubicacion || '',
        };
    }

    function agregarFiltros(form, parametros) {
        const campoSubsidiaria = form.addField({
            id    : 'custpage_subsidiaria',
            type  : serverWidget.FieldType.SELECT,
            label : 'Subsidiaria',
            source: 'subsidiary',
        });
        campoSubsidiaria.defaultValue = parametros.subsidiaria;

        const campoUbicacion = form.addField({
            id   : 'custpage_ubicacion',
            type : serverWidget.FieldType.SELECT,
            label: 'Ubicacion',
        });
        campoUbicacion.addSelectOption({ value: '', text: '' });

        consultaStockRepository.listarUbicacionesPorSubsidiaria().forEach((ubicacion) => {
            if (ubicacion.subsidiaria !== parametros.subsidiaria) {
                return;
            }

            campoUbicacion.addSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
        });

        campoUbicacion.defaultValue = parametros.ubicacion;
    }

    function agregarArticulos(form, ubicacion) {
        const articulos = consultaStockRepository.listarArticulosConStock(ubicacion, TOPE_ARTICULOS);

        const sublista = form.addSublist({
            id   : 'custpage_sl_articulos',
            type : serverWidget.SublistType.STATICLIST,
            label: armarTituloArticulos(articulos.length),
        });

        sublista.addField({ id: 'custpage_col_id',         type: serverWidget.FieldType.TEXT, label: 'Internal ID' });
        sublista.addField({ id: 'custpage_col_sku',        type: serverWidget.FieldType.TEXT, label: 'SKU / Nombre' });
        sublista.addField({ id: 'custpage_col_unidad',     type: serverWidget.FieldType.TEXT, label: 'Unidad' });
        sublista.addField({ id: 'custpage_col_ubicacion',  type: serverWidget.FieldType.TEXT, label: 'Ubicacion' });
        sublista.addField({ id: 'custpage_col_enmano',     type: serverWidget.FieldType.TEXT, label: 'On Hand' });
        sublista.addField({ id: 'custpage_col_disponible', type: serverWidget.FieldType.TEXT, label: 'Available' });

        articulos.forEach((articulo, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_id',         line: indice, value: articulo.id });
            sublista.setSublistValue({ id: 'custpage_col_sku',        line: indice, value: articulo.sku });
            sublista.setSublistValue({ id: 'custpage_col_ubicacion',  line: indice, value: articulo.ubicacion });
            sublista.setSublistValue({ id: 'custpage_col_enmano',     line: indice, value: String(articulo.enMano) });
            sublista.setSublistValue({ id: 'custpage_col_disponible', line: indice, value: String(articulo.disponible) });

            if (articulo.unidad) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: articulo.unidad });
            }
        });
    }

    function armarTituloArticulos(encontrados) {
        if (encontrados < TOPE_ARTICULOS) {
            return 'Articulos con stock disponible (' + encontrados + ')';
        }

        return 'Articulos con stock disponible (primeros ' + TOPE_ARTICULOS + ', hay mas)';
    }

    return {
        construirVista: construirVista,
    };
});
