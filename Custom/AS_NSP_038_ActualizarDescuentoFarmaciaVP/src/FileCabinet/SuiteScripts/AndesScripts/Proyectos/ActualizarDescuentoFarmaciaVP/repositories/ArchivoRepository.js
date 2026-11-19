/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Archivos en el File Cabinet: JSON temporal de la búsqueda (uno por usuario, se
 *              sobrescribe en cada búsqueda) y JSON del proceso (fuente de verdad para el Map/Reduce).
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

    /** JSON con el nombre y la carpeta del archivo (para comprobar a quién pertenece); null si no existe. */
    const leerJsonConInfo = (fileId) => {
        try {
            const f = file.load({ id: Number(fileId) });
            return { id: Number(f.id), nombre: f.name, carpeta: Number(f.folder), datos: JSON.parse(f.getContents()) };
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 - ArchivoRepository.leerJsonConInfo", details: `${fileId}: ${e.message || e}` });
            return null;
        }
    };

    /** URL de descarga; null si el archivo ya no existe. */
    const getUrl = (fileId) => {
        if (!fileId) return null;
        try {
            return file.load({ id: Number(fileId) }).url;
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 - ArchivoRepository.getUrl", details: `${fileId}: ${e.message || e}` });
            return null;
        }
    };

    return { crearCsv, crearJson, actualizarJson, leer, leerJson, leerJsonConInfo, getUrl };
});
