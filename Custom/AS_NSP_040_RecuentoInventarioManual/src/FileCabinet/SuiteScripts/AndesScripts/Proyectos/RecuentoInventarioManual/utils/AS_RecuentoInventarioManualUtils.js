/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Funciones genericas del modulo, sin negocio.
 *
 *              convertirArchivoATexto           → el contenido de un archivo
 *                                                 subido, como texto.
 *              formatearMoneda                  → un importe con el formato de
 *                                                 moneda del usuario.
 *              convertirEntidadesHtmlATexto     → &lt; &gt; &amp; de vuelta a
 *                                                 < > &.
 *              encerrarEntreComillas            → un texto entre comillas para
 *                                                 CSV, con sus comillas dobladas.
 *              convertirNuloAVacio              → null como texto vacio.
 *              truncarATextoConDosDecimales     → un numero cortado sin
 *                                                 redondear, como texto con
 *                                                 punto y 2 decimales
 *                                                 (148.6666 → '148.66').
 *              partirEnBloques                  → una lista en bloques de un
 *                                                 tamano; el ultimo, con lo que
 *                                                 sobra.
 *              lanzarMapReduceSiEstaLibre       → lanza un Map/Reduce; si ya
 *                                                 esta corriendo, no hace nada.
 *              lanzarScheduledSiEstaLibre       → lanza un Scheduled; si ya
 *                                                 esta corriendo, no hace nada.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 *
 */

define(['N/encode', 'N/format', 'N/task'],
    (encode, format, task) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function convertirArchivoATexto(archivo) {
        if (archivo.isText) return archivo.getContents();
        return encode.convert({
            string        : archivo.getContents(),
            inputEncoding : encode.Encoding.BASE_64,
            outputEncoding: encode.Encoding.UTF_8,
        });
    }

    /**
     * Con el formato de moneda del usuario (la cuenta es es_ES).
     */
    function formatearMoneda(valor) {
        return format.format({ value: valor, type: format.Type.CURRENCY });
    }

    function convertirEntidadesHtmlATexto(texto) {
        return texto.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    function encerrarEntreComillas(texto) { return '"' + texto.replace(/"/g, '""') + '"'; }

    function convertirNuloAVacio(valor) { return valor === null ? '' : valor; }

    /**
     * Redondea primero a 4 decimales para que el error de coma flotante no
     * corte de mas (1.15 * 100 da 114.99999...).
     */
    function truncarATextoConDosDecimales(valor) { return (Math.trunc(Math.round(valor * 10000) / 100) / 100).toFixed(2); }

    function partirEnBloques(lista, tamano) {
        const bloques = [];
        for (let inicio = 0; inicio < lista.length; inicio += tamano) bloques.push(lista.slice(inicio, inicio + tamano));
        return bloques;
    }

    /**
     * Un deployment de Map/Reduce corre de a una ejecucion: si ya esta
     * corriendo, NetSuite rechaza el submit y la solicitud espera en la cola
     * hasta el proximo lanzamiento (la vista de la solicitud lo reintenta).
     */
    function lanzarMapReduceSiEstaLibre(scriptId, deploymentId) {
        try {
            task.create({ taskType: task.TaskType.MAP_REDUCE, scriptId: scriptId, deploymentId: deploymentId }).submit();
            return true;
        } catch (fallo) {
            if (fallo.name !== 'MAP_REDUCE_ALREADY_RUNNING' && fallo.name !== 'FAILED_TO_SUBMIT_JOB_REQUEST_1') throw fallo;
            return false;
        }
    }

    function lanzarScheduledSiEstaLibre(scriptId, deploymentId) {
        try {
            task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT, scriptId: scriptId, deploymentId: deploymentId }).submit();
            return true;
        } catch (fallo) {
            if (fallo.name !== 'FAILED_TO_SUBMIT_JOB_REQUEST_1') throw fallo;
            return false;
        }
    }

    return {
        convertirArchivoATexto          : convertirArchivoATexto,
        formatearMoneda                 : formatearMoneda,
        convertirEntidadesHtmlATexto    : convertirEntidadesHtmlATexto,
        encerrarEntreComillas           : encerrarEntreComillas,
        convertirNuloAVacio             : convertirNuloAVacio,
        truncarATextoConDosDecimales    : truncarATextoConDosDecimales,
        partirEnBloques                 : partirEnBloques,
        lanzarMapReduceSiEstaLibre      : lanzarMapReduceSiEstaLibre,
        lanzarScheduledSiEstaLibre      : lanzarScheduledSiEstaLibre,
    };
});
