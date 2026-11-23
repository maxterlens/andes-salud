/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de los archivos que se bajan del recuento: el TXT para la
 *              pistola (como el del AS_NSP_036) y el CSV Detalle de conteo.
 *
 *              agregarBotones   → en la vista del recuento, Descargar TXT
 *                                 siempre y Detalle de conteo con el recuento
 *                                 Iniciado, en Aprobacion pendiente o
 *                                 Aprobado (UE).
 *              descargarTxt     → arma el TXT con una fila por articulo del
 *                                 recuento, con o sin stock, y lo responde como
 *                                 descarga (Suitelet, GET).
 *              mostrarFormularioMaestro → boton Descargar TXT maestro de la
 *                                 pantalla del recuento: abre la pantalla
 *                                 para elegir la subsidiaria y, con ella
 *                                 elegida, muestra el total de articulos
 *                                 distintos que lleva el TXT (Suitelet,
 *                                 GET).
 *              descargarTxtMaestro → boton Descargar TXT de esa pantalla: el
 *                                 mismo TXT con una fila por articulo activo y
 *                                 ubicacion de la subsidiaria, sin recuento
 *                                 (Suitelet, GET).
 *              descargarDetalle → arma el CSV con una fila por articulo de la
 *                                 sublista Articulos y lo responde como
 *                                 descarga (Suitelet, GET).
 *
 *              El TXT tiene el formato de la pistola: correlativo, codigo de
 *              barras y nombre del articulo, con Cantidad vacia para que bodega
 *              la llene. COD 3 trae el id de la ubicacion del recuento; sin lote.
 *              El Detalle va en CSV y no en Excel: con 2.500 lineas queda liviano.
 *              Un User Event no puede responder un archivo: el beforeLoad solo
 *              dibuja la pagina. Por eso la descarga la hace el Suitelet.
 *              Cada clic vuelve a generar el archivo y no se guarda en el File
 *              Cabinet.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.6.0
 *
 */

define(['../form/AS_ArchivoRecuentoForm', '../form/AS_TxtMaestroForm', '../data/query/AS_RecuentoInventarioManualQuery',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (archivoRecuentoForm, txtMaestroForm, recuentoInventarioManualQuery, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarBotones(form, recuento) {
        const estados    = CONSTANTES.RECUENTO;
        const estado     = recuento.getValue({ fieldId: 'statuskey' });
        const conDetalle = [estados.ESTADO_INICIADO, estados.ESTADO_PENDIENTE_APROBACION, estados.ESTADO_APROBADO].includes(estado);
        archivoRecuentoForm.agregarBotones(form, conDetalle);
    }

    function descargarTxt(context, recuentoId) {
        const articulos = recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId);
        const ubicacion = recuentoInventarioManualQuery.obtenerUbicacionRecuento(recuentoId);
        articulos.forEach((articulo) => { articulo.ubicacionId = ubicacion.id; });
        const archivo   = archivoRecuentoForm.construirTxt(CONSTANTES.ARCHIVO.PREFIJO + '-' + recuentoId + '.txt', articulos);

        log.audit({
            title  : 'RECUENTO INVENTARIO TXT DESCARGADO',
            details: 'recuento: ' + recuentoId + ' | filas: ' + articulos.length + ' | archivo: ' + archivo.name,
        });

        context.response.writeFile({ file: archivo, isInline: false });
    }

    function mostrarFormularioMaestro(context, subsidiariaId) {
        const articulos      = subsidiariaId ? recuentoInventarioManualQuery.obtenerArticulosSubsidiaria(subsidiariaId) : [];
        const totalArticulos = new Set(articulos.map((articulo) => articulo.id)).size;
        context.response.writePage(txtMaestroForm.construirFormulario(subsidiariaId, totalArticulos));
    }

    function descargarTxtMaestro(context, subsidiariaId) {
        const articulos = recuentoInventarioManualQuery.obtenerArticulosSubsidiaria(subsidiariaId);
        const archivo   = archivoRecuentoForm.construirTxt(CONSTANTES.ARCHIVO.PREFIJO_MAESTRO + '-' + subsidiariaId + '.txt', articulos);

        log.audit({
            title  : 'RECUENTO INVENTARIO TXT MAESTRO DESCARGADO',
            details: 'subsidiaria: ' + subsidiariaId + ' | filas: ' + articulos.length + ' | archivo: ' + archivo.name,
        });

        context.response.writeFile({ file: archivo, isInline: false });
    }

    function descargarDetalle(context, recuentoId) {
        const articulos = recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId);
        const archivo   = archivoRecuentoForm.construirCsv(recuentoId, articulos);

        log.audit({
            title  : 'RECUENTO INVENTARIO DETALLE DESCARGADO',
            details: 'recuento: ' + recuentoId + ' | filas: ' + articulos.length + ' | archivo: ' + archivo.name,
        });

        context.response.writeFile({ file: archivo, isInline: false });
    }

    return {
        agregarBotones          : agregarBotones,
        descargarTxt            : descargarTxt,
        mostrarFormularioMaestro: mostrarFormularioMaestro,
        descargarTxtMaestro     : descargarTxtMaestro,
        descargarDetalle        : descargarDetalle,
    };
});
