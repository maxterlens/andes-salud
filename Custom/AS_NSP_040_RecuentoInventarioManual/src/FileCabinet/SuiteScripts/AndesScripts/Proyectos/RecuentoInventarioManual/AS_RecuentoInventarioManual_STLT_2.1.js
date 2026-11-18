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
 *                custpage_aprobar        → boton Aprobar del recuento: deja la
 *                                          aprobacion en la cola y lleva a
 *                                          ella.
 *              POST
 *                sin parametros          → Generar recuento: deja la solicitud
 *                                          de generacion en la cola y lleva a
 *                                          ella.
 *                custpage_recuento_carga → Cargar, con el lote elegido en
 *                                          custpage_lote_carga: valida el CSV,
 *                                          deja la solicitud de carga en la
 *                                          cola y lleva a ella.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_man_stlt
 * @deploymentid customdeploy_as_rec_inv_man_stlt
 * @author Andes Salud
 * @version 1.8.0
 *
 * CHANGELOG
 * 1.8.0 [FEAT] Aprobar: deja la aprobacion del recuento en la cola.
 * 1.7.0 [FEAT] Cargar recibe el lote elegido en la pantalla.
 */
define(['./handler/AS_RecuentoInventarioManualHandler', './handler/AS_ArchivoRecuentoHandler',
        './handler/AS_CargaCantidadesHandler', './handler/AS_AprobacionRecuentoHandler',
        './constants/AS_RecuentoInventarioManualConstants'],
    (recuentoInventarioManualHandler, archivoRecuentoHandler, cargaCantidadesHandler, aprobacionRecuentoHandler, CONSTANTES) => {

    function onRequest(context) {
        const parametros = obtenerParametros(context);

        try {
            if (context.request.method === 'GET') {
                if (parametros.recuentoId) {
                    archivoRecuentoHandler.descargarArchivo(context, parametros.recuentoId);
                } else if (parametros.carga) {
                    cargaCantidadesHandler.mostrarFormulario(context);
                } else if (parametros.aprobarId) {
                    aprobacionRecuentoHandler.solicitarAprobacion(parametros.aprobarId);
                } else {
                    recuentoInventarioManualHandler.mostrarFormulario(context);
                }
            } else {
                if (parametros.recuentoCargaId) {
                    cargaCantidadesHandler.cargarCantidades(context, parametros.recuentoCargaId, parametros.loteCargaId);
                } else {
                    recuentoInventarioManualHandler.generarRecuento(context);
                }
            }
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO MANUAL ERROR',
                details: 'metodo: ' + context.request.method
                       + ' | recuento: ' + (parametros.recuentoId || parametros.recuentoCargaId || parametros.aprobarId || '')
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    function obtenerParametros(context) {
        return {
            recuentoId     : context.request.parameters[CONSTANTES.CAMPOS.RECUENTO],
            recuentoCargaId: context.request.parameters[CONSTANTES.CAMPOS.RECUENTO_CARGA],
            loteCargaId    : context.request.parameters[CONSTANTES.CAMPOS.LOTE_CARGA],
            carga          : context.request.parameters[CONSTANTES.CAMPOS.CARGA],
            aprobarId      : context.request.parameters[CONSTANTES.CAMPOS.APROBAR],
        };
    }

    return { onRequest };
});
