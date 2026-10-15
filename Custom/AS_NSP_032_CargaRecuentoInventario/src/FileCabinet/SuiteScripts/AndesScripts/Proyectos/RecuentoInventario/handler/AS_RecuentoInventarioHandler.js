/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Proceso de la pantalla de carga.
 *
 *              mostrarFormulario → el formulario vacio (GET).
 *              cargarArchivo     → lee el CSV (UBICACION, ITEM, UPC), valida cada
 *                                  fila contra NetSuite y vuelve a dibujar la
 *                                  pantalla con la cabecera que lleno el usuario,
 *                                  los errores y la lista de articulos (POST).
 *              generarRecuento   → crea el Recuento de inventario con la cabecera
 *                                  y los articulos listados, lo deja Iniciado
 *                                  y abre el recuento
 *                                  (POST, boton Generar).
 *
 *              El CSV se lee desde la peticion, sin guardarlo en el File Cabinet:
 *              todavia no se crea el recuento, asi que no queda nada que borrar.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.6.0
 *
 */

define(['N/encode', 'N/redirect', '../form/AS_RecuentoInventarioForm', '../data/query/AS_RecuentoInventarioQuery',
        '../data/record/AS_RecuentoInventarioRecord', '../utils/AS_RecuentoInventarioUtils',
        '../constants/AS_RecuentoInventarioConstants'],
    (encode, redirect, recuentoInventarioForm, recuentoInventarioQuery, recuentoInventarioRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        responderConFormulario(context, {}, [], []);
    }

    function cargarArchivo(context) {
        const parametros = obtenerParametrosCarga(context.request);
        if (!parametros.contenido) {
            responderConFormulario(context, parametros.cabecera, [], ['Seleccione el archivo CSV']);
            return;
        }
        const filas      = leerFilas(parametros.contenido);
        const ubicacion  = recuentoInventarioQuery.obtenerUbicacion(parametros.cabecera.ubicacion);
        const articulos  = recuentoInventarioQuery.obtenerArticulosPorNombre(obtenerNombres(filas));
        const resultados = filas.map((fila) => validarFila(fila, ubicacion, articulos));
        const errores    = validarSubsidiaria(ubicacion, parametros.cabecera.subsidiaria)
            .concat(resultados.filter((resultado) => resultado.error).map((resultado) => resultado.error));
        const lineas     = armarLineas(resultados.filter((resultado) => resultado.articulo));

        log.audit({
            title  : 'RECUENTO INVENTARIO CARGADO',
            details: 'filas: ' + filas.length + ' | lineas: ' + lineas.length + ' | errores: ' + errores.length,
        });

        responderConFormulario(context, parametros.cabecera, lineas, errores);
    }

    /**
     * Los articulos salen de la lista que dibujo Cargar: el CSV ya se valido y no
     * se vuelve a leer. Si el usuario cambio la ubicacion despues de cargar, los
     * articulos se validaron contra otra y se pide cargar de nuevo.
     */
    function generarRecuento(context) {
        const parametros = obtenerParametrosGenerar(context.request);
        if (parametros.cabecera.ubicacion !== parametros.ubicacionCargada) {
            responderConFormulario(context, parametros.cabecera, [], ['La ubicacion cambio despues de cargar el CSV: vuelva a cargarlo']);
            return;
        }
        const recuentoId = recuentoInventarioRecord.crearRecuento(parametros.cabecera, parametros.articulos);
        recuentoInventarioRecord.comenzarRecuento(recuentoId);

        log.audit({
            title  : 'RECUENTO INVENTARIO GENERADO',
            details: 'recuento: ' + recuentoId + ' | lineas: ' + parametros.articulos.length,
        });

        redirect.toRecord({ type: CONSTANTES.RECUENTO.TIPO, id: recuentoId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los tres procesos terminan aqui: el select Cuenta necesita las cuentas
     * configuradas cada vez que se dibuja la pantalla.
     */
    function responderConFormulario(context, cabecera, lineas, errores) {
        const cuentas = recuentoInventarioQuery.obtenerCuentasRecuento();
        context.response.writePage(recuentoInventarioForm.construirFormulario(cabecera, lineas, errores, cuentas));
    }

    function obtenerParametrosCarga(request) {
        const archivo = request.files[CONSTANTES.CAMPOS.ARCHIVO];

        return {
            cabecera : leerCabecera(request.parameters),
            contenido: archivo ? leerContenido(archivo) : '',
        };
    }

    function leerCabecera(valores) {
        const campos = CONSTANTES.CAMPOS;

        return {
            subsidiaria : valores[campos.SUBSIDIARIA],
            ubicacion   : valores[campos.UBICACION],
            departamento: valores[campos.DEPARTAMENTO],
            clase       : valores[campos.CLASE],
            fecha       : valores[campos.FECHA],
            cuenta      : valores[campos.CUENTA],
            nota        : valores[campos.NOTA],
        };
    }

    /**
     * En Windows el navegador sube el .csv como "application/vnd.ms-excel":
     * NetSuite lo toma como Excel (binario) y getContents lo devuelve en base64,
     * sin saltos de linea. Ahi se decodifica a texto.
     */
    function leerContenido(archivo) {
        if (archivo.isText) return archivo.getContents();
        return encode.convert({
            string        : archivo.getContents(),
            inputEncoding : encode.Encoding.BASE_64,
            outputEncoding: encode.Encoding.UTF_8,
        });
    }

    function leerFilas(contenido) {
        const separador = contenido.indexOf(';') >= 0 ? ';' : ',';

        return contenido.split(/\r?\n/)
            .map((fila, posicion) => {
                const columnas = fila.split(separador);
                return {
                    numero   : posicion + 1,
                    ubicacion: (columnas[0] || '').trim(),
                    item     : (columnas[1] || '').trim(),
                    upc      : (columnas[2] || '').trim(),
                };
            })
            .slice(1)
            .filter((fila) => fila.ubicacion || fila.item || fila.upc);
    }

    function obtenerNombres(filas) {
        const nombres = filas.map((fila) => UTILS.pasarAMayusculasSinEspaciosExtra(fila.item)).filter((nombre) => nombre);
        return nombres.filter((nombre, posicion) => nombres.indexOf(nombre) === posicion);
    }

    function validarFila(fila, ubicacion, articulos) {
        const prefijo    = 'Fila ' + fila.numero + ': ';
        const candidatos = articulos[UTILS.pasarAMayusculasSinEspaciosExtra(fila.item)] || [];
        if (!candidatos.length) return { error: prefijo + 'el ITEM "' + fila.item + '" no existe en NetSuite' };
        const coincidentes = candidatos.filter((articulo) => articulo.upc === fila.upc);
        if (!coincidentes.length) return { error: prefijo + 'el UPC "' + fila.upc + '" no es el del ITEM "' + fila.item + '"' };
        if (coincidentes.length > 1) return { error: prefijo + 'hay ' + coincidentes.length + ' articulos con el ITEM "' + fila.item + '" y el UPC ' + fila.upc };
        if (UTILS.pasarAMayusculasSinEspaciosExtra(fila.ubicacion) !== UTILS.pasarAMayusculasSinEspaciosExtra(ubicacion.nombre)) {
            return { error: prefijo + 'la ubicacion "' + fila.ubicacion + '" no es la seleccionada (' + ubicacion.nombre + ')' };
        }
        return { articulo: coincidentes[0] };
    }

    function validarSubsidiaria(ubicacion, subsidiaria) {
        if (ubicacion.subsidiaria === String(subsidiaria)) return [];
        return ['La ubicacion ' + ubicacion.nombre + ' no pertenece a la subsidiaria seleccionada'];
    }

    /**
     * Un articulo repetido en el CSV queda en una sola linea.
     */
    function armarLineas(resultados) {
        const lineas = [];
        const vistos = {};

        resultados.forEach((resultado) => {
            const articulo = resultado.articulo;
            if (vistos[articulo.id]) return;
            vistos[articulo.id] = true;
            lineas.push({ codigo: articulo.upc, articuloId: String(articulo.id), articulo: articulo.nombre, unidad: articulo.unidad });
        });

        return lineas;
    }

    function obtenerParametrosGenerar(request) {
        const sublista  = CONSTANTES.SUBLISTA;
        const articulos = [];

        for (let linea = 0; linea < request.getLineCount({ group: sublista.ID }); linea++) {
            articulos.push(request.getSublistValue({ group: sublista.ID, name: sublista.COLUMNAS.ARTICULO_ID, line: linea }));
        }

        return {
            cabecera        : leerCabecera(request.parameters),
            ubicacionCargada: request.parameters[CONSTANTES.CAMPOS.UBICACION_CARGADA],
            articulos       : articulos,
        };
    }

    return {
        mostrarFormulario: mostrarFormulario,
        cargarArchivo    : cargarArchivo,
        generarRecuento  : generarRecuento,
    };
});
