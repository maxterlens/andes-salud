/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Script para validar el RUT de entidades y prevenir duplicados.
 */

define(["N/search", "N/log"], function (search, nLog) {

    const ENTITY_FIELDS = {
        rut: "custentity_2wrut"
    };

    /**
     * @function validarRutChileno - Valida que el formato de rut sea valido.
     * @param {string} rut - Rut a validar.
     * @returns {boolean}
     */
    const validarRutChileno = (rut) => {
        if (!/^[0-9]+[-|‐]{1}[0-9kK]{1}$/.test(rut)) {
            return false;
        }
        let tmp = rut.split("-");
        let digv = tmp[1];
        rut = tmp[0];
        if (digv === "K") {
            digv = "k";
        }
        let M = 0;
        let S = 1;
        for (; rut; rut = Math.floor(rut / 10)) {
            S = (S + ((rut % 10) * (9 - (M++ % 6)))) % 11;
        }
        return (S ? `${S - 1}` : "k") === digv;
    };

    /**
     * @function beforeSubmit - Ejecuta operacion en base a datos recuperados antes de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function beforeSubmit(context) {
        try {
            const newRecord = context.newRecord;
            nLog.debug(`beforeSubmit - ${context.type} - newRecord`, newRecord);

            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {

                // Si se está cambiando a inactivo, no validar RUT
                if (context.type === context.UserEventType.EDIT) {
                    const isInactive = newRecord.getValue({ fieldId: "isinactive" });
                    
                    if (isInactive === true || isInactive === "T") {
                        nLog.debug("beforeSubmit", "La entidad se está cambiando a inactivo. No se valida el RUT.");
                        return;
                    }
                }

                let rut = newRecord.getValue({ fieldId: ENTITY_FIELDS.rut });
                nLog.debug("beforeSubmit - campos", { rut: rut });

                // Si el RUT está vacío, no se realiza ninguna validación.
                if (!rut) {
                    nLog.debug("beforeSubmit", "El campo RUT está vacío. No se requiere validación.");
                    return;
                }

                // Validar que el formato de rut sea valido
                if (!validarRutChileno(rut)) {
                    throw new Error("<b>Error:</b> El formato del <b>RUT</b> no es válido. Por favor, verifique el campo.");
                }

                // Validar que el rut sea unico en todas las entidades
                const entitySearch = search.create({
                    type: newRecord.type,
                    filters: [
                        [ENTITY_FIELDS.rut, "is", rut]
                    ],
                    columns: [
                        "entityid"
                    ]
                });

                // Excluir el registro actual en caso de una edicion
                if (context.type === context.UserEventType.EDIT) {
                    entitySearch.filters.push(search.createFilter({
                        name: "internalid",
                        operator: search.Operator.NONEOF,
                        values: newRecord.id
                    }));
                }

                const resultSet = entitySearch.run();
                const firstResult = resultSet.getRange({ start: 0, end: 1 });

                if (firstResult.length > 0) {
                    const entityId = firstResult[0].getValue("entityid");
                    throw new Error(`<b>Error:</b> El RUT <b>${rut}</b> ya existe en el sistema para la entidad <b>${entityId}</b>. Por favor, verifique el campo.`);
                }
            }
        } catch (err) {
            nLog.error("beforeSubmit - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
        }
    }

    return {
        beforeSubmit: beforeSubmit
    };
});
