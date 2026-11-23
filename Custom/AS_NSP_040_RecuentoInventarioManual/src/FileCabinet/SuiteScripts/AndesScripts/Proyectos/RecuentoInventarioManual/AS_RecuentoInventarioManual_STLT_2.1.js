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
 *                custpage_detalle        → boton Detalle de conteo del
 *                                          recuento: baja el CSV.
 *                custpage_importes       → boton Importes del recuento del
 *                                          recuento: baja el CSV de la ficha
 *                                          Importes del recuento.
 *                custpage_txt_maestro    → boton Descargar TXT maestro de esta
 *                                          pantalla: la pantalla para elegir
 *                                          la subsidiaria; con
 *                                          custpage_subsidiaria_maestro, su
 *                                          total de articulos.
 *                custpage_maestro        → boton Descargar TXT de esa
 *                                          pantalla: baja el TXT de todos los
 *                                          articulos de la subsidiaria.
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
 * @version 1.10.0
 *
 */

define(['./handler/AS_RecuentoInventarioManualHandler', './handler/AS_ArchivoRecuentoHandler',
        './handler/AS_CargaCantidadesHandler', './handler/AS_AprobacionRecuentoHandler',
        './handler/AS_ImporteRecuentoHandler', './constants/AS_RecuentoInventarioManualConstants'],
    (recuentoInventarioManualHandler, archivoRecuentoHandler, cargaCantidadesHandler, aprobacionRecuentoHandler,
     importeRecuentoHandler, CONSTANTES) => {

    function onRequest(context) {
        const parametros = obtenerParametros(context);

        try {
            if (context.request.method === 'GET') {
                if (parametros.recuentoId) {
                    archivoRecuentoHandler.descargarTxt(context, parametros.recuentoId);
                } else if (parametros.carga) {
                    cargaCantidadesHandler.mostrarFormulario(context);
                } else if (parametros.aprobarId) {
                    aprobacionRecuentoHandler.solicitarAprobacion(parametros.aprobarId);
                } else if (parametros.detalleId) {
                    archivoRecuentoHandler.descargarDetalle(context, parametros.detalleId);
                } else if (parametros.importesId) {
                    importeRecuentoHandler.descargarImportes(context, parametros.importesId);
                } else if (parametros.txtMaestro) {
                    archivoRecuentoHandler.mostrarFormularioMaestro(context, parametros.subsidiariaMaestro);
                } else if (parametros.maestroId) {
                    archivoRecuentoHandler.descargarTxtMaestro(context, parametros.maestroId);
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
                       + ' | recuento: ' + (parametros.recuentoId || parametros.recuentoCargaId || parametros.aprobarId
                                        || parametros.detalleId || parametros.importesId || parametros.maestroId || '')
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
            detalleId      : context.request.parameters[CONSTANTES.CAMPOS.DETALLE],
            importesId     : context.request.parameters[CONSTANTES.CAMPOS.IMPORTES],
            txtMaestro        : context.request.parameters[CONSTANTES.CAMPOS.TXT_MAESTRO],
            subsidiariaMaestro: context.request.parameters[CONSTANTES.CAMPOS.SUBSIDIARIA_MAESTRO],
            maestroId      : context.request.parameters[CONSTANTES.CAMPOS.MAESTRO],
        };
    }

    return { onRequest };
});
