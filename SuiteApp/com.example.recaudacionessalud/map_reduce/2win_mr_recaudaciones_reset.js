/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(["N/query", "N/log", "N/record"], function (query, nLog, record) {
    function getInputData() {
        const sql = `
            select
            transaction.tranid,
            transaction.id,
            transaction.type,
            transaction.memo,
            transaction.tranDate,
            transaction.custbody_2winfolioacepta
            from
            transaction
            where
            transaction.tranDate = '12/01/2026'

            and
            transaction.custbody_2win_created_from_income_flow = 'T'
            ORDER BY
            transaction.id DESC`;
        const pagedQuery = query.runSuiteQLPaged({
            query: sql,
            pageSize: 1000
        });

        const pageCount = pagedQuery.pageRanges.length;
        const allResults = [];

        for (let i = 0; i < pageCount; i++) {
            const page = pagedQuery.fetch({ index: i });
            allResults.push(...page.data.asMappedResults());
        }

        return allResults;
    }

    function map(context) {
        try {
            const searchResult = JSON.parse(context.value);
            const { tranid, id, type, memo, custbody_2winfolioacepta } = searchResult;
            const t3 = {
                SalesOrd: "salesorder",
                CustInvc: "invoice",
                Journal: "journalentry",
                CustPymt: "customerpayment",
                CustCred: "creditmemo"
            };
            if (t3[type]) {
                nLog.debug("Processing Transaction", `ID: ${id},TranId: ${tranid}, Type: ${type}, Memo: ${memo}, Folio Acepta: ${custbody_2winfolioacepta}`);
                record.delete({
                    type: t3[type],
                    id: id
                });
            }
        } catch (error) {
            nLog.error("Map Error", error.message);
        }
    }

    // function reduce(context) {}

    // function summarize(summary) {}

    return {
        getInputData: getInputData,
        map: map
        // reduce: reduce,
        // summarize: summarize
    };
});
