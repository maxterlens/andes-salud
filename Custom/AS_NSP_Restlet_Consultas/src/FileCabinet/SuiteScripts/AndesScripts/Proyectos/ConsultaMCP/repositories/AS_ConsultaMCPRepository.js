/**
 * AS_NSP_025 — Consulta MCP con creacion controlada
 * @description Unico punto del modulo que toca datos. Las lecturas usan N/query,
 *              N/search, N/dataset, N/record y N/file. Solo se persisten nuevas
 *              busquedas guardadas y datasets, nunca registros ni archivos.
 *
 *              Las tres consultas fijas (campos, custom record, carpeta) viven aca y
 *              no pasan por la whitelist porque su SQL no llega desde afuera: la
 *              whitelist protege solo a la operacion suiteql.
 *
 *              La paginacion y getRange limitan las filas antes de convertirlas,
 *              para no materializar respuestas completas en el handler.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * CHANGELOG v1.1.0 (2026-09-25):
 * - [FEAT] Lectura paginada, busquedas guardadas y dinamicas, registros y archivos.
 * - [FEAT] Creacion limitada a Saved Searches y Datasets nuevos.
 */
define(['N/query', 'N/search', 'N/dataset', 'N/record', 'N/file', './../lib/AS_ConsultaMCPConstants'],
    (query, search, dataset, record, file, CONSTANTES) => {

    const ejecutarConsulta = (consulta) => {
        return correr(consulta, []);
    };

    const obtenerCamposCustom = (tabla) => {
        return correr('SELECT scriptid, label, fieldvaluetype FROM ' + tabla + ' ORDER BY scriptid', []);
    };

    const obtenerCustomRecord = (scriptid) => {
        return correr('SELECT id, scriptid, name, isinactive FROM customrecordtype WHERE scriptid = ?', [scriptid]);
    };

    const obtenerCamposDeCustomRecord = (scriptid) => {
        return correr('SELECT c.scriptid, c.label, c.fieldvaluetype'
                    + ' FROM customrecordcustomfield c'
                    + ' JOIN customrecordtype t ON t.id = c.rectype'
                    + ' WHERE t.scriptid = ?'
                    + ' ORDER BY c.scriptid', [scriptid]);
    };

    const obtenerArchivosDeCarpeta = (carpeta) => {
        const archivos = correr('SELECT f.id, f.name, f.filetype, f.filesize, f.lastmodifieddate'
                             + ' FROM file f'
                             + ' JOIN mediaitemfolder mf ON mf.id = f.folder'
                             + ' WHERE UPPER(mf.name) = UPPER(?)'
                             + ' ORDER BY f.name', [carpeta]);

        return archivos.filter((archivo) => {
            const ruta = file.load({ id: archivo.id }).path;
            return estaEnCarpetaPermitida(ruta);
        });
    };

    const estaEnCarpetaPermitida = (rutaArchivo) => {
        const ruta = String(rutaArchivo || '').replace(/\\/g, '/').replace(/^\/+/, '');
        return CONSTANTES.CARPETAS_ARCHIVOS_PERMITIDAS.some((carpeta) => {
            return ruta.startsWith(carpeta + '/');
        });
    };

    const leerRegistro = (tipo, id, sublista, desde) => {
        const registro = record.load({ type: tipo, id: id, isDynamic: false });
        const campos = {};

        registro.getFields().forEach((campo) => {
            campos[campo] = registro.getValue({ fieldId: campo });
        });

        const sublistas = {};
        registro.getSublists().forEach((nombre) => {
            const total = registro.getLineCount({ sublistId: nombre });
            sublistas[nombre] = { total: total };

            if (!sublista || sublista !== nombre) return;

            const columnas = registro.getSublistFields({ sublistId: nombre });
            const filas = [];
            const inicio = Math.max(0, Number(desde) || 0);
            const fin = Math.min(inicio + CONSTANTES.LIMITES.LINEAS, total);

            for (let linea = inicio; linea < fin; linea++) {
                const valores = {};
                columnas.forEach((campo) => {
                    valores[campo] = registro.getSublistValue({
                        sublistId: nombre, fieldId: campo, line: linea,
                    });
                });
                filas.push(valores);
            }

            sublistas[nombre].desde = inicio;
            sublistas[nombre].filas = filas;
        });

        return { tipo: tipo, id: id, campos: campos, sublistas: sublistas };
    };

    const leerArchivo = (id, desde) => {
        const archivo = file.load({ id: id });
        const nombre = archivo.name || '';

        if (!estaEnCarpetaPermitida(archivo.path)
                || !/\.(js|xml|json|md)$/i.test(nombre)
                || /(^|[._-])(env|secret|credential|token|password|key)([._-]|$)/i.test(nombre)) {
            return { error: CONSTANTES.ERRORES.ARCHIVO_NO_PERMITIDO };
        }

        const contenido = archivo.getContents();
        const inicio = Math.max(0, Number(desde) || 0);

        return {
            id      : id,
            nombre  : nombre,
            total   : contenido.length,
            desde   : inicio,
            contenido: contenido.substring(inicio, inicio + 10000),
        };
    };

    const cargarBusqueda = (id) => {
        return search.load({ id: id });
    };

    const ejecutarBusqueda = (busqueda) => {
        return convertirResultados(busqueda);
    };

    const convertirResultados = (busqueda) => {
        return busqueda.run().getRange({ start: 0, end: CONSTANTES.LIMITES.FILAS })
            .map((resultado) => {
                const fila = {};
                busqueda.columns.forEach((columna, indice) => {
                    const nombre = columna.label
                        || [columna.join, columna.name, columna.summary].filter(Boolean).join('.');
                    const clave = Object.prototype.hasOwnProperty.call(fila, nombre)
                        ? nombre + '_' + indice : nombre;
                    const texto = resultado.getText(columna);
                    fila[clave] = texto || resultado.getValue(columna);
                });
                return fila;
            });
    };

    const ejecutarBusquedaDinamica = (tipo, filtros, columnas) => {
        return convertirResultados(search.create({
            type   : tipo,
            filters: filtros || [],
            columns: columnas,
        }));
    };

    const crearBusqueda = (tipo, titulo, filtros, columnas) => {
        const nueva = search.create({
            type    : tipo,
            title   : titulo,
            filters : filtros || [],
            columns : columnas,
            isPublic: false,
        });

        return { id: nueva.save() };
    };

    const obtenerBusquedasGuardadas = (filtro) => {
        const resultados = search.create({
            type   : search.Type.SAVED_SEARCH,
            filters: filtro ? [['title', 'contains', filtro]] : [],
            columns: ['id', 'title', 'recordtype', 'owner'],
        }).run().getRange({ start: 0, end: CONSTANTES.LIMITES.FILAS });

        return resultados.map((resultado) => ({
            id        : resultado.getValue({ name: 'id' }),
            title     : resultado.getValue({ name: 'title' }),
            recordtype: resultado.getValue({ name: 'recordtype' }),
            owner     : resultado.getValue({ name: 'owner' }),
        }));
    };

    const listarDatasets = () => {
        return dataset.list().slice(0, CONSTANTES.LIMITES.FILAS);
    };

    const cargarDataset = (id) => {
        return dataset.load({ id: id });
    };

    const ejecutarDataset = (existente) => {
        const paginas = existente.runPaged({ pageSize: CONSTANTES.LIMITES.FILAS });
        return paginas.pageRanges.length
            ? paginas.fetch({ index: 0 }).data.asMappedResults() : [];
    };

    const crearDataset = (tipo, titulo, columnas) => {
        const nuevasColumnas = columnas.map((campo) => dataset.createColumn({ fieldId: campo }));
        const nuevo = dataset.create({ type: tipo, columns: nuevasColumnas });
        const guardado = nuevo.save({ name: titulo });

        return { id: guardado.id };
    };

    const correr = (consulta, parametros) => {
        const paginas = query.runSuiteQLPaged({
            query: consulta, params: parametros, pageSize: CONSTANTES.LIMITES.FILAS,
        });

        return paginas.pageRanges.length
            ? paginas.fetch({ index: 0 }).data.asMappedResults() : [];
    };

    return {
        ejecutarConsulta          : ejecutarConsulta,
        obtenerCamposCustom       : obtenerCamposCustom,
        obtenerCustomRecord       : obtenerCustomRecord,
        obtenerCamposDeCustomRecord: obtenerCamposDeCustomRecord,
        obtenerArchivosDeCarpeta  : obtenerArchivosDeCarpeta,
        leerRegistro             : leerRegistro,
        leerArchivo              : leerArchivo,
        cargarBusqueda           : cargarBusqueda,
        ejecutarBusqueda         : ejecutarBusqueda,
        ejecutarBusquedaDinamica : ejecutarBusquedaDinamica,
        crearBusqueda            : crearBusqueda,
        obtenerBusquedasGuardadas: obtenerBusquedasGuardadas,
        listarDatasets           : listarDatasets,
        cargarDataset            : cargarDataset,
        ejecutarDataset          : ejecutarDataset,
        crearDataset             : crearDataset,
    };
});
