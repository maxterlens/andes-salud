/**
 * @NApiVersion 2.1
 * Repository: acceso a datos de Pago de Factura (vendorpayment) para la impresión de cheques.
 *
 * Responsabilidad única: consultar NetSuite y retornar datos crudos en objetos planos.
 * NO contiene lógica de negocio ni de formato.
 */
define(['N/query', 'N/search', 'N/record', '../lib/constants/Lib.Constants'], (query, search, record, Constants) => {

    /**
     * Obtiene el nombre a imprimir del beneficiario (proveedor).
     * Prioridad: "Imprimir en cheque como" → razón social / nombre de persona.
     *
     * @param {string|number} vendorId
     * @returns {string} Nombre o '' si no se pudo obtener
     */
    const _getNombreBeneficiario = (vendorId) => {
        const _lookup = (columns) => search.lookupFields({ type: search.Type.VENDOR, id: vendorId, columns });

        let datos = {};
        try {
            datos = _lookup(['printoncheckas', 'isperson', 'companyname', 'firstname', 'lastname']);
        } catch (e) {
            // Si printoncheckas no está disponible para el tipo de entidad, reintenta sin él
            log.error('ASPagoFacturaRepository | _getNombreBeneficiario | printoncheckas', e.message);
            try {
                datos = _lookup(['isperson', 'companyname', 'firstname', 'lastname']);
            } catch (e2) {
                log.error('ASPagoFacturaRepository | _getNombreBeneficiario', e2.message);
                return '';
            }
        }

        if (datos.printoncheckas) return datos.printoncheckas;
        if (datos.isperson === true || datos.isperson === 'T') {
            return [datos.firstname, datos.lastname].filter(Boolean).join(' ');
        }
        return datos.companyname || '';
    };

    /**
     * Obtiene los datos de uno o varios Pagos de Factura necesarios para el cheque.
     * La fecha se separa en SuiteQL para evitar desfases por zona horaria o formato de usuario.
     *
     * @param {string[]} ids - internalIds de vendorpayment
     * @returns {{ idInterno: string, numeroDocumento: string, total: number,
     *             fecha: { dia: string, mes: number, anio: string }, beneficiario: string }[]}
     */
    const getDatosCheques = (ids) => {
        if (!ids || !ids.length) return [];

        const marcadores = ids.map(() => '?').join(', ');
        const sql = `
            SELECT t.id,
                   t.tranid,
                   t.entity,
                   tl.subsidiary                 AS subsidiaria,
                   BUILTIN.DF(t.entity)          AS entidad,
                   ABS(t.foreigntotal)           AS total,
                   TO_CHAR(t.trandate, 'DD')     AS dia,
                   TO_CHAR(t.trandate, 'MM')     AS mes,
                   TO_CHAR(t.trandate, 'YYYY')   AS anio
            FROM   transaction t
            INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
            WHERE  t.id IN (${marcadores})
              AND  t.type = 'VendPymt'
        `;

        const rows = query.runSuiteQL({ query: sql, params: ids }).asMappedResults();

        return rows.map(r => ({
            idInterno:       String(r.id),
            numeroDocumento: r.tranid || String(r.id),
            subsidiaria:     r.subsidiaria ? String(r.subsidiaria) : '',
            total:           Number(r.total) || 0,
            fecha: {
                dia:  r.dia,
                mes:  Number(r.mes),
                anio: r.anio
            },
            beneficiario: _getNombreBeneficiario(r.entity) || r.entidad || ''
        }));
    };

    /**
     * Obtiene los datos de un solo Pago de Factura.
     * @param {string|number} id
     * @returns {Object|null}
     */
    const getDatosCheque = (id) => getDatosCheques([String(id)])[0] || null;

    /**
     * Obtiene una configuración de impresión de cheques (customrecord_as_config_cheque).
     * - Con `id`: esa configuración (si está activa).
     * - Sin `id`: la predeterminada activa de la subsidiaria (la de menor id si hubiera varias).
     *
     * La búsqueda solo usa los campos de filtro (subsidiarias, predeterminada) y los valores
     * se leen cargando el registro: si un campo nuevo del XML aún no está desplegado en la
     * cuenta, no rompe la impresión (queda vacío = valor base) y se registra en el log.
     *
     * @param {{ id?: string, subsidiaria?: string }} criterio
     * @returns {Object|null} { id, nombre, subsidiarias: string[], desp_x, desp_y, ... } con valores crudos
     */
    const getConfiguracionCheque = ({ id, subsidiaria } = {}) => {
        const { RECORD_TYPE, PREFIJO, CAMPOS } = Constants.CONFIG_CHEQUE;

        let idConfig = id ? String(id) : '';
        if (!idConfig) {
            if (!subsidiaria) return null;
            const filas = search.create({
                type: RECORD_TYPE,
                filters: [
                    ['isinactive', 'is', 'F'], 'AND',
                    [`${PREFIJO}subsidiaria`, 'anyof', subsidiaria], 'AND',
                    [`${PREFIJO}predeterminada`, 'is', 'T']
                ],
                columns: [search.createColumn({ name: 'internalid', sort: search.Sort.ASC })]
            }).run().getRange({ start: 0, end: 1 });
            if (!filas.length) return null;
            idConfig = String(filas[0].id);
        }

        let registro;
        try {
            registro = record.load({ type: RECORD_TYPE, id: idConfig });
        } catch (e) {
            log.error('ASPagoFacturaRepository | getConfiguracionCheque | load', `${idConfig}: ${e.message}`);
            return null;
        }
        const inactivo = registro.getValue({ fieldId: 'isinactive' });
        if (inactivo === true || inactivo === 'T') return null;

        const disponibles = registro.getFields();
        const faltantes   = [];
        const cfg = { id: idConfig, nombre: registro.getValue({ fieldId: 'name' }) || '' };

        CAMPOS.forEach((c) => {
            const fieldId = `${PREFIJO}${c}`;
            if (!disponibles.includes(fieldId)) {
                faltantes.push(fieldId);
                cfg[c] = '';
                return;
            }
            const valor = registro.getValue({ fieldId });
            if (valor === true)                cfg[c] = 'T';
            else if (valor === false)          cfg[c] = 'F';
            else if (Array.isArray(valor))     cfg[c] = valor.join(',');
            else if (valor === null || valor === undefined) cfg[c] = '';
            else                               cfg[c] = String(valor);
        });

        if (faltantes.length) {
            log.error('ASPagoFacturaRepository | getConfiguracionCheque | campos no desplegados en la cuenta',
                `Configuración ${idConfig}: ${faltantes.join(', ')}. Se usa el valor base del layout. Despliegue customrecord_as_config_cheque.`);
        }

        cfg.subsidiarias = String(cfg.subsidiaria || '').split(',').map(v => v.trim()).filter(Boolean);
        delete cfg.subsidiaria;
        return cfg;
    };

    return { getDatosCheques, getDatosCheque, getConfiguracionCheque };
});
