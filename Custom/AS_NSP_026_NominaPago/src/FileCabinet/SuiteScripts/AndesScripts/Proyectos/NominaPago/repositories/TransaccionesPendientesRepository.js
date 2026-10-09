/**
 * AS_NSP_026 — Nomina de Pago (generacion con seleccion manual de transacciones)
 * @description Busqueda de transacciones candidatas a incluir en una Nomina de Pago.
 *              Mismo filtro que usaba 2win_ue_nomina_banco.js (crearDetalleNomina),
 *              que hoy incluye automaticamente TODO lo que matchea. Aca solo se BUSCA
 *              y se devuelve la lista — la seleccion final la hace el usuario en el
 *              Suitelet, y el Handler vuelve a llamar esta misma funcion para
 *              revalidar justo antes de crear los detalles (ver
 *              ui/handlers/GeneracionNominaPagoHandler.js).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search'], (search) => {

    /**
     * Busca transacciones (VendPymt, TaxPymt, VPrep) candidatas a nomina de pago:
     * cuenta con numero de cuenta bancaria informado, approval status distinto de
     * Rechazado, y que aun no tengan un customrecord_2w_detalle_nomina_pago vinculado.
     *
     * @param {Object} params
     * @param {string|number} [params.subsidiaria] - internal id de la subsidiaria (opcional)
     * @param {string|number} params.cuenta - internal id de la cuenta bancaria
     * @returns {Array<{id:string, numero:string, entidad:string, fecha:string, monto:number, tipo:string}>}
     */
    function buscarTransaccionesCandidatas(params) {
        const subsidiaria = params && params.subsidiaria;
        const cuenta = params && params.cuenta;

        let filters = [
            ['type', 'anyof', 'VendPymt', 'TaxPymt', 'VPrep'],
            'AND',
            ['account.custrecord_2win_numero_cuenta_bancaria', 'isnotempty', ''],
            'AND',
            ['approvalstatus', 'noneof', '3'],
            'AND',
            ['custrecord_2w_detpago_transaccion.internalidnumber', 'isempty', ''],
            'AND',
            ['account', 'anyof', cuenta]
        ];

        if (subsidiaria) {
            filters = filters.concat(['AND', ['subsidiary', 'anyof', subsidiaria]]);
        }

        const transactionSearchObj = search.create({
            type: 'transaction',
            filters: filters,
            columns: [
                search.createColumn({ name: 'internalid', label: 'ID TRANSACCION' }),
                search.createColumn({ name: 'tranid', label: 'N Transaccion' }),
                search.createColumn({ name: 'name', label: 'Entidad' }),
                search.createColumn({ name: 'trandate', label: 'Fecha' }),
                search.createColumn({ name: 'amount', label: 'Monto a Pagar' }),
                search.createColumn({ name: 'type', label: 'Tipo de Transaccion' })
            ]
        });

        const resultados = [];
        // NOTA: usar runPaged() si el volumen puede superar el limite de 4000
        // resultados iterables de N/search — ver documento de viabilidad.
        transactionSearchObj.run().each((result) => {
            resultados.push({
                id: result.id,
                numero: result.getValue('tranid'),
                entidad: result.getText('name'),
                fecha: result.getValue('trandate'),
                monto: result.getValue('amount'),
                tipo: result.getText('type')
            });
            return true;
        });

        return resultados;
    }

    return { buscarTransaccionesCandidatas };
});
