/**
 * AS_NSP_026 — Nomina de Pago (seleccion manual de transacciones)
 * @description Logica de negocio: crear la Nomina de Pago junto con los detalles de
 *              SOLO las transacciones que el usuario selecciono en el Suitelet (a
 *              diferencia del comportamiento actual de 2win_ue_nomina_banco.js, que
 *              incluye automaticamente todo lo que matchea el filtro).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    '../repositories/NominaPagoRepository'
], (NominaPagoRepository) => {

    const ESTADO_NOMINA_GENERADA = 'Nómina Generada';

    /**
     * Crea la Nomina de Pago y un detalle por cada transaccion seleccionada.
     *
     * @param {Object} datos
     * @param {Object} datos.cabecera - { empresa, banco, cuentaBanco, fecha, descripcion }
     * @param {Array<{id:string, monto:number}>} datos.transaccionesSeleccionadas
     * @returns {{nominaId:number, cantidadDetalles:number}}
     */
    function crearNominaConDetalle(datos) {
        const nominaId = NominaPagoRepository.crearNomina(datos.cabecera);

        let cantidadDetalles = 0;
        (datos.transaccionesSeleccionadas || []).forEach((trx) => {
            NominaPagoRepository.crearDetalle({
                nominaId: nominaId,
                transaccionId: trx.id,
                monto: trx.monto
            });
            cantidadDetalles++;
        });

        NominaPagoRepository.actualizarEstado(nominaId, ESTADO_NOMINA_GENERADA);

        return { nominaId, cantidadDetalles };
    }

    return { crearNominaConDetalle };
});
