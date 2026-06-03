/**
 * @NApiVersion 2.1
 * @module ASMotorTransformacionService
 * @description Motor de transformación de recepciones a facturas de compra.
 *
 *              Flujo de transformación:
 *              1. Obtiene la Orden de Compra asociada a la recepción (createdfrom)
 *              2. Transforma OC → vendorbill (purchaseorder → vendorbill)
 *              3. Filtra el sublist item: elimina líneas no presentes en la recepción
 *                 y ajusta las cantidades a las efectivamente recibidas.
 *                 Si un ítem aparece en varios lotes, las cantidades se suman.
 *              4. Filtra el sublist expense: elimina líneas ya facturadas (isbilled=T)
 *              5. Copia campos de cabecera desde la factura del CSV
 *              6. Aplica valores por defecto (forma de pago, estado de aprobación)
 *              7. Guarda y retorna el internal ID de la nueva factura
 *
 *              SUPUESTOS:
 *              - Cada recepción proviene de exactamente una OC (createdfrom único).
 *              - Los lotes identifican unidades recibidas; el vendorbill no requiere
 *                detalle de lote, solo la cantidad total por ítem.
 */
define([
    'N/record',
    '../commons/constants',
    '../repositories/ASRecepcionRepository',
    '../repositories/ASFacturaCompraRepository',
], function (record, C, RecepcionRepo, FacturaCompraRepo) {

    // ─── Helpers privados ────────────────────────────────────────────────────────

    /**
     * Copia los campos de cabecera definidos en C.CAMPOS_CABECERA_A_COPIAR
     * desde la factura del CSV hacia el record de la nueva factura (en memoria).
     * Solo copia si el valor de origen no es nulo/vacío.
     *
     * @param {Record} nuevaFactura    - Record en modo dinámico
     * @param {Object} camposCabecera - Mapa fieldId → valor (del repositorio)
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
     * Filtra y ajusta el sublist item del vendorbill según las líneas de la recepción:
     * - Elimina líneas cuyo ítem no esté en la recepción.
     * - Ajusta la cantidad de las líneas restantes a la cantidad recibida.
     * Itera en orden inverso para evitar desplazamiento de índices al eliminar.
     *
     * @param {Record} nuevaFactura    - Record en modo dinámico
     * @param {Object} lineasRecepcion - Mapa itemId → { quantity } de la recepción
     */
    function _filtrarYAjustarLineasItem(nuevaFactura, lineasRecepcion) {
        var total = nuevaFactura.getLineCount({ sublistId: 'item' });

        for (var i = total - 1; i >= 0; i--) {
            var itemId = nuevaFactura.getSublistValue({
                sublistId: 'item',
                fieldId:   'item',
                line:      i,
            });

            if (!itemId || !lineasRecepcion[itemId]) {
                // Ítem no recibido en esta recepción: eliminar la línea
                nuevaFactura.removeLine({ sublistId: 'item', line: i });
            } else {
                // Ajustar cantidad a la efectivamente recibida
                nuevaFactura.selectLine({ sublistId: 'item', line: i });
                nuevaFactura.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId:   'quantity',
                    value:     lineasRecepcion[itemId].quantity,
                });
                nuevaFactura.commitLine({ sublistId: 'item' });
            }
        }
    }

    /**
     * Filtra el sublist expense del vendorbill comparando contra los gastos
     * de la factura del CSV de referencia (por account id + importe).
     * Solo se conservan las líneas que tengan una coincidencia exacta en la
     * factura del CSV. El resto se elimina.
     * Itera en orden inverso para evitar desplazamiento de índices al eliminar.
     *
     * @param {Record} nuevaFactura     - Record en modo dinámico
     * @param {Object} gastosOrigenClave - Mapa 'accountId|amount' → true (del repositorio)
     */
    function _filtrarGastosSegunFacturaCsv(nuevaFactura, gastosOrigenClave) {
        var total = nuevaFactura.getLineCount({ sublistId: 'expense' });

        for (var j = total - 1; j >= 0; j--) {
            var accountId = nuevaFactura.getSublistValue({
                sublistId: 'expense',
                fieldId:   'account',
                line:      j,
            });
            var amount = parseFloat(nuevaFactura.getSublistValue({
                sublistId: 'expense',
                fieldId:   'amount',
                line:      j,
            })) || 0;
            var clave = accountId + '|' + amount;

            if (!accountId || !gastosOrigenClave[clave]) {
                nuevaFactura.removeLine({ sublistId: 'expense', line: j });
            }
        }
    }

    /**
     * Compara las líneas item de la nueva factura con las de la factura del CSV.
     * Para cada ítem con rate diferente, sobreescribe el rate en la nueva factura.
     * Función preparada pero no activada aún (pendiente de confirmación de negocio).
     *
     * @param {Record} nuevaFactura - Record en modo dinámico
     * @param {Object} lineasCsv   - Mapa itemId → { rate } del repositorio
     */
    function _ajustarImportesLineas(nuevaFactura, lineasCsv) {
        var total = nuevaFactura.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < total; i++) {
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

    // ─── API pública ─────────────────────────────────────────────────────────────

    /**
     * Genera una factura de compra a partir de la OC relacionada a la recepción,
     * limitándose a los ítems y cantidades recibidos en esa recepción.
     * Las líneas de gasto incluidas son solo las que coinciden con la factura del CSV.
     * Tras guardar, actualiza el tranid de la nueva factura con el de la factura origen.
     *
     * @param   {string|number} recepcionId          - Internal ID de la recepción (itemreceipt)
     * @param   {string|number} facturaOrigenId      - Internal ID de la factura del CSV (vendorbill)
     * @param   {string}        facturaOrigenTranId  - TranId de la factura del CSV
     * @returns {string}                              Internal ID de la nueva factura guardada
     * @throws  {Error}  Si la recepción no tiene OC asociada, o si el guardado falla
     */
    function transformarRecepcionAFactura(recepcionId, facturaOrigenId, facturaOrigenTranId) {
        // 1. Obtener la OC asociada a la recepción
        var ocId = RecepcionRepo.obtenerOcId(recepcionId);
        if (!ocId) {
            throw new Error(
                'La recepción ID ' + recepcionId + ' no tiene una Orden de Compra asociada (campo createdfrom vacío).'
            );
        }

        // 2. Leer los ítems y cantidades de la recepción
        var lineasRecepcion = RecepcionRepo.obtenerLineasPorItem(recepcionId);

        // 3. Transform OC → vendorbill
        var nuevaFactura = record.transform({
            fromType:  C.TIPOS_TRANSACCION.ORDEN_COMPRA,
            fromId:    ocId,
            toType:    C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            isDynamic: true,
        });

        // 4. Filtrar sublist item: solo ítems de la recepción con cantidad recibida
        _filtrarYAjustarLineasItem(nuevaFactura, lineasRecepcion);

        // 5. Filtrar sublist expense: conservar solo los gastos que coincidan
        //    en account + importe con los de la recepción
        var gastosOrigenClave = RecepcionRepo.obtenerGastosPorClave(recepcionId);
        _filtrarGastosSegunFacturaCsv(nuevaFactura, gastosOrigenClave);

        // 6. Copiar campos de cabecera desde la factura del CSV
        var camposCabecera = FacturaCompraRepo.obtenerCamposCabecera(facturaOrigenId);
        _copiarCamposCabecera(nuevaFactura, camposCabecera);

        // 7. Forma de pago: aplicar valor por defecto si vino vacío del CSV
        var formaPago = nuevaFactura.getValue({ fieldId: 'custbody_2w_forma_pago' });
        if (!formaPago) {
            nuevaFactura.setValue({ fieldId: 'custbody_2w_forma_pago', value: C.DEFAULTS_FACTURA_NUEVA.FORMA_PAGO });
        }

        // 8. Marcar la nueva factura como Aprobada
        nuevaFactura.setValue({ fieldId: 'approvalstatus', value: C.DEFAULTS_FACTURA_NUEVA.APPROVAL_STATUS });

        /*// Ajustar importes de líneas con diferencias (pendiente de activar)
        var lineasCsv = FacturaCompraRepo.obtenerLineasPorItem(facturaOrigenId);
        _ajustarImportesLineas(nuevaFactura, lineasCsv);*/

        // 9. Guardar la nueva factura
        var nuevaFacturaId = String(nuevaFactura.save({
            enableSourcing:        false,
            ignoreMandatoryFields: false,
        }));

        // 10. Actualizar el tranid con el de la factura del CSV
        //     (tranid no se puede copiar en memoria durante el transform)
        FacturaCompraRepo.actualizarTranId(nuevaFacturaId, facturaOrigenTranId);

        return nuevaFacturaId;
    }

    return {
        transformarRecepcionAFactura,
    };
});
