define(["N/query"], function (query) {
    function validarSubsidiarias(FolioA, FolioB) {
        const sql = `select distinct
                transaction.id,
                tl.subsidiary,
                transaction.custbody_2winfolioacepta,
                transaction.type
                from
                transaction
                inner join transactionLine as tl on tl.transaction = transaction.id
                where
                transaction.custbody_2winfolioacepta is not null
                and transaction.custbody_2winfolioacepta  = any(?,?)`;
        const resultados = query
            .runSuiteQL({
                query: sql,
                params: [FolioA, FolioB]
            })
            .asMappedResults();

        return resultados[0]?.subsidiary === resultados[1]?.subsidiary;
    }
    return { validarSubsidiarias };
});
