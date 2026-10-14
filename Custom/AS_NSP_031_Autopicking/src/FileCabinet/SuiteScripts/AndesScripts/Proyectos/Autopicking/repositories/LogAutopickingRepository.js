/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Registro de log por Orden de Venta procesada
 *              (customrecord_as_autopicking_log).
 */
define(["N/record", "N/log", "../constants/AutopickingConstants"], (record, nLog, CONST) => {
    const { LOG } = CONST;
    const C = LOG.CAMPOS;

    const recortar = (texto) => {
        if (texto === null || texto === undefined) return "";
        const s = typeof texto === "string" ? texto : JSON.stringify(texto);
        return s.length > LOG.MAX_TEXTO ? `${s.substring(0, LOG.MAX_TEXTO - 20)}...[truncado]` : s;
    };

    /**
     * Crea el registro de log. Nunca lanza excepción: si falla, solo deja log del script,
     * para que un problema del log no revierta ni interrumpa el procesamiento de la OV.
     *
     * @param {object} datos
     * @param {number} datos.idOrdenVenta
     * @param {string} datos.tranid
     * @param {string} datos.estado            - texto de LOG.ESTADOS
     * @param {boolean} datos.simulacion
     * @param {string} datos.idProceso
     * @param {number[]} datos.ejecuciones     - IDs de Ejecuciones creadas
     * @param {number} datos.pendienteInicial
     * @param {number} datos.ejecutada
     * @param {number} datos.pendienteFinal
     * @param {Array|object} datos.detalle
     * @param {string} [datos.error]
     * @returns {number|null} ID del log creado
     */
    function crear(datos) {
        try {
            const rec = record.create({ type: LOG.TIPO, isDynamic: false });
            rec.setValue({ fieldId: "name", value: `OV ${datos.tranid || datos.idOrdenVenta} - ${datos.estado}`.substring(0, 300) });
            rec.setValue({ fieldId: C.ORDEN_VENTA, value: Number(datos.idOrdenVenta) });
            rec.setText({ fieldId: C.ESTADO, text: datos.estado });
            rec.setValue({ fieldId: C.SIMULACION, value: !!datos.simulacion });
            rec.setValue({ fieldId: C.ID_PROCESO, value: String(datos.idProceso || "").substring(0, 300) });
            rec.setValue({ fieldId: C.EJECUCIONES, value: (datos.ejecuciones || []).join(", ").substring(0, 300) });
            rec.setValue({ fieldId: C.CANT_PENDIENTE_INICIAL, value: Number(datos.pendienteInicial || 0) });
            rec.setValue({ fieldId: C.CANT_EJECUTADA, value: Number(datos.ejecutada || 0) });
            rec.setValue({ fieldId: C.CANT_PENDIENTE_FINAL, value: Number(datos.pendienteFinal || 0) });
            rec.setValue({ fieldId: C.DETALLE, value: recortar(datos.detalle) });
            if (datos.error) rec.setValue({ fieldId: C.ERROR, value: recortar(datos.error) });
            return rec.save({ ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error({ title: `Log AS_NSP_031 - no se pudo crear para OV ${datos.idOrdenVenta}`, details: e.message || e });
            return null;
        }
    }

    return { crear };
});
