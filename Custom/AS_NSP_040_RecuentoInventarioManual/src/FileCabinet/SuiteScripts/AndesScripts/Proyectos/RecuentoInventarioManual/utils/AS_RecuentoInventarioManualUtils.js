/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Funciones genericas del modulo, sin negocio.
 *
 *              convertirArchivoATexto           → el contenido de un archivo
 *                                                 subido, como texto.
 *              formatearMoneda                  → un importe con el formato de
 *                                                 moneda del usuario.
 *              lanzarScheduledSiEstaLibre       → lanza un Scheduled; si ya
 *                                                 esta corriendo, no hace nada.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 * CHANGELOG
 * 1.2.0 [FIX] Se quita pasarAMayusculasSinEspaciosExtra: la ubicacion del CSV
 *             ya no se compara por nombre.
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
        lanzarScheduledSiEstaLibre      : lanzarScheduledSiEstaLibre,
    };
});
