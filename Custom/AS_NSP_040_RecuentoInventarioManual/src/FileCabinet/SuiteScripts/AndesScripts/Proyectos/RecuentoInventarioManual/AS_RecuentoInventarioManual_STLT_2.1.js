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
 *                custpage_recuento_carga → boton Cargar CSV: la pantalla para
 *                                          subir el archivo.
 *                custpage_generacion     → el aviso de la generacion pregunta
 *                                          si ya termino (responde JSON).
 *              POST
 *                sin parametros          → Generar recuento: manda a crear el
 *                                          recuento al Scheduled con los
 *                                          articulos marcados.
 *                custpage_recuento_carga → Cargar: escribe las cantidades del
 *                                          CSV en el recuento.
 *
 * CHANGELOG v1.3.0 (2026-11-16):
 * - [FEAT] GET con custpage_generacion y custpage_tarea: estado de la generacion.
 *
 * CHANGELOG v1.2.2 (2026-11-16):
 * - [FIX] Cabecera: Generar recuento ahora va al Scheduled. El ruteo no cambia.
 *
 * CHANGELOG v1.2.1 (2026-11-16):
 * - [FIX] onRequest ordenado: un bloque GET y uno POST, cada caso con llaves;
 *         los parametros en obtenerParametros.
 *
 * CHANGELOG v1.2.0 (2026-11-15):
 * - [FEAT] custpage_recuento_carga: pantalla y carga de cantidades por CSV.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FEAT] GET con custpage_recuento: descarga el TXT del recuento.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Mostrar la pantalla y generar el recuento.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_man_stlt
 * @deploymentid customdeploy_as_rec_inv_man_stlt
 * @author Andes Salud
 * @version 1.3.0
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
                } else if (parametros.recuentoCargaId) {
                    cargaCantidadesHandler.mostrarFormulario(context, parametros.recuentoCargaId);
                } else if (parametros.codigo) {
                    recuentoInventarioManualHandler.consultarGeneracion(context, parametros.codigo, parametros.tareaId);
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
            codigo         : context.request.parameters[CONSTANTES.CAMPOS.GENERACION],
            tareaId        : context.request.parameters[CONSTANTES.CAMPOS.TAREA],
        };
    }

    return { onRequest };
});
