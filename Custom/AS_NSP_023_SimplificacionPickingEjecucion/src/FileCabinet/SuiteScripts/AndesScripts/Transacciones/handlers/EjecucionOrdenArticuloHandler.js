/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([
], () => {

	function asignarEstadoEnviado(context) {
		const SENT_SHIP_STATUS = 'C';
		const { newRecord, type } = context;

		if (type == 'create') {
			newRecord.setValue('shipstatus', SENT_SHIP_STATUS);
		}
	}

    return {
		asignarEstadoEnviado
    };
});
