/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Corrección de una factura (la usa el reduce del Map/Reduce).
 *
 *              1. Solo se modifican las facturas POR_PROCESAR que el usuario dejó marcadas.
 *              2. Antes de tocar nada se confirma que la factura sigue abierta y con el mismo importe restante.
 *              3. record.load (modo dinámico) y se vuelve a aplicar la misma regla de DeteccionService sobre
 *                 la sublista de artículos: cada descuento validado debe seguir debajo del mismo artículo y
 *                 con las mismas cantidades; si algo cambió no se guarda nada y la factura queda con error.
 *              4. En cada descuento con diferencia se deja la cantidad del artículo (en positivo; la tarifa
 *                 negativa del descuento se conserva) y se confirma el importe = cantidad × tarifa.
 *              5. Se guarda una sola vez y se lee el nuevo importe restante.
 *
 *              Devuelve una fila por línea de descuento con `estado` = clave de ESTADO_LINEA.
 */
define(["N/record", "N/log", "../constants/ActualizarDescuentoFarmaciaVPConstants", "../repositories/FacturaRepository", "./DeteccionService"], (
    record,
    nLog,
    CONST,
    facturaRepo,
    deteccion
) => {
    const { CLASIFICACION, REGLAS } = CONST;
    const SUBLISTA = "item";

    const r2 = (n) => Math.round(Number(n) * 100) / 100;
    const r5 = (n) => Math.round(Number(n) * 100000) / 100000;
    const txt = (n) => String(r5(n));
    const mensajeError = (e) => (e && (e.message || e.name)) || String(e);

    /** Fila base del detalle a partir de una línea validada. */
    const filaBase = (f, l = {}) => ({
        facturaId: f.id,
        facturaNumero: f.numero,
        lineaArticulo: l.lineaArticulo,
        articuloId: l.articuloId,
        articuloNombre: l.articuloNombre,
        cantArticulo: l.cantArticulo,
        lineaDescuento: l.lineaDescuento,
        descuentoId: l.descuentoId,
        descuentoNombre: l.descuentoNombre,
        cantDescuento: l.cantDescuento,
        cantDescuentoDespues: l.cantDescuento,
        tarifaDescuento: l.tarifaDescuento,
        importeDescuento: l.importeDescuento,
        importeDescuentoDespues: l.importeDescuento,
        restanteAntes: f.restante,
        restanteEsperado: f.restanteEsperado,
        restanteDespues: null
    });

    /** Una fila por línea validada (o una sola si la factura no tiene líneas con diferencia). */
    const filasConEstado = (f, estado, mensaje) => {
        const lineas = f.lineas && f.lineas.length ? f.lineas : [{}];
        return lineas.map((l) => ({ ...filaBase(f, l), estado, mensaje }));
    };

    /** Líneas actuales de la sublista de artículos, con la misma forma que usa DeteccionService. */
    const leerLineas = (rec) => {
        const total = rec.getLineCount({ sublistId: SUBLISTA });
        const lineas = [];
        for (let i = 0; i < total; i++) {
            const v = (fieldId) => rec.getSublistValue({ sublistId: SUBLISTA, fieldId, line: i });
            let nombre = "";
            try {
                nombre = rec.getSublistText({ sublistId: SUBLISTA, fieldId: "item", line: i }) || "";
            } catch (e) {
                nombre = "";
            }
            const tarifa = Number(v("rate"));
            lineas.push({
                indice: i,
                linea: Number(v("line")),
                articuloId: Number(v("item")) || null,
                nombre,
                nombreBusqueda: nombre,
                tipo: v("itemtype") || "",
                cantidad: Math.abs(Number(v("quantity")) || 0),
                tarifa: Number.isFinite(tarifa) ? Math.abs(tarifa) : null,
                tarifaConSigno: Number.isFinite(tarifa) ? tarifa : null,
                importe: Math.abs(Number(v("amount")) || 0),
                esImpuesto: false
            });
        }
        return lineas;
    };

    /**
     * Revisa cada línea validada contra la factura actual.
     * @returns {{ pendientes: object[], sinCambio: object[], error: string|null }}
     */
    const compararConValidacion = (f, actuales) => {
        const items = actuales.filter((l) => !l.esImpuesto);
        const pendientes = [];
        const sinCambio = [];
        for (const v of f.lineas) {
            const i = items.findIndex((l) => l.linea === Number(v.lineaDescuento));
            const descuento = items[i];
            const articulo = items[i - 1];
            if (!descuento || !deteccion.esDescuento(descuento)) return { pendientes, sinCambio, error: `No se encontró la línea de descuento ${v.lineaDescuento} en la factura.` };
            if (!articulo || articulo.linea !== Number(v.lineaArticulo)) {
                return { pendientes, sinCambio, error: `El descuento de la línea ${v.lineaDescuento} ya no está debajo del artículo de la línea ${v.lineaArticulo}.` };
            }
            if (Math.abs(articulo.cantidad - descuento.cantidad) <= REGLAS.EPSILON) {
                sinCambio.push(v);
                continue;
            }
            if (Math.abs(articulo.cantidad - Number(v.cantArticulo)) > REGLAS.EPSILON || Math.abs(descuento.cantidad - Number(v.cantDescuento)) > REGLAS.EPSILON) {
                return {
                    pendientes,
                    sinCambio,
                    error: `Las cantidades de las líneas ${v.lineaArticulo}/${v.lineaDescuento} cambiaron desde la validación (artículo ${txt(articulo.cantidad)}, descuento ${txt(descuento.cantidad)}). Revalide.`
                };
            }
            pendientes.push({ validada: v, articulo, descuento });
        }
        return { pendientes, sinCambio, error: null };
    };

    /** Deja la cantidad del artículo en la línea de descuento, conservando la tarifa. @returns {number} importe final */
    const corregirLinea = (rec, { articulo, descuento }) => {
        rec.selectLine({ sublistId: SUBLISTA, line: descuento.indice });
        const tarifaOriginal = descuento.tarifaConSigno;
        rec.setCurrentSublistValue({ sublistId: SUBLISTA, fieldId: "quantity", value: articulo.cantidad });

        // Cambiar la cantidad puede volver a obtener el precio: se conserva la tarifa original del descuento
        const tarifaActual = Number(rec.getCurrentSublistValue({ sublistId: SUBLISTA, fieldId: "rate" }));
        if (tarifaOriginal !== null && Math.abs(tarifaActual - tarifaOriginal) > REGLAS.EPSILON) {
            rec.setCurrentSublistValue({ sublistId: SUBLISTA, fieldId: "rate", value: tarifaOriginal });
        }
        const importeEsperado = r2(articulo.cantidad * (tarifaOriginal !== null ? tarifaOriginal : Number(rec.getCurrentSublistValue({ sublistId: SUBLISTA, fieldId: "rate" }))));
        const importeActual = Number(rec.getCurrentSublistValue({ sublistId: SUBLISTA, fieldId: "amount" }));
        if (Math.abs(importeActual - importeEsperado) > 0.005) {
            rec.setCurrentSublistValue({ sublistId: SUBLISTA, fieldId: "amount", value: importeEsperado });
        }
        rec.commitLine({ sublistId: SUBLISTA });
        return importeEsperado;
    };

    /**
     * Procesa una factura de la validación.
     * @param {object} f - factura del JSON de validación (con `seleccionada` y `tolerancia`)
     * @returns {object[]} filas del detalle
     */
    const procesarFactura = (f) => {
        if (f.clasificacion !== CLASIFICACION.POR_PROCESAR.codigo) return filasConEstado(f, "NO_PROCESABLE", f.motivo);
        if (!f.seleccionada) return filasConEstado(f, "OMITIDA", "Desmarcada en la validación: no se modificó.");

        // 1. Estado e importe restante actuales
        const actual = facturaRepo.obtenerEstado(f.id);
        if (actual.estado !== REGLAS.ESTADO_FACTURA_ABIERTA) {
            return filasConEstado(f, "ERROR", `La factura ya no está abierta (estado: ${actual.estado || "desconocido"}). No se modificó.`);
        }
        if (Math.abs(actual.restante - Number(f.restante)) > REGLAS.TOLERANCIA_CAMBIO_RESTANTE) {
            return filasConEstado(f, "ERROR", `El importe restante cambió desde la validación (${txt(f.restante)} → ${txt(actual.restante)}). No se modificó; revalide.`);
        }

        // 2. Factura actual y comparación con lo validado
        const rec = record.load({ type: record.Type.INVOICE, id: Number(f.id), isDynamic: true });
        const { pendientes, sinCambio, error } = compararConValidacion(f, leerLineas(rec));
        if (error) return filasConEstado(f, "ERROR", `${error} No se modificó la factura.`);

        const filasSinCambio = sinCambio.map((v) => ({ ...filaBase(f, v), estado: "SIN_CAMBIO", mensaje: "El descuento ya tenía la cantidad del artículo." }));
        if (!pendientes.length) return filasSinCambio.map((r) => ({ ...r, restanteDespues: actual.restante }));

        // 3. Corrección y guardado (una sola vez por factura)
        const corregidas = [];
        try {
            pendientes.forEach((p) => corregidas.push({ ...p, importe: corregirLinea(rec, p) }));
            rec.save({ enableSourcing: true, ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error({ title: `AS_NSP_038 - Error al guardar ${f.numero}`, details: mensajeError(e) });
            return [
                ...pendientes.map((p) => ({ ...filaBase(f, p.validada), estado: "ERROR", mensaje: `No se pudo guardar la factura: ${mensajeError(e)}` })),
                ...filasSinCambio
            ];
        }

        // 4. Resultado
        let restanteDespues = null;
        try {
            restanteDespues = facturaRepo.obtenerEstado(f.id).restante;
        } catch (e) {
            restanteDespues = null;
        }
        const aviso =
            restanteDespues !== null && Math.abs(restanteDespues - Number(f.restanteEsperado)) > Number(f.tolerancia || 0)
                ? ` Atención: el importe restante quedó en ${txt(restanteDespues)} (esperado ${txt(f.restanteEsperado)}).`
                : "";
        const filas = corregidas.map((c) => ({
            ...filaBase(f, c.validada),
            cantDescuentoDespues: c.articulo.cantidad,
            importeDescuentoDespues: Math.abs(c.importe),
            restanteDespues,
            estado: "PROCESADA",
            mensaje: `Cantidad del descuento actualizada de ${txt(c.validada.cantDescuento)} a ${txt(c.articulo.cantidad)}. Importe restante ${txt(f.restante)} → ${
                restanteDespues === null ? "?" : txt(restanteDespues)
            }.${aviso}`
        }));
        nLog.audit({ title: `AS_NSP_038 - Factura ${f.numero} corregida`, details: `${corregidas.length} línea(s). Restante ${f.restante} → ${restanteDespues}` });
        return [...filas, ...filasSinCambio.map((r) => ({ ...r, restanteDespues }))];
    };

    return { procesarFactura };
});
