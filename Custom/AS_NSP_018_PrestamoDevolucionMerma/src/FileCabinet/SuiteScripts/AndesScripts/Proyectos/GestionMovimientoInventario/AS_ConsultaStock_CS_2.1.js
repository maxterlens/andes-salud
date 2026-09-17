/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Client script de la consulta de stock. Hace una sola cosa: volver
 *              a pedir la pagina cuando cambia un filtro, porque el combo de
 *              ubicaciones y la lista de articulos los arma el servidor.
 *
 *              Al cambiar la subsidiaria la ubicacion se manda vacia a proposito:
 *              la que estaba elegida pertenece a la subsidiaria anterior y ya no
 *              aplica.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/url'], (url) => {

    const SUITELET = {
        SCRIPT    : 'customscript_as_stlt_consulta_stock',
        DEPLOYMENT: 'customdeploy_as_stlt_consulta_stock',
    };

    function fieldChanged(context) {
        const registroActual = context.currentRecord;

        if (context.fieldId === 'custpage_subsidiaria') {
            abrirConsulta(registroActual.getValue({ fieldId: 'custpage_subsidiaria' }), '');
            return;
        }

        if (context.fieldId === 'custpage_ubicacion') {
            abrirConsulta(registroActual.getValue({ fieldId: 'custpage_subsidiaria' }),
                          registroActual.getValue({ fieldId: 'custpage_ubicacion' }));
        }
    }

    function abrirConsulta(subsidiaria, ubicacion) {
        window.location.href = url.resolveScript({
            scriptId    : SUITELET.SCRIPT,
            deploymentId: SUITELET.DEPLOYMENT,
            params      : {
                subsidiaria: subsidiaria,
                ubicacion  : ubicacion,
            },
        });
    }

    return { fieldChanged };
});
