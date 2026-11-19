/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Registros del historial: cabecera del proceso
 *              (customrecord_as_faov_proceso) y detalle por línea (customrecord_as_faov_detalle).
 *              Los campos de lista se escriben y filtran por ID interno, resuelto desde el scriptid
 *              del valor con ListaRepository (nunca por el texto visible).
 */
define(["N/record", "N/log", "../constants/FixArticuloOrdenVentaConstants", "../utils/SuiteQLUtils", "./ListaRepository"], (record, nLog, CONST, sql, listaRepo) => {
    const { PROCESO, DETALLE, LISTAS, ESTADO_PROCESO, ESTADO_LINEA, ACCIONES_LINEA, REGLAS, LIMITES } = CONST;
    const P = PROCESO.CAMPOS;
    const D = DETALLE.CAMPOS;

    const recortar = (valor, max = LIMITES.TEXTO) => {
        if (valor === null || valor === undefined) return "";
        const s = typeof valor === "string" ? valor : JSON.stringify(valor);
        return s.length > max ? `${s.substring(0, max - 15)}...[truncado]` : s;
    };

    const idEstadoProceso = (clave) => listaRepo.getId(LISTAS.ESTADO_PROCESO, ESTADO_PROCESO[clave].scriptid);

    /** Clave de ESTADO_PROCESO a partir del ID interno del valor de lista. */
    const claveEstadoProceso = (id) => {
        const scriptid = id ? listaRepo.getScriptId(LISTAS.ESTADO_PROCESO, id) : null;
        return Object.keys(ESTADO_PROCESO).find((k) => ESTADO_PROCESO[k].scriptid === scriptid) || null;
    };

    const asignar = (rec, valores = {}) => {
        Object.keys(valores).forEach((campo) => {
            const v = valores[campo];
            if (v === undefined) return;
            rec.setValue({ fieldId: campo, value: v === null ? "" : v });
        });
    };

    /**
     * Crea la cabecera del proceso en estado Validado y le asigna su nombre (FAOV-000123).
     * @returns {{ id: number, nombre: string }}
     */
    function crear({ subsidiaria, usuario, observacion, archivoOrigen, archivoDatos, totales, resumen }) {
        const rec = record.create({ type: PROCESO.TIPO, isDynamic: false });
        rec.setValue({ fieldId: "name", value: `${PROCESO.PREFIJO_NOMBRE}NUEVO` });
        asignar(rec, {
            [P.SUBSIDIARIA]: Number(subsidiaria),
            [P.ESTADO]: idEstadoProceso("VALIDADO"),
            [P.USUARIO]: usuario ? Number(usuario) : null,
            [P.OBSERVACION]: recortar(observacion || ""),
            [P.ARCHIVO_ORIGEN]: archivoOrigen || null,
            [P.ARCHIVO_DATOS]: archivoDatos || null,
            [P.TOTAL_LINEAS]: Number(totales.lineas || 0),
            [P.TOTAL_PROCESAR]: Number(totales.procesar || 0),
            [P.RESUMEN]: recortar(resumen, LIMITES.CLOB)
        });
        const id = rec.save({ ignoreMandatoryFields: true });
        const nombre = `${PROCESO.PREFIJO_NOMBRE}${String(id).padStart(6, "0")}`;
        record.submitFields({ type: PROCESO.TIPO, id, values: { name: nombre } });
        return { id: Number(id), nombre };
    }

    /**
     * Actualiza la cabecera.
     * @param {number} id
     * @param {object} valores - { campo: valor } (IDs de PROCESO.CAMPOS)
     * @param {string} [estado] - clave de ESTADO_PROCESO
     */
    function actualizar(id, valores = {}, estado = null) {
        const rec = record.load({ type: PROCESO.TIPO, id: Number(id), isDynamic: false });
        asignar(rec, estado ? { ...valores, [P.ESTADO]: idEstadoProceso(estado) } : valores);
        rec.save({ ignoreMandatoryFields: true });
    }

    /** Lee la cabecera del proceso; `estado` es la clave de ESTADO_PROCESO. */
    function obtener(id) {
        if (!id) return null;
        const filas = sql.consultar(
            `
            SELECT
                p.id AS id, p.name AS nombre,
                TO_CHAR(p.created, 'DD/MM/YYYY HH24:MI') AS creado,
                p.${P.SUBSIDIARIA} AS subsidiaria, BUILTIN.DF(p.${P.SUBSIDIARIA}) AS subsidiarianombre,
                p.${P.ESTADO} AS estadoid, BUILTIN.DF(p.${P.ESTADO}) AS estadotexto,
                BUILTIN.DF(p.${P.USUARIO}) AS usuario,
                p.${P.OBSERVACION} AS observacion,
                p.${P.ARCHIVO_ORIGEN} AS archivoorigen,
                p.${P.ARCHIVO_DATOS} AS archivodatos,
                p.${P.TOTAL_LINEAS} AS totallineas,
                p.${P.TOTAL_PROCESAR} AS totalprocesar,
                p.${P.TOTAL_PROCESADAS} AS totalprocesadas,
                p.${P.TOTAL_OMITIDAS} AS totalomitidas,
                p.${P.TOTAL_ERRORES} AS totalerrores,
                p.${P.TASK_ID} AS taskid,
                TO_CHAR(p.${P.FECHA_INICIO}, 'DD/MM/YYYY HH24:MI') AS fechainicio,
                TO_CHAR(p.${P.FECHA_FIN}, 'DD/MM/YYYY HH24:MI') AS fechafin
            FROM ${PROCESO.TIPO} p
            WHERE p.id = ?
        `,
            [Number(id)]
        );
        if (!filas.length) return null;
        const f = filas[0];
        // Los campos CLOB no siempre se devuelven completos por SuiteQL: se leen del registro
        const rec = record.load({ type: PROCESO.TIPO, id: Number(id), isDynamic: false });
        return {
            id: Number(f.id),
            nombre: f.nombre,
            creado: f.creado,
            subsidiaria: f.subsidiaria ? Number(f.subsidiaria) : null,
            subsidiariaNombre: f.subsidiarianombre,
            estado: claveEstadoProceso(f.estadoid),
            estadoTexto: f.estadotexto,
            usuario: f.usuario,
            observacion: f.observacion,
            archivoOrigen: f.archivoorigen ? Number(f.archivoorigen) : null,
            archivoDatos: f.archivodatos ? Number(f.archivodatos) : null,
            totalLineas: Number(f.totallineas || 0),
            totalProcesar: Number(f.totalprocesar || 0),
            totalProcesadas: Number(f.totalprocesadas || 0),
            totalOmitidas: Number(f.totalomitidas || 0),
            totalErrores: Number(f.totalerrores || 0),
            taskId: f.taskid,
            fechaInicio: f.fechainicio,
            fechaFin: f.fechafin,
            resumen: rec.getValue({ fieldId: P.RESUMEN }) || "",
            error: rec.getValue({ fieldId: P.ERROR }) || ""
        };
    }

    /**
     * Procesos para el historial.
     * @param {{ estado?: string, subsidiaria?: string, desde?: string, hasta?: string }} filtros
     *        estado = clave de ESTADO_PROCESO; desde/hasta = 'YYYY-MM-DD'
     */
    function listar(filtros = {}) {
        const condiciones = ["NVL(p.isinactive, 'F') = 'F'"];
        const params = [];
        if (filtros.estado) {
            condiciones.push(`p.${P.ESTADO} = ?`);
            params.push(Number(idEstadoProceso(filtros.estado)));
        }
        if (filtros.subsidiaria) {
            condiciones.push(`p.${P.SUBSIDIARIA} = ?`);
            params.push(Number(filtros.subsidiaria));
        }
        if (filtros.desde) {
            condiciones.push("p.created >= TO_DATE(?, 'YYYY-MM-DD')");
            params.push(filtros.desde);
        }
        if (filtros.hasta) {
            condiciones.push("p.created < TO_DATE(?, 'YYYY-MM-DD') + 1");
            params.push(filtros.hasta);
        }
        const filas = sql.consultarTodo(
            `
            SELECT * FROM (
                SELECT
                    p.id AS id, p.name AS nombre,
                    TO_CHAR(p.created, 'DD/MM/YYYY HH24:MI') AS creado,
                    BUILTIN.DF(p.${P.SUBSIDIARIA}) AS subsidiaria,
                    p.${P.ESTADO} AS estadoid,
                    BUILTIN.DF(p.${P.ESTADO}) AS estadotexto,
                    BUILTIN.DF(p.${P.USUARIO}) AS usuario,
                    p.${P.TOTAL_LINEAS} AS totallineas,
                    p.${P.TOTAL_PROCESAR} AS totalprocesar,
                    p.${P.TOTAL_PROCESADAS} AS totalprocesadas,
                    p.${P.TOTAL_OMITIDAS} AS totalomitidas,
                    p.${P.TOTAL_ERRORES} AS totalerrores,
                    TO_CHAR(p.${P.FECHA_FIN}, 'DD/MM/YYYY HH24:MI') AS fechafin,
                    p.${P.OBSERVACION} AS observacion
                FROM ${PROCESO.TIPO} p
                WHERE ${condiciones.join(" AND ")}
                ORDER BY p.id DESC
            ) WHERE ROWNUM <= ${Number(REGLAS.LIMITE_HISTORIAL)}
        `,
            params
        );
        return filas.map((f) => ({ ...f, estado: claveEstadoProceso(f.estadoid) }));
    }

    /** Procesos en estado En proceso (para impedir dos procesos simultáneos). */
    function obtenerEnProceso() {
        return sql.consultarTodo(
            `
            SELECT p.id AS id, p.name AS nombre, p.${P.TASK_ID} AS taskid
            FROM ${PROCESO.TIPO} p
            WHERE p.${P.ESTADO} = ?
              AND NVL(p.isinactive, 'F') = 'F'
        `,
            [Number(idEstadoProceso("EN_PROCESO"))]
        );
    }

    const numeroONull = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

    /**
     * Crea el detalle de una línea procesada. Nunca lanza excepción: si falla, deja log del script
     * para no revertir lo ya hecho en la OV.
     * @param {number} idProceso
     * @param {object} l - línea con `estado` = clave de ESTADO_LINEA y `accion` = código de ACCIONES_LINEA
     */
    function crearDetalle(idProceso, l) {
        try {
            const accion = ACCIONES_LINEA[l.accion] || ACCIONES_LINEA.NO_PROCESABLE;
            const estado = ESTADO_LINEA[l.estado] || ESTADO_LINEA.ERROR;
            const rec = record.create({ type: DETALLE.TIPO, isDynamic: false });
            rec.setValue({ fieldId: "name", value: `${l.cuenta || "-"} | ${l.crg || "-"}`.substring(0, 300) });
            asignar(rec, {
                [D.PROCESO]: Number(idProceso),
                [D.FILA]: Number(l.filas && l.filas.length ? l.filas[0] : 0),
                [D.CUENTA]: recortar(l.cuenta || "", 300),
                [D.CRG_CORREL]: recortar(l.crg || "", 300),
                [D.ORDEN_VENTA]: l.ovId ? Number(l.ovId) : null,
                [D.ARTICULO_OV]: l.articuloOvId ? Number(l.articuloOvId) : null,
                [D.ARTICULO_CSV]: l.articuloCsvExiste ? Number(l.idArticuloCsv) : null,
                [D.ACCION]: listaRepo.getId(LISTAS.ACCION, accion.scriptid),
                [D.ESTADO]: listaRepo.getId(LISTAS.ESTADO_LINEA, estado.scriptid),
                [D.CANT_OV]: numeroONull(l.cantidadOv),
                [D.CANT_DESPACHADA]: numeroONull(l.despachada),
                [D.CANT_FINAL]: numeroONull(l.cantidadFinal),
                [D.CANT_RESULTANTE]: numeroONull(l.cantidadResultante),
                [D.PRECIO_OV]: numeroONull(l.precioOv),
                [D.PRECIO_NUEVO]: numeroONull(l.precioNuevo),
                [D.EJECUCIONES]: recortar((l.ejecucionesAfectadas || []).map((e) => e.texto).join(", "), 300),
                [D.EJECUCIONES_JSON]: recortar(l.ejecucionesAfectadas || []),
                [D.LOTES]: recortar(l.lotes || ""),
                [D.MENSAJE]: recortar(l.mensaje || "")
            });
            return rec.save({ ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error({ title: `AS_NSP_037 - No se pudo crear el detalle ${l.cuenta}|${l.crg}`, details: e.message || e });
            return null;
        }
    }

    /** Clave de ESTADO_LINEA a partir del ID interno. */
    const claveEstadoLinea = (id) => {
        const scriptid = id ? listaRepo.getScriptId(LISTAS.ESTADO_LINEA, id) : null;
        return Object.keys(ESTADO_LINEA).find((k) => ESTADO_LINEA[k].scriptid === scriptid) || null;
    };

    /** Detalle de un proceso; `estado` de cada línea = clave de ESTADO_LINEA. */
    function listarDetalle(idProceso) {
        const filas = sql.consultarTodo(
            `
            SELECT
                d.id AS id,
                d.${D.FILA} AS fila, d.${D.CUENTA} AS cuenta, d.${D.CRG_CORREL} AS crg,
                d.${D.ORDEN_VENTA} AS ovid, BUILTIN.DF(d.${D.ORDEN_VENTA}) AS ov,
                d.${D.ARTICULO_OV} AS articuloovid, BUILTIN.DF(d.${D.ARTICULO_OV}) AS articuloov,
                d.${D.ARTICULO_CSV} AS articulocsvid, BUILTIN.DF(d.${D.ARTICULO_CSV}) AS articulocsv,
                BUILTIN.DF(d.${D.ACCION}) AS accion,
                d.${D.ESTADO} AS estadoid, BUILTIN.DF(d.${D.ESTADO}) AS estadotexto,
                d.${D.CANT_OV} AS cantov, d.${D.CANT_DESPACHADA} AS despachada, d.${D.CANT_FINAL} AS cantfinal,
                d.${D.CANT_RESULTANTE} AS cantresultante, d.${D.PRECIO_OV} AS precioov, d.${D.PRECIO_NUEVO} AS precionuevo,
                d.${D.EJECUCIONES} AS ejecuciones, d.${D.EJECUCIONES_JSON} AS ejecucionesjson,
                d.${D.LOTES} AS lotes, d.${D.MENSAJE} AS mensaje
            FROM ${DETALLE.TIPO} d
            WHERE d.${D.PROCESO} = ?
            ORDER BY d.${D.FILA}, d.id
        `,
            [Number(idProceso)]
        );
        return filas.map((f) => ({ ...f, estado: claveEstadoLinea(f.estadoid) }));
    }

    return { crear, actualizar, obtener, listar, obtenerEnProceso, crearDetalle, listarDetalle };
});
