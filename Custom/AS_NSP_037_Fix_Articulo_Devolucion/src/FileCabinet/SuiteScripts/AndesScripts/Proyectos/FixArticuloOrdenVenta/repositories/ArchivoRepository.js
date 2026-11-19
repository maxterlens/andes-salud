/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Archivos del proceso en el File Cabinet: CSV de origen y JSON con la
 *              validación (fuente de verdad entre la validación y el Map/Reduce).
 */
define(["N/file", "N/log"], (file, nLog) => {
    /** Crea un CSV. @returns {number} ID del archivo */
    const crearCsv = (nombre, contenido, carpetaId) =>
        Number(file.create({ name: nombre, fileType: file.Type.CSV, contents: contenido, folder: Number(carpetaId), encoding: file.Encoding.UTF_8 }).save());

    /** Crea un JSON. @returns {number} ID del archivo */
    const crearJson = (nombre, objeto, carpetaId) =>
        Number(file.create({ name: nombre, fileType: file.Type.JSON, contents: JSON.stringify(objeto), folder: Number(carpetaId), encoding: file.Encoding.UTF_8 }).save());

    /** Reescribe un JSON existente (mismo nombre y carpeta). @returns {number} ID del archivo */
    const actualizarJson = (fileId, objeto) => {
        const original = file.load({ id: Number(fileId) });
        return crearJson(original.name, objeto, original.folder);
    };

    /** Contenido de un archivo de texto. */
    const leer = (fileId) => file.load({ id: Number(fileId) }).getContents();

    /** Contenido de un JSON. */
    const leerJson = (fileId) => JSON.parse(file.load({ id: Number(fileId) }).getContents());

    /** URL de descarga; null si el archivo ya no existe. */
    const getUrl = (fileId) => {
        if (!fileId) return null;
        try {
            return file.load({ id: Number(fileId) }).url;
        } catch (e) {
            nLog.error({ title: "AS_NSP_037 - ArchivoRepository.getUrl", details: `${fileId}: ${e.message || e}` });
            return null;
        }
    };

    return { crearCsv, crearJson, actualizarJson, leer, leerJson, getUrl };
});
