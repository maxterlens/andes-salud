/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Importes del recuento, solo informativos y solo en vista:
 *              cantidad x tarifa por articulo. No se guardan ni contabilizan;
 *              el asiento real lo hace NetSuite en el Ajuste de inventario al
 *              aprobar, con el mismo calculo.
 *
 *              Importe Instantanea = instantanea x tarifa
 *              Importe Recuento    = recuento x tarifa
 *              Importe Variacion   = ajustada x tarifa
 *
 *              En Iniciado el form muestra solo el Importe Recuento: la variacion
 *              la calcula NetSuite al completar. Una linea sin contar va en blanco.
 *
 *              mostrarImportes   → la ficha en la vista del recuento, con el
 *                                  boton Importes del recuento (User Event).
 *              descargarImportes → boton Importes del recuento: los mismos
 *                                  importes en CSV para Excel (Suitelet, GET).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */
define(['../data/query/AS_RecuentoInventarioManualQuery', '../form/AS_ImporteRecuentoForm',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (recuentoInventarioManualQuery, importeRecuentoForm, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarImportes(form, recuento) {
        const iniciado   = recuento.getValue({ fieldId: 'statuskey' }) === CONSTANTES.RECUENTO.ESTADO_INICIADO;
        const cantidades = recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuento.id);
        const lineas     = armarLineas(cantidades);
        if (!lineas.some((linea) => linea.contado)) return;
        const totales    = sumarImportes(lineas);
        importeRecuentoForm.agregarImportes(form, lineas, totales, iniciado);
    }

    function descargarImportes(context, recuentoId) {
        const iniciado = recuentoInventarioManualQuery.obtenerEstadoRecuento(recuentoId) === CONSTANTES.RECUENTO.ESTADO_INICIADO;
        const lineas   = armarLineas(recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId));
        const totales  = sumarImportes(lineas);
        const archivo  = importeRecuentoForm.construirCsv(recuentoId, lineas, totales, iniciado);

        log.audit({
            title  : 'RECUENTO INVENTARIO IMPORTES DESCARGADOS',
            details: 'recuento: ' + recuentoId + ' | filas: ' + lineas.length + ' | archivo: ' + archivo.name,
        });

        context.response.writeFile({ file: archivo, isInline: false });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Una cantidad vacia por la tarifa da 0 (null x 410 = 0): los importes son
     * siempre numeros y contado dice si la linea se conto.
     */
    function armarLineas(cantidades) {
        return cantidades.map((cantidad) => {
            return {
                id                : cantidad.id,
                nombre            : cantidad.nombre,
                codigoBarra       : cantidad.codigoBarra,
                contado          : cantidad.recuento !== null,
                instantanea       : cantidad.instantanea,
                recuento          : cantidad.recuento,
                ajustada          : cantidad.ajustada,
                tarifa            : cantidad.tarifa,
                importeInstantanea: cantidad.instantanea * cantidad.tarifa,
                importeRecuento   : cantidad.recuento * cantidad.tarifa,
                importeVariacion  : cantidad.ajustada * cantidad.tarifa,
            };
        });
    }

    /**
     * Solo suman las lineas contadas: NetSuite no ajusta las que quedaron sin
     * contar.
     */
    function sumarImportes(lineas) {
        const totales = { importeInstantanea: 0, importeRecuento: 0, importeVariacion: 0 };

        lineas.filter((linea) => linea.contado).forEach((linea) => {
            totales.importeInstantanea += linea.importeInstantanea;
            totales.importeRecuento    += linea.importeRecuento;
            totales.importeVariacion   += linea.importeVariacion;
        });

        return totales;
    }

    return {
        mostrarImportes  : mostrarImportes,
        descargarImportes: descargarImportes,
    };
});
