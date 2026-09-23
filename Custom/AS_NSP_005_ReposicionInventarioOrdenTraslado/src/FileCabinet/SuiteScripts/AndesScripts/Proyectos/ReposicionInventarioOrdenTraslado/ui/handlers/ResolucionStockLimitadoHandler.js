/**
 * AS_NSP_005 — Reposición de Inventario por Orden de Traslado (módulo M2)
 * @description Lógica del Suitelet de Resolución de Stock Limitado.
 *
 *              No existe ningún custom record de "conflictos pendientes": cada vez que
 *              se abre la pantalla de Resolución, este handler vuelve a calcular en vivo
 *              los conflictos activos usando exactamente la misma lógica de negocio que
 *              usa el Map/Reduce automático (ReposicionService.evaluarReposicionPorOrigen),
 *              evitando así una segunda fuente de verdad que podría quedar desactualizada.
 *
 *              Flujo:
 *                GET  view=landing (default) → pantalla inicial, botón "Buscar"
 *                POST accion=buscar          → redirige a GET view=resolucion (PRG)
 *                GET  view=resolucion        → calcula conflictos en vivo y arma la grilla
 *                POST accion=confirmar       → valida contra stock fresco, crea las OT
 *                                               correspondientes y redirige a resultados
 *                GET  view=resultados        → lee del log (por ID) lo que se acaba de crear
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([
    '../../repositories/ASConfigReposicionAutomaticaInventarioRepository',
    '../../repositories/ASLogReposicionAutomaticaInventarioRepository',
    '../../services/ReposicionService',
    '../../services/TransferOrderService',
    '../forms/ResolucionStockLimitadoForm',
    'N/search',
    'N/redirect',
    'N/log'
], (ConfigRepository, LogRepository, ReposicionService, TransferOrderService, Form, search, redirect, log) => {

    const SCRIPT_ID     = 'customscript_as_res_stock_limit_sl';
    const DEPLOYMENT_ID = 'customdeploy_as_res_stock_limit_sl';

    const VIEWS = {
        LANDING   : 'landing',
        RESOLUCION: 'resolucion',
        RESULTADOS: 'resultados'
    };

    // Deben coincidir con Form.ACCIONES
    const ACCIONES = {
        BUSCAR   : 'buscar',
        CONFIRMAR: 'confirmar'
    };

    const CANT_PREFIX = 'custpage_cant__';

    /* ═══════════════════════════════════════════════════════════════════
     * GET
     * ═══════════════════════════════════════════════════════════════════ */
    const handleGet = (context) => {
        const view = context.request.parameters.view || VIEWS.LANDING;

        switch (view) {
            case VIEWS.RESOLUCION:
                return _renderResolucion(context);
            case VIEWS.RESULTADOS:
                return _renderResultados(context);
            case VIEWS.LANDING:
            default:
                return _renderLanding(context);
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
     * POST
     * ═══════════════════════════════════════════════════════════════════ */
    const handlePost = (context) => {
        const params = context.request.parameters;
        const accion = params[Form.FIELDS.ACCION];

        switch (accion) {
            case ACCIONES.BUSCAR:
                return _procesarBusqueda(context, params);
            case ACCIONES.CONFIRMAR:
                return _procesarConfirmacion(context, params);
            default:
                return redirect.toSuitelet({
                    scriptId: SCRIPT_ID, deploymentId: DEPLOYMENT_ID,
                    parameters: { view: VIEWS.LANDING }
                });
        }
    };

    /**
     * Valida que se haya seleccionado una Subsidiaria (obligatoria) y, de ser así,
     * redirige a la vista de Resolución llevando ese filtro como parámetro.
     * La validación server-side es una segunda barrera además de isMandatory en
     * el campo nativo del formulario.
     */
    const _procesarBusqueda = (context, params) => {
        const subsidiaryId = params[Form.FIELDS.SUBSIDIARIA];

        if (!subsidiaryId) {
            return _renderLanding(context, {
                mensaje: 'Debés seleccionar una Subsidiaria antes de buscar.',
                esError: true
            });
        }

        return redirect.toSuitelet({
            scriptId: SCRIPT_ID, deploymentId: DEPLOYMENT_ID,
            parameters: { view: VIEWS.RESOLUCION, subsidiaryId }
        });
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Vista: Landing
     * ═══════════════════════════════════════════════════════════════════ */
    const _renderLanding = (context, { mensaje, esError } = {}) => {
        const form = Form.buildLandingForm({ mensaje, esError });
        context.response.writePage(form);
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Vista: Resolución (cálculo en vivo, filtrado por subsidiaria)
     * ═══════════════════════════════════════════════════════════════════ */
    const _renderResolucion = (context) => {
        const subsidiaryId = context.request.parameters.subsidiaryId;

        if (!subsidiaryId) {
            return _renderLanding(context, {
                mensaje: 'Debés seleccionar una Subsidiaria antes de buscar.',
                esError: true
            });
        }

        const origenes = _evaluarConflictosActivos(subsidiaryId);

        if (!origenes.length) {
            return _renderLanding(context, {
                mensaje: 'No se encontraron artículos con stock limitado en este momento para la subsidiaria ' +
                    'seleccionada. El stock disponible en origen alcanza para cubrir la reposición automática ' +
                    'de todos los destinos configurados.'
            });
        }

        const subsidiaryName = _resolverNombreSubsidiaria(subsidiaryId);

        const form = Form.buildResolucionForm({ origenes, subsidiaryName });
        context.response.writePage(form);
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Vista: Resultados
     * ═══════════════════════════════════════════════════════════════════ */
    const _renderResultados = (context) => {
        const logIdsRaw = context.request.parameters.logIds || '';
        const logIds    = logIdsRaw.split(',').filter(Boolean);
        const resultados = LogRepository.getByIds(logIds);

        const form = Form.buildResultadosForm({ resultados });
        context.response.writePage(form);
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Cálculo en vivo de conflictos activos (fuente única de verdad,
     * compartida con AS_ReposicionAutomaticaInventario_MPRD_2.1.js)
     *
     * @param {string|number} [subsidiaryId]  Si se indica, filtra las configs a solo
     *                                          esa subsidiaria (usado por la pantalla
     *                                          de Resolución, filtrada desde el landing).
     *                                          Si se omite, evalúa todas las subsidiarias
     *                                          (usado en la revalidación de _procesarConfirmacion,
     *                                          donde cada línea ya trae su propia subsidiaria).
     * ═══════════════════════════════════════════════════════════════════ */
    const _evaluarConflictosActivos = (subsidiaryId) => {
        let configs = ConfigRepository.getActiveConfigs();

        if (subsidiaryId) {
            configs = configs.filter(cfg => String(cfg.subsidiaryId) === String(subsidiaryId));
        }

        // Agrupar destinos por origen (misma clave que usa el reduce del MapReduce)
        const gruposPorOrigen = {};
        configs.forEach(cfg => {
            const key = `${cfg.subsidiaryId}:${cfg.locationFrom}`;
            if (!gruposPorOrigen[key]) {
                gruposPorOrigen[key] = {
                    subsidiaryId: cfg.subsidiaryId,
                    locationFrom: cfg.locationFrom,
                    destinos: []
                };
            }
            gruposPorOrigen[key].destinos.push({ locationTo: cfg.locationTo, orden: cfg.orden });
        });

        const origenesConConflicto = [];

        Object.keys(gruposPorOrigen).forEach(key => {
            const grupo = gruposPorOrigen[key];

            const destinosConItems = grupo.destinos
                .map(d => ({
                    locationTo: d.locationTo,
                    orden     : d.orden,
                    items     : ReposicionService.getItemsToReplenish(d.locationTo)
                }))
                .filter(d => d.items.length);

            if (!destinosConItems.length) return;

            const { conflictos } = ReposicionService.evaluarReposicionPorOrigen({
                locationFrom: grupo.locationFrom,
                destinos    : destinosConItems
            });

            if (conflictos.length) {
                origenesConConflicto.push({
                    subsidiaryId: grupo.subsidiaryId,
                    locationFrom: grupo.locationFrom,
                    conflictos
                });
            }
        });

        if (origenesConConflicto.length) {
            _resolverNombresUbicacion(origenesConConflicto);
        }

        log.error('ResolucionStockLimitadoHandler._evaluarConflictosActivos',
            `Orígenes con conflicto: ${origenesConConflicto.length}`
        );

        return origenesConConflicto;
    };

    /**
     * Agrega el nombre legible de cada ubicación (origen y destinos) a la estructura
     * de conflictos, para mostrarlo en la grilla en vez del Internal ID.
     */
    const _resolverNombresUbicacion = (origenes) => {
        const idsSet = new Set();
        origenes.forEach(o => {
            idsSet.add(String(o.locationFrom));
            o.conflictos.forEach(c => c.destinos.forEach(d => idsSet.add(String(d.locationTo))));
        });

        const nombres = {};
        Array.from(idsSet).forEach(id => {
            try {
                const fields = search.lookupFields({ type: 'location', id, columns: ['name'] });
                nombres[id] = fields.name || `Ubicación ${id}`;
            } catch (e) {
                nombres[id] = `Ubicación ${id}`;
            }
        });

        origenes.forEach(o => {
            o.locationFromName = nombres[String(o.locationFrom)];
            o.conflictos.forEach(c => c.destinos.forEach(d => {
                d.locationToName = nombres[String(d.locationTo)];
            }));
        });
    };

    /**
     * Resuelve el nombre legible de una subsidiaria, para mostrarlo en el
     * banner de contexto de la pantalla de Resolución.
     *
     * @param   {string|number} subsidiaryId
     * @returns {string}
     */
    const _resolverNombreSubsidiaria = (subsidiaryId) => {
        try {
            const fields = search.lookupFields({ type: 'subsidiary', id: subsidiaryId, columns: ['name'] });
            return fields.name || `Subsidiaria ${subsidiaryId}`;
        } catch (e) {
            return `Subsidiaria ${subsidiaryId}`;
        }
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Confirmación: crea las OT según lo que decidió la persona en la grilla
     * ═══════════════════════════════════════════════════════════════════ */
    const _procesarConfirmacion = (context, params) => {
        const lineas = _parseLineasFromParams(params);

        if (!lineas.length) {
            return redirect.toSuitelet({
                scriptId: SCRIPT_ID, deploymentId: DEPLOYMENT_ID,
                parameters: { view: VIEWS.LANDING }
            });
        }

        // Se vuelve a calcular todo en vivo para validar contra el stock ACTUAL — evita
        // procesar una resolución basada en datos que ya cambiaron entre que se abrió el
        // Suitelet y el momento en que la persona confirma.
        const origenesFrescos = _evaluarConflictosActivos();

        const logIds = [];

        const lineasPorOrigen = {};
        lineas.forEach(l => {
            const key = `${l.subsidiaryId}:${l.locationFrom}`;
            if (!lineasPorOrigen[key]) lineasPorOrigen[key] = [];
            lineasPorOrigen[key].push(l);
        });

        Object.keys(lineasPorOrigen).forEach(key => {
            const [subsidiaryId, locationFrom] = key.split(':');
            const lineasOrigen = lineasPorOrigen[key];

            const grupoFresco = origenesFrescos.find(o =>
                String(o.subsidiaryId) === subsidiaryId && String(o.locationFrom) === locationFrom
            );

            const itemsPorDestino = {};

            lineasOrigen.forEach(l => {
                if (l.cantidad <= 0) return;

                const conflictoFresco = grupoFresco &&
                    grupoFresco.conflictos.find(c => String(c.itemInternalId) === l.itemInternalId);

                if (!conflictoFresco) {
                    // El conflicto ya no existe con los mismos términos (se resolvió automáticamente
                    // entretanto, o el stock cambió) — se omite esta línea y se deja constancia en logs.
                    log.error('ResolucionStockLimitadoHandler._procesarConfirmacion',
                        `[${key}] Ítem ${l.itemInternalId}: el conflicto ya no está vigente. Línea omitida.`
                    );
                    return;
                }

                const destinoFresco = conflictoFresco.destinos.find(d => String(d.locationTo) === l.locationTo);
                if (!destinoFresco) {
                    log.error('ResolucionStockLimitadoHandler._procesarConfirmacion',
                        `[${key}] Ítem ${l.itemInternalId}: destino ${l.locationTo} ya no compite por este ítem. Línea omitida.`
                    );
                    return;
                }

                // Salvaguarda final: no permitir que la cantidad ingresada supere lo disponible fresco.
                const cantidadFinal = Math.min(l.cantidad, conflictoFresco.disponibleOrigen);

                if (!itemsPorDestino[l.locationTo]) itemsPorDestino[l.locationTo] = [];
                itemsPorDestino[l.locationTo].push({
                    ...destinoFresco.item,
                    qtyNecesaria: destinoFresco.necesidad,
                    qtyToOrder  : cantidadFinal,
                    esParcial   : cantidadFinal < destinoFresco.necesidad,
                    stockOrigen : conflictoFresco.stockOrigen,
                    minimoOrigen: conflictoFresco.minimoOrigen
                });
            });

            Object.keys(itemsPorDestino).forEach(locationTo => {
                const resultado = TransferOrderService.processReplenishment({
                    subsidiaryId,
                    locationFrom,
                    locationTo,
                    items: itemsPorDestino[locationTo]
                });
                if (resultado.logId) logIds.push(resultado.logId);
            });
        });

        return redirect.toSuitelet({
            scriptId: SCRIPT_ID,
            deploymentId: DEPLOYMENT_ID,
            parameters: { view: VIEWS.RESULTADOS, logIds: logIds.join(',') }
        });
    };

    /**
     * Parsea los parámetros dinámicos de la grilla INLINEHTML según la convención:
     *   custpage_cant__<subsidiaryId>__<locationFrom>__<itemInternalId>__<locationTo>
     *
     * @param   {Object} params  context.request.parameters del POST
     * @returns {Array<{subsidiaryId, locationFrom, itemInternalId, locationTo, cantidad}>}
     */
    const _parseLineasFromParams = (params) => {
        const lineas = [];

        Object.keys(params).forEach(key => {
            if (key.indexOf(CANT_PREFIX) !== 0) return;

            const resto  = key.substring(CANT_PREFIX.length);
            const partes = resto.split('__');
            if (partes.length !== 4) return;

            const [subsidiaryId, locationFrom, itemInternalId, locationTo] = partes;
            const cantidad = parseFloat(params[key]) || 0;

            lineas.push({ subsidiaryId, locationFrom, itemInternalId, locationTo, cantidad });
        });

        return lineas;
    };

    return { handleGet, handlePost };
});
