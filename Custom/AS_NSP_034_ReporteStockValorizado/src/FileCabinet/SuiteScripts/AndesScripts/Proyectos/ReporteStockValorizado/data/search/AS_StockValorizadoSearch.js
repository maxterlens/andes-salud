/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Todas las busquedas del modulo.
 *
 *              obtenerHistorial → los ultimos reportes pedidos, del mas nuevo al
 *                                 mas viejo, para la lista del formulario.
 *              existeReporteEnProceso → si hay un reporte generandose ahora.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 * CHANGELOG v1.2.0:
 * - [FEAT] existeReporteEnProceso.
 *
 * CHANGELOG v1.1.0:
 * - [FEAT] El historial trae las ubicaciones de cada reporte.
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
                campos.UBICACIONES,
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
            ubicaciones: resultado.getText({ name: campos.UBICACIONES }),
            fechaCorte : resultado.getValue({ name: campos.FECHA_CORTE }),
            estado     : resultado.getValue({ name: campos.ESTADO }),
            urlExcel   : resultado.getValue({ name: campos.URL_EXCEL }),
            urlCsv     : resultado.getValue({ name: campos.URL_CSV }),
            error      : resultado.getValue({ name: campos.ERROR }),
        }));
    }

    /**
     * Solo cuenta lo pedido hace menos de MINUTOS_EN_PROCESO: un reporte que
     * NetSuite corto sin avisar se queda En proceso y no puede bloquear para siempre.
     */
    function existeReporteEnProceso() {
        const resultados = search.create({
            type   : CONSTANTES.LOG.TIPO,
            filters: [
                ['isinactive', 'is', 'F'], 'AND',
                [CONSTANTES.LOG.CAMPOS.ESTADO, 'is', CONSTANTES.LOG.ESTADOS.EN_PROCESO], 'AND',
                ['formulanumeric: ({now} - {created}) * 1440', 'lessthan', CONSTANTES.LOG.MINUTOS_EN_PROCESO],
            ],
        }).run().getRange({ start: 0, end: 1 });

        return resultados.length > 0;
    }

    return {
        obtenerHistorial      : obtenerHistorial,
        existeReporteEnProceso: existeReporteEnProceso,
    };
});
