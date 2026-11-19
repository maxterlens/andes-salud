/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Client Script adjunto al formulario principal del Suitelet.
 *              Gestiona interacciones del lado del cliente.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/currentRecord', 'N/url', 'N/ui/message'], function (currentRecord, url, message) {

    const FLD_OMITIR_NETO_CERO = 'custpage_fil_omit_net_cero';

    /* Banner de advertencia activo (null si no se muestra) */
    let bannerOmitir = null;

    /* ─────────────────────────────────────────────────────────────── */
    /*  pageInit — Se ejecuta al cargar el formulario                  */
    /* ─────────────────────────────────────────────────────────────── */
    function pageInit(scriptContext) {
        _actualizarAdvertenciaOmitir(scriptContext.currentRecord);
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  fieldChanged — Advertencia al desmarcar Omitir Neto Cero       */
    /* ─────────────────────────────────────────────────────────────── */
    function fieldChanged(scriptContext) {
        if (scriptContext.fieldId === FLD_OMITIR_NETO_CERO) {
            _actualizarAdvertenciaOmitir(scriptContext.currentRecord);
        }
    }

    /**
     * Muestra un banner WARNING cuando Omitir Neto Cero está desmarcado
     * y lo oculta cuando está marcado. Es solo informativo: no bloquea el envío.
     * @param {Record} rec  currentRecord del formulario
     */
    function _actualizarAdvertenciaOmitir(rec) {
        const omitir = rec.getValue({ fieldId: FLD_OMITIR_NETO_CERO });

        if (omitir === false || omitir === 'F') {
            if (!bannerOmitir) {
                bannerOmitir = message.create({
                    type   : message.Type.WARNING,
                    title  : 'Omitir Neto Cero desmarcado',
                    message: 'El reporte incluirá también las partidas ya pagadas o aplicadas y las compensadas por folio, con saldo 0. '
                           + 'Puede tardar más y generar un archivo de mayor tamaño. '
                           + 'Se recomienda filtrar por Cuenta Contable o RUT.',
                });
                bannerOmitir.show();
            }
        } else if (bannerOmitir) {
            bannerOmitir.hide();
            bannerOmitir = null;
        }
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  PUNTO DE EXTENSIÓN — Validación antes de submit                */
    /*                                                                 */
    /*  Descomentar y completar si se requieren validaciones           */
    /*  obligatorias antes de lanzar el Map Reduce.                    */
    /* ─────────────────────────────────────────────────────────────── */

    // function saveRecord(scriptContext) {
    //     const rec = currentRecord.get();
    //     const subsidiaria = rec.getValue({ fieldId: 'custpage_fil_subsidiaria' });
    //     const fecha       = rec.getValue({ fieldId: 'custpage_fil_fecha' });
    //
    //     if (!subsidiaria) {
    //         alert('Por favor seleccione una Subsidiaria antes de generar el reporte.');
    //         return false;
    //     }
    //     if (!fecha) {
    //         alert('Por favor ingrese una Fecha antes de generar el reporte.');
    //         return false;
    //     }
    //     return true;
    // }

    /* ─────────────────────────────────────────────────────────────── */
    /*  PUNTO DE EXTENSIÓN — Navegar al detalle de un log             */
    /*                                                                 */
    /*  Si se desea hacer clic en una fila de la sublista para ir     */
    /*  al detalle, se puede usar la columna oculta LINK_DETALLE.     */
    /* ─────────────────────────────────────────────────────────────── */

    // function goToDetalle(fileId) {
    //     var detalleUrl = url.resolveScript({
    //         scriptId    : 'customscript_as_rpt_anlt_cuenta_cons_sl',
    //         deploymentId: 'customdeploy_as_rpt_anlt_cuenta_cons_sl',
    //         params      : { op: 'detail', fileId: fileId },
    //     });
    //     window.location.href = detalleUrl;
    // }

    return {
        pageInit,
        fieldChanged,
        // saveRecord,  // Descomentar al activar validación
    };
});
