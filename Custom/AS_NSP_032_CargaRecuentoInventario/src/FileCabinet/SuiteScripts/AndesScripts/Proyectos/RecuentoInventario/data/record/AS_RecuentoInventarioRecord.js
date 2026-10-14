/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description El Inventory Count (Recuento de inventario) que genera el modulo.
 *
 *              crearRecuento: la cabecera del formulario, un articulo por linea
 *              y el check AS Recuento Inventario Carga marcado. Las unidades las
 *              trae NetSuite al elegir el articulo.
 *              comenzarRecuento: lo pasa de Abierto a Iniciado.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 * CHANGELOG v1.0.0 (2026-10-14):
 *   - [FEAT] crearRecuento: crea el Inventory Count con los articulos del CSV.
 *   - [FEAT] comenzarRecuento: ejecuta la accion startcount (Comenzar recuento).
 */
define(['N/record', 'N/action', 'N/format', '../../constants/AS_RecuentoInventarioConstants'],
    (record, action, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {Object} cabecera   { subsidiaria, ubicacion, departamento, clase, fecha, cuenta, nota }
     * @param {Array}  articulos  ids internos de los articulos, uno por linea
     * @returns {number} id del recuento
     */
    function crearRecuento(cabecera, articulos) {
        const recuento = record.create({ type: CONSTANTES.RECUENTO.TIPO, isDynamic: true });

        recuento.setValue({ fieldId: 'subsidiary', value: cabecera.subsidiaria });
        recuento.setValue({ fieldId: 'location',   value: cabecera.ubicacion });
        if (cabecera.departamento) recuento.setValue({ fieldId: 'department', value: cabecera.departamento });
        if (cabecera.clase) recuento.setValue({ fieldId: 'class', value: cabecera.clase });
        recuento.setValue({ fieldId: 'trandate',   value: format.parse({ value: cabecera.fecha, type: format.Type.DATE }) });
        recuento.setValue({ fieldId: 'account',    value: cabecera.cuenta });
        recuento.setValue({ fieldId: 'memo',       value: cabecera.nota });
        recuento.setValue({ fieldId: CONSTANTES.RECUENTO.CAMPO_CARGA, value: true });
        agregarArticulos(recuento, articulos);

        return recuento.save();
    }

    /**
     * NetSuite no deja escribir el estado del recuento por script: submitFields
     * de status o statuskey se guarda sin error pero el estado no cambia (probado
     * en QA, 2026-10-14). Lo que hace el boton Comenzar recuento es la accion
     * startcount, y esa se ejecuta por su id, igual en cualquier idioma.
     */
    function comenzarRecuento(recuentoId) {
        action.execute({
            recordType: CONSTANTES.RECUENTO.TIPO,
            id        : CONSTANTES.RECUENTO.ACCION_COMENZAR,
            params    : { recordId: recuentoId },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarArticulos(recuento, articulos) {
        articulos.forEach((articulo) => {
            recuento.selectNewLine({ sublistId: 'item' });
            recuento.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: articulo });
            recuento.commitLine({ sublistId: 'item' });
        });
    }

    return {
        crearRecuento   : crearRecuento,
        comenzarRecuento: comenzarRecuento,
    };
});
