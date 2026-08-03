/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Dao_Catalogos — Búsquedas de catálogos para el módulo Gestión Solicitud de Consumo.
 *
 * Centraliza todas las consultas a catálogos nativos de NetSuite
 * (subsidiarias, departamentos, clases, artículos, ubicaciones y responsable de ubicación).
 * Al usar N/search directamente, el Suitelet puede ejecutarlas con runasrole=ADMINISTRATOR,
 * evitando la restricción de permisos del rol Centro de Empleados sobre el tipo Location (-103).
 */
define(['N/log', 'N/search'], function (nLog, search) {

    /**
     * Recupera subsidiarias activas ordenadas por nombre.
     * @returns {{ id: string, name: string }[]}
     */
    function buscarSubsidiarias() {
        try {
            const resultados = search.create({
                type   : search.Type.SUBSIDIARY,
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name', sort: search.Sort.ASC })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            return resultados.map(function (r) {
                return { id: r.getValue('internalid'), name: r.getValue('name') };
            });
        } catch (e) {
            nLog.error('GSC_Dao_Catalogos.buscarSubsidiarias - error', e);
            return [];
        }
    }

    /**
     * Recupera departamentos (centros de costo) activos ordenados por nombre.
     * @returns {{ id: string, name: string }[]}
     */
    function buscarDepartamentos() {
        try {
            const resultados = search.create({
                type   : search.Type.DEPARTMENT,
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name', sort: search.Sort.ASC })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            return resultados.map(function (r) {
                return { id: r.getValue('internalid'), name: r.getValue('name') };
            });
        } catch (e) {
            nLog.error('GSC_Dao_Catalogos.buscarDepartamentos - error', e);
            return [];
        }
    }

    /**
     * Recupera clases activas ordenadas por nombre.
     * @returns {{ id: string, name: string }[]}
     */
    function buscarClases() {
        try {
            const resultados = search.create({
                type   : search.Type.CLASSIFICATION,
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name', sort: search.Sort.ASC })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            return resultados.map(function (r) {
                return { id: r.getValue('internalid'), name: r.getValue('name') };
            });
        } catch (e) {
            nLog.error('GSC_Dao_Catalogos.buscarClases - error', e);
            return [];
        }
    }

    /**
     * Recupera ubicaciones que tienen responsable asignado (custrecord_2win_responsable_ubicacion).
     * Opcionalmente filtra por subsidiaria.
     * Esta búsqueda corre con el rol del deployment (ADMINISTRATOR), evitando la restricción
     * de permisos del tipo Location (-103) en el rol Centro de Empleados.
     *
     * @param {string} [subsidiariaId] - Internal ID de la subsidiaria para filtrar
     * @returns {{ id: string, name: string }[]}
     */
    function buscarUbicaciones(subsidiariaId) {
        try {
            const filtros = [['custrecord_2win_responsable_ubicacion', 'noneof', '@NONE@']];
            if (subsidiariaId) {
                filtros.push('AND', ['subsidiary', 'anyof', subsidiariaId]);
            }

            const resultados = search.create({
                type   : search.Type.LOCATION,
                filters: filtros,
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name', sort: search.Sort.ASC })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            return resultados.map(function (r) {
                return { id: r.getValue('internalid'), name: r.getValue('name') };
            });
        } catch (e) {
            nLog.error('GSC_Dao_Catalogos.buscarUbicaciones - error', e);
            return [];
        }
    }

    /**
     * Recupera artículos de inventario activos ordenados por itemid.
     * Incluye la unidad de stock para propagarla al detalle.
     * @returns {{ id: string, name: string, unidad: string, unidadId: string }[]}
     */
    function buscarArticulos() {
        try {
            const resultados = search.create({
                type   : search.Type.ITEM,
                filters: [
                    ['isinactive', 'is', 'F'],
                    'AND',
                    ['type', 'anyof', ['InvtPart', 'Assembly', 'Kit', 'NonInvtPart']]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'itemid',    sort: search.Sort.ASC }),
                    search.createColumn({ name: 'stockunit' })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            return resultados.map(function (r) {
                return {
                    id      : r.getValue('internalid'),
                    name    : r.getValue('itemid'),
                    unidad  : r.getText('stockunit')  || '',
                    unidadId: r.getValue('stockunit') || ''
                };
            });
        } catch (e) {
            nLog.error('GSC_Dao_Catalogos.buscarArticulos - error', e);
            return [];
        }
    }

    /**
     * Recupera el internal ID del empleado responsable de una ubicación.
     * @param {string|number} ubicacionId
     * @returns {string|null}
     */
    function obtenerResponsableUbicacion(ubicacionId) {
        try {
            const datos = search.lookupFields({
                type   : search.Type.LOCATION,
                id     : ubicacionId,
                columns: ['custrecord_2win_responsable_ubicacion']
            });
            const lista = datos.custrecord_2win_responsable_ubicacion;
            if (lista && lista.length > 0) {
                return String(lista[0].value);
            }
            return null;
        } catch (e) {
            nLog.error('GSC_Dao_Catalogos.obtenerResponsableUbicacion - error', e);
            return null;
        }
    }

    return {
        buscarSubsidiarias,
        buscarDepartamentos,
        buscarClases,
        buscarUbicaciones,
        buscarArticulos,
        obtenerResponsableUbicacion
    };
});
