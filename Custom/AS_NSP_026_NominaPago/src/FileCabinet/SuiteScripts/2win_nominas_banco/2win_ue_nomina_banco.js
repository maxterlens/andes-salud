/**
 *@NApiVersion 2.x
 *@NScriptType UserEventScript
 */
define(["N/search", "N/record"], function (search, record) {

    function beforeLoad(context) {
        log.debug({ title: 'beforeLoad', details: 'Ejecutando antes de cargar el registro' });
    }

    function beforeSubmit(context) {
        log.debug({ title: 'beforeSubmit', details: 'Ejecutando antes de enviar el registro' });
    }

    function crearDetalleNomina(subsidiaria, cuenta, nomina) {

        var filters = [];

        if (subsidiaria && subsidiaria != null && subsidiaria !== "") {

            log.debug('crearDetalleNomina', 'Flujo con subsidiaria');
            
            filters = [
                ["type", "anyof", "VendPymt", "TaxPymt", "VPrep"],
                "AND",
                ["account.custrecord_2win_numero_cuenta_bancaria", "isnotempty", ""],
                "AND",
                ["approvalstatus", "noneof", "3"],
                "AND",
                ["custrecord_2w_detpago_transaccion.internalidnumber", "isempty", ""],
                "AND",
                ["subsidiary", "anyof", subsidiaria],
                "AND",
                ["account", "anyof", cuenta]
            ]

        } else {

            log.debug('crearDetalleNomina', 'Flujo sin subsidiaria');

            filters = [
                ["type", "anyof", "VendPymt", "TaxPymt", "VPrep"],
                "AND",
                ["account.custrecord_2win_numero_cuenta_bancaria", "isnotempty", ""],
                "AND",
                ["approvalstatus", "noneof", "3"],
                "AND",
                ["custrecord_2w_detpago_transaccion.internalidnumber", "isempty", ""],
                "AND",
                ["account", "anyof", cuenta]
            ]
        }
        
        var transactionSearchObj = search.create({
            type: "transaction",
            filters: filters,
            columns:
                [
                    search.createColumn({ name: "internalid", label: "ID TRANSACCIÓN" }),
                    search.createColumn({ name: "amount", label: "Monto a Pagar" })
                ]
        });

        var searchResultCount = transactionSearchObj.runPaged().count;
        log.debug("crearDetalleNomina result count", searchResultCount);
        transactionSearchObj.run().each(function (result) {

            log.debug({ title: 'Resultados del search', details: result });

            var monto = result.getValue('amount');

            var detalleNomina = record.create({ type: "customrecord_2w_detalle_nomina_pago" });
            detalleNomina.setValue({ fieldId: "custrecord_2w_detpago_nomina", value: nomina });
            detalleNomina.setValue({ fieldId: "custrecord_2w_detpago_transaccion", value: result.id });
            detalleNomina.setValue({ fieldId: "custrecord_2w_detpago_monto_a_pagar", value: monto });
            var detalleNominaId = detalleNomina.save();

            log.debug({ title: "detalleNominaId", details: detalleNominaId });

            return true;
        });

    }

    function afterSubmit(context) {
        // DESHABILITADO (AS_NSP_026): la creacion de detalle de nomina se movio al
        // Suitelet AS_GeneracionNominaPago_SL_2.1 (ver
        // src/FileCabinet/SuiteScripts/AndesScripts/Proyectos/NominaPago/services/NominaPagoService.js),
        // donde el usuario elige manualmente que transacciones incluir en vez de
        // que este script las incluya todas automaticamente para la subsidiaria/
        // cuenta de la nomina. Se deja la logica original comentada abajo como
        // referencia y para poder revertir facilmente si hiciera falta.
        return;

        /*
        var nomina = context.newRecord;
        var id_nomina = nomina.id;
        var subsidiaria = nomina.getValue('custrecord_2w_nompago_empresa');
        var cuenta = nomina.getValue('custrecord_2w_nompago_cuenta_banco');

        log.debug({ title: 'Parametros para el search', details: { 'id': id_nomina, "subsidiaria": subsidiaria, 'cuenta': cuenta } });

        if (context.type == 'create') {

            crearDetalleNomina(subsidiaria, cuenta, id_nomina);
            
            record.submitFields({
                type: 'customrecord_2w_nominas_pago',
                id: id_nomina,
                values: {
                    "custrecord_2win_estado_nomina_pago": "Nómina Generada"
                }
            });
        }
        */
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    }
});
