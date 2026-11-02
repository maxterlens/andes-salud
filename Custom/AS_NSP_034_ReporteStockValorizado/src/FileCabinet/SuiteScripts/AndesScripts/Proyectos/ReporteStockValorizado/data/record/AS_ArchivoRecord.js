/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Los archivos del reporte en el File Cabinet.
 *
 *              crearCsvVacio → el CSV donde el SuiteQLTask vuelca la consulta.
 *              leerCsv       → ese CSV ya lleno, con el encabezado aparte.
 *              crearExcel    → el .xls (XML Spreadsheet) con las columnas de
 *                              CONSTANTES.EXCEL.COLUMNAS, al lado del CSV y con
 *                              su mismo nombre.

 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
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

        const encabezados = filas.shift();

        return { nombre: csv.name, carpeta: csv.folder, url: csv.url, encabezados: encabezados, filas: filas };
    }

    function crearExcel(nombre, carpeta, encabezados, filas) {
        const columnas = CONSTANTES.EXCEL.COLUMNAS.map((columna) => ({ posicion: encabezados.indexOf(columna.campo), numerica: columna.numerica }));
        const excel    = file.create({
            name    : nombre,
            fileType: file.Type.PLAINTEXT,
            contents: armarInicioExcel(),
            folder  : carpeta,
            encoding: file.Encoding.UTF_8,
        });

        filas.forEach((fila) => excel.appendLine({ value: armarFilaExcel(fila, columnas) }));
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
             + '<Row>' + CONSTANTES.EXCEL.COLUMNAS.map((columna) => '<Cell ss:StyleID="encabezado"><Data ss:Type="String">'
             + UTILS.escaparXml(columna.titulo) + '</Data></Cell>').join('') + '</Row>';
    }

    function armarFilaExcel(fila, columnas) {
        const celdas = columnas.map((columna) => {
            const valor = fila[columna.posicion];
            if (valor === '') return '<Cell/>';
            if (columna.numerica) return '<Cell><Data ss:Type="Number">' + Number(valor.replace(/,/g, '')) + '</Data></Cell>';
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
