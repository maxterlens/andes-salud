/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Dibuja la ficha "Importes del recuento" en la vista del recuento:
 *              una tabla por articulo con sus cantidades, la tarifa y los tres
 *              importes, y la fila de totales. No busca ni guarda records.
 *
 *              Va como HTML en una ficha propia: la sublista Articulos del
 *              recuento no dibuja columnas personalizadas (probado en QA con
 *              custcol, 2026-10-22).
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */
define(['N/ui/serverWidget', 'N/format', '../constants/AS_RecuentoInventarioConstants'],
    (serverWidget, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarImportes(form, lineas, totales, iniciado) {
        const importes = CONSTANTES.IMPORTES;

        form.addTab({ id: importes.FICHA, label: importes.FICHA_LABEL });

        const campoImportes = form.addField({
            id       : importes.CAMPO,
            type     : serverWidget.FieldType.INLINEHTML,
            label    : importes.FICHA_LABEL,
            container: importes.FICHA,
        });
        campoImportes.defaultValue = armarTabla(lineas, totales, iniciado);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Imita la sublista nativa Articulos: cabeceras en mayusculas chicas y
     * grises, sin fondo, y filas separadas por una linea clara. En Iniciado
     * Instantanea y Variacion van en blanco: NetSuite calcula la variacion al
     * completar.
     */
    function armarTabla(lineas, totales, iniciado) {
        const cabecera = 'font-size:8pt;font-weight:normal;color:#666;text-transform:uppercase;'
                       + 'padding:6px 8px;border-bottom:1px solid #ccc;white-space:nowrap;';

        return '<p style="font-size:9pt;color:#666;margin:8px 0">Informativo: cantidad × tarifa. El asiento'
             + ' real lo genera NetSuite en el Ajuste de inventario al aprobar.</p>'
             + '<table style="border-collapse:collapse;font-size:9pt;width:100%">'
             + '<tr>'
             + '<th style="' + cabecera + 'text-align:left">Artículo</th>'
             + '<th style="' + cabecera + 'text-align:right">Cantidad de instantánea</th>'
             + '<th style="' + cabecera + 'text-align:right">Cantidad del recuento</th>'
             + '<th style="' + cabecera + 'text-align:right">Cantidad ajustada</th>'
             + '<th style="' + cabecera + 'text-align:right">Tarifa</th>'
             + '<th style="' + cabecera + 'text-align:right">Importe instantánea</th>'
             + '<th style="' + cabecera + 'text-align:right">Importe recuento</th>'
             + '<th style="' + cabecera + 'text-align:right">Importe variación</th>'
             + '</tr>'
             + lineas.map((linea) => armarFila(linea, iniciado)).join('')
             + '<tr style="font-weight:bold;text-align:right;border-top:2px solid #999">'
             + '<td style="text-align:left;padding:6px 8px" colspan="5">Total</td>'
             + '<td style="padding:6px 8px">' + (iniciado ? '' : formatearMoneda(totales.importeInstantanea)) + '</td>'
             + '<td style="padding:6px 8px">' + formatearMoneda(totales.importeRecuento) + '</td>'
             + '<td style="padding:6px 8px">' + (iniciado ? '' : formatearMoneda(totales.importeVariacion)) + '</td>'
             + '</tr>'
             + '</table>';
    }

    /**
     * Una linea sin contar muestra sus cantidades pero no sus importes.
     */
    function armarFila(linea, iniciado) {
        const conVariacion = linea.contado && !iniciado;

        return '<tr style="text-align:right;border-bottom:1px solid #e5e5e5">'
             + '<td style="text-align:left;padding:4px 8px">' + linea.nombre + '</td>'
             + '<td style="padding:4px 8px">' + (linea.instantanea === null ? '' : linea.instantanea) + '</td>'
             + '<td style="padding:4px 8px">' + (linea.recuento === null ? '' : linea.recuento) + '</td>'
             + '<td style="padding:4px 8px">' + (conVariacion && linea.ajustada !== null ? linea.ajustada : '') + '</td>'
             + '<td style="padding:4px 8px">' + formatearMoneda(linea.tarifa) + '</td>'
             + '<td style="padding:4px 8px">' + (conVariacion ? formatearMoneda(linea.importeInstantanea) : '') + '</td>'
             + '<td style="padding:4px 8px">' + (linea.contado ? formatearMoneda(linea.importeRecuento) : '') + '</td>'
             + '<td style="padding:4px 8px">' + (conVariacion ? formatearMoneda(linea.importeVariacion) : '') + '</td>'
             + '</tr>';
    }

    /**
     * Con el formato de moneda del usuario (la cuenta es es_ES).
     */
    function formatearMoneda(valor) {
        return format.format({ value: valor, type: format.Type.CURRENCY });
    }

    return {
        agregarImportes: agregarImportes,
    };
});
