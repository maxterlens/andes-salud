/**
 * @NApiVersion 2.1
 */
define(["N/record", "N/search", "N/log", "N/query"], function (record, search, nLog, query) {
    // Caché para búsquedas por RUT - optimización para flujos con muchos movimientos
    let rutCache = {};

    function upsertCustomer(data) {
        try {
            // data.IdPaciente viene del JSON
            const customerId = data.IdPaciente;

            // Buscar si existe
            const existingId = findCustomerById(customerId);

            if (existingId) {
                // Actualizar si es necesario, por ahora solo retornamos el ID
                // log.debug('CustomerDAO', `Cliente existente: ${existingId}`);
                return existingId;
            } else {
                return null;
            }
        } catch (e) {
            nLog.error("CustomerDAO Error", e);
            throw e;
        }
    }

    function findCustomerById(externalId) {
        const searchObj = search.create({
            type: record.Type.CUSTOMER,
            filters: [
                ["externalid", "is", externalId],
                "AND",
                ["isinactive", "is", "F"]
                // O usar externalid si el JSON trae eso: ['externalid', 'is', externalId]
            ],
            columns: ["internalid"]
        });

        const results = searchObj.run().getRange({ start: 0, end: 1 });
        if (results && results.length > 0) {
            return results[0].getValue("internalid");
        }
        return null;
    }
    function getByRut(rut) {
        // Verificar caché primero - optimización
        const rutKey = rut?.trim();
        if (rutCache[rutKey]) {
            return rutCache[rutKey];
        }

        const customerRut = query
            .runSuiteQL({
                query: `
                    select top 1
                        customer.id
                    from
                        customer
                    where
                        customer.custentity_2wrut = ?
                        AND customer.isinactive = 'F'
                `,
                params: [rutKey]
            })
            .asMappedResults();

        const customerId = customerRut[0]?.id;
        if (customerId) {
            rutCache[rutKey] = customerId;
        }
        return customerId;
    }

    return {
        upsertCustomer: upsertCustomer,
        getByRut
    };
});
