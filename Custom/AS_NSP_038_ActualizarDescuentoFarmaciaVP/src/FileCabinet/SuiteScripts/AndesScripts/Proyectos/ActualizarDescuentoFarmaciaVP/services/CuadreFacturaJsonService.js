/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Cuadre de una factura de venta contra el JSON de la integración y lo pagado.
 *
 *              Por factura (record.load en modo dinámico, para que NetSuite recalcule importes e impuestos):
 *               0. Validaciones: factura abierta y Importe − Importe restante = pagado del JSON (si cambió, se omite).
 *               1. Emparejar cada artículo con su producto del JSON por orden (ID de artículo, cantidad y neto).
 *                  El descuento es el artículo de tipo Servicio con "descuento" en el nombre, debajo del artículo.
 *               2. Casuística A: la cantidad del descuento se iguala a la del artículo (se conserva la tarifa).
 *               3. Casuística B: por producto, artículo + IVA + descuento + IVA del descuento debe ser igual al
 *                  total del JSON; la diferencia se corrige en el importe de impuesto de la línea de descuento
 *                  (o del artículo si el producto no tiene descuento). Más del tope → revisión manual.
 *               4. El total de la factura debe quedar igual a la suma de los totales del JSON.
 *               5. Casuística C: si lo pagado difiere del total por la ley de redondeo (pago en efectivo, dentro
 *                  del rango y con efectivo múltiplo de 10), la diferencia se carga a la línea del artículo de redondeo.
 *               6. Se guarda (salvo simulación) y se verifica que el importe restante quede en 0.
 *              Nada se guarda si algún paso falla: la factura queda como estaba y el motivo va al log.
 */
define(["N/record", "N/search", "../constants/CuadreFacturaJsonConstants"], (record, search, CONST) => {
    const { CAMPOS: C, REGLAS, RESULTADO } = CONST;
    const S = C.SUBLISTA;

    const r2 = (n) => Math.round(Number(n) * 100) / 100;
    const num = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    /** Redondeo a la precisión de la moneda (CLP = 0 decimales), mitad hacia arriba en valor absoluto. */
    const redondearMoneda = (n) => {
        const f = Math.pow(10, REGLAS.DECIMALES_MONEDA);
        return (Math.sign(n) * Math.round(Math.abs(Number(n)) * f)) / f;
    };
    const igual = (a, b) => Math.abs(Number(a) - Number(b)) <= REGLAS.EPSILON;
    const normalizar = (t) =>
        String(t || "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase();

    /** Error de negocio: detiene la factura con un resultado y un mensaje. */
    class Detencion extends Error {
        constructor(resultado, mensaje) {
            super(mensaje);
            this.resultado = resultado;
        }
    }
    const detener = (resultado, mensaje) => {
        throw new Detencion(resultado, mensaje);
    };

    // ── JSON ──────────────────────────────────────────────────────────────────

    /** Datos del JSON de la integración: productos, total (boleta), pagado y pagado en efectivo. */
    const leerJson = (texto) => {
        let json;
        try {
            json = typeof texto === "string" ? JSON.parse(texto) : texto;
        } catch (e) {
            detener(RESULTADO.ERROR, `El JSON no es válido: ${e.message}`);
        }
        const productos = (json.detalleProductos || []).map((p, i) => ({
            n: i + 1,
            articulo: String(p.articulo || "").trim(),
            cantidad: num(p.cantidad),
            valorUnitarioNeto: num(p.valorUnitarioNeto),
            descuento: num(p.descuento),
            total: num(p.total)
        }));
        const formas = (json.detalleFormaPago || []).map((f) => ({ tipo: String(f.tipoFormaPago || "").toUpperCase(), monto: num(f.monto) }));
        if (!productos.length) detener(RESULTADO.ERROR, "El JSON no tiene detalleProductos.");
        if (!formas.length) detener(RESULTADO.ERROR, "El JSON no tiene detalleFormaPago.");
        return {
            productos,
            formas,
            totalJson: r2(productos.reduce((s, p) => s + p.total, 0)),
            pagado: r2(formas.reduce((s, f) => s + f.monto, 0)),
            efectivo: r2(formas.filter((f) => f.tipo === REGLAS.FORMA_PAGO_EFECTIVO).reduce((s, f) => s + f.monto, 0))
        };
    };

    /**
     * ¿La diferencia pagado − total JSON es redondeo de efectivo? Devuelve el motivo si no lo es.
     * @returns {string|null}
     */
    const motivoPagoNoRedondeo = (diferencia, datos, rango) => {
        if (!datos.efectivo) return `Diferencia de pago ${diferencia} sin pago en efectivo.`;
        if (Math.abs(diferencia) > rango) return `Diferencia de pago ${diferencia} fuera del rango de redondeo (±${rango}).`;
        if (Math.abs(datos.efectivo % REGLAS.MULTIPLO_EFECTIVO) > REGLAS.EPSILON) return `El monto en efectivo (${datos.efectivo}) no termina en 0: no es redondeo.`;
        return null;
    };

    // ── Factura ───────────────────────────────────────────────────────────────

    const esDescuento = (l) => l.tipo === REGLAS.TIPO_DESCUENTO && normalizar(l.nombre).includes(REGLAS.TEXTO_DESCUENTO);

    /** Líneas actuales de la sublista de artículos. */
    const leerLineas = (rec) => {
        const total = rec.getLineCount({ sublistId: S });
        const lineas = [];
        for (let i = 0; i < total; i++) {
            const v = (fieldId) => rec.getSublistValue({ sublistId: S, fieldId, line: i });
            let nombre = "";
            try {
                nombre = rec.getSublistText({ sublistId: S, fieldId: C.ARTICULO, line: i }) || "";
            } catch (e) {
                nombre = "";
            }
            lineas.push({
                indice: i,
                linea: v(C.LINEA),
                articulo: String(v(C.ARTICULO) || ""),
                nombre,
                tipo: v(C.TIPO_ARTICULO) || "",
                cantidad: num(v(C.CANTIDAD)),
                tarifa: num(v(C.TARIFA)),
                importe: num(v(C.IMPORTE)),
                impuesto: num(v(C.IMPUESTO))
            });
        }
        return lineas;
    };

    /**
     * Empareja las líneas con los productos del JSON. Las líneas del artículo de redondeo se apartan.
     * @returns {{ pares: {producto, articulo, descuento}[], redondeo: object[] }}
     */
    const emparejar = (lineas, productos, articuloRedondeo) => {
        const redondeo = lineas.filter((l) => articuloRedondeo && l.articulo === String(articuloRedondeo));
        const items = lineas.filter((l) => !(articuloRedondeo && l.articulo === String(articuloRedondeo)));
        const pares = [];
        let p = 0;
        for (let i = 0; i < items.length; i++) {
            const art = items[i];
            if (esDescuento(art)) detener(RESULTADO.ERROR, `Línea ${art.linea}: descuento sin artículo encima.`);
            const producto = productos[p++];
            if (!producto) detener(RESULTADO.ERROR, `Línea ${art.linea} (${art.nombre}): no tiene producto en el JSON.`);
            const desc = items[i + 1] && esDescuento(items[i + 1]) ? items[i + 1] : null;
            if (desc) i++;

            const etiqueta = `Producto ${producto.n} (línea ${art.linea}, ${art.nombre})`;
            if (art.articulo !== producto.articulo) detener(RESULTADO.ERROR, `${etiqueta}: artículo ${art.articulo} distinto al del JSON (${producto.articulo}).`);
            if (!igual(art.cantidad, producto.cantidad)) detener(RESULTADO.ERROR, `${etiqueta}: cantidad ${art.cantidad} distinta al JSON (${producto.cantidad}).`);
            if (Math.abs(art.importe - producto.cantidad * producto.valorUnitarioNeto) > 0.5) {
                detener(RESULTADO.ERROR, `${etiqueta}: neto ${art.importe} distinto al JSON (${producto.cantidad} × ${producto.valorUnitarioNeto}).`);
            }
            if (producto.descuento > 0 && !desc) detener(RESULTADO.ERROR, `${etiqueta}: el JSON tiene ${producto.descuento}% de descuento y la factura no tiene línea de descuento.`);
            if (!(producto.descuento > 0) && desc) detener(RESULTADO.ERROR, `${etiqueta}: la factura tiene descuento y el JSON no.`);
            pares.push({ producto, articulo: art, descuento: desc });
        }
        if (p !== productos.length) detener(RESULTADO.ERROR, `El JSON tiene ${productos.length} productos y la factura ${p}.`);
        return { pares, redondeo };
    };

    /** Casuística A: deja la cantidad del artículo en la línea de descuento conservando su tarifa. */
    const corregirCantidadDescuento = (rec, par) => {
        const { articulo, descuento } = par;
        rec.selectLine({ sublistId: S, line: descuento.indice });
        rec.setCurrentSublistValue({ sublistId: S, fieldId: C.CANTIDAD, value: articulo.cantidad });
        // Cambiar la cantidad puede volver a obtener el precio: se conserva la tarifa original
        if (!igual(rec.getCurrentSublistValue({ sublistId: S, fieldId: C.TARIFA }), descuento.tarifa)) {
            rec.setCurrentSublistValue({ sublistId: S, fieldId: C.TARIFA, value: descuento.tarifa });
        }
        // La tarifa del descuento puede tener decimales (747,1): el importe se redondea a la precisión de la
        // moneda, igual que NetSuite (2 × −747,1 = −1.494,2 → −1.494). Solo se fija si NetSuite dejó otro valor.
        const importe = redondearMoneda(articulo.cantidad * descuento.tarifa);
        if (!igual(rec.getCurrentSublistValue({ sublistId: S, fieldId: C.IMPORTE }), importe)) {
            rec.setCurrentSublistValue({ sublistId: S, fieldId: C.IMPORTE, value: importe });
        }
        rec.commitLine({ sublistId: S });
        const importeFinal = num(rec.getSublistValue({ sublistId: S, fieldId: C.IMPORTE, line: descuento.indice }));
        return { linea: descuento.linea, cantidadAntes: descuento.cantidad, cantidadDespues: articulo.cantidad, importeAntes: descuento.importe, importeDespues: importeFinal };
    };

    /** Casuística B: fija el importe de impuesto de una línea y verifica que NetSuite lo conserve. */
    const fijarImpuesto = (rec, linea, impuesto) => {
        rec.selectLine({ sublistId: S, line: linea.indice });
        rec.setCurrentSublistValue({ sublistId: S, fieldId: C.IMPUESTO, value: impuesto });
        rec.commitLine({ sublistId: S });
        const guardado = num(rec.getSublistValue({ sublistId: S, fieldId: C.IMPUESTO, line: linea.indice }));
        if (!igual(guardado, impuesto)) detener(RESULTADO.ERROR, `Línea ${linea.linea}: NetSuite no conservó el impuesto editado (${impuesto} → quedó ${guardado}).`);
    };

    /** Casuística C: agrega o actualiza la línea del artículo de redondeo. */
    const fijarRedondeo = (rec, existentes, monto, cfg, primerArticulo) => {
        if (existentes.length > 1) detener(RESULTADO.ERROR, "La factura tiene más de una línea del artículo de redondeo.");
        if (existentes.length) {
            rec.selectLine({ sublistId: S, line: existentes[0].indice });
        } else {
            rec.selectNewLine({ sublistId: S });
            rec.setCurrentSublistValue({ sublistId: S, fieldId: C.ARTICULO, value: Number(cfg.articuloRedondeo) });
            C.COPIAR_EN_REDONDEO.forEach((campo) => {
                try {
                    const valor = rec.getSublistValue({ sublistId: S, fieldId: campo, line: primerArticulo.indice });
                    if (valor) rec.setCurrentSublistValue({ sublistId: S, fieldId: campo, value: valor });
                } catch (e) {
                    // El campo no existe en la línea o no aplica
                }
            });
        }
        rec.setCurrentSublistValue({ sublistId: S, fieldId: C.CANTIDAD, value: 1 });
        rec.setCurrentSublistValue({ sublistId: S, fieldId: C.TARIFA, value: monto });
        rec.setCurrentSublistValue({ sublistId: S, fieldId: C.IMPORTE, value: monto });
        if (cfg.impuestoRedondeo) rec.setCurrentSublistValue({ sublistId: S, fieldId: C.CODIGO_IMPUESTO, value: Number(cfg.impuestoRedondeo) });
        rec.commitLine({ sublistId: S });
    };

    const totalFactura = (rec) => r2(num(rec.getValue({ fieldId: "total" })));

    /** Estado, total e importe restante actuales. */
    const leerEstado = (id) => {
        const v = search.lookupFields({ type: search.Type.INVOICE, id: Number(id), columns: ["statusref", "amountremaining", "total", "tranid"] });
        const estado = Array.isArray(v.statusref) ? (v.statusref[0] || {}).value : v.statusref;
        return { estado: estado || "", restante: r2(num(v.amountremaining)), total: r2(num(v.total)), numero: v.tranid };
    };

    /**
     * Cuadra una factura.
     * @param {{ id: number, factura: string, json: string }} entrada - fila del CSV
     * @param {{ simulacion: boolean, articuloRedondeo: number, impuestoRedondeo: number, topeAjusteIva: number, rangoRedondeo: number }} cfg
     * @returns {{ resultado: string, factura: string, id: number, mensaje: string, cambios: object[], antes: object, despues: object }}
     */
    const cuadrar = (entrada, cfg) => {
        const salida = { id: Number(entrada.id), factura: entrada.factura, resultado: null, mensaje: "", cambios: [], antes: {}, despues: {} };
        try {
            const datos = leerJson(entrada.json);
            salida.antes = { totalJson: datos.totalJson, pagado: datos.pagado, efectivo: datos.efectivo };

            // 0. Factura sin cambios desde la exportación
            const estado = leerEstado(entrada.id);
            salida.factura = estado.numero || entrada.factura;
            Object.assign(salida.antes, { total: estado.total, restante: estado.restante, estado: estado.estado });
            if (estado.estado !== REGLAS.ESTADO_FACTURA_ABIERTA) detener(RESULTADO.OMITIDA, `La factura no está abierta (estado ${estado.estado || "desconocido"}).`);
            if (!igual(estado.total - estado.restante, datos.pagado)) {
                detener(RESULTADO.OMITIDA, `Lo aplicado en NetSuite (${r2(estado.total - estado.restante)}) no coincide con lo pagado del JSON (${datos.pagado}).`);
            }

            // Regla de redondeo antes de tocar nada (no depende de la factura)
            const difPago = r2(datos.pagado - datos.totalJson);
            if (!igual(difPago, 0)) {
                const motivo = motivoPagoNoRedondeo(difPago, datos, cfg.rangoRedondeo);
                if (motivo) detener(RESULTADO.REVISION_MANUAL, motivo);
                if (!cfg.articuloRedondeo) detener(RESULTADO.ERROR, "Falta el parámetro Artículo de redondeo para cargar la diferencia de pago.");
            }

            // 1. Emparejar
            const rec = record.load({ type: record.Type.INVOICE, id: Number(entrada.id), isDynamic: true });
            let { pares, redondeo } = emparejar(leerLineas(rec), datos.productos, cfg.articuloRedondeo);

            // 2. Casuística A
            pares
                .filter((p) => p.descuento && !igual(p.descuento.cantidad, p.articulo.cantidad))
                .forEach((p) => salida.cambios.push({ tipo: "A", producto: p.producto.n, articulo: p.articulo.nombre, articuloId: p.articulo.articulo, ...corregirCantidadDescuento(rec, p) }));
            if (salida.cambios.length) ({ pares, redondeo } = emparejar(leerLineas(rec), datos.productos, cfg.articuloRedondeo));

            // 3. Casuística B (con los valores que recalculó NetSuite)
            pares.forEach((p) => {
                const { articulo, descuento, producto } = p;
                const bruto = r2(articulo.importe + articulo.impuesto + (descuento ? descuento.importe + descuento.impuesto : 0));
                const diferencia = r2(bruto - producto.total);
                if (igual(diferencia, 0)) return;
                const linea = descuento || articulo;
                if (Math.abs(diferencia) > cfg.topeAjusteIva) {
                    detener(RESULTADO.REVISION_MANUAL, `Producto ${producto.n} (${articulo.nombre}): el bruto ${bruto} difiere del total del JSON ${producto.total} en ${diferencia}, supera el tope de ${cfg.topeAjusteIva}.`);
                }
                const nuevo = r2(linea.impuesto - diferencia);
                fijarImpuesto(rec, linea, nuevo);
                salida.cambios.push({
                    tipo: "B",
                    producto: producto.n,
                    articulo: articulo.nombre,
                    articuloId: articulo.articulo,
                    linea: linea.linea,
                    en: descuento ? "descuento" : "articulo",
                    impuestoAntes: linea.impuesto,
                    impuestoDespues: nuevo
                });
            });

            // 4. Total = total del JSON
            const totalLineas = r2(totalFactura(rec) - redondeo.reduce((s, l) => s + l.importe, 0));
            if (!igual(totalLineas, datos.totalJson)) detener(RESULTADO.ERROR, `Después del cuadre el total es ${totalLineas} y el del JSON ${datos.totalJson}.`);

            // 5. Casuística C
            const redondeoActual = r2(redondeo.reduce((s, l) => s + l.importe, 0));
            if (!igual(redondeoActual, difPago)) {
                if (igual(difPago, 0)) detener(RESULTADO.ERROR, "La factura tiene una línea de redondeo y lo pagado ya coincide con el JSON: revisar.");
                fijarRedondeo(rec, redondeo, difPago, cfg, pares[0].articulo);
                salida.cambios.push({ tipo: "C", articuloId: cfg.articuloRedondeo, linea: redondeo.length ? redondeo[0].linea : null, montoAntes: redondeoActual, montoDespues: difPago });
            }
            const totalFinal = totalFactura(rec);
            if (!igual(totalFinal, datos.pagado)) detener(RESULTADO.ERROR, `El total final (${totalFinal}) no coincide con lo pagado (${datos.pagado}).`);

            // 6. Guardar
            salida.despues = { total: totalFinal };
            if (!salida.cambios.length) {
                salida.resultado = RESULTADO.SIN_CAMBIO;
                salida.mensaje = "La factura ya cuadra con el JSON y lo pagado.";
                return salida;
            }
            if (cfg.simulacion) {
                salida.resultado = RESULTADO.SIMULADA;
                salida.mensaje = "Simulación: los cambios no se guardaron.";
                salida.despues.restante = r2(totalFinal - datos.pagado);
                return salida;
            }
            rec.save({ enableSourcing: false, ignoreMandatoryFields: true });
            const final = leerEstado(entrada.id);
            salida.despues = { total: final.total, restante: final.restante, estado: final.estado };
            salida.resultado = igual(final.restante, 0) ? RESULTADO.CORREGIDA : RESULTADO.ERROR;
            salida.mensaje = igual(final.restante, 0) ? "Factura cuadrada: importe restante 0." : `Se guardó pero el importe restante quedó en ${final.restante}.`;
            return salida;
        } catch (e) {
            salida.resultado = e instanceof Detencion ? e.resultado : RESULTADO.ERROR;
            salida.mensaje = e instanceof Detencion ? e.message : `Error: ${(e && (e.message || e.name)) || e}`;
            salida.cambios = salida.resultado === RESULTADO.ERROR || salida.resultado === RESULTADO.REVISION_MANUAL ? salida.cambios : [];
            if (salida.cambios.length) salida.mensaje += " No se guardó ningún cambio.";
            return salida;
        }
    };

    return { cuadrar, leerJson, motivoPagoNoRedondeo, emparejar, esDescuento };
});
