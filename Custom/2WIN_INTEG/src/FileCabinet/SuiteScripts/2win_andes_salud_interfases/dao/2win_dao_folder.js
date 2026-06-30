/**
 * @NApiVersion 2.1
 * @module ./2win_dao_folder.js
 * @NModuleScope Public
 */
define(["N/file", "N/log", "N/search"], function (file, nLog, search) {
    /**
     * @function crearFolder - Función para crear una nueva carpeta en NetSuite.
     * @param {object} datosFolder - Datos de la carpeta a crear.
     * @param {string} datosFolder.nombre - Nombre de la carpeta.
     * @param {number|string} datosFolder.parent - ID de la carpeta padre (opcional).
     * @return {object} - Resultado de la operación con ID de la carpeta creada.
     */
    function crearFolder(datosFolder) {
        try {
            nLog.debug("crearFolder - datosFolder", datosFolder);

            // Validar datos requeridos
            if (!datosFolder.nombre) {
                throw new Error("Nombre de la carpeta es requerido");
            }

            // Crear folder
            let folder = file.create({
                name: datosFolder.nombre,
                fileType: file.Type.FOLDER,
                folder: datosFolder.parent || null
            });

            // Guardar folder
            let folderId = folder.save();
            
            nLog.audit("crearFolder - folder creado", {
                nombre: datosFolder.nombre,
                id: folderId
            });

            return {
                id: folderId,
                nombre: datosFolder.nombre,
                parent: datosFolder.parent || null
            };
        } catch (error) {
            nLog.error("crearFolder - error", error);
            throw error;
        }
    }

    /**
     * @function cargarFolder - Función para cargar una carpeta existente por ID.
     * @param {number|string} folderId - ID de la carpeta a cargar.
     * @return {object} - Datos de la carpeta cargada.
     */
    function cargarFolder(folderId) {
        try {
            nLog.debug("cargarFolder - folderId", folderId);

            // Validar ID de folder
            if (!folderId) {
                throw new Error("ID de la carpeta es requerido");
            }

            // Cargar folder
            let folder = file.load({
                id: folderId
            });

            nLog.audit("cargarFolder - folder cargado", {
                id: folder.id,
                nombre: folder.name,
                parent: folder.folder
            });

            return {
                id: folder.id,
                nombre: folder.name,
                parent: folder.folder,
                size: folder.size,
                url: folder.url
            };
        } catch (error) {
            nLog.error("cargarFolder - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarFolder - Función para actualizar una carpeta existente.
     * @param {object} datosFolder - Datos de la carpeta a actualizar.
     * @param {number|string} datosFolder.id - ID de la carpeta a actualizar.
     * @param {string} datosFolder.nombre - Nuevo nombre de la carpeta (opcional).
     * @param {number|string} datosFolder.parent - Nuevo ID de la carpeta padre (opcional).
     * @return {object} - Resultado de la operación con ID de la carpeta actualizada.
     */
    function actualizarFolder(datosFolder) {
        try {
            nLog.debug("actualizarFolder - datosFolder", datosFolder);

            // Validar ID de folder
            if (!datosFolder.id) {
                throw new Error("ID de la carpeta es requerido");
            }

            // Cargar folder existente
            let folder = file.load({
                id: datosFolder.id
            });

            // Validar que el objeto cargado sea una carpeta
            if (folder.fileType !== file.Type.FOLDER) {
                throw new Error("El ID proporcionado no corresponde a una carpeta");
            }

            // Actualizar nombre si se proporciona
            if (datosFolder.nombre) {
                folder.name = datosFolder.nombre;
            }

            // Actualizar parent folder si se proporciona
            if (datosFolder.parent) {
                folder.folder = datosFolder.parent;
            }

            // Guardar cambios
            let folderId = folder.save();

            nLog.audit("actualizarFolder - folder actualizado", {
                id: folderId,
                nombre: folder.name
            });

            return {
                id: folderId,
                nombre: folder.name,
                parent: folder.folder
            };
        } catch (error) {
            nLog.error("actualizarFolder - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarFolder - Función para eliminar una carpeta por ID.
     * @param {number|string} folderId - ID de la carpeta a eliminar.
     * @return {boolean} - Resultado de la operación.
     */
    function eliminarFolder(folderId) {
        try {
            nLog.debug("eliminarFolder - folderId", folderId);

            // Validar ID de folder
            if (!folderId) {
                throw new Error("ID de la carpeta es requerido");
            }

            // Eliminar folder
            file.delete({
                id: folderId
            });

            nLog.audit("eliminarFolder - folder eliminado", folderId);

            return true;
        } catch (error) {
            nLog.error("eliminarFolder - error", error);
            throw error;
        }
    }

    /**
     * @function buscarFolders - Función para buscar carpetas por criterios específicos.
     * @param {object} criteriosBusqueda - Criterios para la búsqueda de carpetas.
     * @param {string} criteriosBusqueda.nombre - Nombre de la carpeta (opcional).
     * @param {number|string} criteriosBusqueda.parent - ID de la carpeta padre (opcional).
     * @return {Array} - Resultados de la búsqueda.
     */
    function buscarFolders(criteriosBusqueda) {
        try {
            nLog.debug("buscarFolders - criteriosBusqueda", criteriosBusqueda);

            // Crear filtros de búsqueda
            let filtros = [["filetype", "anyof", "FOLDER"]];
            
            if (criteriosBusqueda.nombre) {
                filtros.push("AND", ["name", "is", criteriosBusqueda.nombre]);
            }
            
            if (criteriosBusqueda.parent) {
                filtros.push("AND", ["folder", "anyof", criteriosBusqueda.parent]);
            }

            // Crear búsqueda
            let busqueda = search.create({
                type: search.Type.FOLDER,
                filters: filtros,
                columns: [
                    search.createColumn({ name: "name", label: "nombre" }),
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "parent", label: "parent" }),
                    search.createColumn({ name: "filesize", label: "tamaño" }),
                    search.createColumn({ name: "url", label: "url" })
                ]
            });

            // Ejecutar búsqueda y obtener resultados
            let resultados = [];
            busqueda.run().each(function (resultado) {
                let folder = {};
                for (let i = 0; i < resultado.columns.length; i++) {
                    folder[resultado.columns[i].label] = resultado.getValue(resultado.columns[i]);
                }
                resultados.push(folder);
                return true;
            });

            nLog.audit("buscarFolders - resultados", {
                cantidad: resultados.length,
                resultados: resultados
            });

            return resultados;
        } catch (error) {
            nLog.error("buscarFolders - error", error);
            throw error;
        }
    }

    /**
     * @function buscarFolderPorNombre - Función para buscar una carpeta por su nombre.
     * @param {string} nombreFolder - Nombre de la carpeta a buscar.
     * @param {number|string} parentId - ID de la carpeta padre donde buscar (opcional).
     * @return {Array} - Resultados de la búsqueda.
     */
    function buscarFolderPorNombre(nombreFolder, parentId) {
        try {
            nLog.debug("buscarFolderPorNombre - parametros", {
                nombreFolder: nombreFolder,
                parentId: parentId
            });

            // Validar nombre de folder
            if (!nombreFolder) {
                throw new Error("Nombre de la carpeta es requerido");
            }

            // Crear filtros de búsqueda
            let filtros = [
                ["filetype", "anyof", "FOLDER"],
                "AND",
                ["name", "is", nombreFolder]
            ];
            
            if (parentId) {
                filtros.push("AND", ["parent", "anyof", parentId]);
            }

            // Crear búsqueda
            let busqueda = search.create({
                type: search.Type.FOLDER,
                filters: filtros,
                columns: [
                    search.createColumn({ name: "name", label: "nombre" }),
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "parent", label: "parent" })
                ]
            });

            // Ejecutar búsqueda y obtener resultados
            let resultados = [];
            busqueda.run().each(function (resultado) {
                let folder = {};
                for (let i = 0; i < resultado.columns.length; i++) {
                    folder[resultado.columns[i].label] = resultado.getValue(resultado.columns[i]);
                }
                resultados.push(folder);
                return true;
            });

            nLog.audit("buscarFolderPorNombre - resultados", {
                cantidad: resultados.length,
                resultados: resultados
            });

            return resultados;
        } catch (error) {
            nLog.error("buscarFolderPorNombre - error", error);
            throw error;
        }
    }

    return {
        crearFolder: crearFolder,
        cargarFolder: cargarFolder,
        actualizarFolder: actualizarFolder,
        eliminarFolder: eliminarFolder,
        buscarFolders: buscarFolders,
        buscarFolderPorNombre: buscarFolderPorNombre
    };
});
