/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_get_available_inv_numbers
 * @NModuleScope public
 */define(['N/search'],
    function(search){
        /**
         * Devuelve una lista de números disponibles para el item/ubicación.
         * Para seriales: cada elemento representa un serial con disponible=1.
         * Para lotes: cada elemento trae disponible acumulado por número de lote.
         */
        function fetchAvailableInventoryNumbers(itemId, locationId) {
            var res = [];

            // Usamos el tipo "inventorybalance" pues da disponibilidad por ubicación/lote/bin
            var s = search.create({
            type: 'inventorybalance',
            filters: [
                ['item', 'anyof', itemId],
                'AND', ['location', 'anyof', locationId],
                'AND', ['available', 'greaterthan', 0]
            ],
            columns: [
                search.createColumn({ name: 'inventorynumber' }),
                search.createColumn({ name: 'inventorynumber', summary: null }),
                search.createColumn({ name: 'available' }),
                // Si usas bins, descomenta:
                // search.createColumn({ name: 'binnumber' })
            ]
            });

            s.run().each(function(r) {
            var invNumId   = r.getValue({ name: 'inventorynumber' });
            var invNumText = r.getText({  name: 'inventorynumber' });
            var available  = Number(r.getValue({ name: 'available' })) || 0;
            // var binId   = r.getValue({ name: 'binnumber' }) || null;

            if (available > 0 && invNumId) {
                res.push({
                invNumId: invNumId,
                invNumText: invNumText,
                available: available
                // , binId: binId
                });
            }
            return true;
            });

            res.sort(function(a,b){ return b.available - a.available; });
            return res;
        }
        return {
            fetchAvailableInventoryNumbers: fetchAvailableInventoryNumbers
        };
    }
);