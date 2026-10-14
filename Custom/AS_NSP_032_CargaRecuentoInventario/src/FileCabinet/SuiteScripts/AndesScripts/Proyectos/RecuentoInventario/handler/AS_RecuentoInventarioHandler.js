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
 * @version 1.5.0
 *
 * CHANGELOG v1.5.0 (2026-10-14):
 *   - [FEAT] generarRecuento: el boton Generar crea el Inventory Count con los
 *            articulos listados y el check AS Recuento Inventario Carga, lo
 *            pasa a Iniciado (Comenzar recuento) y redirige al recuento. Si la ubicacion cambio despues de cargar, pide
 *            volver a cargar el CSV.
 *   - [FEAT] cargarArchivo: avisa si se presiono Cargar sin archivo (el campo ya
 *            no es obligatorio en pantalla).
 *
 * CHANGELOG v1.4.0 (2026-10-13):
 *   - [FEAT] El select Cuenta se llena con AS Recuento Inventario Cuenta.
 *
 * CHANGELOG v1.3.0 (2026-10-13):
 *   - [FEAT] El CSV pasa a UBICACION, ITEM, UPC y se validan las tres columnas:
 *            la ubicacion es la seleccionada y pertenece a la subsidiaria, el UPC
 *            existe tal como viene y el ITEM es el nombre del articulo de ese UPC. Los errores se listan por numero de fila.
 *
 * CHANGELOG v1.2.0 (2026-10-13):
 *   - [FEAT] El CSV es una lista de articulos (UPC, ITEM): ya no lee FISICO ni arma
 *            observaciones. Los UPC repetidos se juntan y los que no existen se
 *            separan de la lista.
 *
 * CHANGELOG v1.1.1 (2026-10-09):
 *   - [FIX] leerContenido: el CSV subido desde Windows llega como Excel en base64
 *           y no se listaba ninguna linea; se decodifica a texto.
 *
 * CHANGELOG v1.1.0 (2026-10-09):
 *   - [FEAT] cargarArchivo: lee el CSV (COD, FISICO), suma los codigos repetidos,
 *            busca los articulos por UPC y lista las lineas con su observacion.
 *
 * CHANGELOG v1.0.0 (2026-10-09):
 *   - [FEAT] mostrarFormulario: dibuja el formulario de carga.
 */
define(['N/encode', 'N/redirect', '../form/AS_RecuentoInventarioForm', '../data/query/AS_RecuentoInventarioQuery',
        '../data/record/AS_RecuentoInventarioRecord', '../utils/AS_RecuentoInventarioUtils',
        '../constants/AS_RecuentoInventarioConstants'],
    (encode, redirect, recuentoInventarioForm, recuentoInventarioQuery, recuentoInventarioRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        const cuentas = recuentoInventarioQuery.obtenerCuentasRecuento();
        context.response.writePage(recuentoInventarioForm.construirFormulario({}, [], [], cuentas));
    }

    function cargarArchivo(context) {
        const parametros = obtenerParametrosCarga(context.request);
        const cuentas    = recuentoInventarioQuery.obtenerCuentasRecuento();
        if (!parametros.contenido) {
            context.response.writePage(recuentoInventarioForm.construirFormulario(parametros.cabecera, [], ['Seleccione el archivo CSV'], cuentas));
            return;
        }
        const filas      = leerFilas(parametros.contenido);
        const ubicacion  = recuentoInventarioQuery.obtenerUbicacion(parametros.cabecera.ubicacion);
        const articulos  = recuentoInventarioQuery.obtenerArticulosPorCodigo(obtenerCodigos(filas));
        const resultados = filas.map((fila) => validarFila(fila, ubicacion, articulos));
        const errores    = validarSubsidiaria(ubicacion, parametros.cabecera.subsidiaria)
            .concat(resultados.filter((resultado) => resultado.error).map((resultado) => resultado.error));
        const lineas     = armarLineas(resultados.filter((resultado) => resultado.articulo));

        log.audit({
            title  : 'RECUENTO INVENTARIO CARGADO',
            details: 'filas: ' + filas.length + ' | lineas: ' + lineas.length + ' | errores: ' + errores.length,
        });

        context.response.writePage(recuentoInventarioForm.construirFormulario(parametros.cabecera, lineas, errores, cuentas));
    }

    /**
     * Los articulos salen de la lista que dibujo Cargar: el CSV ya se valido y no
     * se vuelve a leer. Si el usuario cambio la ubicacion despues de cargar, los
     * articulos se validaron contra otra y se pide cargar de nuevo.
     */
    function generarRecuento(context) {
        const parametros = obtenerParametrosGenerar(context.request);
        if (parametros.cabecera.ubicacion !== parametros.ubicacionCargada) {
            const cuentas = recuentoInventarioQuery.obtenerCuentasRecuento();
            const error   = 'La ubicacion cambio despues de cargar el CSV: vuelva a cargarlo';
            context.response.writePage(recuentoInventarioForm.construirFormulario(parametros.cabecera, [], [error], cuentas));
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

    /**
     * La primera fila es el encabezado (UBICACION, ITEM, UPC) y se salta. El Excel
     * en espanol guarda el CSV con ';': se aceptan ';' y ','. El numero es la
     * fila del Excel, para que el usuario encuentre el error.
     *
     * @returns {Array} [{ numero, ubicacion, item, upc }]
     */
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

    function obtenerCodigos(filas) {
        const codigos = filas.map((fila) => fila.upc).filter((codigo) => codigo);
        return codigos.filter((codigo, posicion) => codigos.indexOf(codigo) === posicion);
    }

    /**
     * Una fila vale si su ubicacion es la seleccionada y si UPC + ITEM apuntan a
     * un solo articulo: en NetSuite hay UPC compartidos por varios articulos, y
     * el nombre es lo que decide cual es. Se informa el primer error de la fila.
     *
     * @returns {Object} { articulo } o { error }
     */
    function validarFila(fila, ubicacion, articulos) {
        const prefijo      = 'Fila ' + fila.numero + ': ';
        const nombreItem   = UTILS.pasarAMayusculasSinEspaciosExtra(fila.item);
        const candidatos   = articulos[fila.upc] || [];
        const coincidentes = candidatos.filter((articulo) => UTILS.pasarAMayusculasSinEspaciosExtra(articulo.nombre) === nombreItem);

        if (UTILS.pasarAMayusculasSinEspaciosExtra(fila.ubicacion) !== UTILS.pasarAMayusculasSinEspaciosExtra(ubicacion.nombre)) {
            return { error: prefijo + 'la ubicacion "' + fila.ubicacion + '" no es la seleccionada (' + ubicacion.nombre + ')' };
        }
        if (!candidatos.length) return { error: prefijo + 'el UPC "' + fila.upc + '" no existe en NetSuite' };
        if (!coincidentes.length) return { error: prefijo + 'el ITEM "' + fila.item + '" no es el articulo del UPC ' + fila.upc };
        if (coincidentes.length > 1) {
            return { error: prefijo + 'hay ' + coincidentes.length + ' articulos con el UPC ' + fila.upc + ' y ese nombre' };
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

    /**
     * @returns {Object} { cabecera, ubicacionCargada, articulos: [id del articulo] }
     */
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
