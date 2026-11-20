/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Proceso de la pantalla Generar Nomina de Reembolso. Replica el
 *              Suitelet de Nomina de Pago de AS_NSP_026 con los Reembolsos al
 *              cliente (CustRfnd) en vez de los pagos a proveedor, y desde
 *              v1.2.0 tambien las devoluciones por asiento (lineas a credito
 *              de la 2120021): las dos se pagan en la misma nomina.
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
 *              Tope de reembolsos por nomina (NOMINA.MAXIMO_REEMBOLSOS): cada
 *              linea de detalle es un save propio (6 unidades) y el Suitelet
 *              tiene 1.000; sin el tope corta a mitad y deja la nomina con
 *              total y sin parte del detalle. El detalle no va como sublista
 *              hija de la nomina: con isparent T desde el primer deploy la
 *              sublista no existe y NetSuite descarta las lineas sin error
 *              (QA, 2026-11-12, nominas 4 y 5).
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 */
define(['N/redirect', '../form/AS_NominaReembolsoForm', '../data/search/AS_NominaReembolsoSearch',
        '../data/query/AS_NominaReembolsoQuery', '../data/record/AS_NominaReembolsoRecord',
        '../data/record/AS_NominaReembolsoDetalleRecord', '../constants/AS_NominaReembolsoConstants'],
    (redirect, nominaReembolsoForm, nominaReembolsoSearch, nominaReembolsoQuery, nominaReembolsoRecord, nominaReembolsoDetalleRecord, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        responderConFormulario(context, {}, null, []);
    }

    function buscarReembolsos(context) {
        const parametros = obtenerParametros(context.request);
        const reembolsos = buscarPendientes(parametros.cabecera);
        responderConFormulario(context, parametros.cabecera, reembolsos, []);
    }

    function generarNomina(context) {
        const parametros = obtenerParametros(context.request);
        const cabecera   = parametros.cabecera;
        const pendientes = buscarPendientes(cabecera);
        if (!parametros.marcados.length) {
            responderConFormulario(context, cabecera, pendientes, parametros.marcados, 'Debe marcar al menos un reembolso.');
            return;
        }
        const reembolsos = pendientes.filter((reembolso) => parametros.marcados.indexOf(reembolso.clave) >= 0);
        if (!reembolsos.length) {
            responderConFormulario(context, cabecera, pendientes, [], 'Los reembolsos marcados ya no estan pendientes: entraron en otra nomina mientras la pantalla estaba abierta.');
            return;
        }
        if (reembolsos.length > CONSTANTES.NOMINA.MAXIMO_REEMBOLSOS) {
            responderConFormulario(context, cabecera, pendientes, parametros.marcados, 'Una nomina admite hasta ' + CONSTANTES.NOMINA.MAXIMO_REEMBOLSOS
                + ' reembolsos y se marcaron ' + reembolsos.length + '. Genere esta con menos y otra con el resto.');
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

    function buscarPendientes(cabecera) {
        const inicio       = Date.now();
        const reembolsos   = nominaReembolsoSearch.buscarReembolsosPendientes(cabecera.subsidiaria, cabecera.cuentaBanco, cabecera.desde);
        const medio        = Date.now();
        const devoluciones = nominaReembolsoQuery.buscarDevolucionesPendientes(cabecera.subsidiaria, cabecera.desde);
        log.audit({ title: 'NOMINA REEMBOLSO TIEMPOS TEMPORAL', details: 'reembolsos: ' + (medio - inicio) + ' ms | devoluciones: ' + (Date.now() - medio) + ' ms' });
        return reembolsos.concat(devoluciones);
    }

    function responderConFormulario(context, cabecera, reembolsos, marcados, alerta) {
        const bancos  = nominaReembolsoSearch.buscarBancosConPlantilla();
        const cuentas = nominaReembolsoSearch.buscarCuentasBanco();
        const total   = sumarMontos((reembolsos || []).filter((reembolso) => marcados.indexOf(reembolso.clave) >= 0));
        context.response.writePage(nominaReembolsoForm.construirFormulario(cabecera, bancos, cuentas, reembolsos, marcados, total, alerta));
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
                desde      : valores[campos.DESDE],
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
