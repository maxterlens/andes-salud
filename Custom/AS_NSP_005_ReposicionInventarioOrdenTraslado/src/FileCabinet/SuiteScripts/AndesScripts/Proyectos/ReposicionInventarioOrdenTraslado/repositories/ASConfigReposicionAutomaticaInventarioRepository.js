/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        ASConfigReposicionAutomaticaInventarioRepository.js
 * @description Repositorio de acceso al custom record de configuración de reposición.
 *              Responsabilidad exclusiva: leer registros de customrecord_as_config_rep_auto_inventar.
 */
define(['N/search', 'N/log'], (search, log) => {

    const RECORD_TYPE = 'customrecord_as_config_rep_auto_inventar';

    const FIELDS = {
        SUBSIDIARY : 'custrecord_as_conf_rep_aut_inv_subsidiar',
        LOC_FROM   : 'custrecord_as_conf_rep_aut_inv_ubi_desde',
        LOC_TO     : 'custrecord_as_conf_rep_aut_inv_ubi_hasta',
        ORDEN      : 'custrecord_as_conf_rep_aut_inv_orden',
    };

    /**
     * Retorna todos los registros de configuración activos.
     * Cada elemento representa un par (subsidiaria / origen / destino) habilitado,
     * junto con su orden de prioridad para el reparto de stock en origen.
     *
     * @returns {Array<{
     *   subsidiaryId: string,
     *   locationFrom: string,
     *   locationTo: string,
     *   orden: number|null
     * }>}
     */
    const getActiveConfigs = () => {
        const configSearch = search.create({
            type    : RECORD_TYPE,
            filters : [['isinactive', 'is', 'F']],
            columns : [
                search.createColumn({ name: FIELDS.SUBSIDIARY }),
                search.createColumn({ name: FIELDS.LOC_FROM }),
                search.createColumn({ name: FIELDS.LOC_TO }),
                search.createColumn({ name: FIELDS.ORDEN })
            ]
        });

        const configs = [];
        configSearch.run().each(result => {
            const subsidiaryId = result.getValue({ name: FIELDS.SUBSIDIARY });
            const locationFrom  = result.getValue({ name: FIELDS.LOC_FROM });
            const locationTo    = result.getValue({ name: FIELDS.LOC_TO });
            const ordenRaw       = result.getValue({ name: FIELDS.ORDEN });
            const orden          = (ordenRaw === '' || ordenRaw === null || ordenRaw === undefined)
                ? null
                : Number(ordenRaw);

            if (subsidiaryId && locationFrom && locationTo) {
                configs.push({ subsidiaryId, locationFrom, locationTo, orden });
            }
            return true;
        });

        log.error('ConfigReposicionRepository.getActiveConfigs',
            `Configuraciones activas encontradas: ${configs.length}`
        );
        return configs;
    };

    return { getActiveConfigs };
});
