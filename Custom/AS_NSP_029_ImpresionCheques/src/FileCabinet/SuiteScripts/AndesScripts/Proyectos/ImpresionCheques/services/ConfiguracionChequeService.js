/**
 * @NApiVersion 2.1
 * Service: reglas del record AS Configuración Impresión Cheque (customrecord_as_config_cheque).
 *
 * Regla: una subsidiaria puede tener varias impresoras, pero solo una predeterminada activa.
 */
define([
    'N/error',
    '../repositories/ImpresionChequesRepository',
    '../constants/ImpresionChequesConstants'
], (error, ImpresionChequesRepository, Constants) => {

    const { SUBSIDIARIA, PREDETERMINADA, INACTIVO } = Constants.CONFIG_CHEQUE;

    const _esVerdadero = (v) => v === true || v === 'T';

    const _comoLista = (v) => {
        if (Array.isArray(v)) return v.map(String).filter(Boolean);
        return String(v || '').split(/[,\u0005]/).map(x => x.trim()).filter(Boolean);
    };

    /**
     * Valida que no exista otra configuración predeterminada activa para las mismas subsidiarias.
     * @param {{ id?: string, nombre: string, predeterminada: *, inactivo: *, subsidiarias: * }} config
     * @throws {error.SuiteScriptError} AS_CONFIG_CHEQUE_PREDETERMINADA
     */
    const validarPredeterminada = (config) => {
        if (!_esVerdadero(config.predeterminada) || _esVerdadero(config.inactivo)) return;

        const subsidiarias = _comoLista(config.subsidiarias);
        const conflictos   = ImpresionChequesRepository.getPredeterminadas(subsidiarias, config.id);
        if (!conflictos.length) return;

        const detalle = conflictos.map(c => `"${c.nombre}" (${c.subsidiarias})`).join('; ');
        throw error.create({
            name:      'AS_CONFIG_CHEQUE_PREDETERMINADA',
            message:   `Ya existe una impresora predeterminada para alguna de las subsidiarias seleccionadas: ${detalle}. ` +
                       'Desmarque "Predeterminada" en esa configuración o en esta antes de guardar.',
            notifyOff: true
        });
    };

    /**
     * Lee los valores efectivos del registro en beforeSubmit.
     * En edición en línea (xedit) newRecord solo trae los campos modificados: el resto se toma de oldRecord.
     */
    const leerDesdeContexto = (context) => {
        const { newRecord, oldRecord } = context;
        const modificados = newRecord.getFields ? newRecord.getFields() : [];
        const esXedit     = context.type === context.UserEventType.XEDIT;

        const valor = (fieldId) => {
            if (esXedit && oldRecord && !modificados.includes(fieldId)) {
                return oldRecord.getValue({ fieldId });
            }
            return newRecord.getValue({ fieldId });
        };

        return {
            id:             newRecord.id ? String(newRecord.id) : '',
            nombre:         valor('name'),
            predeterminada: valor(PREDETERMINADA),
            inactivo:       valor(INACTIVO),
            subsidiarias:   valor(SUBSIDIARIA)
        };
    };

    return { validarPredeterminada, leerDesdeContexto };
});
