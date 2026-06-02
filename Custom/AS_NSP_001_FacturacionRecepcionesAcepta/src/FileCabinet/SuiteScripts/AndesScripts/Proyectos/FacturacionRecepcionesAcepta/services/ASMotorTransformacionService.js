/**
 * @NApiVersion 2.1
 * @module ASMotorTransformacionService
 * @description Motor de transformación de recepciones a facturas de compra.
 *
 *              Orquesta tres operaciones:
 *              1. Transform itemreceipt → vendorbill (nueva factura desde recepción)
 *              2. Copia de campos de cabecera desde la factura del CSV
 *              3. Ajuste de importes de líneas si hay diferencias con la factura del CSV
 *
 *              Retorna el internal ID de la nueva factura guardada.
 */
define([
    'N/record',
    '../commons/constants',
    '../repositories/ASFacturaCompraRepository'
], function (record, C, FacturaCompraRepo) {

    /**
     * Copia los campos de cabecera definidos en C.CAMPOS_CABECERA_A_COPIAR
     * desde la factura del CSV hacia el record de la nueva factura (en memoria).
     *
     * @param {Record} nuevaFactura    - Record cargado en modo dinámico
     * @param {Object} camposCabecera - Mapa fieldId → valor obtenido del repositorio
     */
    function _copiarCamposCabecera(nuevaFactura, camposCabecera) {
        C.CAMPOS_CABECERA_A_COPIAR.forEach(function (fieldId) {
            var valor = camposCabecera[fieldId];
            if (valor !== null && valor !== undefined && valor !== '') {
                nuevaFactura.setValue({ fieldId: fieldId, value: valor });
            }
        });
    }

    /**
     * Compara las líneas de la nueva factura con las de la factura del CSV.
     * Para cada ítem que tenga un rate diferente, actualiza el rate en la nueva factura.
     * La comparación se realiza por item internal ID.
     *
     * @param {Record} nuevaFactura  - Record cargado en modo dinámico
     * @param {Object} lineasCsv    - Mapa itemId → { rate } del repositorio
     */
    function _ajustarImportesLineas(nuevaFactura, lineasCsv) {
        var totalLineas = nuevaFactura.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < totalLineas; i++) {
            var itemId = nuevaFactura.getSublistValue({
                sublistId: 'item',
                fieldId:   'item',
                line:      i,
            });

            if (!itemId || !lineasCsv[itemId]) continue;

            var rateCsv    = lineasCsv[itemId].rate;
            var rateActual = parseFloat(nuevaFactura.getSublistValue({
                sublistId: 'item',
                fieldId:   C.CAMPO_IMPORTE_LINEA,
                line:      i,
            })) || 0;

            if (rateCsv !== rateActual) {
                nuevaFactura.selectLine({ sublistId: 'item', line: i });
                nuevaFactura.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId:   C.CAMPO_IMPORTE_LINEA,
                    value:     rateCsv,
                });
                nuevaFactura.commitLine({ sublistId: 'item' });
            }
        }
    }

    /**
     * Transforma una recepción en una nueva factura de compra, copiando
     * los campos de cabecera y ajustando los importes de líneas según la
     * factura de referencia del CSV.
     *
     * @param   {string|number} recepcionId      - Internal ID de la recepción (itemreceipt)
     * @param   {string|number} facturaOrigenId  - Internal ID de la factura del CSV (vendorbill)
     * @returns {string}                          Internal ID de la nueva factura guardada
     * @throws  {Error}                           Si el transform o el guardado fallan
     */
    function transformarRecepcionAFactura(recepcionId, facturaOrigenId) {
        // 1. Transform recepción → factura de compra
        var nuevaFactura = record.transform({
            fromType:  C.TIPOS_TRANSACCION.RECEPCION,
            fromId:    recepcionId,
            toType:    C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            isDynamic: true,
        });

        // 2. Cargar datos de la factura del CSV
        var camposCabecera = FacturaCompraRepo.obtenerCamposCabecera(facturaOrigenId);
        var lineasCsv      = FacturaCompraRepo.obtenerLineasPorItem(facturaOrigenId);

        // 3. Copiar campos de cabecera
        _copiarCamposCabecera(nuevaFactura, camposCabecera);

        // 4. Ajustar importes de líneas con diferencias
        _ajustarImportesLineas(nuevaFactura, lineasCsv);

        // 5. Guardar y retornar el ID de la nueva factura
        var nuevaFacturaId = nuevaFactura.save({
            enableSourcing:        false,
            ignoreMandatoryFields: false,
        });

        return nuevaFacturaId;
    }

    return {
        transformarRecepcionAFactura,
    };
});
