/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario de los archivos del recuento: los botones en
 *              la vista, el TXT y el CSV Detalle de conteo. No busca ni guarda
 *              records. Los dos archivos se crean en memoria para responderlos
 *              como descarga, en Windows-1252 como los TXT del AS_NSP_036.
 *
 *              TXT     → una fila de encabezado y una por articulo, separadas
 *                        por coma. PRO_CORREL lleva el id interno del articulo
 *                        y COD_BARRA va vacio; PRO_CORREL1 sigue con el
 *                        correlativo de la fila. COD 3 lleva el id de la
 *                        ubicacion del recuento en todas las filas. El nombre
 *                        sale como se ve en NetSuite (< en vez de &lt;), con
 *                        las comas cambiadas por punto.
 *              Detalle → las columnas de la sublista Articulos: articulo,
 *                        unidades, cantidad de instantanea, del recuento y
 *                        ajustada, tarifa y nota. CSV estandar: separado por
 *                        coma y con punto decimal. El nombre y la nota van
 *                        entre comillas, para que sus comas no partan la fila.
 *                        Una cantidad vacia sale vacia.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.8.0
 *
 */
define(['N/file', '../utils/AS_RecuentoInventarioManualUtils', '../constants/AS_RecuentoInventarioManualConstants'],
    (file, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarBotones(form, conDetalle) {
        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addButton({
            id          : CONSTANTES.BOTONES.TXT,
            label       : CONSTANTES.BOTONES.TXT_LABEL,
            functionName: 'descargarTxt',
        });
        if (!conDetalle) return;
        form.addButton({
            id          : CONSTANTES.BOTONES.DETALLE,
            label       : CONSTANTES.BOTONES.DETALLE_LABEL,
            functionName: 'descargarDetalle',
        });
    }

    function construirTxt(recuentoId, articulos, ubicacionId) {
        const archivo = CONSTANTES.ARCHIVO;
        const filas   = [archivo.ENCABEZADO.join(archivo.SEPARADOR)];
        articulos.forEach((articulo, indice) => {
            const correlativo = indice + 1;
            const nombre      = UTILS.convertirEntidadesHtmlATexto(articulo.nombre).replace(/,/g, '.');
            filas.push([articulo.id, articulo.codigoBarra, '', ubicacionId, '', '', nombre, '',
                        correlativo, '', '', '', '', ''].join(archivo.SEPARADOR));
        });

        return file.create({
            name    : archivo.PREFIJO + '-' + recuentoId + '.txt',
            fileType: file.Type.PLAINTEXT,
            contents: filas.join('\r\n'),
            encoding: file.Encoding.WINDOWS_1252,
        });
    }

    function construirCsv(recuentoId, articulos) {
        const detalle = CONSTANTES.DETALLE;
        const filas   = [detalle.ENCABEZADO.join(detalle.SEPARADOR)];
        articulos.forEach((articulo) => {
            const nombre = encerrarEntreComillas(UTILS.convertirEntidadesHtmlATexto(articulo.nombre));
            const nota   = encerrarEntreComillas(articulo.nota);
            filas.push([nombre, articulo.unidad, convertirNuloAVacio(articulo.instantanea),
                        convertirNuloAVacio(articulo.recuento), convertirNuloAVacio(articulo.ajustada),
                        convertirNuloAVacio(articulo.tarifa), nota].join(detalle.SEPARADOR));
        });

        return file.create({
            name    : detalle.PREFIJO + '-' + recuentoId + '.csv',
            fileType: file.Type.CSV,
            contents: filas.join('\r\n'),
            encoding: file.Encoding.WINDOWS_1252,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias — Detalle de conteo
    // ─────────────────────────────────────────────────────────────────────────

    function encerrarEntreComillas(texto) { return '"' + texto.replace(/"/g, '""') + '"'; }

    function convertirNuloAVacio(valor) { return valor === null ? '' : valor; }

    return {
        agregarBotones: agregarBotones,
        construirTxt  : construirTxt,
        construirCsv  : construirCsv,
    };
});
