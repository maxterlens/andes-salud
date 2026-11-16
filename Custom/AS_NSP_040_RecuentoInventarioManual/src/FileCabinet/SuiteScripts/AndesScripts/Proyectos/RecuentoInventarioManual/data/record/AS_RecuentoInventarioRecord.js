/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description El Inventory Count (Recuento de inventario) que genera el modulo.
 *
 *              armarRecuento: la cabecera del formulario, un articulo por linea
 *              y el check AS Recuento Inventario Carga marcado, como el AS_NSP_032.
 *              guardarRecuento: lo guarda; va aparte para medir cada paso.
 *              comenzarRecuento: lo pasa de Abierto a Iniciado.
 *              actualizarCantidades: escribe la Cantidad del recuento y su
 *              detalle por lote en las lineas de los articulos recibidos.
 *
 *              Se crea en modo estandar, no dinamico como el AS_NSP_032: en
 *              dinamico cada linea dispara el sourcing del articulo (unidades,
 *              instantanea) al confirmarla, y con mas de mil lineas el guardado
 *              se vuelve lento. En estandar NetSuite hace el sourcing de todas
 *              las lineas una sola vez, al guardar.
 *
 * CHANGELOG v1.3.0 (2026-11-16):
 * - [FEAT] El codigo de la pantalla va en el ID externo, para que el seguimiento
 *          encuentre el recuento creado.
 * - [FEAT] crearRecuento se separa en armarRecuento y guardarRecuento, para
 *          medir cuanto tarda el save().
 *
 * CHANGELOG v1.2.2 (2026-11-16):
 * - [FIX] Cada lote del detalle lleva el estado de inventario Good
 *         (CONSTANTES.RECUENTO.ESTADO_INVENTARIO).
 *
 * CHANGELOG v1.2.1 (2026-11-16):
 * - [FIX] El lote se escribe por nombre (setSublistText): inventorynumber del
 *         detalle del recuento puede ser un select de lotes.
 *
 * CHANGELOG v1.2.0 (2026-11-16):
 * - [FEAT] actualizarCantidades escribe un lote por fila del CSV; se quita el lote fijo.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FEAT] actualizarCantidades, version de prueba con un solo lote fijo.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Crear el recuento en modo estandar y dejarlo Iniciado.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 */
define(['N/record', 'N/action', 'N/format', '../../constants/AS_RecuentoInventarioManualConstants'],
    (record, action, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function armarRecuento(cabecera, articulos, codigo) {
        const recuento = record.create({ type: CONSTANTES.RECUENTO.TIPO });

        recuento.setValue({ fieldId: 'externalid', value: codigo });
        recuento.setValue({ fieldId: 'subsidiary', value: cabecera.subsidiaria });
        recuento.setValue({ fieldId: 'location',   value: cabecera.ubicacion });
        if (cabecera.departamento) recuento.setValue({ fieldId: 'department', value: cabecera.departamento });
        if (cabecera.clase) recuento.setValue({ fieldId: 'class', value: cabecera.clase });
        recuento.setValue({ fieldId: 'trandate',   value: format.parse({ value: cabecera.fecha, type: format.Type.DATE }) });
        recuento.setValue({ fieldId: 'account',    value: cabecera.cuenta });
        recuento.setValue({ fieldId: 'memo',       value: cabecera.nota });
        recuento.setValue({ fieldId: CONSTANTES.RECUENTO.CAMPO_CARGA, value: true });
        articulos.forEach((articulo, linea) => {
            recuento.setSublistValue({ sublistId: 'item', fieldId: 'item', line: linea, value: articulo });
        });

        return recuento;
    }

    function guardarRecuento(recuento) { return recuento.save(); }

    function comenzarRecuento(recuentoId) {
        action.execute({
            recordType: CONSTANTES.RECUENTO.TIPO,
            id        : CONSTANTES.RECUENTO.ACCION_COMENZAR,
            params    : { recordId: recuentoId },
        });
    }

    /**
     * cantidades: { idArticulo: { total, lotes: [{ lote, cantidad }] } }.
     * La Cantidad del recuento es el total y el detalle lleva un lote por fila.
     * El detalle se vacia antes de escribir: cargar dos veces el mismo archivo
     * no suma. Devuelve cuantas lineas se actualizaron.
     */
    function actualizarCantidades(recuentoId, cantidades) {
        const recuento = record.load({ type: CONSTANTES.RECUENTO.TIPO, id: recuentoId });
        let actualizadas = 0;

        for (let linea = 0; linea < recuento.getLineCount({ sublistId: 'item' }); linea++) {
            const cantidad = cantidades[String(recuento.getSublistValue({ sublistId: 'item', fieldId: 'item', line: linea }))];
            if (!cantidad) continue;
            recuento.setSublistValue({ sublistId: 'item', fieldId: CONSTANTES.RECUENTO.CAMPO_CANTIDAD, line: linea, value: cantidad.total });
            escribirDetalle(recuento.getSublistSubrecord({ sublistId: 'item', fieldId: CONSTANTES.RECUENTO.CAMPO_DETALLE, line: linea }), cantidad.lotes);
            actualizadas++;
        }
        recuento.save();

        return actualizadas;
    }

    /**
     * El detalle del recuento no es como el de las demas transacciones: la
     * sublista es inventorydetail (no inventoryassignment) y el lote va en
     * inventorynumber. NetSuite ignora sin error un campo que no existe, y con
     * el detalle vacio descarta tambien la Cantidad del recuento. Cada lote
     * exige su estado de inventario: va Good para todos, porque el lote es
     * libre y puede no existir todavia. Confirmado en QA, 2026-11-16.
     */
    function escribirDetalle(detalle, lotes) {
        const sublista = CONSTANTES.RECUENTO.DETALLE_SUBLISTA;
        for (let linea = detalle.getLineCount({ sublistId: sublista }) - 1; linea >= 0; linea--) {
            detalle.removeLine({ sublistId: sublista, line: linea });
        }
        lotes.forEach((lote, linea) => {
            detalle.setSublistText({ sublistId: sublista, fieldId: CONSTANTES.RECUENTO.DETALLE_LOTE,      line: linea, text: lote.lote });
            detalle.setSublistValue({ sublistId: sublista, fieldId: CONSTANTES.RECUENTO.DETALLE_ESTADO,   line: linea, value: CONSTANTES.RECUENTO.ESTADO_INVENTARIO });
            detalle.setSublistValue({ sublistId: sublista, fieldId: CONSTANTES.RECUENTO.DETALLE_CANTIDAD, line: linea, value: lote.cantidad });
        });
    }

    return {
        armarRecuento       : armarRecuento,
        guardarRecuento     : guardarRecuento,
        comenzarRecuento    : comenzarRecuento,
        actualizarCantidades: actualizarCantidades,
    };
});
