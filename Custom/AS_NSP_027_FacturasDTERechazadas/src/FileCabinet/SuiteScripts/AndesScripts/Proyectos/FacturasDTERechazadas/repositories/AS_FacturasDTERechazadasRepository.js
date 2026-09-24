/**
 * AS_NSP_025 — Facturas DTE Rechazadas
 * @description Consulta customrecord_as_dte_rechazado y registra avisos manuales.
 *              La bandeja no consulta el record de 2WIN en vivo. Un nuevo registro
 *              de 2WIN se muestra como una fila independiente.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query', 'N/record', '../lib/AS_FacturasDTERechazadasConstants'],
    (query, record, CONSTANTES) => {

    function contarPendientes() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT COUNT(*) AS total',
                'FROM ' + CONSTANTES.RECORD.CACHE + ' c',
                'WHERE c.isinactive = \'F\'',
                '  AND c.custrecord_as_dterc_avisado = \'F\'',
            ].join(' '),
        }).asMappedResults();

        return Number(filas[0].total) || 0;
    }

    function listarRechazados(filtros, indicePagina) {
        const consulta = construirConsultaListado(filtros);

        const paginado = query.runSuiteQLPaged({
            query   : consulta.texto,
            params  : consulta.parametros,
            pageSize: CONSTANTES.PAGINACION.TAMANO_PAGINA,
        });

        const totalPaginas = Math.max(paginado.pageRanges.length, 1);
        const pagina       = Math.min(Math.max(indicePagina, 0), totalPaginas - 1);

        const filas = paginado.pageRanges.length
                    ? paginado.fetch({ index: pagina }).data.asMappedResults()
                    : [];

        return {
            filas         : filas,
            paginaActual  : pagina,
            totalPaginas  : totalPaginas,
            totalRegistros: paginado.count,
        };
    }

    function listarSubsidiarias() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT id, name AS nombre',
                'FROM subsidiary',
                'WHERE isinactive = \'F\'',
                '  AND UPPER(name) NOT LIKE \'XX%\'',
                'ORDER BY name',
            ].join(' '),
        }).asMappedResults();

        return filas.map((fila) => ({ id: String(fila.id), nombre: fila.nombre }));
    }

    function marcarProveedorAvisado(id, idEmpleado, observacion) {
        const filas = query.runSuiteQL({
            query : 'SELECT id, custrecord_as_dterc_avisado AS avisado FROM ' + CONSTANTES.RECORD.CACHE
                  + ' WHERE id = ? AND isinactive = \'F\'',
            params: [id],
        }).asMappedResults();

        if (!filas.length || filas[0].avisado === 'T') {
            return false;
        }

        record.submitFields({
            type  : CONSTANTES.RECORD.CACHE,
            id    : id,
            values: {
                custrecord_as_dterc_avisado      : true,
                custrecord_as_dterc_fecha_aviso  : new Date(),
                custrecord_as_dterc_usuario_aviso: idEmpleado,
                custrecord_as_dterc_nota_aviso   : observacion,
            },
        });
        return true;
    }

    function construirConsultaListado(filtros) {
        const condiciones = ['c.isinactive = \'F\''];
        const parametros  = [];

        if (filtros.fechaDesde) {
            condiciones.push('TRUNC(c.custrecord_as_dterc_fecha) >= TO_DATE(?, \'DD/MM/YYYY\')');
            parametros.push(filtros.fechaDesde);
        }

        if (filtros.fechaHasta) {
            condiciones.push('TRUNC(c.custrecord_as_dterc_fecha) <= TO_DATE(?, \'DD/MM/YYYY\')');
            parametros.push(filtros.fechaHasta);
        }

        if (filtros.folio) {
            condiciones.push('INSTR(UPPER(c.custrecord_as_dterc_folio), UPPER(?)) > 0');
            parametros.push(filtros.folio);
        }

        if (filtros.rutEmisor) {
            condiciones.push('UPPER(c.custrecord_as_dterc_rut_emisor) = UPPER(?)');
            parametros.push(filtros.rutEmisor);
        }

        if (filtros.codigoError) {
            condiciones.push('c.custrecord_as_dterc_cod_error = ?');
            parametros.push(filtros.codigoError);
        }

        if (filtros.subsidiaria) {
            condiciones.push('c.custrecord_as_dterc_subsidiaria = ?');
            parametros.push(filtros.subsidiaria);
        }

        if (filtros.seguimiento === 'pendiente') {
            condiciones.push('c.custrecord_as_dterc_avisado = \'F\'');
        } else if (filtros.seguimiento === 'avisado') {
            condiciones.push('c.custrecord_as_dterc_avisado = \'T\'');
        }

        const texto = [
            'SELECT',
            '    c.id AS id,',
            '    TO_CHAR(c.custrecord_as_dterc_fecha, \'DD/MM/YYYY\') AS fecha,',
            '    c.custrecord_as_dterc_folio AS folio,',
            '    c.custrecord_as_dterc_tipo AS tipodte,',
            '    c.custrecord_as_dterc_rut_emisor AS rutemisor,',
            '    BUILTIN.DF(c.custrecord_as_dterc_proveedor) AS proveedor,',
            '    BUILTIN.DF(c.custrecord_as_dterc_subsidiaria) AS subsidiaria,',
            '    c.custrecord_as_dterc_estado AS estadodte,',
            '    c.custrecord_as_dterc_cod_error AS codigoerror,',
            '    c.custrecord_as_dterc_desc_error AS descripcionerror,',
            '    c.custrecord_as_dterc_avisado AS avisado,',
            '    TO_CHAR(c.custrecord_as_dterc_fecha_aviso, \'DD/MM/YYYY HH24:MI\') AS fechaaviso,',
            '    BUILTIN.DF(c.custrecord_as_dterc_usuario_aviso) AS usuarioaviso,',
            'FROM ' + CONSTANTES.RECORD.CACHE + ' c',
            'WHERE ' + condiciones.join(' AND '),
            'ORDER BY c.custrecord_as_dterc_avisado ASC, c.custrecord_as_dterc_fecha DESC, c.id DESC',
        ].join(' ');

        return { texto: texto, parametros: parametros };
    }

    return {
        contarPendientes     : contarPendientes,
        listarRechazados     : listarRechazados,
        listarSubsidiarias   : listarSubsidiarias,
        marcarProveedorAvisado: marcarProveedorAvisado,
    };
});
