/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoRepository.js
 * @description 
 */
define(['N/search'], (search) => {

    const getCreatedBy = (id) => {
        try {
            let createdby = search.lookupFields({ type: 'expensereport', id, columns: ['createdby'] }).createdby
            return createdby ? createdby[0].value : '';
        } catch (error) {
            log.error('An error was ocurred', error);
            return '';
        }
    }

    return { getCreatedBy };
});
