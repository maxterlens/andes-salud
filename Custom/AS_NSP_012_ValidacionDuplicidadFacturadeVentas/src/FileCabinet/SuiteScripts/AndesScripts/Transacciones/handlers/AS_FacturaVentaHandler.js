/**
 * @NApiVersion 2.1
 *
 */
define(['N/search'], (search) => {

    const FIELD = {
        CLIENTE: 'entity',
        SUBSIDIARIA: 'subsidiary',
        FOLIO: 'custbody_2winfolioacepta',
        TIPO_DTE_SII: 'custbody_2wintipodtesii',
        CUSTOM_FORM: 'customform',
        TAX_TOTAL: 'taxtotal'
    };

    const TIPO_DTE_SII = {
        FACTURA_AFECTA_ELECTRONICA: 1,
        FACTURA_EXENTA_ELECTRONICA: 2
    };

    const FORMULARIOS_AUTOCOMPLETADOS_POR_WORKFLOW = [
        151, // QA
        132  // PROD
    ];

    const formularioLoAutocompletaElWorkflow = (record) => {
        const customForm = Number(record.getValue({ fieldId: FIELD.CUSTOM_FORM }));
        return FORMULARIOS_AUTOCOMPLETADOS_POR_WORKFLOW.indexOf(customForm) !== -1;
    };

    const calcularTipoDteSiiEsperado = (record) => {
        const taxTotal = Number(record.getValue({ fieldId: FIELD.TAX_TOTAL })) || 0;
        return taxTotal > 0
            ? TIPO_DTE_SII.FACTURA_AFECTA_ELECTRONICA
            : TIPO_DTE_SII.FACTURA_EXENTA_ELECTRONICA;
    };

    const obtenerTipoDteSii = (record) => {
        return formularioLoAutocompletaElWorkflow(record)
            ? calcularTipoDteSiiEsperado(record)
            : record.getValue({ fieldId: FIELD.TIPO_DTE_SII });
    };

    const validarCamposBasicos = (record) => {
        const camposSiempreRequeridos = [
            { fieldId: FIELD.CLIENTE, mensaje: 'Debe seleccionar un cliente.' },
            { fieldId: FIELD.SUBSIDIARIA, mensaje: 'Debe seleccionar una subsidiaria.' },
            { fieldId: FIELD.FOLIO, mensaje: 'Debe ingresar el Folio Acepta.' }
        ];

        for (const campo of camposSiempreRequeridos) {
            if (!record.getValue({ fieldId: campo.fieldId })) {
                return { ok: false, message: campo.mensaje };
            }
        }

        const tipoDteEsExigibleAqui = !formularioLoAutocompletaElWorkflow(record);
        if (tipoDteEsExigibleAqui && !record.getValue({ fieldId: FIELD.TIPO_DTE_SII })) {
            return { ok: false, message: 'Debe seleccionar el Tipo DTE SII Acepta.' };
        }

        return { ok: true };
    };

    const buscarFacturaDuplicada = (record) => {
        const idInterno = record.id || '0';
        const cliente = record.getValue({ fieldId: FIELD.CLIENTE });
        const subsidiaria = record.getValue({ fieldId: FIELD.SUBSIDIARIA });
        const folio = record.getValue({ fieldId: FIELD.FOLIO });
        const tipoDteSii = obtenerTipoDteSii(record);

        const faltaAlgunDatoParaComparar = !cliente || !subsidiaria || !folio || !tipoDteSii;
        if (faltaAlgunDatoParaComparar) {
            return null;
        }

        const filtros = [
            ['type', 'anyof', 'CustInvc'],
            'AND', ['entity', 'anyof', cliente],
            'AND', ['subsidiary', 'anyof', subsidiaria],
            'AND', [FIELD.FOLIO, 'equalto', folio],
            'AND', [FIELD.TIPO_DTE_SII, 'anyof', tipoDteSii],
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

    return {
        validarCamposBasicos,
        buscarFacturaDuplicada
    };

});
