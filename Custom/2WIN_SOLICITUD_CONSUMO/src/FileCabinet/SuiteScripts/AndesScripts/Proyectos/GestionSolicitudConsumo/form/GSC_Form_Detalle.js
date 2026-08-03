/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Form_Detalle — Tab y sublista de detalle para Solicitud de Consumo.
 *
 * Responsabilidades:
 *  - Agregar la pestaña "Detalle" al formulario.
 *  - Crear la sublista de tipo INLINEEDITOR (create/edit) o LIST (view).
 *  - Definir las columnas: ID oculto, Artículo, Unidad, ID Unidad oculto,
 *    Disponible, Cantidad y Centro de Costo.
 *  - Poblar filas existentes a partir de los datos del DAO.
 *
 * No realiza búsquedas ni accede a registros de NetSuite directamente.
 * Los campos Unidad y Disponible son completados por el Client Script
 * al momento de seleccionar un Artículo.
 */
define(['N/ui/serverWidget'], function (serverWidget) {

    const TAB_ID     = 'custpage_tab_detalle';
    const SUBLIST_ID = 'custpage_sublist_detalle';

    /**
     * Agrega al formulario la pestaña y la sublista de detalle.
     *
     * @param {serverWidget.Form} form   - Formulario serverWidget
     * @param {object[]}          lineas - Array de objetos de GSC_Dao_SolicitudConsumoDetalle.buscarLineas
     * @param {string}            modo   - 'view' | 'create' | 'edit'
     */
    function agregarTablaDetalle(form, lineas, modo) {
        lineas = lineas || [];
        log.error('agregarTablaDetalle', { modo});
        var isView = (modo === 'view');

        // ── Pestaña ───────────────────────────────────────────────────────────
        form.addTab({
            id   : TAB_ID,
            label: 'Detalle'
        });

        // ── Sublista ──────────────────────────────────────────────────────────
        var sublist = form.addSublist({
            id   : SUBLIST_ID,
            type : isView
                       ? serverWidget.SublistType.STATICLIST
                       : serverWidget.SublistType.INLINEEDITOR,
            label: 'Artículos',
            tab  : TAB_ID
        });

        // ── Columnas ──────────────────────────────────────────────────────────

        // ID interno de la línea (oculto); permite distinguir create vs update en el POST
        var fId = sublist.addField({
            id   : 'custpage_det_id',
            type : serverWidget.FieldType.TEXT,
            label: 'ID Línea'
        });
        fId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Artículo — selector nativo de ítems
        const fArticulo = sublist.addField({
            id    : 'custpage_det_articulo',
            type  : serverWidget.FieldType.SELECT,
            label : 'Artículo',
            source: 'item'
        });
        fArticulo.isMandatory = true;
        if (isView) { 
            fArticulo.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
        }

        // Unidad (texto, deshabilitado — el Client Script lo puebla)
        const fUnidad = sublist.addField({
            id   : 'custpage_det_unidad',
            type : serverWidget.FieldType.TEXT,
            label: 'Unidad'
        });
        fUnidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // ID interno de la unidad (oculto — el Client Script lo puebla para que el DAO lo guarde)
        const fUnidadId = sublist.addField({
            id   : 'custpage_det_unidad_id',
            type : serverWidget.FieldType.TEXT,
            label: 'Unidad ID'
        });
        fUnidadId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Ubicación (deshabilitada — se hereda del header y el Client Script la sincroniza)
        const fUbicacion = sublist.addField({
            id    : 'custpage_det_ubicacion',
            type  : serverWidget.FieldType.SELECT,
            label : 'Ubicación',
            source: 'location'
        });
        fUbicacion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        if (isView) { 
            fUbicacion.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
        }
        
        // Disponible (deshabilitado — el Client Script lo actualiza)
        const fDisponible = sublist.addField({
            id   : 'custpage_det_disponible',
            type : serverWidget.FieldType.FLOAT,
            label: 'Disponible'
        });
        fDisponible.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // Cantidad — editable
        const fCantidad = sublist.addField({
            id   : 'custpage_det_cantidad',
            type : serverWidget.FieldType.INTEGER,
            label: 'Cantidad'
        });
        fCantidad.isMandatory = true;

        // Centro de Costo — selector nativo de departamentos
        const fDepartamento = sublist.addField({
            id    : 'custpage_det_departamento',
            type  : serverWidget.FieldType.SELECT,
            label : 'Centro de Costo',
            source: 'department'
        });
        fDepartamento.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        if (isView) { 
            fDepartamento.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.INLINE
            });
        }

        // ── Poblar filas existentes ───────────────────────────────────────────
        lineas.forEach(function (linea, i) {
            var internalId  = String(linea.internalid                                   || '');
            var articuloId  = String(linea.custrecord_2win_consumo_det_articulo          || '');
            var unidadTxt   = String(linea.custrecord_2win_consumo_det_unidad_text       || '');
            var unidadId    = String(linea.custrecord_2win_consumo_det_unidad            || '');
            var disponible  =        linea.custrecord_2win_consumo_det_disponible        || 0;
            var ubicacionId = String(linea.custrecord_2win_consumo_det_ubicacion         || '');
            var cantidad    =        linea.custrecord_2win_consumo_det_cantidad          || 1;
            var departId    = String(linea.custrecord_2win_consumo_det_departamento      || '');

            if (internalId)  sublist.setSublistValue({ id: 'custpage_det_id',          line: i, value: internalId  });
            if (articuloId)  sublist.setSublistValue({ id: 'custpage_det_articulo',     line: i, value: articuloId  });
            if (unidadTxt)   sublist.setSublistValue({ id: 'custpage_det_unidad',       line: i, value: unidadTxt   });
            if (unidadId)    sublist.setSublistValue({ id: 'custpage_det_unidad_id',    line: i, value: unidadId    });
                             sublist.setSublistValue({ id: 'custpage_det_disponible',   line: i, value: disponible  });
            if (ubicacionId) sublist.setSublistValue({ id: 'custpage_det_ubicacion',   line: i, value: ubicacionId });
                             sublist.setSublistValue({ id: 'custpage_det_cantidad',     line: i, value: cantidad    });
            if (departId)    sublist.setSublistValue({ id: 'custpage_det_departamento', line: i, value: departId    });
        });
    }

    return {
        agregarTablaDetalle,
    };
});
