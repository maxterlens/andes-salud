/**
 * @NApiVersion 2.1
 * Repository: acceso a datos de Solicitud de Consumo.
 *
 * Responsabilidad única: ejecutar búsquedas en NetSuite y retornar
 * datos crudos mapeados a objetos planos. NO contiene lógica de negocio.
 *
 * Registros cubiertos:
 *   - transferorder  → getSolicitudConsumoData
 *   - itemreceipt    → getRecepcionInsumosData
 */
define(['N/search', 'N/query', '../lib/classes/Lib.Class.Row'],
    (search, query, Row) => {

    // ─── Helpers internos ────────────────────────────────────────────────────────

    /**
     * Mapea cada resultado de búsqueda a un objeto Row.
     * @param {search.Result} row
     * @param {number} index
     * @returns {Row}
     */
    const _mapRow = (row, index) => {
        const currentRow = new Row(index);
        row.columns.forEach(col => {
            currentRow.setValues(col.label, row.getValue(col), row.getText(col) || '');
        });
        return currentRow;
    };

    /**
     * Parsea el número de inventario (lote) con el formato: LOTE#POTENCIA#ANÁLISIS#PESO
     * @param {string} inventoryNumber
     * @returns {{ lote: string, potencia: string, numeroAnalisis: string, peso: string }}
     */
    const _parseInventoryNumber = (inventoryNumber) => {
        const parts = (inventoryNumber || '').split('#');
        return {
            lote:          parts[0] || '',
            potencia:      parts[1] || '',
            numeroAnalisis: parts[2] || '',
            peso:          parts[3] || ''
        };
    };

    // ─── Unidades de medida (cache de SuiteQL) ───────────────────────────────────

    /**
     * Carga todas las unidades de medida activas desde SuiteQL.
     * Retorna dos mapas:
     *   - unitsMap:    { internalid → { abbreviation, conversionrate, baseunit } }
     *   - baseUnitMap: { unittypeid → internalid de la unidad base }
     */
    const getUnitsMap = () => {
        const unitsMap    = {};
        const baseUnitMap = {};

        try {
            const sql = `
                SELECT ut.id        AS unittypeid,
                       utu.internalid,
                       utu.abbreviation,
                       utu.pluralabbreviation,
                       utu.baseunit,
                       utu.conversionrate
                FROM   unitsType ut
                INNER JOIN unitsTypeUom utu ON ut.id = utu.unitstype
                WHERE  ut.isinactive = 'F'
            `;
            const rows = query.runSuiteQL({ query: sql }).asMappedResults();

            rows.forEach(r => {
                unitsMap[r.internalid] = {
                    abbreviation:       r.abbreviation,
                    pluralabbreviation: r.pluralabbreviation,
                    conversionrate:     Number(r.conversionrate),
                    baseunit:           r.baseunit
                };
                if (r.baseunit === 'T') {
                    baseUnitMap[r.unittypeid] = r.internalid;
                }
            });
        } catch (e) {
            log.error('ASSolicitudConsumoRepository | getUnitsMap', e);
        }

        return { unitsMap, baseUnitMap };
    };

    // ─── Repositorio de Transfer Order (Solicitud de Consumo) ───────────────────

    /**
     * Obtiene los datos de una Solicitud de Consumo (Transfer Order).
     * Retorna { header, items } con datos crudos mapeados.
     *
     * @param {string[]} ids - Array de internalIds de Transfer Orders
     * @returns {{ header: Object, items: Object[] }}
     */
    const getSolicitudConsumoData = (ids) => {
        const result = { header: {}, items: [] };

        try {
            const rows = search.create({
                type: 'transferorder',
                filters: [
                    ['type',           'anyof',   'TrnfrOrd'],
                    'AND',
                    ['voided',         'is',      'F'],
                    'AND',
                    ['internalid',     'anyof',   ids],
                    'AND',
                    ['mainline',       'is',      'F'],
                    'AND',
                    ['inventorydetail.internalid', 'noneof', '@NONE@']
                ],
                columns: [
                    search.createColumn({ name: 'line',         label: 'line',       sort: search.Sort.ASC }),
                    search.createColumn({ name: 'internalid',   label: 'idInterno' }),
                    search.createColumn({ name: 'tranid',       label: 'numeroDocumento' }),
                    search.createColumn({ name: 'trandate',     label: 'fecha' }),
                    search.createColumn({ name: 'subsidiary',   label: 'idSubsidiaria' }),
                    search.createColumn({ name: 'legalname',    join: 'subsidiary', label: 'subsidiaria' }),
                    search.createColumn({ name: 'location',     label: 'almacenOrigen' }),
                    search.createColumn({ name: 'transferlocation', label: 'almacenDestino' }),
                    search.createColumn({ name: 'department',   label: 'departamento' }),
                    search.createColumn({ name: 'memo',         label: 'observacion' }),
                    search.createColumn({ name: 'memomain',     label: 'nota' }),
                    search.createColumn({ name: 'createdby',    label: 'creadoPor' }),
                    search.createColumn({ name: 'approvalstatus', label: 'estadoAprobacion' }),
                    search.createColumn({ name: 'custbody_as_solicitante',   label: 'solicitante' }),
                    search.createColumn({ name: 'custbody_as_autorizadopor', label: 'autorizadoPor' }),
                    search.createColumn({ name: 'custbody_as_motivo',        label: 'motivo' }),
                    // Líneas
                    search.createColumn({ name: 'item',         label: 'codigoItem' }),
                    search.createColumn({ name: 'displayname',  join: 'item',            label: 'descripcion' }),
                    search.createColumn({ name: 'quantity',     join: 'inventoryDetail', label: 'cantidad' }),
                    search.createColumn({ name: 'inventorynumber', join: 'inventoryDetail', label: 'lote' }),
                    search.createColumn({ name: 'expirationdate',  join: 'inventoryDetail', label: 'fechaVencimiento' }),
                    search.createColumn({ name: 'unitabbreviation', label: 'unidad' }),
                    search.createColumn({ name: 'custcol_as_observacion_linea', label: 'observacionLinea' })
                ]
            }).run().getRange(0, 1000);

            rows.forEach((row, index) => {
                const r = _mapRow(row, index);

                if (index === 0) {
                    result.header = {
                        idInterno:        r.getValue('idInterno'),
                        numeroDocumento:  r.getValue('numeroDocumento'),
                        fecha:            r.getValue('fecha'),
                        idSubsidiaria:    r.getValue('idSubsidiaria'),
                        subsidiaria:      r.getValue('subsidiaria').toUpperCase(),
                        almacenOrigen:    r.getText('almacenOrigen'),
                        almacenDestino:   r.getText('almacenDestino'),
                        departamento:     r.getText('departamento'),
                        observacion:      r.getValue('observacion'),
                        nota:             r.getValue('nota'),
                        creadoPor:        r.getText('creadoPor'),
                        estadoAprobacion: r.getText('estadoAprobacion'),
                        solicitante:      r.getText('solicitante'),
                        autorizadoPor:    r.getText('autorizadoPor'),
                        motivo:           r.getValue('motivo')
                    };
                }

                const { lote, potencia, numeroAnalisis, peso } = _parseInventoryNumber(r.getText('lote'));
                result.items.push({
                    codigoItem:       r.getText('codigoItem'),
                    descripcion:      r.getValue('descripcion'),
                    cantidad:         r.getNumber('cantidad'),
                    unidad:           r.getValue('unidad'),
                    lote,
                    potencia,
                    numeroAnalisis,
                    peso,
                    fechaVencimiento: r.getValue('fechaVencimiento'),
                    observacionLinea: r.getValue('observacionLinea')
                });
            });

        } catch (e) {
            log.error('ASSolicitudConsumoRepository | getSolicitudConsumoData', e);
        }

        return result;
    };

    // ─── Repositorio de Item Receipt (Recepción de Insumos) ─────────────────────

    /**
     * Obtiene los datos de una Recepción de Insumos (Item Receipt).
     * Incluye conversión de unidad de venta a unidad base.
     *
     * @param {string[]} ids - Array de internalIds de Item Receipts
     * @returns {{ header: Object, items: Object[] }}
     */
    const getRecepcionInsumosData = (ids) => {
        const result = { header: {}, items: [] };

        try {
            const { unitsMap, baseUnitMap } = getUnitsMap();

            const rows = search.create({
                type: 'itemreceipt',
                filters: [
                    ['type',    'anyof',   'ItemRcpt'],
                    'AND',
                    ['internalid', 'anyof', ids],
                    'AND',
                    ['mainline', 'is',     'F'],
                    'AND',
                    ['inventorydetail.internalid', 'noneof', '@NONE@']
                ],
                columns: [
                    search.createColumn({ name: 'line',         label: 'line', sort: search.Sort.ASC }),
                    search.createColumn({ name: 'tranid',       label: 'numeroDocumento' }),
                    search.createColumn({ name: 'trandate',     label: 'fecha' }),
                    search.createColumn({ name: 'subsidiary',   label: 'idSubsidiaria' }),
                    search.createColumn({ name: 'legalname',    join: 'subsidiary', label: 'subsidiaria' }),
                    search.createColumn({ name: 'mainname',     label: 'proveedor' }),
                    search.createColumn({ name: 'createdfrom',  label: 'creadoDesde' }),
                    search.createColumn({ name: 'createdby',    label: 'creadoPor' }),
                    search.createColumn({ name: 'memomain',     label: 'nota' }),
                    search.createColumn({ name: 'custbody39',   label: 'dua' }),
                    search.createColumn({ name: 'location',     label: 'almacenDestino' }),
                    // Líneas
                    search.createColumn({ name: 'item',            label: 'codigoItem' }),
                    search.createColumn({ name: 'displayname',     join: 'item',            label: 'descripcion' }),
                    search.createColumn({ name: 'quantity',        join: 'inventoryDetail', label: 'cantidad' }),
                    search.createColumn({ name: 'saleunit',        join: 'item',            label: 'unidadVenta' }),
                    search.createColumn({ name: 'unitstype',       join: 'item',            label: 'tipoUnidad' }),
                    search.createColumn({ name: 'inventorynumber', join: 'inventoryDetail', label: 'lote' }),
                    search.createColumn({ name: 'expirationdate',  join: 'inventoryDetail', label: 'fechaVencimiento' }),
                    search.createColumn({ name: 'custcol8',        label: 'observacionLinea' })
                ]
            }).run().getRange(0, 1000);

            rows.forEach((row, index) => {
                const r = _mapRow(row, index);

                if (index === 0) {
                    result.header = {
                        numeroDocumento: r.getValue('numeroDocumento'),
                        fecha:           r.getValue('fecha'),
                        idSubsidiaria:   r.getValue('idSubsidiaria'),
                        subsidiaria:     r.getValue('subsidiaria').toUpperCase().replace('SA', 'S.A.'),
                        proveedor:       r.getText('proveedor'),
                        dua:             r.getValue('dua'),
                        creadoDesde:     r.getText('creadoDesde'),
                        creadoPor:       r.getText('creadoPor'),
                        nota:            r.getValue('nota'),
                        almacenDestino:  r.getText('almacenDestino')
                    };
                }

                // Conversión de unidades: si la unidad de venta difiere de la base, convierte
                let cantidad         = r.getNumber('cantidad');
                const unidadVentaId  = r.getValue('unidadVenta');
                const tipoUnidadId   = r.getValue('tipoUnidad');
                const unidadBaseId   = baseUnitMap[tipoUnidadId];
                const unidadAbr      = unitsMap[unidadVentaId]?.abbreviation || '';

                if (unidadVentaId && unidadVentaId !== unidadBaseId) {
                    const conversionRate = unitsMap[unidadVentaId]?.conversionrate || 1;
                    cantidad = _roundDecimal(cantidad / conversionRate, 2);
                }

                const { lote, potencia, numeroAnalisis, peso } = _parseInventoryNumber(r.getText('lote'));
                result.items.push({
                    codigoItem:       r.getText('codigoItem'),
                    descripcion:      r.getValue('descripcion'),
                    cantidad,
                    unidad:           unidadAbr,
                    lote,
                    potencia,
                    numeroAnalisis,
                    peso,
                    fechaVencimiento: r.getValue('fechaVencimiento'),
                    almacenDestino:   r.getText('almacenDestino'),
                    observacionLinea: r.getValue('observacionLinea')
                });
            });

        } catch (e) {
            log.error('ASSolicitudConsumoRepository | getRecepcionInsumosData', e);
        }

        return result;
    };

    // ─── Repositorio de customrecord_2win_solicitud_consumo ─────────────────────

    /**
     * Obtiene header + líneas de detalle de una Solicitud de Consumo
     * (custom record), sin depender del tipo de registro nativo transferorder.
     *
     * @param {string[]} ids - Array con el internalId de la solicitud
     * @returns {{ header: Object, items: Object[] }}
     */
    const getSolicitudConsumoCustomData = (ids) => {
        const result = { header: {}, items: [] };
        const id     = ids[0];

        try {
            // ── Header ─────────────────────────────────────────────────────────
            const headerRow = search.lookupFields({
                type   : 'customrecord_2win_solicitud_consumo',
                id     : id,
                columns: [
                    'name',
                    'custrecord_2win_consumo_solicitante',
                    'custrecord_2win_consumo_fecha',
                    'custrecord_2win_consumo_subsidiaria',
                    'custrecord_2win_consumo_departamento',
                    'custrecord_2win_consumo_ubicacion',
                    'custrecord_2win_consumo_nota',
                    'custrecord_2win_consumo_estado'
                ]
            });

            const _txt = (field) =>
                headerRow[field]?.length ? headerRow[field][0].text  : (headerRow[field] || '');
            const _val = (field) =>
                headerRow[field]?.length ? headerRow[field][0].value : (headerRow[field] || '');

            // ── Fecha de entrega: nota de sistema Enviada → Cerrada ───────────
            let fechaEntrega = '';
            try {
                const noteRows = search.create({
                    type   : 'systemnote',
                    filters: [
                        ['recordid', 'equalto', id],
                        'AND',
                        ['recordtype', 'anyof', '1307'],
                        'AND',
                        ['type', 'is', 'F'],
                        'AND',
                        ["field","anyof","CUSTRECORD_2WIN_CONSUMO_ESTADO"],
                        'AND',
                        ['oldvalue', 'is', 'Enviada'],
                        'AND',
                        ['newvalue',  'is', 'Cerrada']
                    ],
                    columns: [
                        search.createColumn({ name: 'date', sort: search.Sort.DESC }),
                        search.createColumn({ name: "formulatext", formula: "TO_CHAR({date}, 'dd/MM/yyyy')", label: "Fórmula (texto)" })
                    ]
                }).run().getRange({ start: 0, end: 1 });

                if (noteRows.length > 0) {
                    let columns = noteRows[0].columns;
                    fechaEntrega = noteRows[0].getValue(columns[1]) || '';
                }
            } catch (eNote) {
                log.error('ASSolicitudConsumoRepository | getSolicitudConsumoCustomData | fechaEntrega', eNote);
            }

            result.header = {
                name         : headerRow.name || '',
                solicitante  : _txt('custrecord_2win_consumo_solicitante'),
                fecha        : headerRow.custrecord_2win_consumo_fecha || '',
                subsidiaria  : _txt('custrecord_2win_consumo_subsidiaria'),
                departamento : _txt('custrecord_2win_consumo_departamento'),
                ubicacion    : _txt('custrecord_2win_consumo_ubicacion'),
                nota         : headerRow.custrecord_2win_consumo_nota || '',
                estado       : _txt('custrecord_2win_consumo_estado'),
                fechaEntrega : fechaEntrega
            };

        } catch (e) {
            log.error('ASSolicitudConsumoRepository | getSolicitudConsumoCustomData | header', e);
        }

        try {
            // ── Líneas de detalle ──────────────────────────────────────────────
            const lineRows = search.create({
                type   : 'customrecord_2win_solicitud_consumo_det',
                filters: [
                    ['custrecord_2win_consumo_det_ref', 'anyof', id],
                    'AND',
                    ['isinactive', 'is', 'F']
                ],
                columns: [
                    search.createColumn({ name: 'custrecord_2win_consumo_det_articulo' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_unidad' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_cantidad' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_departamento' })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            result.items = lineRows.map(row => ({
                articulo    : row.getText('custrecord_2win_consumo_det_articulo')    || '',
                unidad      : row.getText('custrecord_2win_consumo_det_unidad')      || '',
                cantidad    : parseFloat(row.getValue('custrecord_2win_consumo_det_cantidad')) || 0,
                departamento: row.getText('custrecord_2win_consumo_det_departamento') || ''
            }));

        } catch (e) {
            log.error('ASSolicitudConsumoRepository | getSolicitudConsumoCustomData | items', e);
        }

        return result;
    };

    return {
        getSolicitudConsumoData,
        getRecepcionInsumosData,
        getSolicitudConsumoCustomData,
        getUnitsMap
    };
});
