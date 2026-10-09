/**
 * AS_NSP_026 — Nomina de Pago (seleccion manual de transacciones)
 * @description Creacion/actualizacion de customrecord_2w_nominas_pago y
 *              customrecord_2w_detalle_nomina_pago. Sin logica de negocio (eso vive
 *              en ../services/NominaPagoService.js) — solo operaciones de record.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record'], (record) => {

    /**
     * Crea el registro customrecord_2w_nominas_pago.
     * @param {Object} datos - { empresa, banco, cuentaBanco, fecha, descripcion }
     * @returns {number} internal id de la nomina creada
     */
    function crearNomina(datos) {
        const nomina = record.create({ type: 'customrecord_2w_nominas_pago' });
        nomina.setValue({ fieldId: 'custrecord_2w_nompago_empresa', value: datos.empresa });
        nomina.setValue({ fieldId: 'custrecord_2w_nompago_banco', value: datos.banco });
        nomina.setValue({ fieldId: 'custrecord_2w_nompago_cuenta_banco', value: datos.cuentaBanco });
        if (datos.fecha) nomina.setText({ fieldId: 'custrecord_2w_nompago_fecha', text: datos.fecha });
        if (datos.descripcion) nomina.setValue({ fieldId: 'custrecord_2w_nompago_descripcion', value: datos.descripcion });
        return nomina.save();
    }

    /**
     * Crea un customrecord_2w_detalle_nomina_pago para una transaccion seleccionada.
     * @param {Object} datos - { nominaId, transaccionId, monto }
     * @returns {number} internal id del detalle creado
     */
    function crearDetalle(datos) {
        const detalle = record.create({ type: 'customrecord_2w_detalle_nomina_pago' });
        detalle.setValue({ fieldId: 'custrecord_2w_detpago_nomina', value: datos.nominaId });
        detalle.setValue({ fieldId: 'custrecord_2w_detpago_transaccion', value: datos.transaccionId });
        detalle.setValue({ fieldId: 'custrecord_2w_detpago_monto_a_pagar', value: datos.monto });
        return detalle.save();
    }

    /**
     * Actualiza el campo Estado de una nomina de pago.
     * @param {number} nominaId
     * @param {string} estado
     */
    function actualizarEstado(nominaId, estado) {
        record.submitFields({
            type: 'customrecord_2w_nominas_pago',
            id: nominaId,
            values: { custrecord_2win_estado_nomina_pago: estado }
        });
    }

    return { crearNomina, crearDetalle, actualizarEstado };
});
