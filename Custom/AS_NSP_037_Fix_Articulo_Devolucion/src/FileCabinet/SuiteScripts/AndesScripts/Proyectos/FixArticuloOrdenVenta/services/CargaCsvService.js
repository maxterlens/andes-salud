/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Lectura del CSV de entrada: separador ";" o "," detectado
 *              automáticamente, comillas, BOM, decimales con coma y validación de formato
 *              de cada fila. También entrega la plantilla de ejemplo.
 */
define(["../constants/FixArticuloOrdenVentaConstants"], (CONST) => {
    const { COLUMNAS_CSV } = CONST;

    const normalizarEncabezado = (s) =>
        String(s || "")
            .replace(/^﻿/, "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toUpperCase()
            .replace(/\s+/g, " ")
            .trim();

    /** Separa una línea CSV respetando comillas dobles. */
    const separarLinea = (linea, sep) => {
        const valores = [];
        let actual = "";
        let enComillas = false;
        for (let i = 0; i < linea.length; i++) {
            const c = linea[i];
            if (enComillas) {
                if (c === '"' && linea[i + 1] === '"') {
                    actual += '"';
                    i++;
                } else if (c === '"') {
                    enComillas = false;
                } else {
                    actual += c;
                }
            } else if (c === '"') {
                enComillas = true;
            } else if (c === sep) {
                valores.push(actual);
                actual = "";
            } else {
                actual += c;
            }
        }
        valores.push(actual);
        return valores.map((v) => v.trim());
    };

    /** Divide el contenido en líneas lógicas (un salto de línea dentro de comillas no corta la fila). */
    const dividirLineas = (contenido) => {
        const lineas = [];
        let actual = "";
        let enComillas = false;
        for (let i = 0; i < contenido.length; i++) {
            const c = contenido[i];
            if (c === '"') enComillas = !enComillas;
            if (!enComillas && (c === "\n" || c === "\r")) {
                if (c === "\r" && contenido[i + 1] === "\n") i++;
                lineas.push(actual);
                actual = "";
            } else {
                actual += c;
            }
        }
        if (actual.length) lineas.push(actual);
        return lineas;
    };

    /**
     * Convierte un texto numérico del CSV a número. Acepta "2", "2.5", "2,5", "1.234,50", "1,234.50".
     * @returns {number|null} null si viene vacío; NaN si no es numérico
     */
    const parsearNumero = (valor) => {
        let s = String(valor === null || valor === undefined ? "" : valor).trim().replace(/\s/g, "");
        if (s === "") return null;
        const tieneComa = s.includes(",");
        const tienePunto = s.includes(".");
        if (tieneComa && tienePunto) {
            s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
        } else if (tieneComa) {
            s = s.replace(",", ".");
        }
        return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
    };

    /** Normaliza un identificador entero (cuenta, CRG, ID de artículo): quita ".0", ",00" y espacios. */
    const parsearIdentificador = (valor) => {
        const s = String(valor === null || valor === undefined ? "" : valor).trim().replace(/\s/g, "");
        if (s === "") return "";
        const m = s.match(/^(\d+)(?:[.,]0+)?$/);
        return m ? m[1] : null;
    };

    /**
     * Lee el contenido del CSV.
     * @param {string} contenido
     * @returns {{ filas: Array<object>, errores: string[], separador: string, columnas: object }}
     *          fila = { fila, cuenta, crg, idArticulo, cantidadFinal, valorUnitario, errores: string[] }
     */
    function parsearCsv(contenido) {
        const errores = [];
        const texto = String(contenido || "").replace(/^﻿/, "");
        const lineas = dividirLineas(texto).filter((l) => l.trim() !== "");
        if (lineas.length < 2) return { filas: [], errores: ["El archivo no tiene filas de datos."], separador: null, columnas: {} };

        const encabezado = lineas[0];
        const separador = (encabezado.match(/;/g) || []).length >= (encabezado.match(/,/g) || []).length ? ";" : ",";
        const nombres = separarLinea(encabezado, separador).map(normalizarEncabezado);

        const columnas = {};
        Object.keys(COLUMNAS_CSV).forEach((clave) => {
            const def = COLUMNAS_CSV[clave];
            const indice = nombres.findIndex((n) => def.alias.map(normalizarEncabezado).includes(n));
            if (indice >= 0) columnas[clave] = indice;
            else if (def.obligatoria) errores.push(`Falta la columna obligatoria ${def.oficial} (alias aceptados: ${def.alias.join(", ")}).`);
        });
        if (errores.length) return { filas: [], errores, separador, columnas };

        const filas = [];
        for (let i = 1; i < lineas.length; i++) {
            const valores = separarLinea(lineas[i], separador);
            if (valores.every((v) => v === "")) continue;
            const v = (clave) => (columnas[clave] === undefined ? "" : valores[columnas[clave]] || "");
            const fila = { fila: i + 1, errores: [] };

            fila.cuenta = parsearIdentificador(v("CUENTA"));
            fila.crg = parsearIdentificador(v("CRG_CORREL"));
            fila.idArticulo = parsearIdentificador(v("ID_ARTICULO"));
            fila.cantidadFinal = parsearNumero(v("CANTIDAD_FINAL"));
            fila.valorUnitario = parsearNumero(v("VALOR_UNITARIO"));

            if (!fila.cuenta) fila.errores.push(fila.cuenta === "" ? "CUENTA vacía" : `CUENTA inválida (${v("CUENTA")})`);
            if (!fila.crg) fila.errores.push(fila.crg === "" ? "CRG_CORREL vacío" : `CRG_CORREL inválido (${v("CRG_CORREL")})`);
            if (!fila.idArticulo) fila.errores.push(fila.idArticulo === "" ? "ID_ARTICULO vacío" : `ID_ARTICULO inválido (${v("ID_ARTICULO")})`);
            if (fila.cantidadFinal === null) fila.errores.push("CANTIDAD_FINAL vacía");
            else if (Number.isNaN(fila.cantidadFinal)) fila.errores.push(`CANTIDAD_FINAL no numérica (${v("CANTIDAD_FINAL")})`);
            else if (fila.cantidadFinal < 0) fila.errores.push(`CANTIDAD_FINAL negativa (${fila.cantidadFinal})`);
            if (fila.valorUnitario !== null) {
                if (Number.isNaN(fila.valorUnitario)) fila.errores.push(`VALOR_UNITARIO no numérico (${v("VALOR_UNITARIO")})`);
                else if (fila.valorUnitario < 0) fila.errores.push(`VALOR_UNITARIO negativo (${fila.valorUnitario})`);
            }
            if (fila.cuenta === null) fila.cuenta = v("CUENTA");
            if (fila.crg === null) fila.crg = v("CRG_CORREL");
            if (fila.idArticulo === null) fila.idArticulo = v("ID_ARTICULO");
            filas.push(fila);
        }
        if (!filas.length) errores.push("El archivo no tiene filas de datos.");
        return { filas, errores, separador, columnas };
    }

    /** Plantilla CSV de ejemplo. */
    function plantilla() {
        return ["CUENTA;CRG_CORREL;ID_ARTICULO;CANTIDAD_FINAL;VALOR_UNITARIO", "92783071;1;251;2;", "92783071;7;1121;0;", "212620007;3;5365;0;1250"].join("\r\n");
    }

    return { parsearCsv, parsearNumero, plantilla };
});
