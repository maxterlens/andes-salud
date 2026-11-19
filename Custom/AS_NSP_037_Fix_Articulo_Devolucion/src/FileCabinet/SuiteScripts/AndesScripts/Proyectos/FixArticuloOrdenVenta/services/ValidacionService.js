/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Clasificación de cada fila del CSV contra su línea de OV.
 *              La misma función se usa en el Suitelet (validación) y en el Map/Reduce
 *              (revalidación antes de modificar), para que ambos decidan con la misma regla.
 *
 *              Casuísticas:
 *               - Fila inválida / duplicada con datos distintos / artículo inexistente o inactivo.
 *               - OV no encontrada, más de una OV abierta, OV cancelada/facturada/cerrada
 *                 (las OV no editables se ignoran si la cuenta tiene una sola OV abierta).
 *               - Línea no encontrada, CRG_CORREL repetido, línea cerrada o con facturación.
 *               - Mismo artículo: Sin cambio / Actualizar precio / Eliminar / Reducir / Aumentar.
 *               - Artículo distinto: Reemplazar (requiere confirmación en pantalla).
 *               - Aumento o reemplazo sin stock suficiente: No procesable (NetSuite lo rechazaría).
 *               - Ejecución en período cerrado: No procesable.
 */
define([
    "../constants/FixArticuloOrdenVentaConstants",
    "../repositories/OrdenVentaRepository",
    "../repositories/InventarioRepository",
    "./AsignadorLotesService"
], (CONST, ordenVentaRepo, inventarioRepo, asignadorService) => {
    const { ACCIONES_LINEA: ACCIONES, AJUSTES_EJECUCION, REGLAS } = CONST;
    const EPS = REGLAS.EPSILON;

    const r5 = (n) => Math.round(Number(n) * 100000) / 100000;
    const fmt = (n) => String(r5(n));
    const iguales = (a, b) => Math.abs(Number(a) - Number(b)) <= EPS;
    const esInventario = (tipo) => REGLAS.TIPOS_ITEM_INVENTARIO.includes(tipo);

    /** Estructura base de una línea de validación. */
    function lineaBase(fila) {
        return {
            clave: `${fila.cuenta}|${fila.crg}`,
            filas: [fila.fila],
            cuenta: String(fila.cuenta || ""),
            crg: String(fila.crg || ""),
            idArticuloCsv: fila.idArticulo ? String(fila.idArticulo) : "",
            cantidadFinal: Number.isFinite(fila.cantidadFinal) ? fila.cantidadFinal : null,
            valorUnitario: Number.isFinite(fila.valorUnitario) ? fila.valorUnitario : null,
            articuloCsvNombre: "",
            articuloCsvExiste: false,
            ovId: null,
            ovNumero: "",
            ovEstadoTexto: "",
            lineId: null,
            articuloOvId: null,
            articuloOvNombre: "",
            itemType: "",
            ubicacion: null,
            ubicacionNombre: "",
            cantidadOv: null,
            despachada: null,
            facturada: null,
            precioOv: null,
            precioNuevo: null,
            montoNuevo: null,
            conversion: 1,
            accion: "",
            accionTexto: "",
            procesable: false,
            requiereConfirmacion: false,
            confirmado: false,
            ajusteEjecucion: AJUSTES_EJECUCION.NINGUNO,
            ajusteEjecucionTexto: "",
            cantidadEjecucionObjetivo: null,
            ejecuciones: [],
            fechaEjecucionOriginal: null,
            mensaje: ""
        };
    }

    const marcar = (l, accion, mensaje) => {
        l.accion = accion.codigo;
        l.accionTexto = accion.texto;
        l.procesable = accion.procesable;
        if (mensaje) l.mensaje = mensaje;
        return l;
    };

    const noProcesable = (l, mensaje) => {
        l.requiereConfirmacion = false;
        l.ajusteEjecucion = AJUSTES_EJECUCION.NINGUNO;
        l.ajusteEjecucionTexto = "";
        return marcar(l, ACCIONES.NO_PROCESABLE, mensaje);
    };

    const nombresEjecuciones = (ejecuciones) => ejecuciones.map((e) => e.tranid || e.id).join(", ");

    /**
     * Ejecuciones que se tocan al bajar la línea de `despachada` a `objetivo`,
     * desde la más reciente. Devuelve las cantidades nuevas por Ejecución.
     */
    function planReduccion(ejecuciones, despachada, objetivo) {
        let porQuitar = r5(despachada - objetivo);
        const plan = [];
        for (const e of ejecuciones) {
            if (porQuitar <= EPS) break;
            const tomar = Math.min(e.cantidad, porQuitar);
            plan.push({ id: e.id, tranid: e.tranid, periodoCerrado: e.periodoCerrado, nuevaCantidad: r5(e.cantidad - tomar) });
            porQuitar = r5(porQuitar - tomar);
        }
        return plan;
    }

    /** Agrupa filas válidas por cuenta|CRG_CORREL y detecta duplicados. */
    function agruparFilas(filas) {
        const lineas = [];
        const grupos = new Map();
        for (const fila of filas) {
            if (fila.errores && fila.errores.length) {
                lineas.push(noProcesable(lineaBase(fila), `Fila inválida: ${fila.errores.join("; ")}`));
                continue;
            }
            const clave = `${fila.cuenta}|${fila.crg}`;
            if (!grupos.has(clave)) grupos.set(clave, []);
            grupos.get(clave).push(fila);
        }

        const candidatas = [];
        for (const grupo of grupos.values()) {
            const firma = (f) => `${f.idArticulo}|${f.cantidadFinal}|${f.valorUnitario === null ? "" : f.valorUnitario}`;
            const numeros = grupo.map((f) => f.fila);
            if (new Set(grupo.map(firma)).size > 1) {
                for (const f of grupo) {
                    const l = lineaBase(f);
                    l.filas = numeros;
                    lineas.push(noProcesable(l, `Filas duplicadas con datos distintos para la misma cuenta y CRG_CORREL (filas ${numeros.join(", ")})`));
                }
                continue;
            }
            const l = lineaBase(grupo[0]);
            l.filas = numeros;
            if (grupo.length > 1) l.avisoDuplicado = `Filas idénticas unificadas: ${numeros.join(", ")}`;
            candidatas.push(l);
        }
        return { lineas, candidatas };
    }

    /**
     * Valida y clasifica las filas del CSV.
     * @param {object} p
     * @param {number} p.subsidiaria
     * @param {Array} p.filas - ArchivoService.parsearCsv().filas (o filas reconstruidas desde el JSON)
     * @returns {{ lineas: Array<object>, resumen: object }}
     */
    function validar({ subsidiaria, filas }) {
        const { lineas, candidatas } = agruparFilas(filas);

        // OV por cuenta
        const ovsPorCuenta = ordenVentaRepo.buscarPorCuentas(subsidiaria, candidatas.map((c) => c.cuenta));
        const conOv = [];
        for (const l of candidatas) {
            const ovs = ovsPorCuenta.get(l.cuenta) || [];
            if (ovs.length === 0) {
                lineas.push(noProcesable(l, "No se encontró una OV para la cuenta en la subsidiaria seleccionada."));
                continue;
            }
            // Las OV cerradas, canceladas o facturadas no cuentan: solo se corrige una OV editable
            const editables = ovs.filter((o) => !REGLAS.ESTADOS_OV_NO_EDITABLES.includes(o.estado));
            const noEditables = ovs.filter((o) => REGLAS.ESTADOS_OV_NO_EDITABLES.includes(o.estado));
            const describirOvs = (lista) => lista.map((o) => `${o.tranid} (${o.estadoTexto})`).join(", ");
            if (editables.length === 0) {
                const ov = noEditables[0];
                if (noEditables.length === 1) {
                    l.ovId = ov.id;
                    l.ovNumero = ov.tranid;
                    l.ovEstadoTexto = ov.estadoTexto;
                }
                lineas.push(noProcesable(l, `${noEditables.length === 1 ? `La OV ${ov.tranid} está` : `Las OV ${describirOvs(noEditables)} están`} en un estado que no se puede modificar${noEditables.length === 1 ? ` (${ov.estadoTexto})` : ""}.`));
                continue;
            }
            if (editables.length > 1) {
                lineas.push(noProcesable(l, `La cuenta tiene más de una OV abierta en la subsidiaria: ${editables.map((o) => o.tranid).join(", ")}.`));
                continue;
            }
            const ov = editables[0];
            l.ovId = ov.id;
            l.ovNumero = ov.tranid;
            l.ovEstadoTexto = ov.estadoTexto;
            if (noEditables.length) l.avisoOvOmitidas = `Se omitió ${describirOvs(noEditables)}`;
            conOv.push(l);
        }

        // Líneas de OV, artículos del CSV y Ejecuciones
        const lineasOv = ordenVentaRepo.obtenerLineasPorCrg(conOv.map((l) => `${l.ovId}|${l.crg}`));
        const articulos = inventarioRepo.obtenerArticulos(conOv.map((l) => l.idArticuloCsv));

        const conLinea = [];
        for (const l of conOv) {
            const art = articulos.get(Number(l.idArticuloCsv));
            if (art) {
                l.articuloCsvExiste = true;
                l.articuloCsvNombre = `${art.codigo}${art.nombre && art.nombre !== art.codigo ? ` - ${art.nombre}` : ""}`;
                l.tipoArticuloCsv = art.tipo;
                l.esLoteCsv = art.esLote;
            }
            const coincidencias = lineasOv.get(`${l.ovId}|${l.crg}`) || [];
            if (coincidencias.length === 0) {
                lineas.push(noProcesable(l, "No se encontró la línea (CRG_CORREL) en la OV."));
                continue;
            }
            if (coincidencias.length > 1) {
                lineas.push(noProcesable(l, `El CRG_CORREL está repetido en la OV (${coincidencias.length} líneas).`));
                continue;
            }
            const lo = coincidencias[0];
            Object.assign(l, {
                lineId: lo.lineId,
                articuloOvId: lo.item,
                articuloOvNombre: lo.itemNombre,
                itemType: lo.itemType,
                ubicacion: lo.ubicacion,
                ubicacionNombre: lo.ubicacionNombre,
                cantidadOv: r5(lo.cantidad),
                despachada: r5(lo.despachada),
                facturada: r5(lo.facturada),
                precioOv: r5(lo.precio),
                conversion: lo.conversion,
                esLoteOv: lo.esLote,
                esSerieOv: lo.esSerie,
                cerrada: lo.cerrada
            });
            l.articuloCsv = art || null;
            conLinea.push(l);
        }

        const ejecucionesPorLinea = ordenVentaRepo.obtenerEjecucionesPorLinea(conLinea.filter((l) => l.despachada > EPS).map((l) => `${l.ovId}|${l.lineId}`));

        // Stock solo para aumentos y reemplazos con cantidad
        const necesitaStock = conLinea.filter((l) => {
            if (!Number.isFinite(l.cantidadFinal)) return false;
            const mismo = l.articuloCsv && Number(l.articuloCsv.id) === Number(l.articuloOvId);
            return mismo ? l.cantidadFinal > l.cantidadOv + EPS : l.cantidadFinal > EPS;
        });
        const itemsStock = necesitaStock.map((l) => Number(l.idArticuloCsv));
        const ubicacionesStock = necesitaStock.map((l) => l.ubicacion).filter(Boolean);
        const disponible = inventarioRepo.obtenerDisponibleUbicacion(itemsStock, ubicacionesStock);
        const asignador = itemsStock.length ? asignadorService.crearAsignador(itemsStock, ubicacionesStock, 0) : null;
        const consumoUbicacion = new Map();

        /**
         * Verifica y reserva stock (unidad base) para subir `cantidadBase` del ítem en la ubicación.
         * @returns {string|null} motivo si no alcanza
         */
        const reservarStock = (item, ubicacion, cantidadBase, requiereLotes) => {
            const clave = `${item}|${ubicacion}`;
            const usado = consumoUbicacion.get(clave) || 0;
            const libreUbicacion = (disponible.get(clave) || 0) - usado;
            if (libreUbicacion + EPS < cantidadBase) {
                return `No hay stock suficiente: requiere ${fmt(cantidadBase)} y hay ${fmt(Math.max(0, libreUbicacion))} disponible en la ubicación (unidad base).`;
            }
            if (requiereLotes && asignador) {
                const respaldo = asignador.snapshot();
                const reserva = asignador.reservar(item, ubicacion, cantidadBase);
                if (reserva.total + EPS < cantidadBase) {
                    asignador.restaurar(respaldo);
                    return `No hay lotes disponibles suficientes: requiere ${fmt(cantidadBase)} y hay ${fmt(reserva.total)} sin comprometer en otras OV.`;
                }
            }
            consumoUbicacion.set(clave, usado + cantidadBase);
            return null;
        };

        for (const l of conLinea) {
            l.ejecuciones = ejecucionesPorLinea.get(`${l.ovId}|${l.lineId}`) || [];
            l.fechaEjecucionOriginal = l.ejecuciones.length ? l.ejecuciones[0].fecha : null;
            lineas.push(clasificar(l, reservarStock));
            delete l.articuloCsv;
        }

        lineas.sort((a, b) => (a.filas[0] || 0) - (b.filas[0] || 0));
        lineas.forEach((l) => {
            for (const aviso of ["avisoDuplicado", "avisoOvOmitidas"]) {
                if (l[aviso]) l.mensaje = l.mensaje ? `${l.mensaje} ${l[aviso]}.` : `${l[aviso]}.`;
                delete l[aviso];
            }
        });
        return { lineas, resumen: resumir(lineas) };
    }

    /** Clasifica una línea que ya tiene su OV y su línea de OV. */
    function clasificar(l, reservarStock) {
        const art = l.articuloCsv;
        if (!art) return noProcesable(l, `El artículo ${l.idArticuloCsv} del CSV no existe en NetSuite.`);
        if (art.inactivo) return noProcesable(l, `El artículo ${l.articuloCsvNombre} está inactivo.`);
        if (l.cerrada) return noProcesable(l, "La línea de la OV está cerrada.");
        if (l.facturada > EPS) return noProcesable(l, `La línea tiene ${fmt(l.facturada)} facturado; no se puede modificar.`);
        if (REGLAS.TIPOS_ITEM_NO_SOPORTADOS.includes(l.itemType)) return noProcesable(l, `Tipo de artículo no soportado en la OV (${l.itemType}).`);

        const final = l.cantidadFinal;
        const cambiaPrecio = l.valorUnitario !== null && !iguales(l.valorUnitario, l.precioOv);
        l.precioNuevo = l.valorUnitario !== null ? r5(l.valorUnitario) : l.precioOv;
        l.montoNuevo = r5(l.precioNuevo * final);
        const textoPrecio = cambiaPrecio ? ` Precio ${fmt(l.precioOv)} → ${fmt(l.precioNuevo)}.` : "";
        const ejecucionesCerradas = (lista) => lista.filter((e) => e.periodoCerrado);

        // ── Artículo distinto: reemplazo ─────────────────────────────────────
        if (Number(art.id) !== Number(l.articuloOvId)) {
            if (REGLAS.TIPOS_ITEM_NO_SOPORTADOS.includes(art.tipo)) return noProcesable(l, `Tipo de artículo nuevo no soportado (${art.tipo}).`);
            if (l.despachada > EPS) {
                const cerradas = ejecucionesCerradas(l.ejecuciones);
                if (cerradas.length) return noProcesable(l, `Artículo distinto. La Ejecución ${nombresEjecuciones(cerradas)} está en un período cerrado.`);
            }
            const partes = [`Artículo distinto: la OV tiene ${l.articuloOvNombre} y el CSV indica ${l.articuloCsvNombre}.`];
            if (final > EPS) {
                if (esInventario(art.tipo)) {
                    if (art.esSerie) return noProcesable(l, `${partes[0]} El artículo nuevo usa número de serie; no soportado.`);
                    const motivo = reservarStock(art.id, l.ubicacion, final, art.esLote);
                    if (motivo) return noProcesable(l, `${partes[0]} ${motivo}`);
                }
                partes.push(`Si se confirma, se reemplaza por ${l.articuloCsvNombre} con cantidad ${fmt(final)} y el mismo CRG_CORREL.${textoPrecio}`);
            } else {
                partes.push("Si se confirma, como la cantidad final es 0 solo se quita la línea de la OV.");
            }
            if (l.despachada > EPS) {
                l.ajusteEjecucion = AJUSTES_EJECUCION.QUITAR;
                l.ajusteEjecucionTexto = `Desmarcar en ${nombresEjecuciones(l.ejecuciones)}`;
                if (final > EPS && esInventario(art.tipo)) {
                    l.ajusteEjecucion = AJUSTES_EJECUCION.CREAR;
                    l.ajusteEjecucionTexto += " y crear Ejecución del artículo nuevo";
                }
            } else if (final > EPS && esInventario(art.tipo)) {
                partes.push("La línea no tenía Ejecución; el autopicking ejecutará la línea nueva.");
            }
            l.requiereConfirmacion = true;
            l.cantidadEjecucionObjetivo = final;
            return marcar(l, ACCIONES.REEMPLAZAR, partes.join(" "));
        }

        // ── Mismo artículo ───────────────────────────────────────────────────
        if (iguales(final, l.cantidadOv)) {
            if (cambiaPrecio) return marcar(l, ACCIONES.ACTUALIZAR_PRECIO, `La cantidad ya es la correcta.${textoPrecio}`);
            l.precioNuevo = l.precioOv;
            return marcar(l, ACCIONES.SIN_CAMBIO, "La OV ya tiene la cantidad final.");
        }

        if (final < l.cantidadOv) {
            const accion = final <= EPS ? ACCIONES.ELIMINAR : ACCIONES.REDUCIR;
            let texto = final <= EPS ? "Se quita la línea de la OV." : `Se baja la cantidad de ${fmt(l.cantidadOv)} a ${fmt(final)}.`;
            if (l.despachada > final + EPS) {
                if (final <= EPS) {
                    const cerradas = ejecucionesCerradas(l.ejecuciones);
                    if (cerradas.length) return noProcesable(l, `La Ejecución ${nombresEjecuciones(cerradas)} está en un período cerrado.`);
                    l.ajusteEjecucion = AJUSTES_EJECUCION.QUITAR;
                    l.ajusteEjecucionTexto = `Desmarcar en ${nombresEjecuciones(l.ejecuciones)}`;
                    texto += " Se desmarca en su Ejecución (o se elimina si es su única línea).";
                } else {
                    const plan = planReduccion(l.ejecuciones, l.despachada, final);
                    const cerradas = plan.filter((p) => p.periodoCerrado);
                    if (cerradas.length) return noProcesable(l, `La Ejecución ${nombresEjecuciones(cerradas)} está en un período cerrado.`);
                    l.ajusteEjecucion = AJUSTES_EJECUCION.REDUCIR;
                    l.ajusteEjecucionTexto = plan.map((p) => `${p.tranid}: ${p.nuevaCantidad <= EPS ? "desmarcar" : `bajar a ${fmt(p.nuevaCantidad)}`}`).join("; ");
                    texto += " Se baja la Ejecución desde el último lote asignado.";
                }
            }
            l.cantidadEjecucionObjetivo = final;
            return marcar(l, accion, `${texto}${textoPrecio}`);
        }

        // Aumento
        const incremento = r5(final - l.cantidadOv);
        const incrementoBase = r5(incremento * (l.conversion || 1));
        let texto = `Se sube la cantidad de ${fmt(l.cantidadOv)} a ${fmt(final)}.`;
        if (esInventario(l.itemType)) {
            const completa = l.despachada > EPS && l.despachada + EPS >= l.cantidadOv;
            const requiereLotes = completa && (l.esLoteOv || l.esSerieOv);
            if (requiereLotes && l.esSerieOv) return noProcesable(l, "El artículo usa número de serie; no se puede aumentar automáticamente.");
            if (requiereLotes && !iguales(l.conversion, 1)) return noProcesable(l, "La línea usa una unidad con factor de conversión distinto de 1; ajuste manualmente.");
            if (completa && l.ejecuciones.length && l.ejecuciones[0].periodoCerrado) {
                return noProcesable(l, `La Ejecución ${l.ejecuciones[0].tranid} está en un período cerrado.`);
            }
            const motivo = reservarStock(l.articuloOvId, l.ubicacion, incrementoBase, requiereLotes);
            if (motivo) return noProcesable(l, `No hay stock suficiente para aumentar en ${fmt(incremento)}. ${motivo}`);
            if (completa && l.ejecuciones.length) {
                const ultima = l.ejecuciones[0];
                l.ajusteEjecucion = AJUSTES_EJECUCION.AUMENTAR;
                l.ajusteEjecucionTexto = `${ultima.tranid}: subir a ${fmt(ultima.cantidad + incremento)}`;
                texto += ` Se agrega ${fmt(incremento)} a la Ejecución ${ultima.tranid} con lotes FEFO.`;
            } else {
                texto += " La línea tiene cantidad pendiente de ejecutar; la completará el autopicking.";
            }
        }
        l.cantidadEjecucionObjetivo = final;
        return marcar(l, ACCIONES.AUMENTAR, `${texto}${textoPrecio}`);
    }

    /** Conteos por acción para la pantalla y el historial. */
    function resumir(lineas) {
        const porAccion = {};
        Object.values(ACCIONES).forEach((a) => {
            porAccion[a.codigo] = 0;
        });
        let procesar = 0;
        let porConfirmar = 0;
        for (const l of lineas) {
            porAccion[l.accion] = (porAccion[l.accion] || 0) + 1;
            if (l.procesable && !l.requiereConfirmacion) procesar++;
            if (l.requiereConfirmacion) porConfirmar++;
        }
        return { lineas: lineas.length, procesar, porConfirmar, porAccion };
    }

    /** Reconstruye las filas de entrada a partir de líneas ya validadas (para revalidar en el Map/Reduce). */
    function filasDesdeLineas(lineas) {
        return lineas.map((l) => ({
            fila: l.filas[0],
            cuenta: l.cuenta,
            crg: l.crg,
            idArticulo: l.idArticuloCsv,
            cantidadFinal: l.cantidadFinal,
            valorUnitario: l.valorUnitario,
            errores: []
        }));
    }

    return { validar, resumir, filasDesdeLineas };
});
