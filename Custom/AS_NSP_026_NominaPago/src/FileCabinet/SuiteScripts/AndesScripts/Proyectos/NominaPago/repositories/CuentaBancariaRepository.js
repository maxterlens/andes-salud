/**
 * AS_NSP_026 — Nomina de Pago (generacion con seleccion manual de transacciones)
 * @description Busqueda de cuentas bancarias (registro nativo Account) para poblar el
 *              campo Cuenta Banco del Suitelet de Generacion de Nomina de Pago, filtradas
 *              por Subsidiaria y Banco elegidos en la cabecera:
 *                - custrecord_2w_acc_banco (en la cuenta) = Banco seleccionado
 *                - custrecord_2w_empresa_de_cuenta_banco (en la cuenta) = Subsidiaria seleccionada
 *
 *              Este listado se consume de dos formas:
 *                1. Via el endpoint AJAX del Handler (?custpage_ajax=cuentasbancarias),
 *                   que el Client Script llama con fetch() apenas Subsidiaria y Banco
 *                   tienen ambos un valor — sin recargar la pagina.
 *                2. En el render normal del Form (GET/POST), para dejar el campo Cuenta
 *                   Banco correctamente poblado en cualquier re-render server-side
 *                   (por ejemplo, tras un error de validacion en el POST).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search'], (search) => {

    /**
     * @param {Object} params
     * @param {string|number} params.subsidiaria - internal id de la subsidiaria
     * @param {string|number} params.banco - internal id de customrecord_2w_codigos_bancos_chile
     * @returns {Array<{id:string, nombre:string}>}
     */
    function buscarCuentasBancarias(params) {
        const subsidiaria = params && params.subsidiaria;
        const banco = params && params.banco;
        if (!subsidiaria || !banco) return [];

        const cuentaSearchObj = search.create({
            type: search.Type.ACCOUNT,
            filters: [
                ['custrecord_2w_acc_banco', 'anyof', banco],
                'AND',
                ['custrecord_2w_empresa_de_cuenta_banco', 'anyof', subsidiaria],
                'AND',
                ['type', 'anyof', 'Bank'],
                'AND',
                ['issummary', 'is', 'F'],
                'AND',
                ['isinactive', 'is', 'F']
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'name' })
            ]
        });

        const resultados = [];
        cuentaSearchObj.run().each((result) => {
            resultados.push({
                id: result.id,
                nombre: result.getValue('name')
            });
            return true;
        });

        return resultados;
    }

    return { buscarCuentasBancarias };
});
