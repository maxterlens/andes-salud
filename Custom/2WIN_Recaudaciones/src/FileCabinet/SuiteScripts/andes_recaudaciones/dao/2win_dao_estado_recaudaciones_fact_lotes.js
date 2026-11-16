/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search", "N/file", "./2win_dao_file"], function (record, search, file, daoFile) {
    const TIPO = "customrecord_2w_as_fact_lotes";
    const CAMPO_ESTADO = "custrecord_2w_as_fac_lot_estado";

    function buscarControl(externalId) {
        const filas = search.create({ type: TIPO, filters: [["externalidstring", "is", externalId]],
            columns: ["internalid"] }).run().getRange({ start: 0, end: 2 });
        if (filas.length > 1) throw new Error(`Control duplicado: ${externalId}`);
        return filas.length ? filas[0].getValue("internalid") : null;
    }

    function guardarJson(nombre, datos, folder) {
        return daoFile.crearArchivo({ nombre: nombre, contenido: JSON.stringify(datos), folder: folder,
            tipo: file.Type.JSON, encoding: file.Encoding.UTF8 }).id;
    }

    function leerJson(id) {
        return JSON.parse(daoFile.cargarArchivo(id).contenido);
    }

    function crear(archivo, configuracion, documentos, via) {
        const clave = `2win_fac_lotes_${archivo.id}`;
        if (buscarControl(clave)) throw new Error(`Ya existe un control para el archivo ${archivo.id}`);
        const estado = { version: 1, revision: 0, archivoId: String(archivo.id), nombre: archivo.nombre,
            folder: archivo.folder, configuracion: configuracion, via: via, fase: 0, aplicar: false,
            documentos: documentos, errores: [], finalizado: false, cierre: {} };
        if (via === "LOTES_PROGRAMADO") estado.planVersion = 2;
        const estadoId = guardarJson(`${archivo.id}-facturacion-lotes-0.json`, estado, archivo.folder);
        const control = record.create({ type: TIPO, isDynamic: false });
        control.setValue({ fieldId: "externalid", value: clave });
        control.setValue({ fieldId: "name", value: clave });
        control.setValue({ fieldId: CAMPO_ESTADO, value: String(estadoId) });
        return { id: control.save(), estado: estado };
    }

    function cargar(archivoId, opcional) {
        const id = buscarControl(`2win_fac_lotes_${archivoId}`);
        if (!id && opcional) return null;
        if (!id) throw new Error(`No existe el estado de recepción para el archivo ${archivoId}`);
        const control = record.load({ type: TIPO, id: id, isDynamic: false });
        const estado = leerJson(control.getValue({ fieldId: CAMPO_ESTADO }));
        if (estado.version !== 1 || String(estado.archivoId) !== String(archivoId)) throw new Error("Estado de lotes incompatible");
        return { id: id, estado: estado };
    }

    function guardar(control) {
        // El bloqueo optimista del registro protege el puntero; los JSON son snapshots.
        const registro = record.load({ type: TIPO, id: control.id, isDynamic: false });
        const anterior = leerJson(registro.getValue({ fieldId: CAMPO_ESTADO }));
        if (anterior.revision !== control.estado.revision) throw new Error("El estado de lotes cambió durante la ejecución");
        const siguiente = Object.assign({}, control.estado, { revision: anterior.revision + 1 });
        const id = guardarJson(`${siguiente.archivoId}-facturacion-lotes-${siguiente.revision}-${Date.now()}.json`, siguiente, siguiente.folder);
        registro.setValue({ fieldId: CAMPO_ESTADO, value: String(id) });
        registro.save();
        control.estado = siguiente;
        return control;
    }

    function reservarDespacho() {
        const clave = "2win_facturacion_reserva_despacho";
        const reserva = record.create({ type: TIPO, isDynamic: false });
        reserva.setValue({ fieldId: "externalid", value: clave });
        reserva.setValue({ fieldId: "name", value: clave });
        try {
            return reserva.save();
        } catch (error) {
            if (buscarControl(clave)) return null;
            throw error;
        }
    }

    function liberarDespacho(id) {
        if (id) record.delete({ type: TIPO, id: id });
    }

    return { crear, cargar, guardar, guardarJson, leerJson, reservarDespacho, liberarDespacho };
});
