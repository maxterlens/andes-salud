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

    return {
        buscarFacturaDuplicada
    };

});
