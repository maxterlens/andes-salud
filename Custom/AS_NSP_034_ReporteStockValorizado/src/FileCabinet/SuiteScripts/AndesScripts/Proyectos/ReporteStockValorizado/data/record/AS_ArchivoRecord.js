/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Los archivos del reporte en el File Cabinet.
 *
 *              crearCsvVacio → el CSV donde el SuiteQLTask vuelca la consulta.
 *              leerCsv       → ese CSV ya lleno, sin el encabezado.
 *              crearExcel    → el .xls (XML Spreadsheet) con las mismas filas,
 *                              al lado del CSV y con su mismo nombre.
 *
 * CHANGELOG v1.0.1 (2026-10-30):
 *   - [FIX] crearExcel quita la coma de miles antes de convertir a numero: la
 *           Valorizacion individual de 1.000 o mas con decimales salia NaN
 *           (##### en Excel).
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.1
 *
 */
define(['N/file', '../../utils/AS_StockValorizadoUtils', '../../constants/AS_StockValorizadoConstants'],
    (file, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function crearCsvVacio(nombre, carpeta) {
        return file.create({ name: nombre, fileType: file.Type.CSV, contents: '', folder: carpeta }).save();
    }

    function leerCsv(csvId) {
        const csv   = file.load({ id: csvId });
        const filas = [];

        csv.lines.iterator().each((linea) => {
            if (linea.value.trim()) filas.push(UTILS.separarLineaCsv(linea.value));
            return true;
        });

        return { nombre: csv.name, carpeta: csv.folder, url: csv.url, filas: filas.slice(1) };
    }

    /**
     * Excel abre el XML Spreadsheet como planilla: las columnas de cantidad y
     * valor van como numero para que se puedan sumar y filtrar. El CSV del
     * SuiteQLTask trae los decimales de 1.000 o mas con coma de miles
     * ("7,972.67"): se saca antes de convertir, el decimal es el punto.
     */
    function crearExcel(nombre, carpeta, filas) {
        const excel = file.create({
            name    : nombre,
            fileType: file.Type.PLAINTEXT,
            contents: armarInicioExcel(),
            folder  : carpeta,
            encoding: file.Encoding.UTF_8,
        });

        filas.forEach((fila) => excel.appendLine({ value: armarFilaExcel(fila, CONSTANTES.EXCEL.COLUMNAS_NUMERICAS) }));
        excel.appendLine({ value: '</Table></Worksheet></Workbook>' });

        return file.load({ id: excel.save() }).url;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function armarInicioExcel() {
        return '<?xml version="1.0" encoding="UTF-8"?>\n'
             + '<?mso-application progid="Excel.Sheet"?>\n'
             + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
             + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
             + '<Styles><Style ss:ID="encabezado"><Font ss:Bold="1"/><Interior ss:Color="#DBDBDB" ss:Pattern="Solid"/></Style></Styles>\n'
             + '<Worksheet ss:Name="' + CONSTANTES.EXCEL.HOJA + '"><Table>\n'
             + '<Row>' + CONSTANTES.EXCEL.ENCABEZADOS.map((encabezado) => '<Cell ss:StyleID="encabezado"><Data ss:Type="String">'
             + UTILS.escaparXml(encabezado) + '</Data></Cell>').join('') + '</Row>';
    }

    function armarFilaExcel(fila, columnasNumericas) {
        const celdas = fila.map((valor, columna) => {
            if (valor === '') return '<Cell/>';
            if (columnasNumericas.indexOf(columna) >= 0) return '<Cell><Data ss:Type="Number">' + Number(valor.replace(/,/g, '')) + '</Data></Cell>';
            return '<Cell><Data ss:Type="String">' + UTILS.escaparXml(valor) + '</Data></Cell>';
        });

        return '<Row>' + celdas.join('') + '</Row>';
    }

    return {
        crearCsvVacio: crearCsvVacio,
        leerCsv      : leerCsv,
        crearExcel   : crearExcel,
    };
});
