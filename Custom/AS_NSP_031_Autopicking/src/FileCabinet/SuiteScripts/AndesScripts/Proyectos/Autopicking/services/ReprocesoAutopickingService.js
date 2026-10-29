/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Orquesta el reproceso de una Orden de Venta:
 *              valida la cola, crea las Ejecuciones pendientes, verifica el resultado
 *              contra NetSuite, clasifica la OV y registra el log
 *              (registro personalizado, o solo log de ejecución si opciones.registrarLog = false).
 */
define([
    "N/log",
    "../constants/AutopickingConstants",
    "../repositories/OrdenVentaRepository",
    "../repositories/InventarioRepository",
    "../repositories/ColaAutopickingRepository",
    "../repositories/LogAutopickingRepository",
    "./EjecucionOrdenService"
], (nLog, CONST, ordenVentaRepo, inventarioRepo, colaRepo, logRepo, ejecucionService) => {
    const { LOG, RESULTADO, REGLAS } = CONST;
    const EPS = REGLAS.EPSILON;
    const CLAVE_HOY = "HOY";

    const mensajeError = (e) => (e && (e.message || e.details)) || String(e);
    const redondear = (n) => Math.round(n * 100000) / 100000;
    const sumaPendiente = (lineas) => redondear(lineas.reduce((s, l) => s + l.pendiente, 0));

    /** "YYYY-MM-DD" -> Date al mediodía (evita corrimientos de día por zona horaria del servidor) */
    const fechaDesdeClave = (clave) => {
        if (!clave || clave === CLAVE_HOY) return null;
        const [a, m, d] = clave.split("-").map(Number);
        return new Date(a, m - 1, d, 12, 0, 0);
    };

    const esErrorPeriodo = (e) => /per[ií]odo|period/i.test(mensajeError(e));

    /**
     * Agrupa las líneas por ubicación y, si corresponde, por fecha de creación de la línea.
     */
    function agruparLineas(lineas, usarFechaLinea) {
        const grupos = new Map();
        for (const l of lineas) {
            const fechaClave = usarFechaLinea && l.fechaLinea ? l.fechaLinea : CLAVE_HOY;
            const clave = `${l.ubicacion}|${fechaClave}`;
            if (!grupos.has(clave)) {
                grupos.set(clave, { ubicacion: l.ubicacion, esAutopicking: l.esAutopicking, fechaClave, lineas: [] });
            }
            grupos.get(clave).lineas.push(l);
        }
        return [...grupos.values()];
    }

    /**
     * Intenta crear la Ejecución del grupo con dos defensas:
     *  1. Si la fecha de la línea cae en un período cerrado, reintenta con la fecha del día.
     *  2. Si el grupo tiene varias líneas y NetSuite rechaza el guardado, reintenta línea por línea
     *     para que una línea con problemas no bloquee a las demás.
     */
    function ejecutarGrupo(idOrdenVenta, grupo, asignador) {
        const ejecuciones = [];
        const lineasResultado = [];
        const errores = [];

        const intentar = (lineas, fecha) =>
            ejecucionService.crearEjecucion({
                idOrdenVenta,
                ubicacion: grupo.ubicacion,
                esAutopicking: grupo.esAutopicking,
                lineas,
                fecha,
                asignador
            });

        const intentarConFecha = (lineas) => {
            const fecha = fechaDesdeClave(grupo.fechaClave);
            try {
                return intentar(lineas, fecha);
            } catch (e) {
                if (fecha && esErrorPeriodo(e)) {
                    nLog.audit({ title: `AS_NSP_031 - OV ${idOrdenVenta}: período cerrado`, details: `Fecha ${grupo.fechaClave}; se reintenta con la fecha del día` });
                    return intentar(lineas, null);
                }
                throw e;
            }
        };

        try {
            const r = intentarConFecha(grupo.lineas);
            if (r.idEjecucion) ejecuciones.push(r.idEjecucion);
            lineasResultado.push(...r.lineas);
        } catch (eGrupo) {
            if (grupo.lineas.length === 1) {
                errores.push(`Ubicación ${grupo.ubicacion}: ${mensajeError(eGrupo)}`);
                lineasResultado.push({ lineId: grupo.lineas[0].lineId, asignado: 0, lotes: "", motivo: mensajeError(eGrupo) });
            } else {
                nLog.audit({ title: `AS_NSP_031 - OV ${idOrdenVenta}: reintento línea por línea`, details: mensajeError(eGrupo) });
                for (const linea of grupo.lineas) {
                    try {
                        const r = intentarConFecha([linea]);
                        if (r.idEjecucion) ejecuciones.push(r.idEjecucion);
                        lineasResultado.push(...r.lineas);
                    } catch (eLinea) {
                        errores.push(`Línea ${linea.lineId} (${linea.itemNombre}): ${mensajeError(eLinea)}`);
                        lineasResultado.push({ lineId: linea.lineId, asignado: 0, lotes: "", motivo: mensajeError(eLinea) });
                    }
                }
            }
        }
        return { ejecuciones, lineasResultado, errores };
    }

    function clasificar({ simulacion, pendienteInicial, ejecutada, pendienteFinal, errores }) {
        if (simulacion) return RESULTADO.SIMULACION;
        if (ejecutada > EPS && pendienteFinal <= EPS) return RESULTADO.EJECUTADA;
        if (ejecutada > EPS) return RESULTADO.PARCIAL;
        if (errores.length > 0) return RESULTADO.ERROR;
        return pendienteInicial > EPS ? RESULTADO.SIN_STOCK : RESULTADO.SIN_PENDIENTES;
    }

    const TEXTO_ESTADO_LOG = {
        [RESULTADO.EJECUTADA]: LOG.ESTADOS.EJECUTADA,
        [RESULTADO.PARCIAL]: LOG.ESTADOS.PARCIAL,
        [RESULTADO.SIN_STOCK]: LOG.ESTADOS.SIN_STOCK,
        [RESULTADO.ERROR]: LOG.ESTADOS.ERROR,
        [RESULTADO.OMITIDA_COLA]: LOG.ESTADOS.OMITIDA_COLA,
        [RESULTADO.SIMULACION]: LOG.ESTADOS.SIMULACION
    };

    /**
     * Procesa una Orden de Venta completa.
     *
     * @param {object} p
     * @param {number} p.idOrdenVenta
     * @param {string} p.tranid
     * @param {{ simulacion: boolean, usarFechaLinea: boolean, logSinCambios: boolean, registrarLog: boolean, idProceso: string }} p.opciones
     * @returns {{ resultado: string, idOrdenVenta: number, tranid: string, ejecuciones: number[], pendienteInicial: number, ejecutada: number, pendienteFinal: number, errores: string[], idLog: number|null }}
     */
    function procesarOrdenVenta({ idOrdenVenta, tranid, opciones }) {
        const salida = { idOrdenVenta, tranid, ejecuciones: [], pendienteInicial: 0, ejecutada: 0, pendienteFinal: 0, errores: [], idLog: null };

        // 1. No competir con el autopicking en línea
        if (colaRepo.tienePendiente(idOrdenVenta)) {
            salida.resultado = RESULTADO.OMITIDA_COLA;
            salida.idLog = registrarLog(salida, opciones, [{ motivo: "La OV entró a la cola de autopicking durante el proceso" }]);
            return salida;
        }

        // 2. Foto inicial de lo pendiente
        const lineas = ordenVentaRepo.obtenerLineasPendientes(idOrdenVenta);
        salida.pendienteInicial = sumaPendiente(lineas);
        if (lineas.length === 0) {
            salida.resultado = RESULTADO.SIN_PENDIENTES;
            return salida;
        }

        const detalle = new Map(
            lineas.map((l) => [
                l.lineId,
                { linea: l.lineId, articulo: l.itemNombre, ubicacion: l.ubicacionNombre, pendienteInicial: l.pendiente, asignado: 0, lotes: "", motivo: null }
            ])
        );

        // 3. Líneas que no se pueden ejecutar por datos de la OV
        const procesables = [];
        for (const l of lineas) {
            if (!l.ubicacion) detalle.get(l.lineId).motivo = "Línea sin ubicación";
            else if (l.ubicacionInactiva) detalle.get(l.lineId).motivo = "Ubicación inactiva";
            else procesables.push(l);
        }

        // 4. Ejecutar (o simular) por grupo ubicación/fecha
        const existencias = inventarioRepo.cargarExistencias(
            procesables.map((l) => l.item),
            procesables.map((l) => l.ubicacion),
            idOrdenVenta
        );
        const asignador = new ejecucionService.AsignadorInventario(existencias);

        for (const grupo of agruparLineas(procesables, opciones.usarFechaLinea)) {
            if (opciones.simulacion) {
                for (const r of ejecucionService.simular(grupo.lineas, asignador)) {
                    Object.assign(detalle.get(r.lineId), { asignado: r.asignado, lotes: r.lotes, motivo: r.motivo });
                }
                continue;
            }
            const r = ejecutarGrupo(idOrdenVenta, grupo, asignador);
            salida.ejecuciones.push(...r.ejecuciones);
            salida.errores.push(...r.errores);
            for (const rl of r.lineasResultado) {
                if (detalle.has(rl.lineId)) Object.assign(detalle.get(rl.lineId), { asignado: rl.asignado, lotes: rl.lotes, motivo: rl.motivo });
            }
        }

        // 5. Verificación contra NetSuite (no se confía solo en lo que se intentó crear)
        if (opciones.simulacion) {
            salida.ejecutada = redondear([...detalle.values()].reduce((s, d) => s + d.asignado, 0));
            salida.pendienteFinal = redondear(salida.pendienteInicial - salida.ejecutada);
        } else {
            salida.pendienteFinal = sumaPendiente(ordenVentaRepo.obtenerLineasPendientes(idOrdenVenta));
            salida.ejecutada = redondear(Math.max(0, salida.pendienteInicial - salida.pendienteFinal));
        }

        salida.resultado = clasificar({ simulacion: opciones.simulacion, ...salida });

        // 6. Log
        const omitirLog = salida.resultado === RESULTADO.SIN_STOCK && !opciones.logSinCambios;
        if (!omitirLog) salida.idLog = registrarLog(salida, opciones, [...detalle.values()]);

        nLog.audit({
            title: `AS_NSP_031 - OV ${tranid || idOrdenVenta}: ${salida.resultado}`,
            details: `Pendiente inicial ${salida.pendienteInicial} | Ejecutado ${salida.ejecutada} | Pendiente final ${salida.pendienteFinal} | IF [${salida.ejecuciones.join(", ")}]${salida.errores.length ? ` | Errores: ${salida.errores.join(" ; ")}` : ""}`
        });
        return salida;
    }

    /** Texto recortado para el campo "details" de N/log. */
    const textoLogScript = (valor) => {
        const s = typeof valor === "string" ? valor : JSON.stringify(valor);
        return s.length > LOG.MAX_TEXTO_LOG_SCRIPT ? `${s.substring(0, LOG.MAX_TEXTO_LOG_SCRIPT - 15)}...[truncado]` : s;
    };

    /**
     * Registra el resultado de la OV:
     *  - registrarLog = true  -> registro customrecord_as_autopicking_log (comportamiento original).
     *  - registrarLog = false -> solo log de ejecución del script, con el detalle por línea.
     * @returns {number|null} ID del registro creado, o null si solo se dejó log del script
     */
    function registrarLog(salida, opciones, detalle) {
        if (!opciones.registrarLog) {
            nLog.audit({
                title: `AS_NSP_031 - OV ${salida.tranid || salida.idOrdenVenta}: ${TEXTO_ESTADO_LOG[salida.resultado]} - detalle`,
                details: textoLogScript({
                    idProceso: opciones.idProceso,
                    simulacion: !!opciones.simulacion,
                    ejecuciones: salida.ejecuciones,
                    detalle
                })
            });
            return null;
        }
        return logRepo.crear({
            idOrdenVenta: salida.idOrdenVenta,
            tranid: salida.tranid,
            estado: TEXTO_ESTADO_LOG[salida.resultado],
            simulacion: opciones.simulacion,
            idProceso: opciones.idProceso,
            ejecuciones: salida.ejecuciones,
            pendienteInicial: salida.pendienteInicial,
            ejecutada: salida.ejecutada,
            pendienteFinal: salida.pendienteFinal,
            detalle,
            error: salida.errores.join("\n")
        });
    }

    return { procesarOrdenVenta };
});
