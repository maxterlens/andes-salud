/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_assign_inv_details
 * @NModuleScope public
 */
define(['N/log', 'N/search', 'N/query', './2win_dao_search_item', 'N/runtime'],
    function(log, search, query, daoSearchItem, runtime) {

        var itemInfoCache = {};
        var allowsNegativeInventory = null;

        /**
         * Núcleo reutilizable: asigna inventory detail usando SuiteQL.
         * Maneja lotes, series Y ítems sin número (bins/status).
         * @param {Subrecord} invDet  - Subrecord inventorydetail ya obtenido
         * @param {number}   itemId
         * @param {number}   locationId
         * @param {number}   qtyNeeded
         * @param {boolean}  isSerial
         * @param {boolean}  isLot
         * @param {string}   trxType  - 'issueinventorynumber' | 'receiptinventorynumber'
         */
        function _asignarInventario(invDet, itemId, locationId, qtyNeeded, isSerial, isLot, trxType, isDynamic) {
            var cantidadAsignada = 0;

            // Una sola consulta que devuelve número de inventario, bin y status
            var rows = query.runSuiteQL({
                query: [
                    'SELECT ib.quantityavailable, ib.inventorynumber, ib.binnumber, ib.inventorystatus',
                    'FROM InventoryBalance AS ib',
                    'WHERE ib.item = ? AND ib.location = ? AND ib.quantityavailable > 0',
                    'ORDER BY ib.lastmodifieddate ASC'
                ].join(' '),
                params: [itemId, locationId]
            }).asMappedResults();

            if (isDynamic) {
                // Modo dinámico: usar selectNewLine, setCurrentSublistValue, commitLine
                for (var i = 0; i < rows.length; i++) {
                    if (cantidadAsignada >= qtyNeeded) break;

                    var row             = rows[i];
                    var available       = parseFloat(row.quantityavailable);
                    var inventoryNumId  = row.inventorynumber;
                    var binNumberId     = row.binnumber;
                    var statusId        = row.inventorystatus;
                    if ((isSerial || isLot) && !inventoryNumId) continue;

                    var cantidadPendiente = qtyNeeded - cantidadAsignada;
                    var cantidadAAsignar  = Math.min(available, cantidadPendiente);

                    if (cantidadAAsignar <= 0) continue;

                    try {
                        invDet.selectNewLine({ sublistId: 'inventoryassignment' });

                        if (inventoryNumId) {
                            invDet.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: trxType,
                                value: inventoryNumId
                            });
                        }

                        if (binNumberId) {
                            invDet.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'binnumber',
                                value: binNumberId
                            });
                        }

                        if (statusId) {
                            invDet.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'inventorystatus',
                                value: statusId
                            });
                        }

                        invDet.setCurrentSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'quantity',
                            value: isSerial ? 1 : cantidadAAsignar
                        });

                        invDet.commitLine({ sublistId: 'inventoryassignment' });

                        cantidadAsignada += isSerial ? 1 : cantidadAAsignar;

                    } catch (e) {
                        try { invDet.cancelLine({ sublistId: 'inventoryassignment' }); } catch(ce) {}
                    }
                }
            } else {
                // Modo estático: usar setSublistValue directo
                var subrecLineIdx = invDet.getLineCount({ sublistId: 'inventoryassignment' });

                for (var i = 0; i < rows.length; i++) {
                    if (cantidadAsignada >= qtyNeeded) break;

                    var row             = rows[i];
                    var available       = parseFloat(row.quantityavailable);
                    var inventoryNumId  = row.inventorynumber;
                    var binNumberId     = row.binnumber;
                    var statusId        = row.inventorystatus;
                    if ((isSerial || isLot) && !inventoryNumId) continue;

                    var cantidadPendiente = qtyNeeded - cantidadAsignada;
                    var cantidadAAsignar  = Math.min(available, cantidadPendiente);

                    if (cantidadAAsignar <= 0) continue;

                    try {
                        invDet.setSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: trxType,
                            line: subrecLineIdx,
                            value: inventoryNumId
                        });

                        if (binNumberId) {
                            invDet.setSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'binnumber',
                                line: subrecLineIdx,
                                value: binNumberId
                            });
                        }

                        if (statusId) {
                            invDet.setSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'inventorystatus',
                                line: subrecLineIdx,
                                value: statusId
                            });
                        }

                        invDet.setSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'quantity',
                            line: subrecLineIdx,
                            value: isSerial ? 1 : cantidadAAsignar
                        });

                        cantidadAsignada += isSerial ? 1 : cantidadAAsignar;
                        subrecLineIdx++;

                    } catch (e) {
                        log.audit({ title: 'Race condition en asignación de inventario', details: 'Item: ' + itemId + ', Error: ' + e.message });
                    }
                }
            }

            // Validación final con tolerancia decimal
            if (cantidadAsignada < qtyNeeded - 0.00001) {
                throw new Error('Stock insuficiente para ítem ' + itemId + ' en loc ' + locationId +
                      '. Requerido: ' + qtyNeeded + ', asignado: ' + cantidadAsignada)
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  Función pública: línea en modo dinámico (getCurrentSublist…)
        // ─────────────────────────────────────────────────────────────
        function assignInventoryDetailToCurrentLine(invoiceRecord, values) {
            try {
                var itemId     = values.itemId;
                var locationId = values.locationId;
                var qtyNeeded  = Number(values.quantity) || 0;
                var trxType    = values.trxType;

                var info = _getItemInfo(itemId);
                if (!info.requiresInvDetail) return;

                _validateStock(itemId, locationId, info);
                if (qtyNeeded <= 0) throw new Error('Cantidad inválida para asignar inventario');

                var invDet;
                try {
                    invDet = invoiceRecord.getCurrentSublistSubrecord({
                        sublistId: 'item',
                        fieldId: 'inventorydetail'
                    });
                } catch (e) {
                    if (e.name === 'FIELD_1_IS_NOT_A_SUBRECORD_FIELD') {
                        log.audit({
                            title: 'assignInventoryDetailToCurrentLine - inventorydetail no disponible como subregistro',
                            details: 'Item: ' + itemId + '. Contexto: NC transformada desde Invoice. NetSuite gestiona el inventario automáticamente.'
                        });
                        return; // No lanzar, el guardado procede sin asignación manual
                    }
                    throw new Error('No se pudo acceder al inventory detail para el ítem ' + itemId + ': ' + e.toString());
                }

                // Limpiar asignaciones previas si las hay
                var existingLines = invDet.getLineCount({ sublistId: 'inventoryassignment' });
                for (var i = existingLines - 1; i >= 0; i--) {
                    invDet.removeLine({ sublistId: 'inventoryassignment', line: i });
                }

                _asignarInventario(invDet, itemId, locationId, qtyNeeded, info.isSerial, info.isLot, trxType,true);

            } catch (error) {
                log.error({ title: 'Error en assignInventoryDetailToCurrentLine', details: error });
                throw error;
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  Función pública: línea en modo estándar (getSublistSubrecord)
        // ─────────────────────────────────────────────────────────────
        function assignInventoryDetailToLine(invoiceRecord, lineIndex, values) {
            try {
                var itemId     = values.itemId;
                var locationId = values.locationId;
                var qtyNeeded  = Number(values.quantity) || 0;
                var trxType    = values.trxType;

                var info = _getItemInfo(itemId);

                // Si el ítem no requiere inventory detail, salir temprano
                if (!info.requiresInvDetail) {
                    return;
                }

                _validateStock(itemId, locationId, info);
                if (qtyNeeded <= 0) throw new Error('Cantidad inválida para asignar inventario');

                // Verificar y asegurar que el location esté seteado en la línea
                var lineLocation = invoiceRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    line: lineIndex
                });
                
                if (!lineLocation || lineLocation != locationId) {
                    log.audit({
                        title: 'assignInventoryDetailToLine - Ajustando location de línea',
                        details: 'Item: ' + itemId + ', Line: ' + lineIndex + ', Location esperado: ' + locationId + ', Location actual: ' + (lineLocation || 'null')
                    });
                    invoiceRecord.setSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        line: lineIndex,
                        value: locationId
                    });
                }

                var invDet;
                try {
                    invDet = invoiceRecord.getSublistSubrecord({
                        sublistId: 'item',
                        fieldId: 'inventorydetail',
                        line: lineIndex
                    });
                } catch (e) {
                    // Intentar forzar habilitación re-seteando el campo item
                    var currentItem = invoiceRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: lineIndex
                    });
                    
                    if (currentItem) {
                        invoiceRecord.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'item',
                            line: lineIndex,
                            value: currentItem
                        });
                        
                        // Re-setear location después del item para asegurar propagación
                        invoiceRecord.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'location',
                            line: lineIndex,
                            value: locationId
                        });
                    }
                    
                    // Intentar obtener el subrecord nuevamente
                    try {
                        invDet = invoiceRecord.getSublistSubrecord({
                            sublistId: 'item',
                            fieldId: 'inventorydetail',
                            line: lineIndex
                        });
                    } catch (e2) {
                        log.audit({
                            title: 'assignInventoryDetailToLine - No se pudo obtener inventorydetail',
                            details: 'Item: ' + itemId + ', Line: ' + lineIndex + '. Se continuará sin asignar inventario.'
                        });
                        return;
                    }
                }

                // Limpiar asignaciones previas si las hay
                var existingLines = invDet.getLineCount({ sublistId: 'inventoryassignment' });
                for (var i = existingLines - 1; i >= 0; i--) {
                    invDet.removeLine({ sublistId: 'inventoryassignment', line: i });
                }

                _asignarInventario(invDet, itemId, locationId, qtyNeeded, info.isSerial, info.isLot, trxType, false);

            } catch (error) {
                log.error({ title: 'Error en assignInventoryDetailToLine', details: error });
                throw error;
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  Helpers privados
        // ─────────────────────────────────────────────────────────────
        function _getItemInfo(itemId) {
            if (itemInfoCache[itemId]) return itemInfoCache[itemId];

            var f = search.lookupFields({
                type: search.Type.ITEM,
                id: itemId,
                columns: ['type', 'isserialitem', 'islotitem', 'usebins']
            });

            var typeCode = Array.isArray(f.type) && f.type[0] ? f.type[0].value : (f.type || '');
            var isInventoryLike = (typeCode === 'InvtPart' || typeCode === 'Assembly');
            var invStatusOn = false;
            try { invStatusOn = runtime.isFeatureInEffect('INVENTORYSTATUS'); } catch(e) {}

            var info = {
                typeCode: typeCode,
                isSerial: !!f.isserialitem,
                isLot:    !!f.islotitem,
                useBins:  !!f.usebins
            };
            info.requiresInvDetail =
                info.isSerial || info.isLot ||
                (isInventoryLike && invStatusOn) ||
                (isInventoryLike && info.useBins);

            itemInfoCache[itemId] = info;
            return info;
        }

        function _validateStock(itemId, locationId, info) {
            var searchResult = daoSearchItem.searchTypeItemByIntId(itemId, locationId);
            if (!searchResult.success) throw new Error('Error al buscar item: ' + searchResult.error);

            if (searchResult.result.length === 0) {
                if (info.isSerial || info.isLot) {
                    throw new Error('Sin balance para ítem ' + itemId + ' en loc ' + locationId);
                }
                if (allowsNegativeInventory === null) {
                    allowsNegativeInventory = runtime.isFeatureInEffect('ALLOWNEGATIVEINVENTORY');
                }
                if (!allowsNegativeInventory) {
                    throw new Error('Sin stock en loc ' + locationId + ' para ítem ' + itemId);
                }
            }
        }

        return {
            assignInventoryDetailToCurrentLine: assignInventoryDetailToCurrentLine,
            assignInventoryDetailToLine:        assignInventoryDetailToLine
        };
    }
);