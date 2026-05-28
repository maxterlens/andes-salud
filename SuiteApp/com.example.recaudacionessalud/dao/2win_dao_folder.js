/**
 * @NApiVersion 2.1
 * @module ./2win_dao_folder.js
 * @NModuleScope Public
 */
define(["N/file", "N/log", "N/record", "N/search"], function (file, nLog, record, search) {
    /**
     * @function buscarOCrearCarpeta - Busca una carpeta por nombre o la crea si no existe.
     * @param {string} nombreCarpeta - Nombre de la carpeta a buscar o crear.
     * @param {number|string} parentFolderId - ID de la carpeta padre donde se creará la nueva carpeta.
     * @return {number} - ID de la carpeta encontrada o creada.
     */
    function buscarOCrearCarpeta(nombreCarpeta, parentFolderId) {
        try {
            nLog.debug("buscarOCrearCarpeta - parametros", {
                nombreCarpeta: nombreCarpeta,
                parentFolderId: parentFolderId
            });

            if (!nombreCarpeta) {
                throw new Error("El nombre de la carpeta es requerido");
            }

            // Buscar carpeta existente por nombre
            const folderIdExistente = buscarCarpetaPorNombre(nombreCarpeta);

            if (folderIdExistente) {
                nLog.audit("buscarOCrearCarpeta", `Carpeta encontrada: ${nombreCarpeta} (ID: ${folderIdExistente})`);
                return folderIdExistente;
            }

            // Crear nueva carpeta si no existe
            if (!parentFolderId) {
                throw new Error("El parentFolderId es requerido para crear una carpeta");
            }

            let objRecord = record.create({
                type: record.Type.FOLDER,
                isDynamic: true
            });
            objRecord.setValue({
                fieldId: "name",
                value: nombreCarpeta
            });
            objRecord.setValue({
                fieldId: "parent",
                value: parentFolderId
            });
            let folderId = objRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });

            nLog.audit("buscarOCrearCarpeta", `Carpeta creada: ${nombreCarpeta} (ID: ${folderId})`);

            return folderId;
        } catch (error) {
            nLog.error("buscarOCrearCarpeta - error", error);
            throw error;
        }
    }

    /**
     * @function buscarCarpetaPorNombre - Busca una carpeta por su nombre.
     * @param {string} name - Nombre de la carpeta a buscar.
     * @return {number|null} - ID de la carpeta encontrada o null si no existe.
     */
    function buscarCarpetaPorNombre(name) {
        try {
            let dataFolder = [];
            let condicion = [["name", "is", name]];

            let saveSearch = search.create({
                type: "folder",
                filters: condicion,
                columns: [search.createColumn({ name: "internalid", label: "Internal ID" }), search.createColumn({ name: "name", sort: search.Sort.ASC, label: "Name" })]
            });

            saveSearch.run().each(function (item) {
                dataFolder.push({
                    internalid: item.getValue("internalid")
                });
                return true;
            });

            if (dataFolder.length > 0) {
                return dataFolder[0].internalid;
            }

            return null;
        } catch (error) {
            nLog.error("buscarCarpetaPorNombre - error", error);
            throw error;
        }
    }

    return {
        buscarOCrearCarpeta: buscarOCrearCarpeta,
        buscarCarpetaPorNombre: buscarCarpetaPorNombre
    };
});
