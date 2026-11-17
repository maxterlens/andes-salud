/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Entry point de la pantalla del recuento. Solo recibe la peticion
 *              y se la pasa al handler.
 *
 *              GET
 *                sin parametros          → la pantalla del recuento; con la
 *                                          ubicacion elegida, la lista de sus
 *                                          articulos para marcar.
 *                custpage_recuento       → boton Descargar TXT: baja el archivo.
 *                custpage_carga          → boton Cargar CSV de esta pantalla:
 *                                          la pantalla de carga, para elegir
 *                                          el recuento.
 *              POST
 *                sin parametros          → Generar recuento: deja la solicitud
 *                                          de generacion en la cola y lleva a
 *                                          ella.
 *                custpage_recuento_carga → Cargar: valida el CSV, deja la
 *                                          solicitud de carga en la cola y
 *                                          lleva a ella.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_man_stlt
 * @deploymentid customdeploy_as_rec_inv_man_stlt
 * @author Andes Salud
 * @version 1.6.0
 */
define(['./handler/AS_RecuentoInventarioManualHandler', './handler/AS_ArchivoRecuentoHandler',
        './handler/AS_CargaCantidadesHandler', './constants/AS_RecuentoInventarioManualConstants'],
    (recuentoInventarioManualHandler, archivoRecuentoHandler, cargaCantidadesHandler, CONSTANTES) => {

    function onRequest(context) {
        const parametros = obtenerParametros(context);

        try {
            if (context.request.method === 'GET') {
                if (parametros.recuentoId) {
                    archivoRecuentoHandler.descargarArchivo(context, parametros.recuentoId);
                } else if (parametros.carga) {
                    cargaCantidadesHandler.mostrarFormulario(context);
                } else {
                    recuentoInventarioManualHandler.mostrarFormulario(context);
                }
            } else {
                if (parametros.recuentoCargaId) {
                    cargaCantidadesHandler.cargarCantidades(context, parametros.recuentoCargaId);
                } else {
                    recuentoInventarioManualHandler.generarRecuento(context);
                }
            }
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO MANUAL ERROR',
                details: 'metodo: ' + context.request.method
                       + ' | recuento: ' + (parametros.recuentoId || parametros.recuentoCargaId || '')
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    function obtenerParametros(context) {
        return {
            recuentoId     : context.request.parameters[CONSTANTES.CAMPOS.RECUENTO],
            recuentoCargaId: context.request.parameters[CONSTANTES.CAMPOS.RECUENTO_CARGA],
            carga          : context.request.parameters[CONSTANTES.CAMPOS.CARGA],
        };
    }

    return { onRequest };
});
