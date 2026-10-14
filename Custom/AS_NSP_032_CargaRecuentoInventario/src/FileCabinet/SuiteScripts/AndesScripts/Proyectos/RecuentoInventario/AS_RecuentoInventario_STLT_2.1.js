/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Entry point del formulario de carga del recuento. Solo recibe la
 *              peticion y se la pasa al handler.
 *
 *              GET  → muestra el formulario: cabecera, archivo CSV y boton Cargar.
 *              POST → Cargar: lee el CSV y lista sus articulos debajo.
 *                     Generar: crea el recuento con los articulos listados.
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_carga_stlt
 * @deploymentid customdeploy_as_rec_inv_carga_stlt
 * @author Andes Salud
 * @version 1.2.0
 *
 * CHANGELOG v1.2.0 (2026-10-14):
 *   - [FEAT] POST: la operacion Generar va a generarRecuento.
 *
 * CHANGELOG v1.1.0 (2026-10-09):
 *   - [FEAT] POST: el boton Cargar lee el CSV y lista los articulos.
 *
 * CHANGELOG v1.0.0 (2026-10-09):
 *   - [FEAT] Formulario inicial: cabecera del recuento y campo de archivo CSV.
 *            El boton Cargar todavia no procesa el archivo.
 */
define(['./handler/AS_RecuentoInventarioHandler', './constants/AS_RecuentoInventarioConstants'],
    (recuentoInventarioHandler, CONSTANTES) => {

    function onRequest(context) {
        try {
            const operacion = context.request.parameters[CONSTANTES.CAMPOS.OPERACION];

            if (context.request.method === 'GET') {
                recuentoInventarioHandler.mostrarFormulario(context);
            } else if (operacion === CONSTANTES.OPERACIONES.GENERAR) {
                recuentoInventarioHandler.generarRecuento(context);
            } else {
                recuentoInventarioHandler.cargarArchivo(context);
            }
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO ERROR',
                details: 'metodo: ' + context.request.method
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { onRequest };
});
