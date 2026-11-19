/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Formato de números, fechas y texto para pantallas y archivos.
 */
define([], () => {
    /** Redondeo a 5 decimales (cantidades de inventario). */
    const r5 = (n) => Math.round(Number(n) * 100000) / 100000;

    /** Número para mostrar (separadores es-CL); vacío si no hay valor. */
    const num = (v, decimales = 5) =>
        v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "" : Number(v).toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: decimales });

    /** Número para mensajes (sin separador de miles). */
    const txt = (n) => String(r5(n));

    /** Escapa HTML. */
    const esc = (v) =>
        String(v === null || v === undefined ? "" : v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    /** Date → 'YYYY-MM-DD' (fecha local). */
    const fechaIso = (d) => {
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };

    /** 'YYYY-MM-DD' → 'DD/MM/YYYY' */
    const isoATexto = (iso) => {
        if (!iso) return "";
        const [a, m, d] = String(iso).substring(0, 10).split("-");
        return d && m && a ? `${d}/${m}/${a}` : String(iso);
    };

    /** 'YYYY-MM-DD' → Date local */
    const isoAFecha = (iso) => {
        const [a, m, d] = String(iso).split("-").map(Number);
        return new Date(a, m - 1, d);
    };

    /** Marca de tiempo para nombres de archivo: YYYYMMDD_HHMMSS */
    const marcaTiempo = () => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    };

    return { r5, num, txt, esc, fechaIso, isoATexto, isoAFecha, marcaTiempo };
});
