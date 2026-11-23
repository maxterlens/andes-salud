/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Trazabilidad del cuadre de facturas contra el JSON (CuadreFacturaJson).
 *               - customrecord_as_adfv_cuadre_ejec: una cabecera por ejecución del Map/Reduce (parámetros y totales).
 *               - customrecord_as_adfv_cuadre_det: un registro por cada cambio aplicado o simulado en una factura;
 *                 una sola fila con el resultado y el motivo si la factura no tuvo cambios.
 *              Los campos de lista se escriben por ID interno, resuelto desde el scriptid del valor con ListaRepository.
 *              Ninguna función lanza excepción hacia el Map/Reduce: un error de trazabilidad nunca revierte una factura.
 */
define(["N/record", "N/query", "N/log", "../constants/CuadreFacturaJsonConstants", "./ListaRepository"], (record, query, nLog, CONST, listaRepo) => {
    const { TRAZA, REGLAS } = CONST;
    const EJ = TRAZA.EJECUCION.CAMPOS;
    const DE = TRAZA.DETALLE.CAMPOS;
    const L = TRAZA.LISTAS;

    const recortar = (v, max = REGLAS.LIMITE_LOG) => {
        const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
        return s.length > max ? `${s.substring(0, max - 15)}...[truncado]` : s;
    };
    const numeroONull = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

    const asignar = (rec, valores) =>
        Object.keys(valores).forEach((campo) => {
            const v = valores[campo];
            if (v === undefined || v === null || v === "") return;
            rec.setValue({ fieldId: campo, value: v });
        });

    const idValor = (lista, scriptid) => {
        try {
            return listaRepo.getId(lista, scriptid);
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 Cuadre | Trazabilidad: valor de lista", details: `${lista} / ${scriptid}: ${e.message || e}` });
            return null;
        }
    };

    /**
     * Crea la cabecera de la ejecución en estado En proceso.
     * @returns {number|null} ID del registro
     */
    const crearEjecucion = ({ cfg, filas, aProcesar }) => {
        try {
            const rec = record.create({ type: TRAZA.EJECUCION.TIPO, isDynamic: false });
            rec.setValue({ fieldId: "name", value: `${TRAZA.EJECUCION.PREFIJO_NOMBRE}NUEVO` });
            asignar(rec, {
                [EJ.ARCHIVO]: numeroONull(cfg.archivo),
                [EJ.SIMULACION]: !!cfg.simulacion,
                [EJ.LIMITE]: numeroONull(cfg.limite),
                [EJ.ARTICULO_REDONDEO]: numeroONull(cfg.articuloRedondeo),
                [EJ.IMPUESTO_REDONDEO]: numeroONull(cfg.impuestoRedondeo),
                [EJ.TOPE_IVA]: numeroONull(cfg.topeAjusteIva),
                [EJ.RANGO_REDONDEO]: numeroONull(cfg.rangoRedondeo),
                [EJ.ESTADO]: idValor(L.ESTADO_EJECUCION, TRAZA.ESTADO.EN_PROCESO),
                [EJ.FECHA_INICIO]: new Date(),
                [EJ.FILAS]: numeroONull(filas),
                [EJ.A_PROCESAR]: numeroONull(aProcesar)
            });
            const id = Number(rec.save({ ignoreMandatoryFields: true }));
            record.submitFields({ type: TRAZA.EJECUCION.TIPO, id, values: { name: `${TRAZA.EJECUCION.PREFIJO_NOMBRE}${String(id).padStart(6, "0")}` } });
            return id;
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 Cuadre | Trazabilidad: no se pudo crear la ejecución", details: e.message || e });
            return null;
        }
    };

    /** Tipo de cambio (scriptid) de un cambio del servicio. */
    const tipoCambio = (c) => {
        if (!c) return TRAZA.TIPO_CAMBIO.NINGUNO;
        if (c.tipo === "A") return TRAZA.TIPO_CAMBIO.A;
        if (c.tipo === "B") return c.en === "articulo" ? TRAZA.TIPO_CAMBIO.B_ARTICULO : TRAZA.TIPO_CAMBIO.B_DESCUENTO;
        if (c.tipo === "C") return TRAZA.TIPO_CAMBIO.C;
        return TRAZA.TIPO_CAMBIO.NINGUNO;
    };

    /**
     * Crea el detalle de una factura: un registro por cambio, o uno solo si no hubo cambios.
     * @param {number} ejecucionId
     * @param {object} r - resultado de CuadreFacturaJsonService.cuadrar
     * @param {boolean} simulacion
     * @returns {number} registros creados
     */
    const crearDetalles = (ejecucionId, r, simulacion) => {
        let creados = 0;
        const cambios = r.cambios && r.cambios.length ? r.cambios : [null];
        const resultado = idValor(L.RESULTADO, TRAZA.RESULTADO[r.resultado] || TRAZA.RESULTADO.ERROR);
        const antes = r.antes || {};
        const despues = r.despues || {};
        cambios.forEach((c) => {
            try {
                const rec = record.create({ type: TRAZA.DETALLE.TIPO, isDynamic: false });
                rec.setValue({ fieldId: "name", value: `${r.factura || r.id} | ${c ? c.tipo : "-"}${c && c.linea ? ` | L${c.linea}` : ""}`.substring(0, 300) });
                asignar(rec, {
                    [DE.EJECUCION]: Number(ejecucionId),
                    [DE.FACTURA]: numeroONull(r.id),
                    [DE.RESULTADO]: resultado,
                    [DE.TIPO]: idValor(L.TIPO_CAMBIO, tipoCambio(c)),
                    [DE.SIMULACION]: !!simulacion,
                    [DE.LINEA]: c ? numeroONull(c.linea) : null,
                    [DE.PRODUCTO]: c ? numeroONull(c.producto) : null,
                    [DE.ARTICULO]: c ? numeroONull(c.articuloId) : null,
                    [DE.CANT_ANTES]: c ? numeroONull(c.cantidadAntes) : null,
                    [DE.CANT_DESPUES]: c ? numeroONull(c.cantidadDespues) : null,
                    [DE.IMP_ANTES]: c ? numeroONull(c.tipo === "C" ? c.montoAntes : c.importeAntes) : null,
                    [DE.IMP_DESPUES]: c ? numeroONull(c.tipo === "C" ? c.montoDespues : c.importeDespues) : null,
                    [DE.IVA_ANTES]: c ? numeroONull(c.impuestoAntes) : null,
                    [DE.IVA_DESPUES]: c ? numeroONull(c.impuestoDespues) : null,
                    [DE.TOTAL_JSON]: numeroONull(antes.totalJson),
                    [DE.PAGADO]: numeroONull(antes.pagado),
                    [DE.EFECTIVO]: numeroONull(antes.efectivo),
                    [DE.TOTAL_ANTES]: numeroONull(antes.total),
                    [DE.TOTAL_DESPUES]: numeroONull(despues.total),
                    [DE.REST_ANTES]: numeroONull(antes.restante),
                    [DE.REST_DESPUES]: numeroONull(despues.restante),
                    [DE.MENSAJE]: recortar(r.mensaje)
                });
                rec.save({ ignoreMandatoryFields: true });
                creados++;
            } catch (e) {
                nLog.error({ title: `AS_NSP_038 Cuadre | Trazabilidad: no se pudo crear el detalle de ${r.factura || r.id}`, details: e.message || e });
            }
        });
        return creados;
    };

    /** Última ejecución En proceso del archivo (el summarize no recibe el ID desde getInputData). */
    const buscarEjecucionEnProceso = (archivo) => {
        try {
            const estado = idValor(L.ESTADO_EJECUCION, TRAZA.ESTADO.EN_PROCESO);
            const filas = query
                .runSuiteQL({
                    query: `SELECT MAX(e.id) AS id FROM ${TRAZA.EJECUCION.TIPO} e WHERE e.${EJ.ESTADO} = ? AND e.${EJ.ARCHIVO} = ?`,
                    params: [Number(estado), Number(archivo)]
                })
                .asMappedResults();
            return filas.length && filas[0].id ? Number(filas[0].id) : null;
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 Cuadre | Trazabilidad: búsqueda de la ejecución", details: e.message || e });
            return null;
        }
    };

    /**
     * Cierra la ejecución con los totales del summarize.
     * @param {number} id
     * @param {{ conteo: object, errores: string[], errorEntrada: boolean }} o
     */
    const finalizarEjecucion = (id, { conteo, errores, errorEntrada }) => {
        try {
            const errorEtapas = (errores || []).length;
            let estado = TRAZA.ESTADO.COMPLETADO;
            if (errorEntrada) estado = TRAZA.ESTADO.ERROR;
            else if ((conteo.ERROR || 0) > 0 || errorEtapas > 0) estado = TRAZA.ESTADO.COMPLETADO_ERRORES;
            const rec = record.load({ type: TRAZA.EJECUCION.TIPO, id: Number(id), isDynamic: false });
            asignar(rec, {
                [EJ.ESTADO]: idValor(L.ESTADO_EJECUCION, estado),
                [EJ.FECHA_FIN]: new Date(),
                [EJ.ERROR]: errorEtapas ? recortar(errores.join("\n"), 100000) : null
            });
            [
                [EJ.CORREGIDAS, conteo.CORREGIDA],
                [EJ.SIMULADAS, conteo.SIMULADA],
                [EJ.SIN_CAMBIO, conteo.SIN_CAMBIO],
                [EJ.OMITIDAS, conteo.OMITIDA],
                [EJ.REVISION, conteo.REVISION_MANUAL],
                [EJ.ERRORES, conteo.ERROR]
            ].forEach(([campo, valor]) => rec.setValue({ fieldId: campo, value: Number(valor || 0) }));
            rec.save({ ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 Cuadre | Trazabilidad: no se pudo cerrar la ejecución", details: e.message || e });
        }
    };

    return { crearEjecucion, crearDetalles, buscarEjecucionEnProceso, finalizarEjecucion };
});
