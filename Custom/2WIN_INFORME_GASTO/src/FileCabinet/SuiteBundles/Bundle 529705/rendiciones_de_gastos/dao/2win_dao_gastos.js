define(['./2win_dao', 'N/search', 'N/record'],

    function (dao, search, record) {

        function findByInternalId(internalid) {

            try {

                log.debug('findByInternalId', internalid);

                var tabItem = {
                    type: "transaction",
                    settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                    filters:
                        [
                            ["internalidnumber", "equalto", internalid],
                            "AND",
                            ["type", "anyof", "ExpRept"],
                            "AND",
                            ["accounttype", "anyof", "Expense"]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "id" }),
                            search.createColumn({ name: "trandate", label: "fecha" }),
                            search.createColumn({ name: "debitamount", label: "debito" }),
                            search.createColumn({ name: "creditamount", label: "credito" }),
                            search.createColumn({ name: "account", label: "id_cuenta" }),
                            search.createColumn({ name: "entity", label: "nombre" }),
                            search.createColumn({ name: "internalid", join: "employee", label: "id_empleado" }),
                            search.createColumn({ name: "entityid", join: "employee", label: "nombre_empleado" })
                        ]
                }

                return dao.getDataSearch(tabItem);

            } catch (error) {
                throw error;
            }
        }

        return {
            findByInternalId: findByInternalId
        }
    }
);
