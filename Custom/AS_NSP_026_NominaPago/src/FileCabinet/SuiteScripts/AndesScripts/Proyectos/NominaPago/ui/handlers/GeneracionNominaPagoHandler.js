/**
 * AS_NSP_026 — Nomina de Pago (generacion con seleccion manual de transacciones)
 * @description Maneja GET/POST del Suitelet de Generacion de Nomina de Pago. Orquesta
 *              repository/service y delega el armado de UI a ../forms/GeneracionNominaPagoForm.
 *
 *              handleGet tiene dos ramas:
 *                1. Endpoint AJAX (custpage_ajax=cuentasbancarias): responde solo JSON
 *                   con las cuentas bancarias filtradas por Subsidiaria+Banco. Lo
 *                   consume el Client Script via fetch() para poblar Cuenta Banco sin
 *                   recargar la pagina — ver AS_GeneracionNominaPago_CS_2.1.js.
 *                2. Render normal del formulario completo.
 *
 *              Validaciones en handlePost:
 *                1. Banco y Cuenta Banco no vacios (defensivo).
 *                2. Fecha obligatoria.
 *                3. Al menos una transaccion marcada.
 *                4. Revalidacion: se vuelve a correr el mismo filtro que usaba
 *                   2win_ue_nomina_banco.js (TransaccionesPendientesRepository) justo
 *                   antes de crear los detalles, y se descarta cualquier transaccion
 *                   marcada que ya no califique (aprobada/rechazada o ya vinculada a
 *                   otra nomina mientras la pantalla estaba abierta). El monto que se
 *                   graba es el de esta busqueda fresca, no el que viajo en el POST.
 *                5. Si ninguna transaccion sigue siendo valida, no se crea nada.
 *
 *              Al crear la nomina, redirige al record customrecord_2w_nominas_pago
 *              recien creado (Post/Redirect/Get — evita reenvios duplicados).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    '../forms/GeneracionNominaPagoForm',
    '../../repositories/TransaccionesPendientesRepository',
    '../../repositories/CuentaBancariaRepository',
    '../../services/NominaPagoService',
    'N/redirect',
    'N/log'
], (Form, TransaccionesPendientesRepository, CuentaBancariaRepository, NominaPagoService, redirect, log) => {

    const SUBLIST_GROUP = 'trxlist';

    /**
     * @param {Object} context - Suitelet onRequest context
     */
    function handleGet(context) {
        const p = context.request.parameters;

        // Endpoint liviano consumido via fetch() desde el Client Script para poblar
        // Cuenta Banco sin recargar la pagina.
        if (p.custpage_ajax === 'cuentasbancarias') {
            const cuentas = CuentaBancariaRepository.buscarCuentasBancarias({
                subsidiaria: p.custpage_subsidiaria,
                banco: p.custpage_banco
            });
            context.response.write(JSON.stringify(cuentas));
            return;
        }

        const subsidiaria = p.custpage_subsidiaria;
        const banco = p.custpage_banco;
        const cuentaBanco = p.custpage_cuentabanco;

        const params = { subsidiaria, banco, cuentaBanco };

        if (subsidiaria && banco) {
            params.cuentasBancarias = CuentaBancariaRepository.buscarCuentasBancarias({ subsidiaria, banco });
        }

        if (banco && cuentaBanco) {
            params.transacciones = TransaccionesPendientesRepository.buscarTransaccionesCandidatas({
                subsidiaria: subsidiaria,
                cuenta: cuentaBanco
            });
        }

        context.response.writePage(Form.buildForm(params));
    }

    /**
     * @param {Object} context - Suitelet onRequest context
     */
    function handlePost(context) {
        const req = context.request;
        const subsidiaria = req.parameters.custpage_subsidiaria;
        const banco = req.parameters.custpage_banco;
        const cuentaBanco = req.parameters.custpage_cuentabanco;
        const fecha = req.parameters.custpage_fecha;
        const descripcion = req.parameters.custpage_descripcion;

        // La busqueda fresca se usa tanto para re-renderizar el form ante un error
        // como para la revalidacion final — se corre una sola vez.
        const transaccionesFrescas = (banco && cuentaBanco)
            ? TransaccionesPendientesRepository.buscarTransaccionesCandidatas({ subsidiaria, cuenta: cuentaBanco })
            : [];

        // Idem para el listado de Cuenta Banco: necesario para que, si hay que
        // re-renderizar por un error, el form no vuelva a aparecer con Cuenta Banco vacio.
        const cuentasBancarias = (subsidiaria && banco)
            ? CuentaBancariaRepository.buscarCuentasBancarias({ subsidiaria, banco })
            : [];

        const baseParams = {
            subsidiaria, banco, cuentaBanco, fecha, descripcion,
            transacciones: transaccionesFrescas,
            cuentasBancarias
        };

        if (!banco || !cuentaBanco) {
            renderError(context, baseParams, 'Debe seleccionar Banco y Cuenta Banco.');
            return;
        }

        if (!fecha) {
            renderError(context, baseParams, 'La Fecha es obligatoria.');
            return;
        }

        const lineCount = req.getLineCount({ group: SUBLIST_GROUP });
        const seleccionadas = [];
        for (let i = 0; i < lineCount; i++) {
            const incluir = req.getSublistValue({ group: SUBLIST_GROUP, name: 'custpage_incluir', line: i });
            if (incluir === 'T') {
                seleccionadas.push(req.getSublistValue({ group: SUBLIST_GROUP, name: 'custpage_trx_id', line: i }));
            }
        }
        baseParams.seleccionadas = seleccionadas;

        if (seleccionadas.length === 0) {
            renderError(context, baseParams, 'Debe marcar al menos una transaccion para generar la nomina de pago.');
            return;
        }

        // Revalidacion contra la busqueda fresca (misma logica que crearDetalleNomina
        // del User Event) — se descarta lo que ya no califica y se usa el monto real.
        const candidatasPorId = {};
        transaccionesFrescas.forEach((t) => { candidatasPorId[String(t.id)] = t; });

        const transaccionesValidas = [];
        const descartadas = [];
        seleccionadas.forEach((id) => {
            const candidata = candidatasPorId[id];
            if (candidata) {
                transaccionesValidas.push({ id: id, monto: candidata.monto });
            } else {
                descartadas.push(id);
            }
        });

        if (descartadas.length > 0) {
            log.audit({
                title: 'AS_GeneracionNominaPago — transacciones descartadas en revalidacion',
                details: descartadas.join(', ')
            });
        }

        if (transaccionesValidas.length === 0) {
            renderError(
                context,
                baseParams,
                'Las transacciones seleccionadas ya no estan disponibles (fueron aprobadas, rechazadas, ' +
                'o incluidas en otra nomina mientras la pantalla estaba abierta). Volve a marcar.'
            );
            return;
        }

        const resultado = NominaPagoService.crearNominaConDetalle({
            cabecera: {
                empresa: subsidiaria,
                banco: banco,
                cuentaBanco: cuentaBanco,
                fecha: fecha,
                descripcion: descripcion
            },
            transaccionesSeleccionadas: transaccionesValidas
        });

        redirect.toRecord({ type: 'customrecord_2w_nominas_pago', id: resultado.nominaId });
    }

    function renderError(context, params, mensaje) {
        params.error = mensaje;
        context.response.writePage(Form.buildForm(params));
    }

    return { handleGet, handlePost };
});
