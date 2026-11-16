/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/file", "N/task"], function (file, task) {

    function crearTareaScriptMapReduce(internalidScript, internalidDeploy, parametrosTarea) {
        try {
            log.debug("crearTareaScriptMapReduce - parametrosTarea", {
                internalidScript: internalidScript,
                internalidDeploy: internalidDeploy,
                parametrosTarea: parametrosTarea
            });

            if (!internalidScript || !internalidDeploy || !parametrosTarea) {
                throw new Error("Los parametros internalidScript, internalidDeploy y parametrosTarea son obligatorios para crear la tarea");
            }

            // 1. Crear la tarea de Scheduled Script
            let mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: internalidScript,
                deploymentId: internalidDeploy,
                params: parametrosTarea
            });
            log.debug('crearTareaScriptMapReduce - mapReduceTask', {
                mapReduceTask: mapReduceTask
            });

            // 2. Enviar la tarea a la cola de NetSuite
            let taskId = mapReduceTask.submit();
            log.debug('crearTareaScriptMapReduce - taskId', {
                taskId: taskId
            });

            return taskId;
        } catch (error) {
            log.error("crearTareaScriptMapReduce - error", error);
            throw error;
        }
    }

    function crearTareaScriptScheduled(internalidScript, internalidDeploy, parametrosTarea) {
        try {
            log.debug("crearTareaScriptScheduled - parametrosTarea", {
                internalidScript: internalidScript,
                internalidDeploy: internalidDeploy,
                parametrosTarea: parametrosTarea
            });

            if (!internalidScript || !internalidDeploy || !parametrosTarea) {
                throw new Error("Los parametros internalidScript, internalidDeploy y parametrosTarea son obligatorios para crear la tarea");
            }

            // 1. Crear la tarea de Scheduled Script
            let scheduledTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: internalidScript,
                deploymentId: internalidDeploy,
                params: parametrosTarea
            });
            log.debug('crearTareaScriptScheduled - scheduledTask', {
                scheduledTask: scheduledTask
            });

            // 2. Enviar la tarea a la cola de NetSuite
            let taskId = scheduledTask.submit();
            log.debug('crearTareaScriptScheduled - taskId', {
                taskId: taskId
            });

            return taskId;
        } catch (error) {
            log.error("crearTareaScriptScheduled - error", error);
            throw error;
        }
    }

    function crearTareaImportacionCsv(idImportacion, idArchivo) {
        try {
            log.debug("crearTareaImportacionCsv - parametros", {
                idImportacion: idImportacion,
                idArchivo: idArchivo
            });

            if (!idImportacion || !idArchivo) {
                throw new Error("Los parametros idImportacion y idArchivo son obligatorios para crear la tarea de importacion CSV");
            }
            let csvTask = task.create({
                taskType: task.TaskType.CSV_IMPORT
            });
            csvTask.mappingId = idImportacion;
            csvTask.importFile = file.load({
                id: idArchivo
            });

            let idTareaEnviada = csvTask.submit();
            log.audit("recuentoEjecucion - idTareaEnviada", {
                idTareaEnviada: idTareaEnviada
            });
            return idTareaEnviada;
        } catch (error) {
            log.error("crearTareaImportacionCsv - error", error);
            throw error;
        }
    }

    return {
        crearTareaScriptMapReduce: crearTareaScriptMapReduce,
        crearTareaScriptScheduled: crearTareaScriptScheduled,
        crearTareaImportacionCsv: crearTareaImportacionCsv
    };
});
