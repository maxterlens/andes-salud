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
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Pasa del AS_NSP_032 al AS_NSP_040 sin cambios de logica: el 032 se retira.
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
                nombre            : cantidad.nombre,
                contado           : cantidad.recuento !== null,
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
        mostrarImportes: mostrarImportes,
    };
});
