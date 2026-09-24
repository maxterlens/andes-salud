/**
 * AS_NSP_025 — Facturas DTE Rechazadas
 * @description Sincroniza una sola fila de customrecord_2win_recepcion_dte_rechaza
 *              hacia customrecord_as_dte_rechazado. Lo llama el trigger
 *              (hoy AS_FacturasDTERechazadas_UE_2.1.js, un afterSubmit -ver ese archivo
 *              para el por que-) apenas 2WIN crea o edita la fila origen.
 *
 *              No sabe nada de quien lo llama a proposito: recibe un id, devuelve los
 *              datos resueltos (vendor, subsidiaria, id del registro) para que el
 *              trigger los loguee, y no loguea nada aca. Asi el trigger se puede
 *              cambiar -UE hoy, Event Subscriber el dia que la cuenta lo soporte- sin
 *              tocar este archivo.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['../repositories/AS_FacturasDTERechazadasSyncRepository'],
    (syncRepository) => {

    function sincronizarFila(idOrigen) {
        const fila = syncRepository.obtenerFilaOrigenPorId(idOrigen);

        if (!fila) {
            return null;
        }

        const idCache = syncRepository.guardarEnCache(fila);

        return {
            rutEmisor    : fila.rutemisor,
            idVendor     : fila.idvendor,
            rutReceptor  : fila.rutreceptor,
            idSubsidiaria: fila.idsubsidiaria,
            idCache      : idCache,
        };
    }

    return {
        sincronizarFila: sincronizarFila,
    };
});
