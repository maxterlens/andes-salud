/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Repositorio de acceso al custom record de log del reporte.
 *              Encapsula todas las búsquedas sobre customrecord_as_log_rep_analit_ctas_cons.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search', 'N/record'], function (search, record) {

    const RECORD_TYPE     = 'customrecord_as_log_rep_analit_ctas_cons';

    const FIELDS = {
        USUARIO      : 'custrecord_as_log_rep_anal_cta_usuario',
        SUBSIDIARIA  : 'custrecord_as_log_rep_anal_cta_subsidiar',
        FECHA_CORTE  : 'custrecord_as_log_rep_anal_cta_fecha',
        ESTADO       : 'custrecord_as_log_rep_anal_cta_estado',
        ID_XLS       : 'custrecord_as_log_rep_anal_cta_id_ar_xls',
        NOMBRE_XLS   : 'custrecord_as_log_rep_anal_cta_arch_xls',
        URL_XLS      : 'custrecord_as_log_rep_anal_cta_url_xls',
        ID_CSV       : 'custrecord_as_log_rep_anal_cta_id_ar_csv',
        NOMBRE_CSV   : 'custrecord_as_log_rep_anal_cta_arch_csv',
        URL_CSV      : 'custrecord_as_log_rep_anal_cta_url_csv',
        RESULTADO    : 'custrecord_as_log_rep_anal_cta_result',
    };

    /* ─── Columnas comunes para todas las búsquedas ─────────────── */
    function _buildColumns() {
        return [
            search.createColumn({ name: 'created',          sort: search.Sort.DESC, label: 'Fecha Creacion' }),
            search.createColumn({ name: FIELDS.USUARIO,     label: 'Usuario'      }),
            search.createColumn({ name: FIELDS.SUBSIDIARIA, label: 'Subsidiaria'  }),
            search.createColumn({ name: FIELDS.FECHA_CORTE, label: 'Fecha Corte'  }),
            search.createColumn({ name: FIELDS.ESTADO,      label: 'Estado'       }),
            search.createColumn({ name: FIELDS.ID_XLS,      label: 'Id Arch XLS'  }),
            search.createColumn({ name: FIELDS.NOMBRE_XLS,  label: 'Nombre XLS'   }),
            search.createColumn({ name: FIELDS.URL_XLS,     label: 'Url XLS'   }),
            search.createColumn({ name: FIELDS.ID_CSV,      label: 'Id Arch Csv'   }),
            search.createColumn({ name: FIELDS.NOMBRE_CSV,  label: 'Nombre CSV' }),
            search.createColumn({ name: FIELDS.URL_CSV,     label: 'Url CSV' }),
            search.createColumn({ name: FIELDS.RESULTADO,   label: 'Resultado' }),
        ];
    }

    /* ─── Mapeo de resultado → objeto ───────────────────────────── */
    function _mapResult(r) {
        return {
            id           : r.id,
            fechaCreacion: r.getValue({ name: 'created' })               || '',
            usuario      : r.getText ({ name: FIELDS.USUARIO })           || '',
            usuarioId    : r.getValue({ name: FIELDS.USUARIO })           || '',
            subsidiaria  : r.getText ({ name: FIELDS.SUBSIDIARIA })       || '',
            subsidiariId : r.getValue({ name: FIELDS.SUBSIDIARIA })       || '',
            fechaCorte   : r.getValue({ name: FIELDS.FECHA_CORTE })       || '',
            estado       : r.getValue({ name: FIELDS.ESTADO })            || '',
            idXls        : r.getValue({ name: FIELDS.ID_XLS })       || '',
            nombreXls    : r.getValue({ name: FIELDS.NOMBRE_XLS })        || '',
            urlXls       : r.getValue({ name: FIELDS.URL_XLS })        || '',
            idCsv        : r.getValue({ name: FIELDS.ID_CSV })       || '',
            nombreCsv    : r.getValue({ name: FIELDS.NOMBRE_CSV })        || '',
            urlCsv       : r.getValue({ name: FIELDS.URL_CSV })        || '',
            resultado    : r.getValue({ name: FIELDS.RESULTADO })        || '',
        };
    }

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Retorna todos los registros de log ordenados por fecha DESC.
     *
     * @param {Object}  [filtros={}]
     * @param {string}  [filtros.subsidiaria]  - Internal ID de subsidiaria
     * @param {string}  [filtros.fechaCorte]   - Fecha (formato NS: MM/DD/YYYY)
     * @returns {Array<Object>}
     */
    function getAll(filtros) {
        filtros = filtros || {};

        const filtrosNs = [['isinactive', 'is', 'F']];

        const srch = search.create({
            type   : RECORD_TYPE,
            columns: _buildColumns(),
            filters: filtrosNs,
        });

        const resultados = [];
        srch.run().each(function (r) {
            resultados.push(_mapResult(r));
            return true;
        });

        return resultados;
    }

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Retorna el registro de log cuyo campo ID_CSV coincide con idCsv.
     * Usado por la vista de detalle para obtener la cabecera del reporte.
     *
     * @param {string|number} idCsv  - Valor de custrecord_as_log_rep_anal_cta_id_a_data
     * @returns {Object|null}
     */
    function getByArchivoDataId(idCsv) {
        if (!idCsv) return null;

        const srch = search.create({
            type   : RECORD_TYPE,
            columns: _buildColumns(),
            filters: [
                ['isinactive', 'is', 'F'],
                'AND',
                [FIELDS.ID_CSV, 'equalto', String(idCsv)],
            ],
        });

        let resultado = null;
        srch.run().each(function (r) {
            resultado = _mapResult(r);
            return false; // solo el primero
        });

        return resultado;
    }

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Actualiza el registro de log con la información del archivo XLS generado
     * y cambia el estado a "Generando CSV".
     * Llamado desde summarize() del Map Reduce después de crear el Excel.
     *
     * @param {string|number} logId
     * @param {Object}        datos
     * @param {string}        datos.nombreArchivo  Nombre del archivo XLS generado
     * @param {string|number} datos.fileId         Internal ID del archivo en File Cabinet
     * @param {string}        datos.fileUrl        URL del archivo en File Cabinet
     */
    function marcarXlsGenerado(logId, datos) {
        if (!logId) return;
        var values = {};
        values[FIELDS.ID_XLS]     = datos.fileId        || '';
        values[FIELDS.NOMBRE_XLS] = datos.nombreArchivo || '';
        values[FIELDS.URL_XLS]    = datos.fileUrl       || '';
        values[FIELDS.ESTADO]     = 'Generando CSV';
        record.submitFields({
            type  : RECORD_TYPE,
            id    : logId,
            values: values,
        });
    }

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Marca el registro de log como completado, registrando el nombre
     * y el ID del archivo CSV generado.
     * Llamado desde summarize() del Map Reduce al finalizar con éxito.
     *
     * @param {string|number} logId
     * @param {Object}        datos
     * @param {string}        datos.nombreArchivo  Nombre del archivo CSV generado
     * @param {string|number} datos.fileId         Internal ID del archivo en File Cabinet
     * @param {string}        datos.fileUrl        URL del archivo en File Cabinet
     */
    function marcarCompletado(logId, datos) {
        if (!logId) return;
        var values = {};
        values[FIELDS.ID_CSV]     = datos.fileId        || '';
        values[FIELDS.NOMBRE_CSV] = datos.nombreArchivo || '';
        values[FIELDS.URL_CSV]    = datos.fileUrl       || '';
        values[FIELDS.ESTADO]     = 'Completado';
        record.submitFields({
            type  : RECORD_TYPE,
            id    : logId,
            values: values,
        });
    }

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Marca el registro de log como fallido, almacenando el mensaje de error.
     * Llamado desde summarize() del Map Reduce al detectar errores críticos.
     *
     * @param {string|number} logId
     * @param {string}        mensaje  Descripción del error ocurrido
     */
    function marcarError(logId, mensaje) {
        if (!logId) return;
        var values = {};
        values[FIELDS.ESTADO]    = 'Error';
        values[FIELDS.RESULTADO] = (mensaje || 'Error desconocido').substring(0, 3999);
        record.submitFields({
            type  : RECORD_TYPE,
            id    : logId,
            values: values,
        });
    }

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Crea un nuevo registro de log con estado "En Proceso".
     * Llamado desde el handler en el POST antes de lanzar el Map Reduce.
     *
     * @param {Object}        datos
     * @param {string|number} [datos.subsidiaria]  Internal ID de subsidiaria
     * @param {string}        [datos.fechaCorte]   Fecha de corte (DD/MM/YYYY)
     * @param {string}        [datos.estado]       Estado inicial (default: "En Proceso")
     * @returns {number} Internal ID del registro creado
     */
    function crear(datos) {
        log.error('datos', datos);
        datos = datos || {};
        const rec = record.create({ type: RECORD_TYPE });
        rec.setValue({ fieldId: FIELDS.SUBSIDIARIA, value: datos.subsidiaria || '' });
        rec.setText({ fieldId: FIELDS.FECHA_CORTE,  text: datos.fechaCorte  || '' });
        rec.setValue({ fieldId: FIELDS.ESTADO,      value: datos.estado      || 'En Proceso' });
        return rec.save();
    }

    return { FIELDS, RECORD_TYPE, getAll, getByArchivoDataId, marcarXlsGenerado, marcarCompletado, marcarError, crear };
});
