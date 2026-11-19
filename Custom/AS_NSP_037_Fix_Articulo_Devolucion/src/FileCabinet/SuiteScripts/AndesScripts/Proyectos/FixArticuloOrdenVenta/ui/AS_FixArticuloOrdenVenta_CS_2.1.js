/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Client script de las pantallas del Suitelet FixArticuloOrdenVenta.
 *               - Validación: confirmación antes de Procesar (cuenta los reemplazos marcados),
 *                 y botones Revalidar y Anular (envían el formulario con su acción).
 *               - Historial: recarga la página al cambiar los filtros.
 *               - Botones de navegación (Ver historial, Volver / Nueva carga, Actualizar).
 */
define(["N/currentRecord", "N/url", "N/format", "../constants/FixArticuloOrdenVentaConstants"], (currentRecord, url, format, CONST) => {
    const { SCRIPTS, PARAMS, PANTALLAS, ACCIONES, CAMPOS_VALIDACION: CV, FILTROS_HISTORIAL: F, SUBLISTAS, COLUMNAS_REEMPLAZO: CR } = CONST;

    const _urlSuitelet = (params) => url.resolveScript({ scriptId: SCRIPTS.SUITELET.ID, deploymentId: SCRIPTS.SUITELET.DEPLOY, params });

    const _ir = (params) => {
        window.onbeforeunload = null;
        window.location.href = _urlSuitelet(params);
    };

    const _textoFecha = (valor) => (valor ? format.format({ value: valor, type: format.Type.DATE }) : "");

    const pageInit = () => {
        // Sin inicialización
    };

    /** Historial: recarga con los filtros seleccionados. */
    const fieldChanged = (context) => {
        if (![F.ESTADO, F.SUBSIDIARIA, F.DESDE, F.HASTA].includes(context.fieldId)) return;
        const rec = context.currentRecord;
        _ir({
            [PARAMS.PANTALLA]: PANTALLAS.HISTORIAL,
            [F.ESTADO]: rec.getValue({ fieldId: F.ESTADO }) || "",
            [F.SUBSIDIARIA]: rec.getValue({ fieldId: F.SUBSIDIARIA }) || "",
            [F.DESDE]: _textoFecha(rec.getValue({ fieldId: F.DESDE })),
            [F.HASTA]: _textoFecha(rec.getValue({ fieldId: F.HASTA }))
        });
    };

    /** Confirmación antes de Procesar. */
    const saveRecord = (context) => {
        const rec = context.currentRecord;
        if (rec.getValue({ fieldId: CV.ACCION }) !== ACCIONES.PROCESAR) return true;
        let reemplazos = 0;
        const total = rec.getLineCount({ sublistId: SUBLISTAS.REEMPLAZOS }) || 0;
        for (let i = 0; i < total; i++) {
            const marcado = rec.getSublistValue({ sublistId: SUBLISTAS.REEMPLAZOS, fieldId: CR.REEMPLAZAR, line: i });
            if (marcado === true || marcado === "T") reemplazos++;
        }
        return window.confirm(
            "Se modificarán las Órdenes de Venta y sus Ejecuciones según la validación" +
                (reemplazos ? `, incluidos ${reemplazos} reemplazo(s) de artículo` : "") +
                ".\n\nEl proceso corre en segundo plano y no se puede deshacer automáticamente. ¿Desea procesar?"
        );
    };

    /** Envía el formulario con otra acción (no pasa por saveRecord: la confirmación se hace aquí). */
    const _enviarAccion = (accion) => {
        currentRecord.get().setValue({ fieldId: CV.ACCION, value: accion });
        window.onbeforeunload = null;
        const formulario = document.forms.main_form || document.forms[0];
        formulario.submit();
    };

    /** Botón "Revalidar": vuelve a validar el CSV cargado en el mismo proceso. */
    const revalidarArchivo = () => {
        if (window.confirm("Se volverá a validar el CSV cargado con los datos actuales de NetSuite. Los reemplazos marcados se desmarcarán. ¿Desea revalidar?")) {
            _enviarAccion(ACCIONES.REVALIDAR);
        }
    };

    /** Botón "Anular": cierra el proceso Validado sin procesarlo. */
    const anularProceso = () => {
        if (window.confirm("El proceso quedará Anulado y ya no se podrá procesar. ¿Desea anular?")) {
            _enviarAccion(ACCIONES.ANULAR);
        }
    };

    /** Botón "Ver historial". */
    const irAHistorial = () => _ir({ [PARAMS.PANTALLA]: PANTALLAS.HISTORIAL });

    /** Botones "Volver" y "Nueva carga". */
    const irACarga = () => _ir({ [PARAMS.PANTALLA]: PANTALLAS.CARGA });

    /** Botón "Actualizar". */
    const actualizarPagina = () => {
        window.onbeforeunload = null;
        window.location.reload();
    };

    return { pageInit, fieldChanged, saveRecord, revalidarArchivo, anularProceso, irAHistorial, irACarga, actualizarPagina };
});
