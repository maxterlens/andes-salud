/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Script para validar el RUT de la subsidiaria.
 */

define(["N/search", "N/log"], function (search, nLog) {
    const SUBSIDIARIA_ANDES_SALUD = {
        id: "subsidiary",
        fields: {
            rut: "custrecord_2winrutsubsiudiaria"
        }
    };

    /**
     * @function validarRutChileno - Valida que el formato de rut sea valido.
     * @param {string} rut - Rut a validar.
     * @returns {boolean}
     */
    const validarRutChileno = (rut) => {
        if (!/^[0-9]+[-‐]{1}[0-9kK]{1}$/.test(rut)) return false;
        let tmp = rut.split("-");
        let digv = tmp[1];
        rut = tmp[0];
        if (digv === "K") digv = "k";
        let M = 0,
            S = 1;
        for (; rut; rut = Math.floor(rut / 10)) S = (S + (rut % 10) * (9 - (M++ % 6))) % 11;

        // ✅ Comparar el dígito calculado contra el dígito verificador recibido
        const dvCalculado = S ? (S - 1).toString() : "k";
        return dvCalculado === digv;
    };

    /**
     * @function beforeSubmit - Ejecuta operacion en base a datos recuperados antes de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function beforeSubmit(context) {
        try {
            nLog.debug("beforeSubmit - context", context);
            const newRecord = context.newRecord;
            nLog.debug(`beforeSubmit - ${context.type} - newRecord`, newRecord);

            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                let rut = newRecord.getValue({ fieldId: SUBSIDIARIA_ANDES_SALUD.fields.rut });
                nLog.debug("beforeSubmit - campos", {
                    rut: rut
                });

                // Validar que el campo rut no este vacio
                if (!rut) throw new Error("<b>Error:</b> El campo <b>RUT</b> no debe estar vacio. Por favor diligencie el campo");

                // Validar que el formato de rut sea valido
                if (!validarRutChileno(rut)) throw new Error("<b>Error:</b> El formato del <b>RUT</b> no es valido. Por favor verifique el campo");

                // Validar que el rut sea unico
                let busquedaSubsidiaria = search.create({
                    type: SUBSIDIARIA_ANDES_SALUD.id,
                    filters: [[SUBSIDIARIA_ANDES_SALUD.fields.rut, "is", rut]],
                    columns: [search.createColumn({ name: SUBSIDIARIA_ANDES_SALUD.fields.rut })]
                });

                // Excluir el registro actual en caso de una edicion
                if (context.type === context.UserEventType.EDIT) {
                    busquedaSubsidiaria.filters.push(
                        search.createFilter({
                            name: "internalid",
                            operator: search.Operator.NONEOF,
                            values: newRecord.id
                        })
                    );
                }

                let resultado = busquedaSubsidiaria.run().getRange({ start: 0, end: 1 });

                if (resultado.length > 0) throw new Error(`<b>Error:</b> El RUT <b>${rut}</b> ya existe en el sistema. Por favor verifique el campo`);
            }
        } catch (err) {
            nLog.error("beforeSubmit - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
            // throw err;
        }
    }

    return {
        beforeSubmit: beforeSubmit
    };
});
