/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Descarga en Excel (XML Spreadsheet 2003, extensión .xls).
 *              Mismo patrón que R003 (ConsumoProrrateoInsumos) y DCP:
 *                1. file.create (PLAINTEXT) con la cabecera XML del libro en la carpeta indicada
 *                2. appendLine por cada fila
 *                3. appendLine del cierre XML
 *                4. save → file.load → response.writeFile({ isInline: false })
 *                5. file.delete del temporal
 *              Encabezado en negrita con fondo gris y la primera fila fija. Admite varias hojas.
 */
define(["N/file"], (file) => {
    const _escapar = (v) =>
        String(v === null || v === undefined ? "" : v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    const _esNumero = (v) => v !== "" && v !== null && v !== undefined && !isNaN(Number(v));

    const _libro =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<?mso-application progid="Excel.Sheet"?>\n' +
        '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
        ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
        ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
        ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
        "<Styles>\n" +
        ' <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>\n' +
        ' <Style ss:ID="sHeader"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>' +
        '<Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/></Style>\n' +
        "</Styles>";

    const _abrirHoja = (hoja) => `<Worksheet ss:Name="${_escapar(hoja).slice(0, 31)}">\n<Table>`;

    const _cerrarHoja =
        "</Table>\n" +
        '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' +
        "<FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal>" +
        "<TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>\n" +
        "</Worksheet>";

    /**
     * Fila XML.
     * @param {Array} celdas
     * @param {boolean} esEncabezado
     * @param {string[]} [tipos] Por columna: 'text' (siempre texto, conserva ceros a la izquierda) o vacío (detección automática)
     */
    const _fila = (celdas, esEncabezado, tipos = []) =>
        `<Row>${celdas
            .map((c, i) => {
                const valor = c === null || c === undefined ? "" : String(c);
                const tipo = esEncabezado || tipos[i] === "text" || !_esNumero(valor) ? "String" : "Number";
                const estilo = esEncabezado ? ' ss:StyleID="sHeader"' : "";
                return `<Cell${estilo}><Data ss:Type="${tipo}">${_escapar(valor)}</Data></Cell>`;
            })
            .join("")}</Row>`;

    /**
     * Genera el .xls y lo envía como descarga.
     * @param {object} o
     * @param {ServerResponse} o.response
     * @param {number} o.carpetaId - carpeta para el archivo temporal
     * @param {string} o.nombre - nombre del archivo (con extensión .xls)
     * @param {{nombre: string, columnas: {titulo: string, tipo?: string}[], filas: Array[]}[]} o.hojas
     */
    const descargar = ({ response, carpetaId, nombre, hojas }) => {
        const xls = file.create({ name: nombre, fileType: file.Type.PLAINTEXT, contents: _libro, encoding: file.Encoding.UTF_8, folder: Number(carpetaId) });
        hojas.forEach((h) => {
            const tipos = h.columnas.map((c) => c.tipo || "");
            xls.appendLine({ value: _abrirHoja(h.nombre) });
            xls.appendLine({ value: _fila(h.columnas.map((c) => c.titulo), true) });
            h.filas.forEach((f) => xls.appendLine({ value: _fila(f, false, tipos) }));
            xls.appendLine({ value: _cerrarHoja });
        });
        xls.appendLine({ value: "</Workbook>" });

        const id = xls.save();
        try {
            response.writeFile({ file: file.load({ id }), isInline: false });
        } finally {
            file.delete({ id });
        }
    };

    return { descargar };
});
