/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoRepository.js
 * @description 
 */
define(['N/search', 'N/record'], (search, record) => {

    const CAMPO_CON_REPOSICION = 'custbody_2w_as_con_reposicion';
    const CAMPO_ASIENTO_CAJA_CHICA = 'custbody_as_asiento_caja_chica';

    const getCreatedBy = (id) => {
        try {
            let createdby = search.lookupFields({ type: 'expensereport', id, columns: ['createdby'] }).createdby
            return createdby ? createdby[0].value : '';
        } catch (error) {
            log.error('An error was ocurred', error);
            return '';
        }
    }

    /**
     * Datos del informe de gastos necesarios para el asiento de caja chica (AS_NSP_039).
     */
    const getDatosCajaChica = (id) => {
        const informe = record.load({ type: record.Type.EXPENSE_REPORT, id });
        const get = (fieldId) => informe.getValue({ fieldId });
        return {
            id,
            tranId        : get('tranid'),
            approvalStatus: String(get('approvalstatus') || ''),
            conReposicion : get(CAMPO_CON_REPOSICION) === true || get(CAMPO_CON_REPOSICION) === 'T',
            advance       : Number(get('advance')) || 0,
            advanceAccount: get('advanceaccount'),
            account       : get('account'),
            empleado      : get('entity'),
            subsidiaria   : get('subsidiary'),
            moneda        : get('expensereportcurrency'),
            tipoCambio    : get('expensereportexchangerate'),
            asientoId     : get(CAMPO_ASIENTO_CAJA_CHICA)
        };
    };

    /** Guarda (o limpia) el vínculo al asiento de caja chica en el informe. */
    const setAsientoCajaChica = (id, asientoId) => record.submitFields({
        type   : record.Type.EXPENSE_REPORT,
        id,
        values : { [CAMPO_ASIENTO_CAJA_CHICA]: asientoId || '' },
        options: { enableSourcing: false, ignoreMandatoryFields: true }
    });

    return { getCreatedBy, getDatosCajaChica, setAsientoCajaChica };
});
