/**
 * @NApiVersion     2.1
 * @NScriptType     MapReduceScript
 * @NModuleScope    SameAccount
 *
 * @name            AS_FacturacionRecepcionesAcepta_CL_MR_2.1.js
 * @description     Generación masiva de facturas de compra a partir de recepciones o
 *                  directamente desde una Orden de Compra.
 *
 *                  Soporta dos formatos de CSV según el encabezado de la primera columna:
 *
 *                  Formato RECEPCION (flujo original):
 *                    Recepcion;Factura
 *                    RA-1052;46057
 *
 *                  Formato OC_DIRECTA (nuevo flujo sin recepción):
 *                    OrdenCompra;Factura
 *                    OC-0123;46057
 *
 *                  Flujo:
 *                  getInputData → Busca el AS Control de Carga en estado Pendiente,
 *                                 lo marca En Proceso, lee el CSV adjunto y retorna
 *                                 cada fila como input al stage map.
 *
 *                  map          → Según el tipo detectado en el CSV:
 *                                 RECEPCION: resuelve recepcionId y facturaOrigenId.
 *                                 OC_DIRECTA: resuelve ocId, valida que la OC no esté
 *                                             totalmente facturada y resuelve facturaOrigenId.
 *                                 Emite clave=tranidDocumento, valor=datos resueltos.
 *
 *                  reduce       → Ejecuta la transformación correspondiente al tipo:
 *                                 RECEPCION:  recepción→factura (approvalstatus=2).
 *                                 OC_DIRECTA: OC→factura (approvalstatus=1).
 *                                 Crea el registro AS Detalle Control de Carga.
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
    '../repositories/ASOrdenCompraRepository',
    '../services/ASMotorTransformacionService',
], function (record, file, search, log, runtime, C, ControlCargaRepo, RecepcionRepo, FacturaCompraRepo, OcRepo, MotorTransformacion) {

    const currentScript = runtime.getCurrentScript();

    // ─── Helpers ────────────────────────────────────────────────────────────────

    function _obtenerParametrosScript() {
        return {
            controlCargaId: currentScript.getParameter({ name: 'custscript_as_fact_recp_acept_id_cc' })
        };
    }

    /**
     * Parsea el contenido CSV del archivo.
     * Detecta el tipo de proceso según el encabezado de la primera columna:
     *   - 'recepcion'   → TIPOS_PROCESO.RECEPCION
     *   - 'ordencompra' → TIPOS_PROCESO.OC_DIRECTA
     *
     * Retorna cada fila con { tipo, tranidDocumento, tranidFactura }.
     *
     * @param   {string} contenido - Texto completo del CSV
     * @returns {Array<{ tipo: string, tranidDocumento: string, tranidFactura: string }>}
     */
    function _parsearCsv(contenido) {
        try {
            const filas = contenido.split(/\r?\n/).filter(function (l) { return l.trim(); });
            log.error('filas', filas);
            if (!filas.length) return [];

            const comaCount = filas[0].split(',').length;
            const puntoComaCount = filas[0].split(';').length;
            const delimitador = puntoComaCount > comaCount ? ';' : ',';
            log.error('delimitador', delimitador);

            var tipo = C.TIPOS_PROCESO.RECEPCION; // valor por defecto
            var resultado = [];

            filas.forEach(function (fila, index) {
                var columnas = fila.split(delimitador).map(function (c) { return c.trim(); });
                log.error('columnas', columnas);
                if (columnas.length < 2) return;

                var primerValor = columnas[0].toLowerCase();
                log.error('primerValor', primerValor);

                // Detectar fila de cabecera y determinar el tipo de proceso
                if (index === 0 && (primerValor === 'recepcion' || primerValor === 'factura' || primerValor === 'ordencompra')) {
                    tipo = (primerValor === 'ordencompra')
                        ? C.TIPOS_PROCESO.OC_DIRECTA
                        : C.TIPOS_PROCESO.RECEPCION;
                    return;
                }

                resultado.push({
                    tipo: tipo,
                    tranidDocumento: columnas[0],
                    tranidFactura: columnas[1],
                });
            });

            log.error('resultado', resultado);
            return resultado;
        } catch (e) {
            log.error('An error was ocurred in function [_parsearCsv]', e);
        }
    }

    /**
     * Crea un registro AS Detalle Control de Carga con el resultado del procesamiento
     * de una fila del CSV.
     *
     * @param {Object}      datos
     * @param {string}      datos.controlCargaId   - ID del registro de cabecera
     * @param {string}      datos.tipo             - C.TIPOS_PROCESO.*
     * @param {string|null} datos.recepcionId      - ID de la recepción (solo RECEPCION)
     * @param {string|null} datos.ocId             - ID de la OC (solo OC_DIRECTA)
     * @param {string|null} datos.facturaOrigenId  - ID de la factura del CSV
     * @param {string|null} datos.facturaNewId     - ID de la nueva factura generada
     * @param {string}      datos.estado           - Texto del estado (C.ESTADOS.*)
     * @param {string}      datos.detalle          - Mensaje descriptivo o de error
     */
    function _crearDetalle(datos) {
        var det = record.create({ type: C.RECORDS.DETALLE_CONTROL_CARGA });

        det.setValue({ fieldId: C.FIELDS_DETALLE.CABECERA, value: datos.controlCargaId });

        if (datos.tipo === C.TIPOS_PROCESO.RECEPCION && datos.recepcionId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.RECEPCION, value: datos.recepcionId });
        }
        if (datos.tipo === C.TIPOS_PROCESO.OC_DIRECTA && datos.ocId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.ORDEN_COMPRA, value: datos.ocId });
        }
        if (datos.facturaOrigenId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.FACTURA_ACEPTA_ORIGEN, value: datos.facturaOrigenId });
        }
        if (datos.facturaNewId) {
            det.setValue({ fieldId: C.FIELDS_DETALLE.FACTURA_NUEVA, value: datos.facturaNewId });
        }

        det.setText({ fieldId: C.FIELDS_DETALLE.ESTADO, text: datos.estado });
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

            const cabecera = controlCargaId
                ? ControlCargaRepo.obtenerPendientePorId(controlCargaId)
                : ControlCargaRepo.obtenerPendiente();

            if (!cabecera) {
                log.error({ title: 'getInputData', details: 'No se encontraron registros AS Control de Carga en estado Pendiente.' });
                return [];
            }

            log.error({ title: 'getInputData', details: 'Procesando Control de Carga ID: ' + cabecera.id });

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
            log.error('archivoCSV', archivoCSV);
            const filas = _parsearCsv(archivoCSV.getContents());

            log.error({ title: 'getInputData', details: 'Filas a procesar: ' + filas.length });

            // Adjuntar el ID de cabecera a cada fila para disponibilizarlo en reduce
            return filas.map(function (fila) {
                return {
                    controlCargaId: cabecera.id,
                    tipo: fila.tipo,
                    tranidDocumento: fila.tranidDocumento,
                    tranidFactura: fila.tranidFactura,
                };
            });

        } catch (e) {
            log.error('An error was ocurred in [getInputData]', e);
        }
    }

    /**
     * map
     * Resuelve los internal IDs según el tipo de proceso.
     *
     * RECEPCION:  resuelve recepcionId y facturaOrigenId (filtrado por vendor/subsidiaria).
     * OC_DIRECTA: resuelve ocId, valida que no esté totalmente facturada
     *             y resuelve facturaOrigenId sin filtros adicionales.
     *
     * Emite los datos agrupados por tranidDocumento (clave única por fila).
     */
    function map(context) {
        const { key, value } = context;
        try {
            var fila = JSON.parse(value);

            log.error({ title: 'map', details: 'Procesando [' + fila.tipo + ']: ' + fila.tranidDocumento + ' / ' + fila.tranidFactura });

            var datosEmitidos;

            if (fila.tipo === C.TIPOS_PROCESO.OC_DIRECTA) {
                // ── Flujo OC directa ──────────────────────────────────────────
                var ocId = OcRepo.obtenerIdPorTranId(fila.tranidDocumento);
                var estaFacturada = ocId ? OcRepo.estaFacturadaTotalmente(ocId) : false;
                var facturaOrigenId = FacturaCompraRepo.obtenerIdPorTranId(fila.tranidFactura, null, null);

                datosEmitidos = {
                    controlCargaId: fila.controlCargaId,
                    tipo: fila.tipo,
                    tranidDocumento: fila.tranidDocumento,
                    tranidFactura: fila.tranidFactura,
                    ocId: ocId,
                    estaFacturada: estaFacturada,
                    facturaOrigenId: facturaOrigenId,
                };

            } else {
                // ── Flujo recepción (original) ────────────────────────────────
                var recepcionId = RecepcionRepo.obtenerIdPorTranId(fila.tranidDocumento);
                var vendorYSubsidiaria = recepcionId ? RecepcionRepo.obtenerVendorYSubsidiaria(recepcionId) : {};
                var facturaOrigenIdRec = FacturaCompraRepo.obtenerIdPorTranId(
                    fila.tranidFactura,
                    vendorYSubsidiaria.entity,
                    vendorYSubsidiaria.subsidiary
                );

                datosEmitidos = {
                    controlCargaId: fila.controlCargaId,
                    tipo: fila.tipo,
                    tranidDocumento: fila.tranidDocumento,
                    tranidFactura: fila.tranidFactura,
                    recepcionId: recepcionId,
                    facturaOrigenId: facturaOrigenIdRec,
                };
            }

            context.write({
                key: fila.tranidDocumento,
                value: JSON.stringify(datosEmitidos),
            });

        } catch (e) {
            log.error('An error was ocurred in [map] key: ' + key, e);
        }
    }

    /**
     * reduce
     * Valida los IDs resueltos en map y ejecuta la transformación correspondiente
     * según el tipo de proceso. Los errores por fila quedan registrados en el detalle
     * sin detener el proceso completo.
     */
    function reduce(context) {
        var datos = JSON.parse(context.values[0]);

        log.error({ title: 'reduce', details: 'Procesando [' + datos.tipo + ']: ' + datos.tranidDocumento });

        if (datos.tipo === C.TIPOS_PROCESO.OC_DIRECTA) {
            // ── Flujo OC directa ──────────────────────────────────────────────

            if (!datos.ocId) {
                var msgOc = 'No se encontró la Orden de Compra con tranId: ' + datos.tranidDocumento;
                log.error({ title: 'reduce', details: msgOc });
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    ocId: null,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgOc,
                });
                return;
            }

            if (datos.estaFacturada) {
                var msgFacturada = 'La Orden de Compra ' + datos.tranidDocumento + ' está totalmente facturada y no puede generar una nueva factura.';
                log.error({ title: 'reduce', details: msgFacturada });
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    ocId: datos.ocId,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgFacturada,
                });
                return;
            }

            if (!datos.facturaOrigenId) {
                var msgFacturaOc = 'No se encontró la factura con tranId: ' + datos.tranidFactura;
                log.error({ title: 'reduce', details: msgFacturaOc });
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    ocId: datos.ocId,
                    facturaOrigenId: null,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgFacturaOc,
                });
                return;
            }

            try {
                var nuevaFacturaIdOc = MotorTransformacion.transformarOcAFactura(
                    datos.ocId,
                    datos.facturaOrigenId,
                    datos.tranidFactura
                );

                log.error({ title: 'reduce', details: 'Factura generada ID: ' + nuevaFacturaIdOc + ' | OC: ' + datos.tranidDocumento });

                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    ocId: datos.ocId,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: nuevaFacturaIdOc,
                    estado: C.ESTADOS.COMPLETADO,
                    detalle: 'Factura generada correctamente desde Orden de Compra ' + datos.tranidDocumento,
                });

            } catch (e) {
                var msgErrorOc = 'Error al transformar OC ' + datos.tranidDocumento + ': ' + e.message;
                log.error({ title: 'reduce', details: msgErrorOc });
                log.error('An error was ocurred in function [reduce] OC_DIRECTA', e);
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    ocId: datos.ocId,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgErrorOc,
                });
            }

        } else {
            // ── Flujo recepción (original) ────────────────────────────────────

            if (!datos.recepcionId) {
                var msgRecepcion = 'No se encontró la recepción con tranId: ' + datos.tranidDocumento;
                log.error({ title: 'reduce', details: msgRecepcion });
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    recepcionId: null,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgRecepcion,
                });
                return;
            }

            if (!datos.facturaOrigenId) {
                var msgFactura = 'No se encontró la factura con tranId: ' + datos.tranidFactura;
                log.error({ title: 'reduce', details: msgFactura });
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    recepcionId: datos.recepcionId,
                    facturaOrigenId: null,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgFactura,
                });
                return;
            }

            try {
                var nuevaFacturaId = MotorTransformacion.transformarRecepcionAFactura(
                    datos.recepcionId,
                    datos.facturaOrigenId,
                    datos.tranidFactura
                );

                log.error({ title: 'reduce', details: 'Factura generada ID: ' + nuevaFacturaId + ' | Recepción: ' + datos.tranidDocumento });

                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    recepcionId: datos.recepcionId,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: nuevaFacturaId,
                    estado: C.ESTADOS.COMPLETADO,
                    detalle: 'Factura generada correctamente desde recepción ' + datos.tranidDocumento,
                });

            } catch (e) {
                var msgError = 'Error al transformar recepción ' + datos.tranidDocumento + ': ' + e.message;
                log.error({ title: 'reduce', details: msgError });
                log.error('An error was ocurred in function [reduce] RECEPCION', e);
                _crearDetalle({
                    controlCargaId: datos.controlCargaId,
                    tipo: datos.tipo,
                    recepcionId: datos.recepcionId,
                    facturaOrigenId: datos.facturaOrigenId,
                    facturaNewId: null,
                    estado: C.ESTADOS.ERROR,
                    detalle: msgError,
                });
            }
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
                type: C.RECORDS.CONTROL_CARGA,
                filters: [[C.FIELDS_CONTROL_CARGA.ESTADO, 'anyof', idEstadoEnProceso]],
                columns: ['internalid'],
            }).run().getRange({ start: 0, end: 1 });

            if (busqueda.length) cabeceraId = busqueda[0].id;
        } catch (e) {
            log.error({ title: 'summarize', details: 'No se pudo localizar el Control de Carga En Proceso: ' + e.message });
        }

        var estadoFinal = errores.length > 0 ? C.ESTADOS.COMPLETADO_CON_ERRORES : C.ESTADOS.COMPLETADO;
        var detalleFinal = errores.length > 0
            ? 'Proceso finalizado con ' + errores.length + ' error(es):\n' + errores.join('\n')
            : 'Proceso finalizado correctamente.';

        if (cabeceraId) {
            ControlCargaRepo.actualizarEstadoYDetalle(cabeceraId, estadoFinal, detalleFinal);
        }

        log.error({ title: 'summarize', details: estadoFinal + ' | ' + detalleFinal });
    }

    return {
        getInputData,
        map,
        reduce,
        summarize,
    };
});
