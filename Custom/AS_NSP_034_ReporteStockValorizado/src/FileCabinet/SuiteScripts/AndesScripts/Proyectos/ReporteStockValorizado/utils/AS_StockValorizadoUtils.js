/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Funciones genericas del modulo, sin negocio.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define([], () => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * El CSV que escribe NetSuite pone entre comillas los valores con coma (un
     * articulo "JERINGA 3ML, 21G") y duplica las comillas internas.
     */
    function separarLineaCsv(linea) {
        const columnas    = [];
        let actual        = '';
        let entreComillas = false;

        for (let posicion = 0; posicion < linea.length; posicion++) {
            const caracter = linea[posicion];
            if (entreComillas && caracter === '"' && linea[posicion + 1] === '"') {
                actual += '"';
                posicion++;
            } else if (caracter === '"') {
                entreComillas = !entreComillas;
            } else if (caracter === ',' && !entreComillas) {
                columnas.push(actual);
                actual = '';
            } else {
                actual += caracter;
            }
        }
        columnas.push(actual);

        return columnas;
    }

    function escaparXml(texto) {
        return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function convertirFechaATextoDiaMesAnio(fecha) {
        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        return dia + '/' + mes + '/' + fecha.getFullYear();
    }

    return {
        separarLineaCsv               : separarLineaCsv,
        escaparXml                    : escaparXml,
        convertirFechaATextoDiaMesAnio: convertirFechaATextoDiaMesAnio,
    };
});
