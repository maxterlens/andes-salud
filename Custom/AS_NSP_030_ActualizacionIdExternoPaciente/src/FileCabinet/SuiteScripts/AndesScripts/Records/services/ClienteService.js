/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file ClienteService.js
 * @description Service — reglas de negocio del registro Cliente.
 */
define([
    'N/error',
    '../repositories/ClienteRepository'
], (error, ClienteRepository) => {

    const FIELDS = {
        NUM_FICHA: 'custentity_pac_numficha',
        EXTERNAL_ID: 'externalid'
    };

    const normalizar = (valor) => String(valor ?? '').trim();

    /**
     * Obtiene el número de ficha y el externalid actual del registro, normalizados.
     * @param {record.Record} rec
     * @returns {{ numFicha: string, idExternoActual: string }}
     */
    const leerValores = (rec) => ({
        numFicha: normalizar(rec.getValue({ fieldId: FIELDS.NUM_FICHA })),
        idExternoActual: normalizar(rec.getValue({ fieldId: FIELDS.EXTERNAL_ID }))
    });

    /**
     * Lanza un error si el número de ficha ya está asignado como externalid a otro cliente.
     * No valida si la ficha está vacía o si no cambia respecto del externalid actual.
     * @param {record.Record} newRecord - Registro del cliente en beforeSubmit.
     */
    const validarIdExternoDuplicado = (newRecord) => {
        const { numFicha, idExternoActual } = leerValores(newRecord);

        if (!numFicha || numFicha === idExternoActual) return;

        const duplicado = ClienteRepository.buscarClientePorIdExterno(numFicha, newRecord.id);
        if (!duplicado) return;

        throw error.create({
            name: 'AS_EXTERNALID_DUPLICADO',
            message: `El número de ficha "${numFicha}" ya está asignado como ID externo al cliente ` +
                `${duplicado.entityid} (ID interno ${duplicado.id}). No se puede guardar el registro.`,
            notifyOff: true
        });
    };

    /**
     * Copia el número de ficha del paciente al externalid del cliente mediante submitFields.
     * Si el número de ficha está vacío, se limpia el externalid. Solo escribe si el valor cambia.
     * @param {record.Record} newRecord - Registro del cliente en afterSubmit.
     */
    const copiarNumFichaAIdExterno = (newRecord) => {
        const { numFicha, idExternoActual } = leerValores(newRecord);

        if (numFicha === idExternoActual) return;

        ClienteRepository.actualizarIdExterno(newRecord.id, numFicha);

        log.error({
            title: 'ClienteService.copiarNumFichaAIdExterno',
            details: `Cliente ${newRecord.id}: externalid "${idExternoActual}" -> "${numFicha}"`
        });
    };

    return { validarIdExternoDuplicado, copiarNumFichaAIdExterno };
});
