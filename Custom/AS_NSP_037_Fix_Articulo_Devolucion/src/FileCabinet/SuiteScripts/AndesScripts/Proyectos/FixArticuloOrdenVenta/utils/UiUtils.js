/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Componentes comunes de los formularios del Suitelet
 *              (mismo estilo que R003 ConsumoProrrateoInsumos): mensaje nativo, campos INLINE,
 *              tarjetas de resumen, botones de descarga, enlaces a registros, campos ocultos y
 *              filas de sublista.
 */
define(["N/ui/serverWidget", "N/ui/message", "N/url", "./FormatoUtils"], (serverWidget, message, url, formato) => {
    const { esc } = formato;

    /**
     * Mensaje de inicio nativo (NetSuite muestra uno solo por página).
     * @param {serverWidget.Form} form
     * @param {{tipo: string, titulo: string, texto: string}|null} m - tipo: CONFIRMATION | INFORMATION | WARNING | ERROR
     */
    const mensaje = (form, m) => {
        if (!m) return;
        form.addPageInitMessage({ type: message.Type[m.tipo] || message.Type.INFORMATION, title: m.titulo || "", message: m.texto || "" });
    };

    /** Campo de solo lectura. */
    const inline = (form, id, label, valor, container) => {
        const f = form.addField({ id, type: serverWidget.FieldType.TEXT, label, container });
        f.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        f.defaultValue = valor === null || valor === undefined ? "" : String(valor);
        return f;
    };

    /** Campo oculto. */
    const oculto = (form, id, valor, tipo = serverWidget.FieldType.TEXT) => {
        const f = form.addField({ id, type: tipo, label: id });
        f.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        f.defaultValue = valor === null || valor === undefined ? "" : String(valor);
        return f;
    };

    /** Bloque HTML dentro de un grupo de campos o pestaña. */
    const html = (form, id, contenido, container) => {
        const f = form.addField({ id, type: serverWidget.FieldType.INLINEHTML, label: " ", container });
        f.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDE });
        f.defaultValue = contenido;
        return f;
    };

    /** Tarjeta de resumen con borde superior de color. */
    const tarjeta = (titulo, valor, detalle, color) => `
        <div style="flex:1 1 140px;border:1px solid #d2d2d2;border-top:3px solid ${color};border-radius:4px;padding:8px 12px;background:#fff">
            <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.4px">${esc(titulo)}</div>
            <div style="font-size:20px;font-weight:bold;color:#111">${esc(valor)}</div>
            <div style="font-size:11px;color:#666">${esc(detalle || "")}</div>
        </div>`;

    const tarjetas = (lista) => `<div style="display:flex;flex-wrap:wrap;gap:10px;padding:6px 0;font-family:Arial,sans-serif">${lista.join("")}</div>`;

    /** Botón de descarga con estilo de enlace. */
    const boton = (href, texto) =>
        href
            ? `<a href="${esc(href)}" target="_blank" style="display:inline-block;margin:4px 6px 4px 0;padding:6px 12px;background:#356d8a;color:#fff;text-decoration:none;border-radius:3px;font-size:12px">⬇ ${esc(texto)}</a>`
            : "";

    /** Texto de ayuda gris. */
    const ayuda = (contenido) => `<div style="padding:6px 0;color:#555;font-size:12px;line-height:1.6">${contenido}</div>`;

    /** Enlace a un registro; texto plano si no hay ID o no se puede resolver la URL. */
    const enlace = (tipo, id, texto) => {
        if (!id) return esc(texto || "");
        try {
            return `<a href="${url.resolveRecord({ recordType: tipo, recordId: Number(id) })}" target="_blank">${esc(texto || id)}</a>`;
        } catch (e) {
            return esc(texto || id);
        }
    };

    /** Escribe una fila en una sublista LIST omitiendo los valores vacíos. */
    const fila = (sublista, linea, valores) => {
        Object.entries(valores).forEach(([id, valor]) => {
            if (valor !== "" && valor !== null && valor !== undefined) {
                sublista.setSublistValue({ id, line: linea, value: String(valor).substring(0, 3999) });
            }
        });
    };

    /** Agrega columnas de texto a una sublista: [[id, etiqueta, tipo?], ...] */
    const columnas = (sublista, definicion) =>
        definicion.forEach(([id, label, tipo]) => sublista.addField({ id, type: tipo || serverWidget.FieldType.TEXT, label }));

    return { mensaje, inline, oculto, html, tarjeta, tarjetas, boton, ayuda, enlace, fila, columnas };
});
