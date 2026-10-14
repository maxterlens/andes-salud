/**
 * @NApiVersion 2.1
 * Handler: Impresión de Cheques.
 *
 * Responsabilidad: leer el request, delegar en el service y responder:
 *   GET  → formulario de filtros y resultados.
 *   POST → registro de la impresión (JSON) solicitado por el Client Script.
 */
define([
    '../forms/ImpresionChequesForm',
    '../../services/ImpresionChequesService'
], (ImpresionChequesForm, ImpresionChequesService) => {

    /** GET: muestra filtros y resultados. */
    const _handleGet = (context) => {
        const filtros = ImpresionChequesService.normalizarFiltros(context.request.parameters);
        const datos   = ImpresionChequesService.obtenerDatosFormulario(filtros);

        const form = ImpresionChequesForm.construir({ filtros, ...datos });
        context.response.writePage(form);
    };

    /**
     * POST (JSON, desde el Client Script): registra la impresión de los pagos seleccionados.
     * Body: { accion: 'registrarImpresion', pagos: [{ id, numCheque }] }
     */
    const _handlePost = (context) => {
        const { request, response } = context;
        response.setHeader({ name: 'Content-Type', value: 'application/json' });

        let respuesta;
        try {
            const body = JSON.parse(request.body || '{}');
            respuesta = body.accion === 'registrarImpresion'
                ? ImpresionChequesService.registrarImpresion(body)
                : { ok: false, mensaje: `Acción no soportada: ${body.accion}`, resultados: [] };
        } catch (e) {
            log.error('ImpresionChequesHandler | _handlePost', e);
            respuesta = { ok: false, mensaje: `Error al registrar la impresión: ${e.message || e}`, resultados: [] };
        }
        response.write(JSON.stringify(respuesta));
    };

    const handleRequest = (context) => {
        if (context.request.method === 'GET') {
            _handleGet(context);
        } else if (context.request.method === 'POST') {
            _handlePost(context);
        } else {
            context.response.write('Método no soportado.');
        }
    };

    return { handleRequest };
});
