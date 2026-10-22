/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Proceso de la pantalla de carga.
 *
 *              mostrarFormulario → el formulario vacio (GET).
 *              cargarArchivo     → lee el CSV (UBICACION, ITEM = id interno), valida cada
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
 * @version 1.8.0
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
        const ids        = [...new Set(filas.map((fila) => fila.item).filter((id) => id))];
        const ubicacion  = recuentoInventarioQuery.obtenerUbicacion(parametros.cabecera.ubicacion);
        const articulos  = recuentoInventarioQuery.obtenerArticulosPorId(ids);
        const resultados = filas.map((fila) => validarFila(fila, ubicacion, articulos));
        const errores    = resultados.filter((resultado) => resultado.error).map((resultado) => resultado.error);
        const lineas     = armarLineas(resultados.filter((resultado) => resultado.articulo));
        if (ubicacion.subsidiaria !== String(parametros.cabecera.subsidiaria)) {
            errores.unshift('La ubicacion ' + ubicacion.nombre + ' no pertenece a la subsidiaria seleccionada');
        }

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
        let recuentoId;
        try {
            recuentoId = recuentoInventarioRecord.crearRecuento(parametros.cabecera, parametros.articulos);
        } catch (fallo) {
            if (fallo.name !== 'USER_ERROR') throw fallo;
            responderConFormulario(context, parametros.cabecera, [], [], fallo.message);
            return;
        }
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
     * Los tres procesos terminan aqui: los selects Cuenta y Ubicacion necesitan
     * sus opciones con la subsidiaria cada vez que se dibuja la pantalla.
     */
    function responderConFormulario(context, cabecera, lineas, errores, alerta) {
        const cuentas     = recuentoInventarioQuery.obtenerCuentasRecuento();
        const ubicaciones = recuentoInventarioQuery.obtenerUbicaciones();
        context.response.writePage(recuentoInventarioForm.construirFormulario(cabecera, lineas, errores, cuentas, ubicaciones, alerta));
    }

    /**
     * En Windows el navegador sube el .csv como "application/vnd.ms-excel":
     * NetSuite lo toma como Excel (binario) y getContents lo devuelve en base64,
     * sin saltos de linea. Ahi se decodifica a texto.
     */
    function obtenerParametrosCarga(request) {
        const archivo = request.files[CONSTANTES.CAMPOS.ARCHIVO];
        let contenido = '';
        if (archivo) {
            contenido = archivo.isText ? archivo.getContents() : encode.convert({
                string        : archivo.getContents(),
                inputEncoding : encode.Encoding.BASE_64,
                outputEncoding: encode.Encoding.UTF_8,
            });
        }

        return { cabecera: leerCabecera(request.parameters), contenido: contenido };
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

    function leerFilas(contenido) {
        const separador = contenido.indexOf(';') >= 0 ? ';' : ',';

        return contenido.split(/\r?\n/)
            .map((fila, posicion) => {
                const columnas = fila.split(separador);
                return {
                    numero   : posicion + 1,
                    ubicacion: (columnas[0] || '').trim(),
                    item     : (columnas[1] || '').trim(),
                };
            })
            .slice(1)
            .filter((fila) => fila.ubicacion || fila.item);
    }

    function validarFila(fila, ubicacion, articulos) {
        const prefijo  = 'Fila ' + fila.numero + ': ';
        const articulo = articulos[fila.item];
        if (!articulo) return { error: prefijo + 'el ITEM "' + fila.item + '" no es el id interno de un articulo activo en NetSuite' };
        if (UTILS.pasarAMayusculasSinEspaciosExtra(fila.ubicacion) !== UTILS.pasarAMayusculasSinEspaciosExtra(ubicacion.nombre)) {
            return { error: prefijo + 'la ubicacion "' + fila.ubicacion + '" no es la seleccionada (' + ubicacion.nombre + ')' };
        }
        return { articulo: articulo };
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
            lineas.push({ articuloId: String(articulo.id), articulo: articulo.nombre, unidad: articulo.unidad });
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
