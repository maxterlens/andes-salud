/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Orquesta la bandeja de rechazos: lee los filtros del request, pide al
 *              repository las dos listas -pendientes y avisados- y le pasa los datos
 *              al formulario (ui/AS_FacturasDTERechazadasBandejaForm.js) para que la
 *              arme. El Client Script aplica los filtros al cambiarlos.
 *
 *              El POST marca las filas seleccionadas con fecha y usuario y vuelve
 *              al listado manteniendo los filtros.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/url', 'N/redirect', 'N/runtime', '../lib/AS_FacturasDTERechazadasConstants', '../repositories/AS_FacturasDTERechazadasRepository', '../ui/AS_FacturasDTERechazadasBandejaForm'],
    (url, redirect, runtime, CONSTANTES, repository, bandejaForm) => {

    function renderizarBandeja(context) {
        const filtros     = obtenerParametrosFiltro(context.request);
        const verAvisados = filtros.seguimiento === CONSTANTES.SEGUIMIENTO.AVISADO;

        const resultadoPendientes = repository.listarRechazados({ ...filtros, seguimiento: CONSTANTES.SEGUIMIENTO.PENDIENTE },
            verAvisados ? 0 : filtros.pagina);
        const resultadoAvisados = repository.listarRechazados({ ...filtros, seguimiento: CONSTANTES.SEGUIMIENTO.AVISADO },
            verAvisados ? filtros.pagina : 0);

        const form = bandejaForm.construirBandeja({
            filtros            : filtros,
            resultadoPendientes: resultadoPendientes,
            resultadoAvisados  : resultadoAvisados,
            suiteletUrl        : url.resolveScript({
                scriptId         : CONSTANTES.SUITELET.SCRIPT,
                deploymentId     : CONSTANTES.SUITELET.DEPLOYMENT,
                returnExternalUrl: false,
            }),
        });

        context.response.writePage(form);
    }

    function obtenerParametrosFiltro(request) {
        const parametros  = request.parameters;
        const seguimiento = parametros.custpage_seguimiento;
        const esValido    = seguimiento === CONSTANTES.SEGUIMIENTO.PENDIENTE
                         || seguimiento === CONSTANTES.SEGUIMIENTO.AVISADO;

        return {
            fechaDesde : parametros.custpage_fecha_desde || '',
            fechaHasta : parametros.custpage_fecha_hasta || '',
            folio      : parametros.custpage_folio || '',
            rutEmisor  : parametros.custpage_rut_emisor || '',
            subsidiaria: parametros.custpage_subsidiaria || '',
            codigoError: parametros.custpage_codigo_error || '',
            seguimiento: esValido ? seguimiento : '',
            pagina     : Number(parametros.custpage_pagina) || 0,
        };
    }

    function registrarAvisos(context) {
        const request     = context.request;
        const filtros     = obtenerParametrosFiltro(request);
        const totalLineas = request.getLineCount({ group: 'custpage_sl_rechazos' });
        const idEmpleado  = runtime.getCurrentUser().id;
        const observacion = request.parameters.custpage_nota_aviso || '';
        let totalAvisados = 0;

        for (let linea = 0; linea < totalLineas; linea++) {
            const seleccionado = request.getSublistValue({ group: 'custpage_sl_rechazos', name: 'custpage_col_seleccionar', line: linea });
            if (seleccionado !== 'T') {
                continue;
            }

            const id = request.getSublistValue({ group: 'custpage_sl_rechazos', name: 'custpage_col_id', line: linea });
            if (repository.marcarProveedorAvisado(id, idEmpleado, observacion)) {
                totalAvisados++;
            }
        }

        log.audit({ title: CONSTANTES.LOGS.AVISOS, details: 'registros avisados: ' + totalAvisados });

        redirect.toSuitelet({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            parameters  : {
                custpage_fecha_desde : filtros.fechaDesde,
                custpage_fecha_hasta : filtros.fechaHasta,
                custpage_folio       : filtros.folio,
                custpage_rut_emisor  : filtros.rutEmisor,
                custpage_subsidiaria : filtros.subsidiaria,
                custpage_codigo_error: filtros.codigoError,
                custpage_seguimiento : filtros.seguimiento,
                custpage_pagina      : filtros.pagina,
            },
        });
    }

    return {
        renderizarBandeja: renderizarBandeja,
        registrarAvisos  : registrarAvisos,
    };
});
