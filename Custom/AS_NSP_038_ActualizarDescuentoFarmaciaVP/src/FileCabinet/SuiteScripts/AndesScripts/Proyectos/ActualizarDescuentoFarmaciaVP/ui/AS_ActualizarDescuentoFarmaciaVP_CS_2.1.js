/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Client script de las pantallas del Suitelet ActualizarDescuentoFarmaciaVP.
 *               - Validación: confirmación antes de Procesar (cuenta las facturas marcadas)
 *                 y botón Revalidar (envía el formulario con su acción).
 *               - Historial: recarga la página al cambiar los filtros.
 *               - Botones de navegación (Ver historial, Volver / Nueva búsqueda, Actualizar).
 */
define(["N/currentRecord", "N/url", "N/format", "../constants/ActualizarDescuentoFarmaciaVPConstants"], (currentRecord, url, format, CONST) => {
    const { SCRIPTS, PARAMS, PANTALLAS, ACCIONES, CAMPOS_VALIDACION: CV, FILTROS_HISTORIAL: F, SUBLISTAS, COLUMNAS_SELECCION: CS } = CONST;

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
        let marcadas = 0;
        const total = rec.getLineCount({ sublistId: SUBLISTAS.POR_PROCESAR }) || 0;
        for (let i = 0; i < total; i++) {
            const marcado = rec.getSublistValue({ sublistId: SUBLISTAS.POR_PROCESAR, fieldId: CS.PROCESAR, line: i });
            if (marcado === true || marcado === "T") marcadas++;
        }
        if (!marcadas) {
            window.alert("Marque al menos una factura para procesar.");
            return false;
        }
        return window.confirm(
            `Se actualizará la cantidad del descuento en ${marcadas} factura(s) de venta.\n\n` +
                "El proceso corre en segundo plano y no se puede deshacer automáticamente. ¿Desea procesar?"
        );
    };

    /** Envía el formulario con otra acción (no pasa por saveRecord: la confirmación se hace aquí). */
    const _enviarAccion = (accion) => {
        currentRecord.get().setValue({ fieldId: CV.ACCION, value: accion });
        window.onbeforeunload = null;
        const formulario = document.forms.main_form || document.forms[0];
        formulario.submit();
    };

    /** Botón "Revalidar": vuelve a buscar y validar las facturas con los mismos parámetros. */
    const revalidarBusqueda = () => {
        if (window.confirm("Se volverán a buscar y validar las facturas con los datos actuales de NetSuite. Las marcas de selección se reiniciarán. ¿Desea revalidar?")) {
            _enviarAccion(ACCIONES.REVALIDAR);
        }
    };

    /** Botón "Ver historial". */
    const irAHistorial = () => _ir({ [PARAMS.PANTALLA]: PANTALLAS.HISTORIAL });

    /** Botones "Volver" y "Nueva búsqueda". */
    const irAParametros = () => _ir({ [PARAMS.PANTALLA]: PANTALLAS.PARAMETROS });

    /** Botón "Actualizar". */
    const actualizarPagina = () => {
        window.onbeforeunload = null;
        window.location.reload();
    };

    return { pageInit, fieldChanged, saveRecord, revalidarBusqueda, irAHistorial, irAParametros, actualizarPagina };
});
