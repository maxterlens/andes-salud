define(['N/search'],

    function (search) {

        function getDataSearch(createSearch) {

            var searchResults = [];

            var saveSearch = search.create(createSearch);

            var searchResultCount = saveSearch.runPaged().count;
            if (searchResultCount == 0) {
                log.audit({ title: 'getDataSearch - Excepcion', details: 'Dato no Encontrado - Tabla: ' + createSearch.type });
                return searchResults;
            }

            saveSearch.run().each(function (item) {
                var objectCompiled = {};
                for (var i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });

            return searchResults;
        }

        return {
            getDataSearch: getDataSearch
        }
    }
);
