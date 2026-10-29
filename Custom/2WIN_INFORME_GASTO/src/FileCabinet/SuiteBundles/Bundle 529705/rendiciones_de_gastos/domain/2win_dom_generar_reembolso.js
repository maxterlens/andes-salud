define(['../dao/2win_dao_factura', '../dao/2win_dao_gastos', '../dao/2win_dao_diario', '../libs/2win_lib_auditoria', 'N/runtime'],

    function (dao_factura, dao_gastos, dao_diario, audit, runtime) {

        function procesar(registro) {

            var id_informe_gasto = registro.id;
            var type = registro.type;

            try {

                var scriptObj = runtime.getCurrentScript();
                log.debug("procesar - remaining usage units (init)", scriptObj.getRemainingUsage());

                var facturas_reversar = obtenerFacturasAReversar(registro);
                //log.debug('procesar - facturas_reversar', facturas_reversar);

                var gastos_reversar = dao_gastos.findByInternalId(id_informe_gasto);
                //log.debug('procesar - gastos_reversar', gastos_reversar);

                var id_subsidiaria = registro.getValue("subsidiary");
                //log.debug('procesar - id_subsidiaria', id_subsidiaria);

                var id_diario = dao_diario.save(facturas_reversar, gastos_reversar, id_subsidiaria);
                log.debug('procesar - id_diario', id_diario);                
                log.debug("procesar - remaining usage units (journal)", scriptObj.getRemainingUsage());

                var facturas_proveedor = agruparFacturasPorProveedor(facturas_reversar);
                //log.debug('procesar - facturas_proveedor', facturas_proveedor);

                dao_factura.createVendPymt(id_informe_gasto, id_diario, facturas_proveedor);

                registarAuditoria(id_informe_gasto, type, "procesarReembolso", "000", "Informe de gasto id " + id_informe_gasto + " pagado por completo.");

            } catch (error) {
                registarAuditoria(id_informe_gasto, type, "procesarReembolso", "001", error.message);
                throw error;
            }
        }

        function agruparFacturasPorProveedor(facturas) {

            var facturas_proveedor = { };

            if (facturas.length > 0) {                

                facturas.forEach(function (factura) {

                    var id_proveedor = factura.id_proveedor;
                    
                    if (!facturas_proveedor[id_proveedor]) {
                        facturas_proveedor[id_proveedor] = [];
                    }

                    facturas_proveedor[id_proveedor].push(factura);
                });                
            }

            return facturas_proveedor;
        }

        function obtenerFacturasAReversar(registro) {

            var total_facturas = registro.getLineCount({ sublistId: 'expense' });
            log.debug('obtenerFacturasAReversar', 'Total Facturas: ' + total_facturas);

            var facturas = [];

            for (var i = 0; i < total_facturas; i++) {

                var id_factura = registro.getSublistValue({ sublistId: 'expense', fieldId: 'custcol_2win_expenseinvoice', line: i });
                log.debug('obtenerFacturasAReversar', 'ID Factura ' + i + ': ' + id_factura);

                var factura = dao_factura.findByInternalId(id_factura);

                if (factura != null) {
                    facturas.push(factura);
                } else {
                    log.debug("obtenerFacturasAReversar", "Factura " + id_factura + " no encontrada.")
                }
            }

            return facturas;
        }

        function registarAuditoria(id, tipo, etapa, estado, decripcion) {

            try {

                var tokenProceso = audit.obtenerToken();

                var datos = {
                    nombreProceso: "2Win WF Rendiciones de Gastos",
                    scriptId: "customscript_2win_wf_rendiciones_gastos",
                    tipoRegistroCreado: tipo,
                    idRegistroCreado: id,
                    etapa: etapa,
                    estado: estado,
                    tokenProceso: tokenProceso,
                    decripcionResultado: decripcion
                }

                audit.crearReporteAuditoria(datos);

            } catch (error) {
                log.error("registarAuditoria", error);
            }
        }

        return {
            procesar: procesar
        }
    }
);
