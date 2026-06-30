/**
 * @NApiVersion 2.1
 * @module ./2win_dao_file.js
 * @NModuleScope Public
 */
define(["N/file", "N/log", "N/search"], function (file, nLog, search) {
    /**
     * @function crearArchivo - Función para crear un nuevo archivo en NetSuite.
     * @param {object} datosArchivo - Datos del archivo a crear.
     * @param {string} datosArchivo.nombre - Nombre del archivo.
     * @param {string} datosArchivo.contenido - Contenido del archivo.
     * @param {string} datosArchivo.tipo - Tipo de archivo (FILE, FOLDER).
     * @param {string} datosArchivo.folder - ID de la carpeta donde se guardará el archivo.
     * @param {string} datosArchivo.encoding - Codificación del archivo (UTF_8, WINDOWS_1252, etc.).
     * @return {object} - Resultado de la operación con ID del archivo creado.
     */
    function crearArchivo(datosArchivo) {
        try {
            nLog.debug("crearArchivo - datosArchivo", datosArchivo);

            // Validar datos requeridos
            if (!datosArchivo.nombre) {
                throw new Error("Nombre del archivo es requerido");
            }

            if (!datosArchivo.contenido) {
                throw new Error("Contenido del archivo es requerido");
            }

            if (!datosArchivo.folder) {
                throw new Error("ID de folder es requerido");
            }

            // Crear archivo sin contenido inicial (streaming)
            let archivo = file.create({
                name: datosArchivo.nombre,
                folder: datosArchivo.folder,
                fileType: datosArchivo.tipo || file.Type.PLAINTEXT
            });

            // Establecer codificación si se proporciona
            if (datosArchivo.encoding) {
                archivo.encoding = datosArchivo.encoding;
            }

            // Determinar si se debe usar streaming
            const usarStreaming = datosArchivo.contenido.length > 10 * 1024 * 1024; // 10MB

            if (usarStreaming) {
                // Escribir contenido en modo streaming por fragmentos
                const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB por fragmento
                for (let i = 0; i < datosArchivo.contenido.length; i += CHUNK_SIZE) {
                    const chunk = datosArchivo.contenido.substring(i, i + CHUNK_SIZE);
                    archivo.append({
                        value: chunk
                    });
                }
            } else {
                // Usar el método anterior para archivos pequeños
                const lineas = datosArchivo.contenido.split(/\r?\n/);
                lineas.forEach(function (linea) {
                    archivo.appendLine({ value: linea });
                });
            }

            // Guardar archivo
            let fileId = archivo.save();

            nLog.audit("crearArchivo - archivo creado", {
                nombre: datosArchivo.nombre,
                id: fileId
            });

            return {
                id: fileId,
                nombre: datosArchivo.nombre,
                folder: datosArchivo.folder
            };
        } catch (error) {
            nLog.error("crearArchivo - error", error);
            throw error;
        }
    }

    /**
     * @function cargarArchivo - Función para cargar un archivo existente por ID.
     * @param {number|string} fileId - ID del archivo a cargar.
     * @return {object} - Datos del archivo cargado.
     */
    function cargarArchivo(fileId) {
        try {
            nLog.debug("cargarArchivo - fileId", fileId);

            // Validar ID de archivo
            if (!fileId) {
                throw new Error("ID del archivo es requerido");
            }

            // Cargar archivo

            const archivoCargado = file.load({ id: fileId });
            nLog.audit("cargarArchivo - archivo cargado", {
                id: archivoCargado.id,
                nombre: archivoCargado.name,
                folder: archivoCargado.folder
            });
            const esGrande = archivoCargado.size > 10 * 1024 * 1024; // 10MB

            const resultado = {
                id: archivoCargado.id,
                nombre: archivoCargado.name,
                folder: archivoCargado.folder,
                tipo: archivoCargado.fileType,
                encoding: archivoCargado.encoding,
                size: archivoCargado.size
            };

            if (esGrande) {
                resultado.contenido = "";
                const iteratorFile = archivoCargado.lines.iterator();
                iteratorFile.each((line) => {
                    resultado.contenido += line.value;
                    return true;
                });
            } else {
                resultado.contenido = archivoCargado.getContents();
            }

            return resultado;
        } catch (error) {
            nLog.error("cargarArchivo - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarArchivo - Función para actualizar un archivo existente.
     * @param {object} datosArchivo - Datos del archivo a actualizar.
     * @param {number|string} datosArchivo.id - ID del archivo a actualizar.
     * @param {string} datosArchivo.contenido - Nuevo contenido del archivo.
     * @param {string} datosArchivo.nombre - Nuevo nombre del archivo (opcional).
     * @param {string} datosArchivo.folder - Nuevo ID de folder (opcional).
     * @return {object} - Resultado de la operación con ID del archivo actualizado.
     */
    function actualizarArchivo(datosArchivo) {
        try {
            nLog.debug("actualizarArchivo - datosArchivo", datosArchivo);

            // Validar ID de archivo
            if (!datosArchivo.id) {
                throw new Error("ID del archivo es requerido");
            }

            if (!datosArchivo.contenido) {
                throw new Error("Contenido del archivo es requerido");
            }

            // Cargar archivo existente
            let archivo = file.load({
                id: datosArchivo.id
            });

            // Actualizar contenido
            archivo.contents = datosArchivo.contenido;

            // Actualizar nombre si se proporciona
            if (datosArchivo.nombre) {
                archivo.name = datosArchivo.nombre;
            }

            // Actualizar folder si se proporciona
            if (datosArchivo.folder) {
                archivo.folder = datosArchivo.folder;
            }

            // Guardar cambios
            let fileId = archivo.save();

            nLog.audit("actualizarArchivo - archivo actualizado", {
                id: fileId,
                nombre: archivo.name
            });

            return {
                id: fileId,
                nombre: archivo.name,
                folder: archivo.folder
            };
        } catch (error) {
            nLog.error("actualizarArchivo - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarArchivo - Función para eliminar un archivo por ID.
     * @param {number|string} fileId - ID del archivo a eliminar.
     * @return {boolean} - Resultado de la operación.
     */
    function eliminarArchivo(fileId) {
        try {
            nLog.debug("eliminarArchivo - fileId", fileId);

            // Validar ID de archivo
            if (!fileId) {
                throw new Error("ID del archivo es requerido");
            }

            // Eliminar archivo
            file.delete({
                id: fileId
            });

            nLog.audit("eliminarArchivo - archivo eliminado", fileId);

            return true;
        } catch (error) {
            nLog.error("eliminarArchivo - error", error);
            throw error;
        }
    }

    /**
     * @function buscarArchivos - Función para buscar archivos por criterios específicos.
     * @param {object} criteriosBusqueda - Criterios para la búsqueda de archivos.
     * @param {string} criteriosBusqueda.nombre - Nombre del archivo (opcional).
     * @param {number|string} criteriosBusqueda.folder - ID de la carpeta (opcional).
     * @param {string} criteriosBusqueda.tipo - Tipo de archivo (opcional).
     * @return {Array} - Resultados de la búsqueda.
     */
    function buscarArchivos(criteriosBusqueda) {
        try {
            nLog.debug("buscarArchivos - criteriosBusqueda", criteriosBusqueda);

            // Crear filtros de búsqueda
            let filtros = [];

            if (criteriosBusqueda.nombre) {
                filtros.push(["name", "is", criteriosBusqueda.nombre]);
            }

            if (criteriosBusqueda.folder) {
                filtros.push(["folder", "anyof", criteriosBusqueda.folder]);
            }

            if (criteriosBusqueda.tipo) {
                filtros.push(["filetype", "anyof", criteriosBusqueda.tipo]);
            }

            // Crear búsqueda
            let busqueda = search.create({
                type: search.Type.FILE,
                filters: filtros,
                columns: [
                    search.createColumn({ name: "name", label: "nombre" }),
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "folder", label: "folder" }),
                    search.createColumn({ name: "filetype", label: "tipo" }),
                    search.createColumn({ name: "filesize", label: "tamaño" }),
                    search.createColumn({ name: "url", label: "url" })
                ]
            });

            // Ejecutar búsqueda y obtener resultados
            let resultados = [];
            busqueda.run().each(function (resultado) {
                let archivo = {};
                for (let i = 0; i < resultado.columns.length; i++) {
                    archivo[resultado.columns[i].label] = resultado.getValue(resultado.columns[i]);
                }
                resultados.push(archivo);
                return true;
            });

            nLog.audit("buscarArchivos - resultados", {
                cantidad: resultados.length,
                resultados: resultados
            });

            return resultados;
        } catch (error) {
            nLog.error("buscarArchivos - error", error);
            throw error;
        }
    }

    /**
     * @function buscarArchivoPorNombre - Función para buscar un archivo por su nombre.
     * @param {string} nombreArchivo - Nombre del archivo a buscar.
     * @param {number|string} folderId - ID de la carpeta donde buscar (opcional).
     * @return {Array} - Resultados de la búsqueda.
     */
    function buscarArchivoPorNombre(nombreArchivo, folderId) {
        try {
            nLog.debug("buscarArchivoPorNombre - parametros", {
                nombreArchivo: nombreArchivo,
                folderId: folderId
            });

            // Validar nombre de archivo
            if (!nombreArchivo) {
                throw new Error("Nombre del archivo es requerido");
            }

            // Crear filtros de búsqueda
            let filtros = [["name", "is", nombreArchivo]];

            if (folderId) {
                filtros.push("AND", ["folder", "anyof", folderId]);
            }

            // Crear búsqueda
            let busqueda = search.create({
                type: "file", // search.Type.FILE
                filters: filtros,
                columns: [
                    search.createColumn({ name: "name", label: "nombre" }),
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "folder", label: "folder" }),
                    search.createColumn({ name: "filetype", label: "tipo" })
                ]
            });

            // Ejecutar búsqueda y obtener resultados
            let resultados = [];
            busqueda.run().each(function (resultado) {
                let archivo = {};
                for (let i = 0; i < resultado.columns.length; i++) {
                    archivo[resultado.columns[i].label] = resultado.getValue(resultado.columns[i]);
                }
                resultados.push(archivo);
                return true;
            });

            nLog.audit("buscarArchivoPorNombre - resultados", {
                cantidad: resultados.length,
                resultados: resultados
            });

            return resultados;
        } catch (error) {
            nLog.error("buscarArchivoPorNombre - error", error);
            throw error;
        }
    }

    function buscarCarpetaPorNombre(name) {
        try {
            let dataFolder = [];
            let condicion = [["name", "is", name]];

            let saveSearch = search.create({
                type: "folder",
                filters: condicion,
                columns: [
                    search.createColumn({ name: "internalid", label: "Internal ID" }),
                    search.createColumn({ name: "name", sort: search.Sort.ASC, label: "Name" }),
                    search.createColumn({ name: "foldersize", label: "Size (KB)" }),
                    search.createColumn({ name: "lastmodifieddate", label: "Last Modified" }),
                    search.createColumn({ name: "parent", label: "Sub of" }),
                    search.createColumn({ name: "numfiles", label: "# of Files" })
                ]
            });

            nLog.debug({ title: "Nombre de carpeta", details: name });

            saveSearch.run().each(function (item) {
                dataFolder.push({
                    internalid: item.getValue("internalid")
                });
            });

            if (dataFolder.length > 0) {
                let folderId = dataFolder[0].internalid;
                return folderId;
            }
        } catch (error) {
            nLog.error("buscarCarpetaPorNombre - error", error);
            throw error;
        }
    }

    return {
        crearArchivo: crearArchivo,
        cargarArchivo: cargarArchivo,
        actualizarArchivo: actualizarArchivo,
        eliminarArchivo: eliminarArchivo,
        buscarArchivos: buscarArchivos,
        buscarArchivoPorNombre: buscarArchivoPorNombre,
        buscarCarpetaPorNombre: buscarCarpetaPorNombre
    };
});
