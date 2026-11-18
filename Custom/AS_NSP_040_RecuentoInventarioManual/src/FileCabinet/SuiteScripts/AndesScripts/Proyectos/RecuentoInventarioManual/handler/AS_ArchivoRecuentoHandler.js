/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso del boton Descargar TXT del recuento, como el del AS_NSP_036.
 *
 *              agregarBoton     → en la vista del recuento, el boton que llama al
 *                                 Suitelet con el id del recuento (UE).
 *              descargarArchivo → arma el TXT con una fila por articulo del
 *                                 recuento, con o sin stock, y lo responde como
 *                                 descarga (Suitelet, GET).
 *
 *              El TXT tiene el formato de la pistola: correlativo, codigo de
 *              barras y nombre del articulo, con Cantidad vacia para que bodega
 *              la llene. COD 3 trae el id de la ubicacion del recuento; sin lote.
 *              Un User Event no puede responder un archivo: el beforeLoad solo
 *              dibuja la pagina. Por eso la descarga la hace el Suitelet.
 *              Cada clic vuelve a generar el archivo y no se guarda en el File
 *              Cabinet.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.4.0
 *
 * CHANGELOG
 * 1.4.0 [FEAT] El TXT lleva el id de la ubicacion del recuento en COD 3.
 */
define(['../form/AS_ArchivoRecuentoForm', '../data/query/AS_RecuentoInventarioManualQuery'],
    (archivoRecuentoForm, recuentoInventarioManualQuery) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarBoton(form) {
        archivoRecuentoForm.agregarBoton(form);
    }

    function descargarArchivo(context, recuentoId) {
        const articulos = recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId);
        const ubicacion = recuentoInventarioManualQuery.obtenerUbicacionRecuento(recuentoId);
        const archivo   = archivoRecuentoForm.construirArchivo(recuentoId, articulos, ubicacion.id);

        log.audit({
            title  : 'RECUENTO INVENTARIO TXT DESCARGADO',
            details: 'recuento: ' + recuentoId + ' | filas: ' + articulos.length + ' | archivo: ' + archivo.name,
        });

        context.response.writeFile({ file: archivo, isInline: false });
    }

    return {
        agregarBoton    : agregarBoton,
        descargarArchivo: descargarArchivo,
    };
});
