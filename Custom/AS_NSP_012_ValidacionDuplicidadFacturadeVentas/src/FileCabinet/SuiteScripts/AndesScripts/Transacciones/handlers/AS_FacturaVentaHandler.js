/**
 * @NApiVersion 2.1
 *
 */
define(['N/search'], (search) => {

    const TIPO_DTE_SII = {
        FACTURA_AFECTA_ELECTRONICA: 1,
        FACTURA_EXENTA_ELECTRONICA: 2
    };

    const FORMULARIOS_AUTOCOMPLETADOS_POR_WORKFLOW = [
        132  // PROD
    ];

    const formularioLoAutocompletaElWorkflow = (record) => {
        const customForm = Number(record.getValue({ fieldId: 'customform' }));
        return FORMULARIOS_AUTOCOMPLETADOS_POR_WORKFLOW.indexOf(customForm) !== -1;
    };

    const calcularTipoDteSiiEsperado = (record) => {
        const taxTotal = Number(record.getValue({ fieldId: 'taxtotal' })) || 0;
        return taxTotal > 0
            ? TIPO_DTE_SII.FACTURA_AFECTA_ELECTRONICA
            : TIPO_DTE_SII.FACTURA_EXENTA_ELECTRONICA;
    };

    const obtenerTipoDteSii = (record) => {
        return formularioLoAutocompletaElWorkflow(record)
            ? calcularTipoDteSiiEsperado(record)
            : record.getValue({ fieldId: 'custbody_2wintipodtesii' });
    };

    const buscarFacturaDuplicada = (record) => {
        const idInterno = record.id || '0';
        const cliente = record.getValue({ fieldId: 'entity' });
        const subsidiaria = record.getValue({ fieldId: 'subsidiary' });
        const folio = record.getValue({ fieldId: 'custbody_2winfolioacepta' });
        const tipoDteSii = obtenerTipoDteSii(record);

        const faltaAlgunDatoParaComparar = !cliente || !subsidiaria || !folio || !tipoDteSii;
        if (faltaAlgunDatoParaComparar) {
            return null;
        }

        const filtros = [
            ['type', 'anyof', 'CustInvc'],
            'AND', ['entity', 'anyof', cliente],
            'AND', ['subsidiary', 'anyof', subsidiaria],
            'AND', ['custbody_2winfolioacepta', 'equalto', folio],
            'AND', ['custbody_2wintipodtesii', 'anyof', tipoDteSii],
            'AND', ['mainline', 'is', 'T']
        ];

        if (idInterno !== '0') {
            filtros.push('AND', ['internalidnumber', 'notequalto', idInterno]);
        }

        const [primerResultado] = search.create({
            type: search.Type.INVOICE,
            filters: filtros,
            columns: ['internalid', 'tranid']
        }).run().getRange({ start: 0, end: 1 });

        if (!primerResultado) {
            return null;
        }

        return {
            internalId: primerResultado.getValue({ name: 'internalid' }),
            documentNumber: primerResultado.getValue({ name: 'tranid' })
        };
    };

    const validarDescripcionLinea = (context, dialog) => {
        const { currentRecord, sublistId } = context;
        if (sublistId !== 'item') return true;

        const descripcion = currentRecord.getCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'description'
        });

        if (!descripcion) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'La Descripción es obligatoria en todas las líneas, independientemente del artículo.'
            });
            return false;
        }

        return true;
    };

    /**
     * Resguardo para saveRecord: recorre todas las líneas del sublist 'item'
     * ya confirmadas (no solo la que se está editando) y exige Descripción en
     * cada una. Cubre casos que no disparan validateLine.
     *
     * @param {Object} currentRecord
     * @param {Object} dialog - Módulo N/ui/dialog, inyectado por el CS
     * @returns {boolean} false si a alguna línea le falta la descripción, true si no
     */
    const validarTodasLasLineasItem = (currentRecord, dialog) => {
        const cantidad = currentRecord.getLineCount({ sublistId: 'item' });
        const lineasFaltantes = [];

        for (let i = 0; i < cantidad; i++) {
            const descripcion = currentRecord.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i });
            if (!descripcion) lineasFaltantes.push(i + 1);
        }

        if (lineasFaltantes.length) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'La Descripción es obligatoria en todas las líneas. Falta en la línea ' + lineasFaltantes.join(', ') + '.'
            });
            return false;
        }

        return true;
    };

    return {
        buscarFacturaDuplicada,
        validarDescripcionLinea,
        validarTodasLasLineasItem
    };

});
