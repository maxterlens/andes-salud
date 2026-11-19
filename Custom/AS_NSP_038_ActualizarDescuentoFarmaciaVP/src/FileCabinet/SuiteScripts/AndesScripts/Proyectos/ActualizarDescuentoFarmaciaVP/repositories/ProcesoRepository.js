/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Registros del historial: cabecera del proceso
 *              (customrecord_as_adfv_proceso) y detalle por línea de descuento (customrecord_as_adfv_detalle).
 *              Los campos de lista se escriben y filtran por ID interno, resuelto desde el scriptid
 *              del valor con ListaRepository (nunca por el texto visible).
 */
define(["N/record", "N/log", "../constants/ActualizarDescuentoFarmaciaVPConstants", "../utils/SuiteQLUtils", "../utils/FormatoUtils", "./ListaRepository"], (
    record,
    nLog,
    CONST,
    sql,
    formato,
    listaRepo
) => {
    const { PROCESO, DETALLE, LISTAS, ESTADO_PROCESO, ESTADO_LINEA, REGLAS, LIMITES } = CONST;
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

    /** Clave de ESTADO_LINEA a partir del ID interno. */
    const claveEstadoLinea = (id) => {
        const scriptid = id ? listaRepo.getScriptId(LISTAS.ESTADO_LINEA, id) : null;
        return Object.keys(ESTADO_LINEA).find((k) => ESTADO_LINEA[k].scriptid === scriptid) || null;
    };

    const asignar = (rec, valores = {}) => {
        Object.keys(valores).forEach((campo) => {
            const v = valores[campo];
            if (v === undefined) return;
            rec.setValue({ fieldId: campo, value: v === null ? "" : v });
        });
    };

    const numeroONull = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
    const fechaONull = (iso) => (iso ? formato.isoAFecha(iso) : null);

    /** Valores de los totales de la validación. */
    const valoresTotales = (totales) => ({
        [P.TOTAL_REVISADAS]: Number(totales.revisadas || 0),
        [P.TOTAL_CON_DIFERENCIA]: Number(totales.conDiferencia || 0),
        [P.TOTAL_PROCESABLES]: Number(totales.procesables || 0)
    });

    /**
     * Crea la cabecera del proceso al presionar Procesar (estado En proceso) y le asigna su nombre (ADFV-000123).
     * @returns {{ id: number, nombre: string }}
     */
    function crear({ subsidiaria, desde, hasta, usuario, observacion, archivoDatos, totales, resumen }) {
        const rec = record.create({ type: PROCESO.TIPO, isDynamic: false });
        rec.setValue({ fieldId: "name", value: `${PROCESO.PREFIJO_NOMBRE}NUEVO` });
        asignar(rec, {
            [P.SUBSIDIARIA]: Number(subsidiaria),
            [P.FECHA_DESDE]: fechaONull(desde),
            [P.FECHA_HASTA]: fechaONull(hasta),
            [P.ESTADO]: idEstadoProceso("EN_PROCESO"),
            [P.TOTAL_SELECCIONADAS]: Number(totales.seleccionadas || 0),
            [P.FECHA_INICIO]: new Date(),
            [P.USUARIO]: usuario ? Number(usuario) : null,
            [P.OBSERVACION]: recortar(observacion || ""),
            [P.ARCHIVO_DATOS]: archivoDatos || null,
            ...valoresTotales(totales),
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
                TO_CHAR(p.${P.FECHA_DESDE}, 'YYYY-MM-DD') AS desde,
                TO_CHAR(p.${P.FECHA_HASTA}, 'YYYY-MM-DD') AS hasta,
                p.${P.ESTADO} AS estadoid, BUILTIN.DF(p.${P.ESTADO}) AS estadotexto,
                BUILTIN.DF(p.${P.USUARIO}) AS usuario,
                p.${P.OBSERVACION} AS observacion,
                p.${P.ARCHIVO_DATOS} AS archivodatos,
                p.${P.TOTAL_REVISADAS} AS totalrevisadas,
                p.${P.TOTAL_CON_DIFERENCIA} AS totalcondiferencia,
                p.${P.TOTAL_PROCESABLES} AS totalprocesables,
                p.${P.TOTAL_SELECCIONADAS} AS totalseleccionadas,
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
            desde: f.desde || "",
            hasta: f.hasta || "",
            estado: claveEstadoProceso(f.estadoid),
            estadoTexto: f.estadotexto,
            usuario: f.usuario,
            observacion: f.observacion,
            archivoDatos: f.archivodatos ? Number(f.archivodatos) : null,
            totalRevisadas: Number(f.totalrevisadas || 0),
            totalConDiferencia: Number(f.totalcondiferencia || 0),
            totalProcesables: Number(f.totalprocesables || 0),
            totalSeleccionadas: Number(f.totalseleccionadas || 0),
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
     *        estado = clave de ESTADO_PROCESO; desde/hasta = 'YYYY-MM-DD' (fecha de creación del proceso)
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
                    TO_CHAR(p.${P.FECHA_DESDE}, 'DD/MM/YYYY') AS desde,
                    TO_CHAR(p.${P.FECHA_HASTA}, 'DD/MM/YYYY') AS hasta,
                    p.${P.ESTADO} AS estadoid,
                    BUILTIN.DF(p.${P.ESTADO}) AS estadotexto,
                    BUILTIN.DF(p.${P.USUARIO}) AS usuario,
                    p.${P.TOTAL_REVISADAS} AS totalrevisadas,
                    p.${P.TOTAL_CON_DIFERENCIA} AS totalcondiferencia,
                    p.${P.TOTAL_PROCESABLES} AS totalprocesables,
                    p.${P.TOTAL_SELECCIONADAS} AS totalseleccionadas,
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

    /**
     * Crea el detalle de una línea de descuento. Nunca lanza excepción: si falla, deja log del script
     * para no revertir lo ya hecho en la factura.
     * @param {number} idProceso
     * @param {object} d - fila de resultado (CorreccionService) con `estado` = clave de ESTADO_LINEA
     */
    function crearDetalle(idProceso, d) {
        try {
            const estado = ESTADO_LINEA[d.estado] || ESTADO_LINEA.ERROR;
            const rec = record.create({ type: DETALLE.TIPO, isDynamic: false });
            rec.setValue({ fieldId: "name", value: `${d.facturaNumero || d.facturaId || "-"} | ${d.lineaDescuento || "-"}`.substring(0, 300) });
            asignar(rec, {
                [D.PROCESO]: Number(idProceso),
                [D.FACTURA]: d.facturaId ? Number(d.facturaId) : null,
                [D.LINEA_ARTICULO]: numeroONull(d.lineaArticulo),
                [D.ARTICULO]: d.articuloId ? Number(d.articuloId) : null,
                [D.CANT_ARTICULO]: numeroONull(d.cantArticulo),
                [D.LINEA_DESCUENTO]: numeroONull(d.lineaDescuento),
                [D.DESCUENTO]: d.descuentoId ? Number(d.descuentoId) : null,
                [D.CANT_DESC_ANTES]: numeroONull(d.cantDescuento),
                [D.CANT_DESC_DESPUES]: numeroONull(d.cantDescuentoDespues),
                [D.TARIFA_DESC]: numeroONull(d.tarifaDescuento),
                [D.IMPORTE_DESC_ANTES]: numeroONull(d.importeDescuento),
                [D.IMPORTE_DESC_DESPUES]: numeroONull(d.importeDescuentoDespues),
                [D.RESTANTE_ANTES]: numeroONull(d.restanteAntes),
                [D.RESTANTE_ESPERADO]: numeroONull(d.restanteEsperado),
                [D.RESTANTE_DESPUES]: numeroONull(d.restanteDespues),
                [D.ESTADO]: listaRepo.getId(LISTAS.ESTADO_LINEA, estado.scriptid),
                [D.MENSAJE]: recortar(d.mensaje || "")
            });
            return rec.save({ ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error({ title: `AS_NSP_038 - No se pudo crear el detalle ${d.facturaNumero}|${d.lineaDescuento}`, details: e.message || e });
            return null;
        }
    }

    /** Detalle de un proceso; `estado` de cada fila = clave de ESTADO_LINEA. */
    function listarDetalle(idProceso) {
        const filas = sql.consultarTodo(
            `
            SELECT
                d.id AS id,
                d.${D.FACTURA} AS facturaid, BUILTIN.DF(d.${D.FACTURA}) AS factura,
                d.${D.LINEA_ARTICULO} AS lineaarticulo,
                d.${D.ARTICULO} AS articuloid, BUILTIN.DF(d.${D.ARTICULO}) AS articulo,
                d.${D.CANT_ARTICULO} AS cantarticulo,
                d.${D.LINEA_DESCUENTO} AS lineadescuento,
                BUILTIN.DF(d.${D.DESCUENTO}) AS descuento,
                d.${D.CANT_DESC_ANTES} AS cantdescantes,
                d.${D.CANT_DESC_DESPUES} AS cantdescdespues,
                d.${D.TARIFA_DESC} AS tarifadesc,
                d.${D.IMPORTE_DESC_ANTES} AS impdescantes,
                d.${D.IMPORTE_DESC_DESPUES} AS impdescdespues,
                d.${D.RESTANTE_ANTES} AS restanteantes,
                d.${D.RESTANTE_ESPERADO} AS restanteesperado,
                d.${D.RESTANTE_DESPUES} AS restantedespues,
                d.${D.ESTADO} AS estadoid, BUILTIN.DF(d.${D.ESTADO}) AS estadotexto,
                d.${D.MENSAJE} AS mensaje
            FROM ${DETALLE.TIPO} d
            WHERE d.${D.PROCESO} = ?
            ORDER BY d.${D.FACTURA}, d.${D.LINEA_DESCUENTO}, d.id
        `,
            [Number(idProceso)]
        );
        return filas.map((f) => ({ ...f, estado: claveEstadoLinea(f.estadoid) }));
    }

    return { crear, actualizar, obtener, listar, obtenerEnProceso, crearDetalle, listarDetalle };
});
