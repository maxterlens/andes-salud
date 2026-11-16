/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["../dao/2win_dao_static_params_operacion"], function (daoParametros) {
    const TIPOS = ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"];
    const DOCUMENTOS = { FACTURA: "facturasEmitidas", NOTA_CREDITO: "ncEmitidas", NOTA_DEBITO: "ndEmitidas" };
    const DETALLES = { FACTURA: "detalleFacturas", NOTA_CREDITO: "detalleNC", NOTA_DEBITO: "detalleND" };
    const SCRIPT_PROGRAMADO = "customscript_2win_ss_recauda_fact_lotes";
    const DEPLOYMENT_PROGRAMADO = "customdeploy_2win_ss_recauda_fact_lotes";
    const DEPLOYMENT_SUPERVISOR = "customdeploy_2win_ss_recauda_fact_sup";
    const PARAMETRO_ARCHIVO_PROGRAMADO = "custscript_2w_as_ss_fac_lotes_archivo";
    const CAMPOS = {
        proceso: "custbody_2win_as_rec_fact_key",
        cargando: "custbody_2w_as_fac_lot_cargando",
        avance: "custbody_2w_as_fac_lot_avance",
        linea: "custcol_2w_as_fac_lot_linea"
    };

    function enteroPositivo(valor, nombre) {
        const numero = Number(valor);
        if (!Number.isSafeInteger(numero) || numero <= 0) throw new Error(`El parámetro ${nombre} debe ser un entero positivo`);
        return numero;
    }

    function leerConfiguracion() {
        const umbral = "recaudaciones_facturacion_umbral_lineas";
        const lote = "recaudaciones_facturacion_lineas_por_lote";
        return {
            umbral: enteroPositivo(daoParametros.getParam(umbral).number, umbral),
            lineasPorLote: enteroPositivo(daoParametros.getParam(lote).number, lote)
        };
    }

    function listarDocumentos(contenido) {
        const documentos = [];
        TIPOS.forEach(function (tipo) {
            const recibidos = contenido[DOCUMENTOS[tipo]] || [];
            if (!Array.isArray(recibidos)) throw new Error(`${DOCUMENTOS[tipo]} debe ser un arreglo`);
            recibidos.forEach(function (documento, indice) {
                if (!documento || typeof documento !== "object") throw new Error(`Documento inválido: ${tipo} ${indice}`);
                const detalles = documento[DETALLES[tipo]];
                documentos.push({ tipo: tipo, indice: indice, folio: documento.folioDoc,
                    lineas: Array.isArray(detalles) ? detalles.length : 0 });
            });
        });
        return documentos;
    }

    function usarRmaParaNc(tipo, lineas, configuracion) {
        // Compatibilidad con snapshots de pruebas ya recibidos; no se genera esta bandera en nuevas recepciones.
        return tipo === "NOTA_CREDITO" && (configuracion.probarNcRma === true || lineas > configuracion.umbral);
    }

    function leerFormularioRma() {
        const nombre = "recaudaciones_facturacion_formulario_rma";
        return enteroPositivo(daoParametros.getParam(nombre).number, nombre);
    }

    function crearClave(archivoId, tipo, indice) {
        return `2win_fac_${archivoId}_${tipo}_${indice}`;
    }

    function esVerdadero(valor) {
        return valor === true || valor === "T";
    }

    return { TIPOS, DOCUMENTOS, DETALLES, CAMPOS,
        leerConfiguracion, listarDocumentos, crearClave, enteroPositivo, esVerdadero,
        usarRmaParaNc, leerFormularioRma,
        SCRIPT_PROGRAMADO, DEPLOYMENT_PROGRAMADO, DEPLOYMENT_SUPERVISOR, PARAMETRO_ARCHIVO_PROGRAMADO };
});
