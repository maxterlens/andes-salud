/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search"], function (record, search) {
    const TIPO = "customrecord_2w_as_fac_lot_tarea";
    const PADRE = "customrecord_2w_as_cola_procesamiento";
    const CAMPOS = {
        padreId: "custrecord_2w_as_flt_padre", processKey: "custrecord_2w_as_flt_clave",
        tipo: "custrecord_2w_as_flt_tipo", folio: "custrecord_2w_as_flt_folio",
        indice: "custrecord_2w_as_flt_indice", fase: "custrecord_2w_as_flt_fase",
        grupo: "custrecord_2w_as_flt_grupo", orden: "custrecord_2w_as_flt_orden",
        operacion: "custrecord_2w_as_flt_operacion", desde: "custrecord_2w_as_flt_desde",
        hasta: "custrecord_2w_as_flt_hasta", estado: "custrecord_2w_as_flt_estado",
        intentos: "custrecord_2w_as_flt_intentos", ejecucionId: "custrecord_2w_as_flt_ejecucion",
        inicio: "custrecord_2w_as_flt_inicio", fin: "custrecord_2w_as_flt_fin",
        preparadoId: "custrecord_2w_as_flt_preparado", documentoId: "custrecord_2w_as_flt_documento",
        resultado: "custrecord_2w_as_flt_resultado", historial: "custrecord_2w_as_flt_historial",
        error: "custrecord_2w_as_flt_error", revision: "custrecord_2w_as_flt_revision"
    };
    const NUMEROS = ["indice", "fase", "grupo", "orden", "desde", "hasta", "intentos", "revision"];
    const JSON_CAMPOS = ["resultado", "historial"];

    function leer(registro) {
        const tarea = { id: String(registro.id) };
        Object.keys(CAMPOS).forEach(function (nombre) {
            const valor = registro.getValue({ fieldId: CAMPOS[nombre] });
            tarea[nombre] = JSON_CAMPOS.includes(nombre) ? (valor ? JSON.parse(valor) : null) :
                (NUMEROS.includes(nombre) ? Number(valor || 0) : valor);
        });
        tarea.historial = tarea.historial || [];
        return tarea;
    }

    function cargar(id) { return leer(record.load({ type: TIPO, id: id, isDynamic: false })); }

    function escribir(registro, tarea) {
        Object.keys(CAMPOS).forEach(function (nombre) {
            if (tarea[nombre] !== undefined) registro.setValue({ fieldId: CAMPOS[nombre],
                value: JSON_CAMPOS.includes(nombre) ? JSON.stringify(tarea[nombre]) : (tarea[nombre] == null ? "" : tarea[nombre]) });
        });
    }

    function buscarClave(clave) {
        const filas = search.create({ type: TIPO, filters: [["externalidstring", "is", clave]], columns: ["internalid"] })
            .run().getRange({ start: 0, end: 2 });
        if (filas.length > 1) throw new Error(`Tarea duplicada: ${clave}`);
        return filas.length ? cargar(filas[0].getValue("internalid")) : null;
    }

    function asegurar(datos) {
        const clave = `2win_flt_${datos.padreId}_${datos.processKey}_${datos.operacion}_${datos.desde || 0}_${datos.hasta || 0}`;
        const anterior = buscarClave(clave);
        if (anterior) {
            ["padreId", "processKey", "tipo", "indice", "fase", "grupo", "orden", "operacion", "desde", "hasta"].forEach(function (nombre) {
                if (String(anterior[nombre] || 0) !== String(datos[nombre] || 0)) throw new Error(`Plan incompatible: ${clave}/${nombre}`);
            });
            return anterior;
        }
        const registro = record.create({ type: TIPO, isDynamic: false });
        registro.setValue({ fieldId: "externalid", value: clave });
        registro.setValue({ fieldId: "name", value: `${datos.folio || datos.tipo} ${datos.operacion} ${datos.desde || ""}-${datos.hasta || ""}` });
        escribir(registro, Object.assign({ estado: "PENDIENTE", intentos: 0, revision: 0, historial: [] }, datos));
        // No absorber errores de save: en el siguiente lanzamiento se busca la clave otra vez.
        return cargar(registro.save());
    }

    function guardar(tarea) {
        const registro = record.load({ type: TIPO, id: tarea.id, isDynamic: false });
        const actual = leer(registro);
        if (actual.revision !== tarea.revision) throw new Error(`La tarea ${tarea.id} cambió durante la ejecución`);
        const siguiente = Object.assign({}, tarea, { revision: tarea.revision + 1 });
        escribir(registro, siguiente);
        registro.save(); // El bloqueo optimista protege también la ventana load/save.
        Object.assign(tarea, siguiente);
    }

    function listar(padreId) {
        const filas = [];
        const consulta = search.create({ type: TIPO, filters: [[CAMPOS.padreId, "anyof", padreId]],
            columns: [search.createColumn({ name: "internalid", sort: search.Sort.ASC }),
                ...Object.keys(CAMPOS).filter(nombre => !JSON_CAMPOS.includes(nombre)).map(nombre => CAMPOS[nombre])] }).runPaged({ pageSize: 1000 });
        consulta.pageRanges.forEach(function (rango) {
            consulta.fetch({ index: rango.index }).data.forEach(function (fila) {
                filas.push(leer({ id: fila.getValue("internalid"), getValue: ({ fieldId }) =>
                    JSON_CAMPOS.some(nombre => CAMPOS[nombre] === fieldId) ? "" : fila.getValue(fieldId) }));
            });
        });
        return filas.sort((a, b) => a.fase - b.fase || a.grupo - b.grupo || a.indice - b.indice || a.orden - b.orden);
    }

    function actualizarPadre(id, datos) {
        const campos = { planCompleto: "custrecord_2w_as_fplan_listo", hijoActual: "custrecord_2w_as_fplan_hijo",
            resultado: "custrecord_2w_as_fplan_resultado", cierrePendiente: "custrecord_2w_as_fplan_cierre" };
        const valores = {};
        Object.keys(datos).forEach(nombre => { valores[campos[nombre]] = datos[nombre]; });
        record.submitFields({ type: PADRE, id: id, values: valores });
    }

    function activos() {
        return search.create({ type: PADRE, filters: [["custrecord_2w_as_flujo", "is", 2], "AND",
            ["custrecord_2w_as_estado_cola", "is", 2]], columns: ["internalid", "custrecord_2w_as_nombre_archivo",
            "custrecord_2w_as_fplan_version", "custrecord_2w_as_script_id_mr"] }).run().getRange({ start: 0, end: 2 })
            .map(fila => ({ id: fila.getValue("internalid"), nombre: fila.getValue("custrecord_2w_as_nombre_archivo"),
                version: Number(fila.getValue("custrecord_2w_as_fplan_version")), scriptId: fila.getValue("custrecord_2w_as_script_id_mr") }));
    }

    function cierrePendiente() {
        const filas = search.create({ type: PADRE, filters: [["custrecord_2w_as_fplan_version", "equalto", 2], "AND",
            ["custrecord_2w_as_fplan_cierre", "is", "T"]],
            columns: ["internalid", "custrecord_2w_as_script_id_mr"] }).run().getRange({ start: 0, end: 1 });
        return filas.length ? { id: filas[0].getValue("internalid"), version: 2,
            scriptId: filas[0].getValue("custrecord_2w_as_script_id_mr") } : null;
    }
    return { asegurar, guardar, cargar, listar, actualizarPadre, activos, cierrePendiente };
});
