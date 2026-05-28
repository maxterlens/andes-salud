define(["../libs/2win_lib_auditoria", "../dao/2win_dao_file", "../dao/2win_dao_folder", "../dao/2win_dao_cola", "N/crypto/random", "N/file", "N/log", "N/runtime", "N/task"], function (libAuditoria, daoFile, daoFolder, daoCola, random, file, nLog, runtime, task) {
    // Clase base para operaciones masivas
    class OperacionMasiva {
        constructor({ nombre, tipoMensaje, scriptIdMapReduce, deploymentIdMapReduce, folderId, mapReduceParameter, parentFolderId, tipoFlujo }) {
            if (!nombre) throw new Error("El nombre de la operación masiva es obligatorio");
            if (!tipoMensaje) throw new Error("El tipo de mensaje es obligatorio");
            if (!scriptIdMapReduce) throw new Error("El scriptId del Map/Reduce es obligatorio");
            if (!deploymentIdMapReduce) throw new Error("El deploymentId del Map/Reduce es obligatorio");
            if (!mapReduceParameter) throw new Error("El parámetro del Map/Reduce es obligatorio");
            if (!tipoFlujo) throw new Error("El tipo de flujo es obligatorio");
            this.nombre = nombre;
            this.tipoMensaje = tipoMensaje;
            this.scriptIdMapReduce = scriptIdMapReduce;
            this.deploymentIdMapReduce = deploymentIdMapReduce;
            this.mapReduceParameter = mapReduceParameter;
            this.tipoFlujo = tipoFlujo;
            this.parentFolderId = parentFolderId || 693; // Carpeta padre por defecto
            
            // Validar o crear carpeta si folderId es una ruta relativa (./nombrecarpeta)
            if (folderId && folderId.startsWith("./")) {
                const nombreCarpeta = folderId.substring(2); // Extraer nombre sin ./
                this.folderId = daoFolder.buscarOCrearCarpeta(nombreCarpeta, this.parentFolderId);
            } else {
                this.folderId = folderId || 693; // Carpeta por defecto
            }
        }

        /**
         * Método para validar los parámetros de entrada
         * @param {object} parametro - Parámetro para ejecución
         * @returns {boolean} - True si los parámetros son válidos
         */
        validarParametros(parametro) {
            try {
                JSON.parse(JSON.stringify(parametro));
                return true;
            } catch (error) {
                nLog.error("Error al validar parámetros", error);
            }
            // throw new Error("Método validarParametros no implementado");
        }

        /**
         * Método para procesar los registros masivamente usando el sistema de cola
         * @param {object} parametro - Parámetro para ejecución
         * @returns {object} - Resultado del procesamiento
         */
        procesar(parametro) {
            try {
                nLog.audit(`${this.nombre} - parametro`, parametro);

                // Validar parámetros
                if (!this.validarParametros(parametro)) {
                    throw new Error("Parámetros inválidos para la operación");
                }

                // Crear archivo con los datos
                const uuid = random.generateUUID();
                const nombreArchivo = `${uuid}.json`;
                const datosArchivo = {
                    nombre: nombreArchivo,
                    contenido: JSON.stringify(parametro, null, 2),
                    folder: this.folderId,
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };
                const archivoCreado = daoFile.crearArchivo(datosArchivo);
                nLog.debug(`${this.nombre} - archivoCreado`, archivoCreado);

                // Crear registro en la cola de procesamiento
                const datosCola = {
                    nombreArchivo: nombreArchivo,
                    flujo: this.tipoFlujo,
                    scriptId: this.scriptIdMapReduce,
                    deploymentId: this.deploymentIdMapReduce,
                    parameterName: this.mapReduceParameter
                };
                const idCola = daoCola.crearRegistroCola(datosCola);
                nLog.debug(`${this.nombre} - registroColaCreado`, { idCola, datosCola });

                // Verificar si hay un Map/Reduce activo
                const tieneMapReduceActivo = daoCola.verificarMapReduceActivo(this.deploymentIdMapReduce);
                nLog.debug(`${this.nombre} - tieneMapReduceActivo`, tieneMapReduceActivo);

                let taskId = null;
                if (!tieneMapReduceActivo) {
                    // Si no hay Map/Reduce activo, ejecutar este archivo inmediatamente
                    // Actualizar estado a En Proceso
                    daoCola.actualizarEstadoCola(idCola, daoCola.ESTADO_COLA.EN_PROCESO);

                    const params = {};
                    params[this.mapReduceParameter] = archivoCreado.id;

                    // Crear y enviar la tarea Map/Reduce
                    const mapReduceTask = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: this.scriptIdMapReduce,
                        deploymentId: this.deploymentIdMapReduce,
                        params: params
                    });

                    taskId = mapReduceTask.submit();
                    nLog.audit(`${this.nombre} - Map/Reduce iniciado`, `ID de Tarea: ${taskId}, ID Cola: ${idCola}`);
                } else {
                    nLog.audit(`${this.nombre} - En cola`, `ID Cola: ${idCola} - Map/Reduce ya está ejecutándose`);
                }

                return {
                    tipoMensaje: this.tipoMensaje,
                    estado: "success",
                    codigo: 200,
                    mensaje: tieneMapReduceActivo 
                        ? "Operación masiva encolada correctamente"
                        : "Operación masiva recibida correctamente",
                    tipo_proceso: this.nombre,
                    id_proceso: uuid,
                    id_cola: idCola,
                    id_tarea: taskId || null,
                    en_cola: tieneMapReduceActivo,
                    data: {}
                };
            } catch (error) {
                nLog.error(`${this.nombre} - error`, error);
                throw error;
            }
        }
    }
    return {
        OperacionMasiva: OperacionMasiva
    };
});
