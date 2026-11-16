/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso del Scheduled que crea el recuento.
 *
 *              generarRecuento → crea el Recuento de inventario con todos los
 *                                articulos marcados y lo deja Iniciado.
 *
 *              Deja en el log cuanto tarda cada paso, para saber donde se va el
 *              tiempo (3.000 lineas tardaron 528 segundos en QA, 2026-11-16):
 *                armar    → la cabecera y las lineas en memoria (modo estandar).
 *                guardar  → el save(): NetSuite completa las lineas y corren los
 *                           User Event del recuento (el de WMS incluido).
 *                comenzar → Comenzar recuento: NetSuite toma la instantanea del
 *                           stock de cada articulo.
 *
 * CHANGELOG v1.2.0 (2026-11-16):
 * - [FEAT] El log separa los segundos de armar, guardar y comenzar.
 *
 * CHANGELOG v1.1.0 (2026-11-16):
 * - [FEAT] Pasa el codigo de la pantalla al recuento, para el seguimiento.
 *
 * CHANGELOG v1.0.0 (2026-11-16):
 * - [FEAT] Generar el recuento en segundo plano.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 */
define(['../data/record/AS_RecuentoInventarioRecord'],
    (recuentoInventarioRecord) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * datos: { cabecera, articulos, codigo }, el JSON que armo la pantalla.
     */
    function generarRecuento(datos) {
        const inicio   = Date.now();
        const recuento = recuentoInventarioRecord.armarRecuento(datos.cabecera, datos.articulos, datos.codigo);
        const armado   = Date.now();
        const recuentoId = recuentoInventarioRecord.guardarRecuento(recuento);
        const guardado = Date.now();
        recuentoInventarioRecord.comenzarRecuento(recuentoId);
        const fin      = Date.now();

        log.audit({
            title  : 'RECUENTO INVENTARIO MANUAL GENERADO',
            details: 'recuento: ' + recuentoId + ' | lineas: ' + datos.articulos.length
                   + ' | armar: ' + convertirASegundos(armado - inicio)
                   + ' | guardar: ' + convertirASegundos(guardado - armado)
                   + ' | comenzar: ' + convertirASegundos(fin - guardado)
                   + ' | total: ' + convertirASegundos(fin - inicio),
        });
    }

    function convertirASegundos(milisegundos) { return Math.round(milisegundos / 1000) + ' s'; }

    return {
        generarRecuento: generarRecuento,
    };
});
