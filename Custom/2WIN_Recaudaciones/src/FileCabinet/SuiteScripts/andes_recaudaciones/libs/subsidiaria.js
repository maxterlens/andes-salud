define(["N/search", "N/log"], function (search, nLog) {
    // Caché para búsquedas de subsidiaria - optimización para flujos con muchos movimientos
    let subsCache = {};

    const getSubsidiaria = (rutSubsidiaria) => {
        try {
            // Verificar caché primero - optimización
            const rutKey = rutSubsidiaria?.trim();
            if (subsCache[rutKey]) {
                return subsCache[rutKey];
            }

            const subsidiaria = search.create({
                type: search.Type.SUBSIDIARY,
                filters: [["custrecord_2winrutsubsiudiaria", "is", rutSubsidiaria]],
                columns: ["internalid"]
            });
            const result = subsidiaria.run().getRange({ start: 0, end: 1 });
            const subsidiaryId = result.length > 0 ? result[0].getValue("internalid") : null;
            
            // Guardar en caché
            if (subsidiaryId) {
                subsCache[rutKey] = subsidiaryId;
            }
            
            return subsidiaryId;
        } catch (error) {
            nLog.error("getTratante", error);
            return null;
        }
    };

    /**
     * Obtiene el representing customer de una subsidiaria
     * @param {number|string} subsidiariaId - ID de la subsidiaria
     * @returns {number|null} - ID del representing customer o null si no se encuentra
     */
    const getRepresentingCustomer = (subsidiariaId) => {
        try {
            const subsidiaria = search.create({
                type: search.Type.SUBSIDIARY,
                filters: [["internalid", "is", subsidiariaId]],
                columns: ["representingcustomer"]
            });
            const result = subsidiaria.run().getRange({ start: 0, end: 1 });
            return result.length > 0 ? result[0].getValue("representingcustomer") : null;
        } catch (error) {
            nLog.error("getRepresentingCustomer", error);
            return null;
        }
    };

    return { getSubsidiaria, getRepresentingCustomer };
});
