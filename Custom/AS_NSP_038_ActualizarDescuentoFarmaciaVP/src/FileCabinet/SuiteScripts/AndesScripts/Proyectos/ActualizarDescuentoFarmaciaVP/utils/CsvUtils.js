/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Lectura de CSV (RFC 4180): campos entre comillas con comas, saltos de línea y
 *              comillas dobles escapadas (""). Detecta el separador (coma o punto y coma) en la cabecera.
 */
define([], () => {
    /** Texto sin tildes, minúsculas y sin espacios ni signos (para comparar nombres de columna). */
    const normalizar = (texto) =>
        String(texto || "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

    /** Separador según la primera línea fuera de comillas. */
    const detectarSeparador = (contenido) => {
        let enComillas = false;
        let comas = 0;
        let puntoComa = 0;
        for (const c of contenido) {
            if (c === '"') enComillas = !enComillas;
            else if (!enComillas && (c === "\n" || c === "\r")) break;
            else if (!enComillas && c === ",") comas++;
            else if (!enComillas && c === ";") puntoComa++;
        }
        return puntoComa > comas ? ";" : ",";
    };

    /**
     * Convierte el contenido en filas.
     * @param {string} contenido
     * @returns {string[][]}
     */
    const parsear = (contenido) => {
        const texto = String(contenido || "").replace(/^﻿/, "");
        const sep = detectarSeparador(texto);
        const filas = [];
        let fila = [];
        let campo = "";
        let enComillas = false;
        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            if (enComillas) {
                if (c === '"') {
                    if (texto[i + 1] === '"') {
                        campo += '"';
                        i++;
                    } else enComillas = false;
                } else campo += c;
            } else if (c === '"') enComillas = true;
            else if (c === sep) {
                fila.push(campo);
                campo = "";
            } else if (c === "\n" || c === "\r") {
                if (c === "\r" && texto[i + 1] === "\n") i++;
                fila.push(campo);
                if (fila.some((v) => v !== "")) filas.push(fila);
                fila = [];
                campo = "";
            } else campo += c;
        }
        fila.push(campo);
        if (fila.some((v) => v !== "")) filas.push(fila);
        return filas;
    };

    /**
     * Filas como objetos usando la cabecera; las columnas se buscan por sus nombres aceptados.
     * @param {string} contenido
     * @param {Object<string, string[]>} columnas - { CLAVE: [nombres aceptados normalizados] }
     * @returns {{ registros: object[], faltantes: string[] }}
     */
    const leerRegistros = (contenido, columnas) => {
        const filas = parsear(contenido);
        if (!filas.length) return { registros: [], faltantes: Object.keys(columnas) };
        const cabecera = filas[0].map(normalizar);
        const indices = {};
        const faltantes = [];
        Object.keys(columnas).forEach((clave) => {
            const i = cabecera.findIndex((h) => columnas[clave].includes(h));
            if (i < 0) faltantes.push(clave);
            indices[clave] = i;
        });
        const registros = filas.slice(1).map((f, n) => {
            const r = { fila: n + 2 };
            Object.keys(indices).forEach((clave) => {
                r[clave] = indices[clave] >= 0 ? String(f[indices[clave]] || "").trim() : "";
            });
            return r;
        });
        return { registros, faltantes };
    };

    return { normalizar, parsear, leerRegistros };
});
