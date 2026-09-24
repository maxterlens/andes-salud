/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Copia las filas de 2WIN hacia customrecord_as_dte_rechazado. Lo usa
 *              el SyncHandler, que sincroniza una sola fila apenas 2WIN la crea o la
 *              edita en customrecord_2win_recepcion_dte_rechaza -disparado hoy por un
 *              UE, ver AS_FacturasDTERechazadas_UE_2.1.js-. Es el unico que crea filas;
 *              la bandeja solo lee y marca el aviso al proveedor (ver
 *              AS_FacturasDTERechazadasRepository.js).
 *
 *              obtenerFilaOrigenPorId trae esa fila YA resuelta -Vendor via
 *              vendor.custentity_2wrut = rut emisor, Subsidiaria via
 *              subsidiary.custrecord_2winrutsubsiudiaria = rut receptor-.
 *
 *              Solo se copian las filas de tipo Documento: un Evento es un aviso sobre
 *              un DTE ya existente, no una factura que falte cargar, y la bandeja no lo
 *              trabaja. Para un Evento la consulta no devuelve fila, el SyncHandler
 *              devuelve null y no se crea nada. Los Evento siguen completos en el
 *              record de 2WIN.
 *
 *              El codigo DTE (33, 61...) se guarda traducido con CONSTANTES.TIPOS_DTE;
 *              si 2WIN manda un codigo que no esta en esa tabla, se guarda el numero.
 *
 *              guardarDteRechazado actualiza si ya existe una fila para ese id original
 *              y crea si no -nunca duplica-, buscando por
 *              custrecord_as_dterc_id_original. Devuelve el id de la fila, para el log
 *              del que la llama.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query', 'N/record', '../lib/AS_FacturasDTERechazadasConstants'],
    (query, record, CONSTANTES) => {

    function obtenerFilaOrigenPorId(id) {
        const filas = query.runSuiteQL({
            query : construirConsultaOrigen() + ' AND r.id = ?',
            params: [id],
        }).asMappedResults();

        return filas.length ? filas[0] : null;
    }

    function construirConsultaOrigen() {
        return [
            'SELECT',
            '    r.id AS idoriginal,',
            '    TO_CHAR(r.created, \'YYYY-MM-DD\') AS fecha,',
            '    r.custrecord_2win_dterech_folio AS folio,',
            '    r.custrecord_2win_dterech_tipo AS tipo,',
            '    r.custrecord_2win_dterech_codigo_dte AS codigodte,',
            '    r.custrecord_2win_dterech_rut_emisor AS rutemisor,',
            '    v.id AS idvendor,',
            '    r.custrecord_2win_dterech_rut_receptor AS rutreceptor,',
            '    s.id AS idsubsidiaria,',
            '    r.custrecord_2win_dterech_estado AS estado,',
            '    r.custrecord_2win_dterech_codigo_error AS codigoerror,',
            '    r.custrecord_2win_dterech_desc_error AS descripcionerror',
            'FROM ' + CONSTANTES.RECORD.RECHAZO + ' r',
            'LEFT JOIN vendor v ON v.custentity_2wrut = r.custrecord_2win_dterech_rut_emisor',
            'LEFT JOIN subsidiary s ON s.custrecord_2winrutsubsiudiaria LIKE r.custrecord_2win_dterech_rut_receptor || \'%\'',
            'WHERE r.isinactive = \'F\'',
            '  AND r.custrecord_2win_dterech_tipo = \'Documento\'',
        ].join(' ');
    }

    function guardarDteRechazado(fila) {
        const idDteRechazado = buscarIdDteRechazado(fila.idoriginal);

        const valores = {
            custrecord_as_dterc_id_original : fila.idoriginal,
            custrecord_as_dterc_fecha       : fila.fecha ? new Date(fila.fecha + 'T00:00:00') : null,
            custrecord_as_dterc_folio       : fila.folio,
            custrecord_as_dterc_tipo        : fila.tipo,
            custrecord_as_dterc_codigo_dte  : CONSTANTES.TIPOS_DTE[fila.codigodte] || fila.codigodte,
            custrecord_as_dterc_rut_emisor  : fila.rutemisor,
            custrecord_as_dterc_proveedor   : fila.idvendor,
            custrecord_as_dterc_rut_receptor: fila.rutreceptor,
            custrecord_as_dterc_subsidiaria : fila.idsubsidiaria,
            custrecord_as_dterc_estado      : fila.estado,
            custrecord_as_dterc_cod_error   : fila.codigoerror,
            custrecord_as_dterc_desc_error  : fila.descripcionerror,
        };

        if (idDteRechazado) {
            record.submitFields({ type: CONSTANTES.RECORD.DTE_RECHAZADO, id: idDteRechazado, values: valores });
            return idDteRechazado;
        }

        const registro = record.create({ type: CONSTANTES.RECORD.DTE_RECHAZADO, isDynamic: false });
        Object.keys(valores).forEach((campo) => registro.setValue({ fieldId: campo, value: valores[campo] }));
        return registro.save();
    }

    function buscarIdDteRechazado(idOriginal) {
        const filas = query.runSuiteQL({
            query : 'SELECT id FROM ' + CONSTANTES.RECORD.DTE_RECHAZADO + ' WHERE custrecord_as_dterc_id_original = ?',
            params: [idOriginal],
        }).asMappedResults();

        return filas.length ? filas[0].id : null;
    }

    return {
        obtenerFilaOrigenPorId: obtenerFilaOrigenPorId,
        guardarDteRechazado   : guardarDteRechazado,
    };
});
