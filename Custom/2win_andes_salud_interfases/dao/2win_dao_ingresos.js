define(["N/record", "N/search", "../dao/2win_dao", "N/log"], function (record, search, dao, nLog) {
    /**
     * @function creaRegistro - Crear un nuevo registro de ingreso de paciente.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function creaRegistro(parametro) {
        try {
            nLog.audit("creaRegistro - parametro", parametro);
            // Crear registro
            let registro = record.create({
                type: "customrecord_2w_ingresos_paciente",
                isDynamic: true
            });

            registro.setValue("name", parametro.cuentaPaciente);
            registro.setValue("custrecord_2w_paciente", parametro.idPaciente);
            registro.setValue("custrecord_2w_ficha_paciente", parametro.idFichaPaciente);
            registro.setValue("custrecord_2w_ingreso_paciente", parametro.idIngresoPaciente);
            registro.setValue("custrecord_2w_tipo_atencion", parametro.tipoAtencion);
            registro.setValue("custrecord_2w_fecha_ingreso", parametro.fechaIngreso);
            registro.setValue("custrecord_2w_fecha_alta", parametro.fechaAlta);
            registro.setValue("custrecord_2w_estado_ficha", parametro.estadoFicha);

            // Guardar registro
            let idRegistro = registro.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
            nLog.audit("creaRegistro - idRegistro", idRegistro);
            return idRegistro;
        } catch (error) {
            nLog.error("creaRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function editarRegistro - Editar registro existente de ingreso de paciente.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function editarRegistro(parametro) {
        try {
            nLog.audit("editarRegistro - parametro", parametro);
            if (!parametro.id) {
                throw new Error("El ID del registro es obligatorio para editar.");
            }
            // Cargar registro
            let registro = record.load({
                type: "customrecord_2w_ingresos_paciente",
                id: parametro.id,
                isDynamic: true
            });

            registro.setValue("name", parametro.cuentaPaciente);
            registro.setValue("custrecord_2w_paciente", parametro.idPaciente);
            registro.setValue("custrecord_2w_ficha_paciente", parametro.idFichaPaciente);
            registro.setValue("custrecord_2w_ingreso_paciente", parametro.idIngresoPaciente);
            registro.setValue("custrecord_2w_tipo_atencion", parametro.tipoAtencion);
            registro.setValue("custrecord_2w_fecha_ingreso", parametro.fechaIngreso);
            registro.setValue("custrecord_2w_fecha_alta", parametro.fechaAlta);
            registro.setValue("custrecord_2w_estado_ficha", parametro.estadoFicha);

            // Guardar registro
            let idRegistro = registro.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
            nLog.audit("editarRegistro - idRegistro", idRegistro);
            return idRegistro;
        } catch (error) {
            nLog.error("editarRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarRegistro - Eliminar registro de ingreso de paciente.
     * @param {number} id - ID interno del registro a eliminar.
     * @return {object} - Resultado de la operación.
     */
    function eliminarRegistro(id) {
        try {
            nLog.audit("eliminarRegistro - id", id);
            if (!id) {
                throw new Error("El ID del registro es obligatorio para eliminar.");
            }
            // Eliminar registro
            let resultado = record.delete({
                type: "customrecord_2w_ingresos_paciente",
                id: id
            });

            nLog.audit("eliminarRegistro - resultado", resultado);
            return { success: true, id: id };
        } catch (error) {
            nLog.error("eliminarRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistroPorId - Buscar registro de ingreso de paciente por ID interno.
     * @param {number} id - ID interno del registro a buscar.
     * @return {object} - Resultado de la búsqueda.
     */
    function busquedaRegistroPorId(id) {
        try {
            const resultado = search.lookupFields({
                type: "customrecord_2w_ingresos_paciente",
                id: id,
                columns: [
                    "internalid",
                    "name",
                    "custrecord_2w_paciente",
                    "custrecord_2w_ficha_paciente",
                    "custrecord_2w_ingreso_paciente",
                    "custrecord_2w_tipo_atencion",
                    "custrecord_2w_fecha_ingreso",
                    "custrecord_2w_fecha_alta",
                    "custrecord_2w_estado_ficha"
                ]
            });
            return {
                id: resultado.internalid,
                name: resultado.name,
                paciente: resultado.custrecord_2w_paciente,
                fichaPaciente: resultado.custrecord_2w_ficha_paciente,
                ingresoPaciente: resultado.custrecord_2w_ingreso_paciente,
                tipoAtencion: resultado.custrecord_2w_tipo_atencion,
                fechaIngreso: resultado.custrecord_2w_fecha_ingreso,
                fechaAlta: resultado.custrecord_2w_fecha_alta,
                estadoFicha: resultado.custrecord_2w_estado_ficha
            };
        } catch (error) {
            nLog.error("busquedaRegistroPorId - error", error);
            throw error;
        }
    }
    function busquedaRegistroPorName(name) {
        try {
            const filtro = search.createFilter({
                name: "name",
                operator: search.Operator.IS,
                values: [name]
            });
            const columnas = [
                "internalid",
                "name",
                "custrecord_2w_paciente",
                "custrecord_2w_ficha_paciente",
                "custrecord_2w_ingreso_paciente",
                "custrecord_2w_tipo_atencion",
                "custrecord_2w_fecha_ingreso",
                "custrecord_2w_fecha_alta",
                "custrecord_2w_estado_ficha"
            ];
            const resultados = dao.busqueda("customrecord_2w_ingresos_paciente", [filtro], columnas);
            if (resultados.length === 0) {
                return null;
            }
            const resultado = resultados[0];
            return {
                id: resultado.getValue("internalid"),
                name: resultado.getValue("name"),
                paciente: resultado.getValue("custrecord_2w_paciente"),
                fichaPaciente: resultado.getValue("custrecord_2w_ficha_paciente"),
                ingresoPaciente: resultado.getValue("custrecord_2w_ingreso_paciente"),
                tipoAtencion: resultado.getValue("custrecord_2w_tipo_atencion"),
                fechaIngreso: resultado.getValue("custrecord_2w_fecha_ingreso"),
                fechaAlta: resultado.getValue("custrecord_2w_fecha_alta"),
                estadoFicha: resultado.getValue("custrecord_2w_estado_ficha")
            };
        } catch (error) {
            nLog.error("busquedaRegistroPorName - error", error);
            throw error;
        }
    }
    return {
        creaRegistro: creaRegistro,
        editarRegistro: editarRegistro,
        eliminarRegistro: eliminarRegistro,
        busquedaRegistroPorId: busquedaRegistroPorId,
        busquedaRegistroPorName: busquedaRegistroPorName
    };
});
