/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */

/**
 * ASRolesAprobacionContableRepository.js
 *
 * Repositorio de acceso a datos para el custom record
 * customrecord_as_rol_aprobacion_contable.
 *
 * Retorna la lista de IDs de roles habilitados para aprobar
 * contablemente informes de gasto.
 *
 * @author  Andes Salud
 * @version 2.1
 */

define(['N/search'], (search) => {

    /**
     * Retorna todos los IDs de roles activos configurados como
     * aprobadores contables de Informe de Gasto.
     *
     * @returns {string[]} Array de internal IDs de roles (como string)
     */
    const obtenerRoles = () => {

        const roles = [];

        search.create({
            type:    'customrecord_as_rol_aprobacion_contable',
            filters: [
                ['isinactive', search.Operator.IS, 'F']
            ],
            columns: [
                search.createColumn({ name: 'custrecord_as_rol_ap_cont_rol' })
            ]
        }).run().each((result) => {
            const rolId = result.getValue({ name: 'custrecord_as_rol_ap_cont_rol' });
            if (rolId) roles.push(rolId);
            return true;
        });

        return roles;
    };

    return { obtenerRoles };

});
