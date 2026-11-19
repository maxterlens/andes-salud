/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Archivos del proceso:
 *               - Lectura del CSV de entrada (separador ";" o "," detectado automáticamente,
 *                 comillas, BOM, decimales con coma).
 *               - Guardado en el File Cabinet del CSV de origen, del JSON con la validación
 *                 (fuente de verdad entre la validación y el Map/Reduce) y de los CSV de
 *                 validación y de resultado con todas las casuísticas.
 */
define(["N/file", "N/search", "N/record", "N/runtime", "../constants/FixArticuloOrdenVentaConstants"], (file, search, record, runtime, CONST) => {
    const { COLUMNAS_CSV, CARPETA_POR_DEFECTO, PARAMETROS } = CONST;

    // ── Lectura del CSV ────────────────────────────────────────────────────────

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

    // ── File Cabinet ───────────────────────────────────────────────────────────

    /** Carpeta de trabajo: parámetro del script o carpeta por defecto en la raíz (se crea si no existe). */
    function obtenerCarpeta() {
        let parametro = null;
        try {
            parametro = runtime.getCurrentScript().getParameter({ name: PARAMETROS.CARPETA });
        } catch (e) {
            parametro = null;
        }
        if (parametro) return Number(parametro);

        let existente = null;
        search
            .create({ type: search.Type.FOLDER, filters: [["name", "is", CARPETA_POR_DEFECTO], "AND", ["parent", "anyof", "@NONE@"]], columns: ["internalid"] })
            .run()
            .each((r) => {
                existente = Number(r.id);
                return false;
            });
        if (existente) return existente;

        const carpeta = record.create({ type: record.Type.FOLDER });
        carpeta.setValue({ fieldId: "name", value: CARPETA_POR_DEFECTO });
        return Number(carpeta.save());
    }

    const marcaTiempo = () => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    };

    const nombreSeguro = (nombre) => String(nombre || "archivo").replace(/[^\w.\-]+/g, "_").substring(0, 120);

    function guardar({ nombre, contenido, tipo, carpeta }) {
        const f = file.create({ name: nombre, fileType: tipo, contents: contenido, folder: Number(carpeta), encoding: file.Encoding.UTF_8 });
        return Number(f.save());
    }

    function guardarOrigen(contenido, nombreOriginal, carpeta) {
        return guardar({ nombre: `FAOV_${marcaTiempo()}_${nombreSeguro(nombreOriginal)}`, contenido, tipo: file.Type.CSV, carpeta });
    }

    function guardarDatos(datos, carpeta) {
        return guardar({ nombre: `FAOV_${marcaTiempo()}_datos.json`, contenido: JSON.stringify(datos), tipo: file.Type.JSON, carpeta });
    }

    function actualizarDatos(idArchivo, datos) {
        const original = file.load({ id: Number(idArchivo) });
        return guardar({ nombre: original.name, contenido: JSON.stringify(datos), tipo: file.Type.JSON, carpeta: original.folder });
    }

    function leerDatos(idArchivo) {
        return JSON.parse(file.load({ id: Number(idArchivo) }).getContents());
    }

    function leerContenido(idArchivo) {
        return file.load({ id: Number(idArchivo) }).getContents();
    }

    function carpetaDe(idArchivo) {
        return Number(file.load({ id: Number(idArchivo) }).folder);
    }

    function urlDe(idArchivo) {
        try {
            return file.load({ id: Number(idArchivo) }).url;
        } catch (e) {
            return null;
        }
    }

    // ── CSV de validación y de resultado ───────────────────────────────────────

    const celda = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const fmt = (n) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? "" : String(Math.round(Number(n) * 100000) / 100000).replace(".", ","));

    const COLUMNAS_SALIDA = [
        ["Fila", (l) => (l.filas || []).join(" ")],
        ["Cuenta", (l) => l.cuenta],
        ["CRG_CORREL", (l) => l.crg],
        ["OV", (l) => l.ovNumero],
        ["Estado OV", (l) => l.ovEstadoTexto],
        ["Artículo OV (ID)", (l) => l.articuloOvId],
        ["Artículo OV", (l) => l.articuloOvNombre],
        ["Artículo CSV (ID)", (l) => l.idArticuloCsv],
        ["Artículo CSV", (l) => l.articuloCsvNombre],
        ["Ubicación", (l) => l.ubicacionNombre],
        ["Cantidad OV", (l) => fmt(l.cantidadOv)],
        ["Despachada", (l) => fmt(l.despachada)],
        ["Cantidad final", (l) => fmt(l.cantidadFinal)],
        ["Precio actual", (l) => fmt(l.precioOv)],
        ["Precio nuevo", (l) => fmt(l.precioNuevo)],
        ["Monto resultante", (l) => fmt(l.montoNuevo)],
        ["Acción", (l) => l.accionTexto],
        ["Ajuste Ejecución", (l) => l.ajusteEjecucionTexto],
        ["Confirmado", (l) => (l.requiereConfirmacion ? (l.confirmado ? "Sí" : "No") : "")]
    ];

    const COLUMNAS_RESULTADO = [
        ["Estado", (l) => l.estado],
        ["Cantidad resultante", (l) => fmt(l.cantidadResultante)],
        ["Ejecuciones", (l) => (l.ejecucionesAfectadas || []).join(" ")],
        ["Lotes", (l) => l.lotes]
    ];

    const construirCsv = (lineas, columnas) => {
        const filas = [columnas.map((c) => celda(c[0])).join(";")];
        lineas.forEach((l) => filas.push(columnas.map((c) => celda(c[1](l))).join(";")));
        return `﻿${filas.join("\r\n")}`;
    };

    function guardarCsvValidacion(lineas, carpeta, nombreProceso) {
        const contenido = construirCsv(lineas, [...COLUMNAS_SALIDA, ["Mensaje", (l) => l.mensaje]]);
        return guardar({ nombre: `${nombreSeguro(nombreProceso)}_validacion.csv`, contenido, tipo: file.Type.CSV, carpeta });
    }

    function guardarCsvResultado(lineas, carpeta, nombreProceso) {
        const contenido = construirCsv(lineas, [...COLUMNAS_SALIDA, ...COLUMNAS_RESULTADO, ["Mensaje", (l) => l.mensaje]]);
        return guardar({ nombre: `${nombreSeguro(nombreProceso)}_resultado.csv`, contenido, tipo: file.Type.CSV, carpeta });
    }

    return {
        parsearCsv,
        parsearNumero,
        plantilla,
        obtenerCarpeta,
        guardarOrigen,
        guardarDatos,
        actualizarDatos,
        leerDatos,
        leerContenido,
        carpetaDe,
        urlDe,
        guardarCsvValidacion,
        guardarCsvResultado
    };
});
