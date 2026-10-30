/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Todas las busquedas del modulo.
 *
 *              obtenerHistorial → los ultimos reportes pedidos, del mas nuevo al
 *                                 mas viejo, para la lista del formulario.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/search', '../../constants/AS_StockValorizadoConstants'],
    (search, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerHistorial() {
        const campos = CONSTANTES.LOG.CAMPOS;

        const resultados = search.create({
            type   : CONSTANTES.LOG.TIPO,
            filters: [['isinactive', 'is', 'F']],
            columns: [
                search.createColumn({ name: 'created', sort: search.Sort.DESC }),
                'owner',
                campos.SUBSIDIARIA,
                campos.FECHA_CORTE,
                campos.ESTADO,
                campos.URL_EXCEL,
                campos.URL_CSV,
                campos.ERROR,
            ],
        }).run().getRange({ start: 0, end: CONSTANTES.LOG.HISTORIAL_MAXIMO });

        return resultados.map((resultado) => ({
            fecha      : resultado.getValue({ name: 'created' }),
            usuario    : resultado.getText({ name: 'owner' }),
            subsidiaria: resultado.getText({ name: campos.SUBSIDIARIA }),
            fechaCorte : resultado.getValue({ name: campos.FECHA_CORTE }),
            estado     : resultado.getValue({ name: campos.ESTADO }),
            urlExcel   : resultado.getValue({ name: campos.URL_EXCEL }),
            urlCsv     : resultado.getValue({ name: campos.URL_CSV }),
            error      : resultado.getValue({ name: campos.ERROR }),
        }));
    }

    return {
        obtenerHistorial: obtenerHistorial,
    };
});
