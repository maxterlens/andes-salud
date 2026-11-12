/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Proceso de la pantalla Generar Nomina de Reembolso. Replica el
 *              Suitelet de Nomina de Pago de AS_NSP_026 con los Reembolsos al
 *              cliente (CustRfnd) en vez de los pagos a proveedor.
 *
 *              mostrarFormulario → la pantalla vacia (GET).
 *              buscarReembolsos  → al elegir la Cuenta Banco, lista los
 *                                  reembolsos pendientes de esa cuenta (POST).
 *              generarNomina     → crea la nomina con los reembolsos marcados
 *                                  y abre el record (POST, boton Generar).
 *
 *              Al generar se vuelve a buscar: un reembolso que entro en otra
 *              nomina mientras la pantalla estaba abierta se descarta, y el
 *              monto que se guarda es el de esa busqueda, no el del formulario.
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] Mostrar, buscar reembolsos y generar la nomina.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/redirect', '../form/AS_NominaReembolsoForm', '../data/search/AS_NominaReembolsoSearch',
        '../data/record/AS_NominaReembolsoRecord', '../data/record/AS_NominaReembolsoDetalleRecord',
        '../constants/AS_NominaReembolsoConstants'],
    (redirect, nominaReembolsoForm, nominaReembolsoSearch, nominaReembolsoRecord, nominaReembolsoDetalleRecord, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        responderConFormulario(context, {}, null, []);
    }

    function buscarReembolsos(context) {
        const parametros = obtenerParametros(context.request);
        const reembolsos = nominaReembolsoSearch.buscarReembolsosPendientes(parametros.cabecera.subsidiaria, parametros.cabecera.cuentaBanco);
        responderConFormulario(context, parametros.cabecera, reembolsos, []);
    }

    function generarNomina(context) {
        const parametros = obtenerParametros(context.request);
        const cabecera   = parametros.cabecera;
        const pendientes = nominaReembolsoSearch.buscarReembolsosPendientes(cabecera.subsidiaria, cabecera.cuentaBanco);
        if (!parametros.marcados.length) {
            responderConFormulario(context, cabecera, pendientes, parametros.marcados, 'Debe marcar al menos un reembolso.');
            return;
        }
        const reembolsos = pendientes.filter((reembolso) => parametros.marcados.indexOf(reembolso.id) >= 0);
        if (!reembolsos.length) {
            responderConFormulario(context, cabecera, pendientes, [], 'Los reembolsos marcados ya no estan pendientes: entraron en otra nomina mientras la pantalla estaba abierta.');
            return;
        }
        const total    = sumarMontos(reembolsos);
        const nominaId = nominaReembolsoRecord.crearNomina(cabecera, total);
        nominaReembolsoDetalleRecord.crearDetalles(nominaId, reembolsos);

        log.audit({
            title  : 'NOMINA REEMBOLSO GENERADA',
            details: 'nomina: ' + nominaId + ' | reembolsos: ' + reembolsos.length
                   + ' | descartados: ' + (parametros.marcados.length - reembolsos.length) + ' | total: ' + total,
        });

        redirect.toRecord({ type: CONSTANTES.NOMINA.TIPO, id: nominaId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los tres procesos terminan aqui: el select Cuenta Banco necesita la lista
     * de cuentas cada vez que se dibuja la pantalla. reembolsos en null es que
     * todavia no se busco (la pantalla recien abierta). El total es el de lo
     * que ya venia marcado, al volver con un error.
     */
    function responderConFormulario(context, cabecera, reembolsos, marcados, alerta) {
        const cuentas = nominaReembolsoSearch.buscarCuentasBanco();
        const total   = sumarMontos((reembolsos || []).filter((reembolso) => marcados.indexOf(reembolso.id) >= 0));
        context.response.writePage(nominaReembolsoForm.construirFormulario(cabecera, cuentas, reembolsos, marcados, total, alerta));
    }

    function obtenerParametros(request) {
        const campos   = CONSTANTES.CAMPOS;
        const sublista = CONSTANTES.SUBLISTA;
        const valores  = request.parameters;
        const marcados = [];

        for (let linea = 0; linea < request.getLineCount({ group: sublista.ID }); linea++) {
            if (request.getSublistValue({ group: sublista.ID, name: sublista.COLUMNAS.INCLUIR, line: linea }) !== 'T') continue;
            marcados.push(request.getSublistValue({ group: sublista.ID, name: sublista.COLUMNAS.ID, line: linea }));
        }

        return {
            cabecera: {
                subsidiaria: valores[campos.SUBSIDIARIA],
                banco      : valores[campos.BANCO],
                cuentaBanco: valores[campos.CUENTA_BANCO],
                fecha      : valores[campos.FECHA],
                descripcion: valores[campos.DESCRIPCION],
            },
            marcados: marcados,
        };
    }

    function sumarMontos(reembolsos) {
        let total = 0;
        reembolsos.forEach((reembolso) => { total += reembolso.monto; });
        return total;
    }

    return {
        mostrarFormulario: mostrarFormulario,
        buscarReembolsos : buscarReembolsos,
        generarNomina    : generarNomina,
    };
});
