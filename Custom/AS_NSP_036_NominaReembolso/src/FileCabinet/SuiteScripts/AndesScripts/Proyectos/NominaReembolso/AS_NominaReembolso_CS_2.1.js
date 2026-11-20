/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Client script de la pantalla Generar Nomina de Reembolso.
 *
 *              - Subsidiaria o Banco: rehace las opciones de Cuenta Banco con
 *                las cuentas de los dos, sacadas del JSON oculto que dejo el
 *                servidor (como AS_NSP_032).
 *              - Cuenta Banco o Desde, con los dos llenos: envia el formulario con la operacion buscar para
 *                que el servidor liste los reembolsos pendientes.
 *              - Incluir: recalcula el Importe Total a Pagar.
 *              - Marcar Todo / Desmarcar Todo: marcan todas las lineas.
 *
 *              Tambien va colgado de la vista de la nomina (AS_VistaForm):
 *              - Descargar TXT: abre el Suitelet con el id de la nomina, que
 *                responde el archivo del banco como descarga.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 */
define(['N/currentRecord', 'N/url', 'N/ui/message', './constants/AS_NominaReembolsoConstants'],
    (currentRecord, url, message, CONSTANTES) => {

    function fieldChanged(context) {
        const campos   = CONSTANTES.CAMPOS;
        const registro = context.currentRecord;

        if (context.sublistId === CONSTANTES.SUBLISTA.ID) {
            if (context.fieldId === CONSTANTES.SUBLISTA.COLUMNAS.INCLUIR) recalcularTotal(registro);
            return;
        }
        if (context.fieldId === campos.SUBSIDIARIA || context.fieldId === campos.BANCO) filtrarCuentasBanco(registro);
        if (context.fieldId !== campos.CUENTA_BANCO && context.fieldId !== campos.DESDE) return;
        if (registro.getValue({ fieldId: campos.CUENTA_BANCO }) && registro.getValue({ fieldId: campos.DESDE })) buscarReembolsos(registro);
    }

    /**
     * El JSON trae { id, nombre, banco, subsidiaria } de todas las cuentas
     * bancarias: quedan solo las de la Subsidiaria y el Banco elegidos.
     */
    function filtrarCuentasBanco(registro) {
        const campos      = CONSTANTES.CAMPOS;
        const campo       = registro.getField({ fieldId: campos.CUENTA_BANCO });
        const subsidiaria = registro.getValue({ fieldId: campos.SUBSIDIARIA });
        const banco       = registro.getValue({ fieldId: campos.BANCO });
        const cuentas     = JSON.parse(registro.getValue({ fieldId: campos.CUENTAS_DATA }));

        campo.removeSelectOption({ value: null });
        campo.insertSelectOption({ value: '', text: '' });
        cuentas.forEach((cuenta) => {
            if (cuenta.subsidiaria !== subsidiaria || cuenta.banco !== banco) return;
            campo.insertSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });
    }

    /**
     * Envia por el mismo boton Generar con la operacion cambiada: el servidor
     * recibe la cabecera y vuelve a dibujar la pantalla con los reembolsos.
     */
    function buscarReembolsos(registro) {
        message.create({
            type   : message.Type.INFORMATION,
            title  : CONSTANTES.FORMULARIO.BUSCANDO_TITULO,
            message: CONSTANTES.FORMULARIO.BUSCANDO_TEXTO,
        }).show();
        registro.setValue({ fieldId: CONSTANTES.CAMPOS.OPERACION, value: CONSTANTES.OPERACIONES.BUSCAR });
        document.getElementById('submitter').click();
    }

    function recalcularTotal(registro) {
        const sublista = CONSTANTES.SUBLISTA;
        let total      = 0;

        for (let linea = 0; linea < registro.getLineCount({ sublistId: sublista.ID }); linea++) {
            if (!registro.getSublistValue({ sublistId: sublista.ID, fieldId: sublista.COLUMNAS.INCLUIR, line: linea })) continue;
            total += parseFloat(registro.getSublistValue({ sublistId: sublista.ID, fieldId: sublista.COLUMNAS.MONTO, line: linea })) || 0;
        }
        registro.setValue({ fieldId: CONSTANTES.CAMPOS.TOTAL, value: total });
    }

    function marcarTodo() {
        marcarLineas(true);
    }

    function desmarcarTodo() {
        marcarLineas(false);
    }

    function marcarLineas(valor) {
        const sublista = CONSTANTES.SUBLISTA;
        const registro = currentRecord.get();

        for (let linea = 0; linea < registro.getLineCount({ sublistId: sublista.ID }); linea++) {
            registro.selectLine({ sublistId: sublista.ID, line: linea });
            registro.setCurrentSublistValue({ sublistId: sublista.ID, fieldId: sublista.COLUMNAS.INCLUIR, value: valor, ignoreFieldChange: true });
            registro.commitLine({ sublistId: sublista.ID });
        }
        recalcularTotal(registro);
    }

    /**
     * La respuesta del Suitelet es un archivo: el navegador lo descarga y la
     * vista de la nomina se queda abierta.
     */
    function descargarTxt() {
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : { [CONSTANTES.CAMPOS.NOMINA]: currentRecord.get().id },
        });
    }

    return {
        fieldChanged : fieldChanged,
        marcarTodo   : marcarTodo,
        desmarcarTodo: desmarcarTodo,
        descargarTxt : descargarTxt,
    };
});
