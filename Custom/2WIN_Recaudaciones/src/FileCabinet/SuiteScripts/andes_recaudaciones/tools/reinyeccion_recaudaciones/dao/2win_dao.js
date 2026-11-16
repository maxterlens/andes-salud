define(['N/search'],

    function (search) {

        const getDataSearch = function (createSearch) {

            let maxResultCount = 4000;
            let searchResults = [];

            try {

                let saveSearch = search.create(createSearch);

                let searchResultCount = saveSearch.runPaged().count;
                if (searchResultCount == 0) {
                    log.audit({ title: 'getDataSearch - Excepcion', details: 'Dato no Encontrado - Tabla: ' + createSearch.type });
                    return searchResults;
                }

                if (searchResultCount > maxResultCount) {

                    // Only return 1,000 at a time based on the index values.
                    let maxLimitRange = 1000;
                    let start = 0;

                    do {

                        let resultslice = saveSearch.run().getRange({ start: start, end: (start + maxLimitRange) });
                        log.audit({ title: 'getDataSearch', details: "resultslice.length: " + resultslice.length });
                        resultslice.forEach(function (item) {

                            let objectCompiled = {};
                            for (let i = 0; i < item.columns.length; i++) {
                                objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                            }
                            searchResults.push(objectCompiled);

                            start++;
                        });
                        log.audit({ title: 'getDataSearch', details: "start: " + start });

                    } while (resultslice.length >= maxLimitRange);

                } else {

                    saveSearch.run().each(function (item) {
                        let objectCompiled = {};
                        for (let i = 0; i < item.columns.length; i++) {
                            objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                        }
                        searchResults.push(objectCompiled);
                        return true;
                    });
                }

            } catch (error) {
                log.error("getDataSearch", error);
                throw error;
            }

            return searchResults;
        }

        return {
            getDataSearch: getDataSearch
        }
    }
);
