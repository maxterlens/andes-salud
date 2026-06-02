/**
 * @NApiVersion     2.1
 * @NScriptType     MapReduceScript
 * @NModuleScope    SameAccount
 *
 * @name            AS_FacturacionRecepcionesAcepta_CL_MR_2.1.js
 * @description     Generación masiva de facturas de compra a partir de recepciones.
 *
 *                  Flujo:
 *                  getInputData → Busca el AS Control de Carga en estado Pendiente,
 *                                 lo marca En Proceso, lee el CSV adjunto y retorna
 *                                 cada fila como input al stage map.
 *
 *                  map          → Resuelve los internal IDs de recepción y factura
 *                                 del CSV a partir de sus tranIds.
 *                                 Emite clave=tranIdRecepcion, valor=datos resueltos.
 *
 *                  reduce       → Ejecuta la transformación recepción→factura,
 *                                 copia campos de cabecera, ajusta líneas y crea
 *                                 el registro AS Detalle Control de Carga.
 *
 *                  summarize    → Actualiza el estado final del Control de Carga
 *                                 (Completado o Completado con Errores).
 */
define([
    'N/record',
    'N/file',
    'N/search',
    'N/log',
    'N/runtime',
    '../commons/constants',
    '../repositories/ASControlCargaRepository',
    '../repositories/ASRecepcionRepository',
    '../repositories/ASFacturaCompraRepository',
    '../services/ASMotorTransformacionService',
], function (record, file, search, log, runtime, C, ControlCargaRepo, RecepcionRepo, FacturaCompraRepo, MotorTransformacion) {

    const currentScript = runtime.getCurrentScript();

    // ─── Helpers ────────────────────────────────────────────────────────────────


    function _obtenerParametrosScript() {
        return {
            controlCargaId: currentScript.getParameter({ name: 'custscript_as_fact_recp_acept_id_cc' })
        }
    }


    /**
     * Parsea el contenido CSV del archivo.
     * Soporta archivos con o sin fila de cabecera.
     * Formato esperado por columna: tranidRecepcion,tranidFactura
     *
     * @param   {string} contenido - Texto completo del CSV
     * @returns {Array<{ tranidRecepcion: string, tranidFactura: string }>}
     */
    function _parsearCsv(contenido) {
        const filas = contenido.split(/\r?\n/).filter(function (l) { return l.trim(); });
        const resultado = [];

        const comaCount = filas[0].split(',').length;
        const puntoComaCount = filas[0].split(';').length;
        const delimitador = puntoComaCount > puntoComaCount ? ';' : ',';

        filas.forEach(function (fila, index) {
            var columnas = fila.split(delimitador).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
            if (columnas.length < 2) return;

            // Ignorar fila de cabecera detectando si la primera columna no tiene formato de tranId
            var primerValor = columnas[0].toLowerCase();
            if (index === 0 && (primerValor === 'recepcion' || primerValor === 'factura')) {
                return;
            }

            resultado.push({
                tranidRecepcion: columnas[0],
                tranidFactura:   columnas[1],
            });
        });

        return resultado;
    }

    /**
     * Crea un registro AS Detalle Control de Carga con el resultado del procesamiento
     * de una fila del CSV.
     *
     * @param {Object} datos
     * @param {string} datos.controlCargaId   - ID del registro de cabecera
     * @param {string|null} datos.recepcionId      - ID de la recepción
     * @param {string|null} datos.facturaOrigenId  - ID de la factura del CSV
     * @param {string|null} datos.facturaNewId     - ID de la nueva factura generada
     * @param {string} datos.estado           - Texto del estado (C.ESTADOS.*)
     * @param {string} datos.detalle          - Mensaje descriptivo o de error
     */
    function _crearDetalle(datos) {
        var det = record.create({ type: C.RECORDS.DETALLE_CONTROL_CARGA });

        det.setValue({ fieldId: C.FIELDS_DETALLE.CABECERA, value: datos.controlCargaId });

        if (datos.recepcionId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.RECEPCION, value: datos.recepcionId });
        }
        if (datos.facturaOrigenId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.FACTURA_ACEPTA_ORIGEN, value: datos.facturaOrigenId });
        }
        if (datos.facturaNewId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.FACTURA_NUEVA, value: datos.facturaNewId });
        }

        det.setText({ fieldId: C.FIELDS_DETALLE.ESTADO,  text: datos.estado });
        det.setValue({ fieldId: C.FIELDS_DETALLE.DETALLE, value: datos.detalle });

        det.save({ ignoreMandatoryFields: true });
    }

    // ─── Map Reduce Entry Points ─────────────────────────────────────────────────

    /**
     * getInputData
     * Localiza el AS Control de Carga en estado Pendiente, lo marca En Proceso,
     * lee el CSV adjunto y retorna las filas como array de objetos.
     */
    function getInputData(context) {

        try {
            const { controlCargaId } = _obtenerParametrosScript();

            const cabecera = controlCargaId ? ControlCargaRepo.obtenerPendientePorId(controlCargaId) : ControlCargaRepo.obtenerPendiente();
           
            if (!cabecera) {
                log.audit({ title: 'getInputData', details: 'No se encontraron registros AS Control de Carga en estado Pendiente.' });
                return [];
            }

            log.audit({ title: 'getInputData', details: 'Procesando Control de Carga ID: ' + cabecera.id });

            // Marcar como En Proceso para evitar doble ejecución
            ControlCargaRepo.actualizarEstado(cabecera.id, C.ESTADOS.EN_PROCESO);

            if (!cabecera.idArchivo) {
                const msg = 'El registro Control de Carga ID ' + cabecera.id + ' no tiene un archivo CSV asignado (campo Id Archivo vacío).';
                ControlCargaRepo.actualizarEstadoYDetalle(cabecera.id, C.ESTADOS.ERROR, msg);
                log.error({ title: 'getInputData', details: msg });
                return [];
            }

            // Cargar y parsear el CSV
            const archivoCSV = file.load({ id: cabecera.idArchivo });
            const filas = _parsearCsv(archivoCSV.getContents());

            log.audit({ title: 'getInputData', details: 'Filas a procesar: ' + filas.length });

            // Adjuntar el ID de cabecera a cada fila para disponibilizarlo en reduce
            return filas.map(function (fila) {
                return {
                    controlCargaId:  cabecera.id,
                    tranidRecepcion: fila.tranidRecepcion,
                    tranidFactura:   fila.tranidFactura,
                };
            });

        
        } catch (e) {
            log.error('An error was ocurred in [getInputData]', e);
        }
    }

    /**
     * map
     * Resuelve los internal IDs de recepción y factura del CSV desde sus tranIds.
     * Emite los datos agrupados por tranId de recepción (clave única por fila).
     */
    function map(context) {
        const { key, value } = context;
        try {
            var fila = JSON.parse(value);

            log.debug({ title: 'map', details: 'Procesando: ' + fila.tranidRecepcion + ' / ' + fila.tranidFactura });

            var recepcionId = RecepcionRepo.obtenerIdPorTranId(fila.tranidRecepcion);
            var facturaOrigenId = FacturaCompraRepo.obtenerIdPorTranId(fila.tranidFactura);

            context.write({
                key:   fila.tranidRecepcion,
                value: JSON.stringify({
                    controlCargaId:  fila.controlCargaId,
                    tranidRecepcion: fila.tranidRecepcion,
                    tranidFactura:   fila.tranidFactura,
                    recepcionId,
                    facturaOrigenId,
                }),
            });
        } catch (e) {
            log.error('An error was ocurred in [map] key: ' + key, e);
        }
    }

    /**
     * reduce
     * Por cada recepción: valida IDs, transforma a factura de compra,
     * copia cabecera, ajusta líneas y crea el registro de detalle.
     * Los errores por fila quedan registrados en el detalle sin detener el proceso.
     */
    function reduce(context) {
        var datos = JSON.parse(context.values[0]);

        log.debug({ title: 'reduce', details: 'Transformando recepción: ' + datos.tranidRecepcion });

        if (!datos.recepcionId) {
            var msgRecepcion = 'No se encontró la recepción con tranId: ' + datos.tranidRecepcion;
            log.error({ title: 'reduce', details: msgRecepcion });
            _crearDetalle({
                controlCargaId:  datos.controlCargaId,
                recepcionId:     null,
                facturaOrigenId: datos.facturaOrigenId,
                facturaNewId:    null,
                estado:          C.ESTADOS.ERROR,
                detalle:         msgRecepcion,
            });
            return;
        }

        if (!datos.facturaOrigenId) {
            var msgFactura = 'No se encontró la factura con tranId: ' + datos.tranidFactura;
            log.error({ title: 'reduce', details: msgFactura });
            _crearDetalle({
                controlCargaId:  datos.controlCargaId,
                recepcionId:     datos.recepcionId,
                facturaOrigenId: null,
                facturaNewId:    null,
                estado:          C.ESTADOS.ERROR,
                detalle:         msgFactura,
            });
            return;
        }

        try {
            var nuevaFacturaId = MotorTransformacion.transformarRecepcionAFactura(
                datos.recepcionId,
                datos.facturaOrigenId
            );

            log.audit({ title: 'reduce', details: 'Factura generada ID: ' + nuevaFacturaId + ' | Recepción: ' + datos.tranidRecepcion });

            _crearDetalle({
                controlCargaId:  datos.controlCargaId,
                recepcionId:     datos.recepcionId,
                facturaOrigenId: datos.facturaOrigenId,
                facturaNewId:    nuevaFacturaId,
                estado:          C.ESTADOS.COMPLETADO,
                detalle:         'Factura generada correctamente desde recepción ' + datos.tranidRecepcion,
            });

        } catch (e) {
            var msgError = 'Error al transformar recepción ' + datos.tranidRecepcion + ': ' + e.message;
            log.error({ title: 'reduce', details: msgError });
            _crearDetalle({
                controlCargaId:  datos.controlCargaId,
                recepcionId:     datos.recepcionId,
                facturaOrigenId: datos.facturaOrigenId,
                facturaNewId:    null,
                estado:          C.ESTADOS.ERROR,
                detalle:         msgError,
            });
        }
    }

    /**
     * summarize
     * Determina el estado final del Control de Carga según si hubo errores
     * en las etapas map o reduce, y actualiza el registro de cabecera.
     */
    function summarize(summary) {
        var errores = [];

        summary.mapSummary.errors.iterator().each(function (key, error) {
            errores.push('MAP [' + key + ']: ' + JSON.parse(error).message);
            return true;
        });

        summary.reduceSummary.errors.iterator().each(function (key, error) {
            errores.push('REDUCE [' + key + ']: ' + JSON.parse(error).message);
            return true;
        });

        // Recuperar el Control de Carga que quedó En Proceso
        var cabeceraId = null;
        try {
            var idEstadoEnProceso = ControlCargaRepo.resolverIdEstado(C.ESTADOS.EN_PROCESO);
            var busqueda = search.create({
                type:    C.RECORDS.CONTROL_CARGA,
                filters: [[C.FIELDS_CONTROL_CARGA.ESTADO, 'anyof', idEstadoEnProceso]],
                columns: ['internalid'],
            }).run().getRange({ start: 0, end: 1 });

            if (busqueda.length) cabeceraId = busqueda[0].id;
        } catch (e) {
            log.error({ title: 'summarize', details: 'No se pudo localizar el Control de Carga En Proceso: ' + e.message });
        }

        var estadoFinal  = errores.length > 0 ? C.ESTADOS.COMPLETADO_CON_ERRORES : C.ESTADOS.COMPLETADO;
        var detalleFinal = errores.length > 0
            ? 'Proceso finalizado con ' + errores.length + ' error(es):\n' + errores.join('\n')
            : 'Proceso finalizado correctamente.';

        if (cabeceraId) {
            ControlCargaRepo.actualizarEstadoYDetalle(cabeceraId, estadoFinal, detalleFinal);
        }

        log.audit({ title: 'summarize', details: estadoFinal + ' | ' + detalleFinal });
    }

    return {
        getInputData,
        map,
        reduce,
        summarize,
    };
});
