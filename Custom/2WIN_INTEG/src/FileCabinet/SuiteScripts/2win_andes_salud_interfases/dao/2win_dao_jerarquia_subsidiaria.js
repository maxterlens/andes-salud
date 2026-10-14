/**
 * @NApiVersion 2.x
 * @module ./2win_dao_jerarquia_subsidiaria.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log"], function (dao, search, nLog) {
    /**
     * @function obtenerArbol - Recupera todas las subsidiarias con su padre en una sola busqueda.
     * @returns {Object} - { hijosPorPadre: {idPadre: [idHijo]}, inactivas: {id: true} }
     */
    function obtenerArbol() {
        var hijosPorPadre = {};
        var inactivas = {};

        // Tipo, filtros y columnas para la busqueda
        var objSearch = {
            type: "subsidiary",
            filters: [],
            columns: [
                search.createColumn({ name: "internalid", label: "internalid" }),
                search.createColumn({ name: "parent", label: "parent" }),
                search.createColumn({ name: "isinactive", label: "isinactive" })
            ]
        };

        // Ejecutar busqueda
        var resultados = dao.obtenerResultados(objSearch);

        for (var i = 0; i < resultados.length; i++) {
            var fila = resultados[i];
            var id = Number(fila.internalid);

            if (fila.isinactive === true || fila.isinactive === "T") {
                inactivas[id] = true;
            }

            // La raiz de la jerarquia no tiene padre
            if (fila.parent) {
                var clavePadre = Number(fila.parent);
                if (!hijosPorPadre[clavePadre]) {
                    hijosPorPadre[clavePadre] = [];
                }
                hijosPorPadre[clavePadre].push(id);
            }
        }

        return { hijosPorPadre: hijosPorPadre, inactivas: inactivas };
    }

    /**
     * @function expandirDescendientes - Agrega a la lista todas las subsidiarias que cuelgan de las indicadas.
     * Se usa cuando el registro tiene "Incluir hijos" marcado: NetSuite guarda solo la subsidiaria
     * seleccionada, y los descendientes quedan implicitos en la jerarquia.
     * @param {Array} idsSeleccionadas - Subsidiarias asignadas explicitamente al registro.
     * @returns {Array} - Las seleccionadas mas todos sus descendientes, sin repetidos.
     */
    function expandirDescendientes(idsSeleccionadas) {
        try {
            nLog.debug("expandirDescendientes - idsSeleccionadas", idsSeleccionadas);

            if (!idsSeleccionadas || idsSeleccionadas.length === 0) {
                return [];
            }

            var arbol = obtenerArbol();
            var resultado = [];
            var visitadas = {};
            var seleccionadas = {};
            var pendientes = [];

            for (var i = 0; i < idsSeleccionadas.length; i++) {
                var idSeleccionada = Number(idsSeleccionadas[i]);
                seleccionadas[idSeleccionada] = true;
                pendientes.push(idSeleccionada);
            }

            // Recorrido por amplitud. "visitadas" corta repetidos y cualquier ciclo en los datos.
            while (pendientes.length > 0) {
                var actual = pendientes.shift();

                if (visitadas[actual]) {
                    continue;
                }
                visitadas[actual] = true;

                // Una descendiente inactiva no se informa; una seleccionada a mano se respeta siempre
                if (arbol.inactivas[actual] && !seleccionadas[actual]) {
                    continue;
                }

                resultado.push(actual);

                var hijos = arbol.hijosPorPadre[actual] || [];
                for (var j = 0; j < hijos.length; j++) {
                    pendientes.push(hijos[j]);
                }
            }

            nLog.debug("expandirDescendientes - resultado", resultado);
            return resultado;
        } catch (error) {
            nLog.error("expandirDescendientes - error", error);
            throw error;
        }
    }

    return {
        expandirDescendientes: expandirDescendientes
    };
});
