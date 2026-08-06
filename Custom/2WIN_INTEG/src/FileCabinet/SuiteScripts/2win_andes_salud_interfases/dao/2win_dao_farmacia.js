define(["N/record", "N/log", "../domain/2win_dom_autopicking"], function (record, nLog, domAutopicking) {
    class OrdenFarmacia {
        _orden;
        constructor(id) {
            this._id = id;
            this._orden = this._getRecord();
            this._indexarLineas(); // Carga el índice inicial de líneas
        }

        /**
         * Crea un índice en memoria (Map) para encontrar líneas instantáneamente en O(1).
         * Evita el escaneo repetitivo de 1000 líneas en cada operación.
         */
        _indexarLineas() {
            this._lineIndexMap = new Map();
            const lineCount = this._orden.getLineCount({ sublistId: "item" });

            for (let i = 0; i < lineCount; i++) {
                const idFila = this._orden.getSublistValue({
                    sublistId: "item",
                    fieldId: "custcol_2win_as_identificador_fila",
                    line: i
                });

                if (idFila) {
                    this._lineIndexMap.set(`${Number(idFila)}`, i);
                }
            }
        }

        /**
         * Busca una línea por su identificador en milisegundos usando el Map.
         * @param {string} identificador - El identificador único de la fila.
         * @returns {number} El índice de la línea encontrada, o -1 si no se encuentra.
         */
        _findLine(identificador) {
            const key = `${Number(identificador)}`;
            return this._lineIndexMap.has(key) ? this._lineIndexMap.get(key) : -1;
        }

        _getRecord() {
            try {
                return record.load({
                    type: record.Type.SALES_ORDER,
                    id: this._id,
                    isDynamic: false // <-- CLAVE: Modo estándar activado
                });
            } catch (e) {
                nLog.error(`Error al cargar la orden de venta con ID ${this._id}`, e);
                throw new Error(`No se pudo cargar la orden de venta con ID ${this._id}.`);
            }
        }

        save() {
            try {
                return this._orden.save({ ignoreMandatoryFields: true, enableTriggers: false });
            } catch (e) {
                nLog.error(`Error al guardar la orden de venta con ID ${this._id}`, e);
                throw new Error(`No se pudo guardar la orden de venta con ID ${this._id}. ${e.message}`);
            }
        }

        existeLineaProvisional(identificador) {
            return this._findLine(identificador, false) !== -1;
        }

        existeLineaPermanente(identificador) {
            return this._findLine(identificador, true) !== -1;
        }

        crearLinea(datosLinea) {
            nLog.debug("OrdenFarmacia - crearLinea", { datosLinea });
            const newLineIndex = this._orden.getLineCount({ sublistId: "item" });
            try {
                if (datosLinea.custcol_2win_as_identificador_fila) {
                    if (this.existeLineaProvisional(datosLinea.custcol_2win_as_identificador_fila)) {
                        throw new Error(`Ya existe una línea provisional con el identificador ${datosLinea.custcol_2win_as_identificador_fila}`);
                    }
                }

                for (const [key, value] of Object.entries(datosLinea)) {
                    this._orden.setSublistValue({ sublistId: "item", fieldId: key, line: newLineIndex, value: value });
                }

                // Actualizamos el Map en memoria de forma ultra rápida
                // Nota: La asignación de lotes/bins se delega al autopicking al momento del fulfillment.
                if (datosLinea.custcol_2win_as_identificador_fila) {
                    this._lineIndexMap.set(`${Number(datosLinea.custcol_2win_as_identificador_fila)}`, newLineIndex);
                }
            } catch (error) {
                try {
                    this._orden.removeLine({
                        sublistId: "item", // ID de la sublista
                        line: newLineIndex // índice de la línea (base 0)
                    });
                } catch (error) {
                    nLog.error("OrdenFarmacia - error al limpiar línea fallida", error);
                }

                nLog.error("OrdenFarmacia - crearLinea error", error);
                throw error;
            }
        }

        modificar(identificador, datosActualizados) {
            try {
                const lineIndex = this._findLine(identificador, false);

                if (lineIndex === -1) {
                    throw new Error(`No se encontró línea con identificador ${identificador}`);
                }

                for (const [key, value] of Object.entries(datosActualizados)) {
                    this._orden.setSublistValue({ sublistId: "item", fieldId: key, line: lineIndex, value: value });
                }

                // Nota: La reasignación de lotes/bins se delega al autopicking al momento del fulfillment.
            } catch (error) {
                nLog.error("OrdenFarmacia - modificar error", error);
                throw error;
            }
        }

        eliminar(identificador) {
            try {
                const lineIndex = this._findLine(identificador, false);

                if (lineIndex === -1) {
                    throw new Error(`No se encontró línea con identificador ${identificador}`);
                }

                this._orden.removeLine({ sublistId: "item", line: lineIndex });
                this._indexarLineas(); // Re-indexamos porque las filas debajo de esta se desplazan hacia arriba
            } catch (error) {
                nLog.error("OrdenFarmacia - eliminar error", error);
                throw error;
            }
        }

        modificarPrecio(identificador, nuevoPrecio, nuevoIva) {
            try {
                const lineIndex = this._findLine(identificador, true);

                if (lineIndex === -1) {
                    throw new Error(`No se encontró línea con identificador ${identificador}`);
                }
                if (Number(nuevoPrecio) < 0) throw new Error("El monto del producto es menor a 0, por favor verifique.");

                this._orden.setSublistValue({ sublistId: "item", fieldId: "rate", line: lineIndex, value: nuevoPrecio });

                const quantity = this._orden.getSublistValue({ sublistId: "item", fieldId: "quantity", line: lineIndex });
                this._orden.setSublistValue({
                    sublistId: "item",
                    fieldId: "tax1amt",
                    line: lineIndex,
                    value: nuevoIva * Number(quantity)
                });
            } catch (error) {
                nLog.error("OrdenFarmacia - modificarPrecio error", error);
                throw error;
            }
        }

        /**
         * Devuelve una única línea (compatibilidad inversa). Delega en devolverLote.
         * @param {string|number} identificador
         * @param {number} cantidadDevolucion
         * @returns {{exitosas: Array, conError: Array}}
         */
        devolver(identificador, cantidadDevolucion) {
            return this.devolverLote([{ identificador, cantidadDevolucion }]);
        }

        /**
         * Procesa múltiples devoluciones en una sola pasada, optimizando al máximo:
         *  - 1 sola query SQL de Item Fulfillments (en lugar de N).
         *  - Paraleliza eliminaciones de líneas en IFs distintos con Promise.all.
         *  - Recarga la OV 0 o 1 vez (no N veces).
         *  - Reindexa 1 sola vez al final (no N veces).
         *  - Elimina líneas de la OV de abajo hacia arriba (evita desplazamientos).
         *  - Limpia inventorydetail en devoluciones parciales para evitar el error
         *    "Configure los detalles de inventario para esta línea."
         *
         * @param {Array<{identificador: string|number, cantidadDevolucion: number}>} devoluciones
         * @returns {{exitosas: Array, conError: Array}} Resultado por línea
         */
        devolverLote(devoluciones) {
            const resultado = { exitosas: [], conError: [] };
            if (!devoluciones || devoluciones.length === 0) return resultado;

            // ── Fase 1: Clasificar devoluciones sin tocar this._orden ──────────
            const lineasAEliminar = []; // { identificador, lineIndex, ordenLine }
            const ajustesParciales = []; // { identificador, lineIndex, nuevaCantidad }
            const lineIndexProcesados = new Set();

            for (const dev of devoluciones) {
                try {
                    const { identificador, cantidadDevolucion } = dev;
                    const cantDev = Number(cantidadDevolucion);

                    if (!identificador) throw new Error("Identificador único de fila no definido");
                    if (!cantDev) throw new Error("Cantidad devuelta no definida");
                    if (cantDev <= 0) throw new Error("Cantidad devuelta debe ser mayor a cero");

                    const lineIndex = this._findLine(identificador);
                    if (lineIndex === -1) throw new Error(`No se encontró línea con identificador ${identificador}`);

                    const cantidadActual = Number(this._orden.getSublistValue({ sublistId: "item", fieldId: "quantity", line: lineIndex }));
                    const nuevaCantidad = cantidadActual - cantDev;

                    if (lineIndexProcesados.has(lineIndex)) {
                        throw new Error(`Línea ${identificador} duplicada en el lote de devolución`);
                    }
                    lineIndexProcesados.add(lineIndex);

                    // nLog.debug("devolverLote - evaluando", { identificador, cantidadActual, cantidadDevolucion: cantDev, nuevaCantidad });

                    if (cantDev > cantidadActual) {
                        // Intento de devolver más de lo disponible → error explícito
                        throw new Error(`Cantidad a devolver (${cantDev}) mayor que la cantidad actual (${cantidadActual}) en la línea ${identificador}`);
                    }

                    if (nuevaCantidad === 0) {
                        // Devolución total → eliminar línea (y su línea en IFs si existe)
                        const ordenLine = this._orden.getSublistValue({ sublistId: "item", fieldId: "line", line: lineIndex });
                        lineasAEliminar.push({ identificador, lineIndex, ordenLine });
                    } else {
                        // Devolución parcial → ajustar quantity (limpiar inventorydetail)
                        ajustesParciales.push({ identificador, lineIndex, nuevaCantidad });
                    }
                } catch (error) {
                    nLog.error("devolverLote - clasificación", { identificador: dev.identificador, error: error.message });
                    resultado.conError.push({ identificador: dev.identificador || "NO_DEFINIDO", error: error.message });
                }
            }

            // ── Fase 2: Eliminar líneas en IFs ────────────────────────────────
            // En SuiteScript server-side, las ops de record son síncronas y bloqueantes;
            // Promise.all no paraleliza I/O aquí. Se ejecutan en secuencia de forma segura.
            let seEliminoEnFulfillment = false;
            if (lineasAEliminar.length > 0) {
                const Autopicking = new domAutopicking();
                for (const l of lineasAEliminar) {
                    try {
                        const deleted = Autopicking.deleteLineOnFulfillments(this._id, l.ordenLine);
                        if (deleted) {
                            seEliminoEnFulfillment = true;
                        }
                    } catch (e) {
                        nLog.audit("devolverLote - IF no eliminado", `Línea ${l.identificador}: ${e.message}`);
                    }
                }
            }

            // ── Fase 3: Si hubo eliminaciones en IFs, recargar OV 1 sola vez ──
            if (seEliminoEnFulfillment) {
                this._orden = this._getRecord();
            }

            // ── Fase 4: Eliminar líneas de la OV de abajo hacia arriba ─────────
            // Ordenar por lineIndex descendente para que removeLine no desplace
            // los índices de las líneas que aún faltan por procesar.
            if (lineasAEliminar.length > 0) {
                const ordenadasDesc = [...lineasAEliminar].sort((a, b) => b.lineIndex - a.lineIndex);
                for (const l of ordenadasDesc) {
                    try {
                        // Tras el reload el índice puede cambiar; reubicamos por identificador.
                        const currentLineIndex = seEliminoEnFulfillment ? this._findLine(l.identificador) : l.lineIndex;
                        if (currentLineIndex !== -1) {
                            this._orden.removeLine({ sublistId: "item", line: currentLineIndex });
                            resultado.exitosas.push({ identificador: l.identificador, accion: "eliminada" });
                        } else {
                            resultado.exitosas.push({ identificador: l.identificador, accion: "eliminada_en_if" });
                        }
                    } catch (e) {
                        resultado.conError.push({ identificador: l.identificador, error: `No se pudo eliminar línea de OV: ${e.message}` });
                    }
                }
            }

            // ── Fase 4.5: Reindexar líneas post eliminación ─────────
            this._indexarLineas();

            // ── Fase 5: Aplicar ajustes parciales (limpiar invdetail + quantity) ──
            // Si hubo eliminaciones en IFs o en la OV, los índices cambiaron: reubicar siempre.
            const requiereReubicacion = seEliminoEnFulfillment || lineasAEliminar.length > 0;
            for (const a of ajustesParciales) {
                try {
                    const currentLineIndex = requiereReubicacion ? this._findLine(a.identificador) : a.lineIndex;
                    if (currentLineIndex === -1) throw new Error("Línea no encontrada tras recarga");

                    // Liberar compromiso de inventario (Do Not Commit)
                    try {
                        this._orden.setSublistValue({
                            sublistId: "item",
                            fieldId: "commitinventory",
                            line: currentLineIndex,
                            value: 1
                        });
                    } catch (e) {
                        nLog.error("devolverLote - commitinventory", `Línea ${currentLineIndex}: ${e.message}`);
                    }

                    // Eliminar inventorydetail si existe (evita validación de NS al guardar)
                    try {
                        const hasInventoryDetail = this._orden.hasSublistSubrecord({
                            sublistId: "item",
                            fieldId: "inventorydetail",
                            line: currentLineIndex
                        });
                        if (hasInventoryDetail) {
                            this._orden.removeSublistSubrecord({
                                sublistId: "item",
                                fieldId: "inventorydetail",
                                line: currentLineIndex
                            });
                        }
                    } catch (e) {
                        nLog.error("devolverLote - inventorydetail", `Línea ${currentLineIndex}: ${e.message}`);
                    }

                    // ── Recalcular campos monetarios (modo estándar no recalcula automáticamente) ──
                    const rateActual = Number(this._orden.getSublistValue({ sublistId: "item", fieldId: "rate", line: currentLineIndex }) || 0);
                    const cantidadActual = Number(this._orden.getSublistValue({ sublistId: "item", fieldId: "quantity", line: currentLineIndex }) || 0);
                    const tax1amtActual = Number(this._orden.getSublistValue({ sublistId: "item", fieldId: "tax1amt", line: currentLineIndex }) || 0);

                    // Setear nueva cantidad
                    this._orden.setSublistValue({
                        sublistId: "item",
                        fieldId: "quantity",
                        line: currentLineIndex,
                        value: Number(a.nuevaCantidad)
                    });

                    // Recalcular Importe (amount = rate × quantity) — evita "Please enter a value for Importe"
                    const nuevoAmount = rateActual * Number(a.nuevaCantidad);
                    try {
                        this._orden.setSublistValue({
                            sublistId: "item",
                            fieldId: "amount",
                            line: currentLineIndex,
                            value: Number(nuevoAmount.toFixed(2))
                        });
                    } catch (e) {
                        // Algunas líneas no permiten setear amount directamente; se ignora si es de solo lectura.
                        nLog.audit("devolverLote - amount", `Línea ${currentLineIndex}: ${e.message}`);
                    }

                    // Recalcular IVA proporcional (tax1amt)
                    if (cantidadActual > 0 && tax1amtActual > 0) {
                        try {
                            const taxRateUnitario = tax1amtActual / cantidadActual;
                            const nuevoTax1amt = taxRateUnitario * Number(a.nuevaCantidad);
                            this._orden.setSublistValue({
                                sublistId: "item",
                                fieldId: "tax1amt",
                                line: currentLineIndex,
                                value: Number(nuevoTax1amt.toFixed(2))
                            });
                        } catch (e) {
                            nLog.audit("devolverLote - tax1amt", `Línea ${currentLineIndex}: ${e.message}`);
                        }
                    }

                    resultado.exitosas.push({ identificador: a.identificador, accion: "ajustada", nuevaCantidad: a.nuevaCantidad });
                } catch (e) {
                    resultado.conError.push({ identificador: a.identificador, error: e.message });
                }
            }

            // ── Fase 5.5: Limpieza global de commitments ────────────────────────
            // Previene el error "ONE_OR_MORE_LINES_CANNOT_BE_COMMITTED_DUE_TO_A_LACK_OF_ITEM_LOT_AVAILABILITY"
            // al desactivar commitinventory (Do Not Commit = 1) y eliminar inventorydetail
            // de TODAS las líneas no fulfillmentadas/no cerradas de la OV.
            // El autopicking posterior (UE afterSubmit → scheduled) reasigna lotes con stock real.
            this._limpiarCommitmentsGlobales();

            // ── Fase 6: Reindexar UNA sola vez al final ─────────────────────────
            if (lineasAEliminar.length > 0 || seEliminoEnFulfillment) {
                this._indexarLineas();
            }

            return resultado;
        }

        /**
         * Recorre TODAS las líneas de la OV y libera compromisos de inventario
         * (commitinventory = 1 "Do Not Commit") eliminando el inventorydetail
         * asociado. Solo procesa líneas no cerradas y no fulfillmentadas.
         *
         * Esto previene el error de NetSuite al guardar cuando un lote comprometido
         * ya no tiene disponibilidad (available = 0). El autopicking posterior
         * se encarga de reasignar lotes con stock real.
         */
        _limpiarCommitmentsGlobales() {
            const lineCount = this._orden.getLineCount({ sublistId: "item" });
            const inventoryItemTypes = ["InvtPart", "Assembly", "Kit"];

            for (let i = 0; i < lineCount; i++) {
                try {
                    // Saltar líneas sin item o no inventariables (descripciones, comentarios, etc.)
                    const itemType = this._orden.getSublistValue({
                        sublistId: "item",
                        fieldId: "itemtype",
                        line: i
                    });
                    if (!itemType || !inventoryItemTypes.includes(itemType)) continue;

                    const isClosed = this._orden.getSublistValue({
                        sublistId: "item",
                        fieldId: "isclosed",
                        line: i
                    });
                    if (isClosed === true || isClosed === "T") continue;

                    const qtyFulfilled = Number(
                        this._orden.getSublistValue({
                            sublistId: "item",
                            fieldId: "quantityfulfilled",
                            line: i
                        }) || 0
                    );
                    if (qtyFulfilled > 0) continue;

                    // 1. Liberar compromiso (Do Not Commit)
                    // try {
                    //     this._orden.setSublistValue({
                    //         sublistId: "item",
                    //         fieldId: "commitinventory",
                    //         line: i,
                    //         value: 1
                    //     });
                    // } catch (e) {
                    //     nLog.error("limpiarCommitments - commitinventory", `Línea ${i}: ${e.message}`);
                    // }

                    // 2. Eliminar Inventory Detail si existe
                    try {
                        const hasInventoryDetail = this._orden.hasSublistSubrecord({
                            sublistId: "item",
                            fieldId: "inventorydetail",
                            line: i
                        });
                        if (hasInventoryDetail) {
                            this._orden.removeSublistSubrecord({
                                sublistId: "item",
                                fieldId: "inventorydetail",
                                line: i
                            });
                        }
                    } catch (e) {
                        nLog.error("limpiarCommitments - inventorydetail", `Línea ${i}: ${e.message}`);
                    }
                } catch (lineError) {
                    nLog.error("limpiarCommitments - línea", `Línea ${i}: ${lineError.message}`);
                }
            }
        }

        guardarOrden(lineasEliminar, lineasAgregar) {
            const resultado = {
                lineasExitosas: [],
                lineasDuplicadas: [],
                lineasNoEliminadas: []
            };

            try {
                if (lineasEliminar && lineasEliminar.length > 0) {
                    lineasEliminar.forEach((identificador) => {
                        const lineIndex = this._findLine(identificador, false);

                        if (lineIndex === -1) {
                            resultado.lineasNoEliminadas.push({
                                identificador: identificador,
                                error: `No se encontró línea provisional con identificador ${identificador}`
                            });
                        } else {
                            this._orden.removeLine({ sublistId: "item", line: lineIndex });
                            this._indexarLineas(); // Re-indexamos en cada eliminación para mantener los IDs estables
                        }
                    });
                }

                if (lineasAgregar && lineasAgregar.length > 0) {
                    // Nota: La asignación de lotes/bins se delega al autopicking al momento del fulfillment.
                    lineasAgregar.forEach((lineaData) => {
                        try {
                            if (lineaData.custcol_2win_as_identificador_fila) {
                                const lineIndexPermanente = this._findLine(lineaData.custcol_2win_as_identificador_fila, true);
                                if (lineIndexPermanente !== -1) {
                                    resultado.lineasDuplicadas.push({
                                        identificador: lineaData.custcol_2win_as_identificador_fila,
                                        item: lineaData.item,
                                        error: `Ya existe una línea permanente con el identificador ${lineaData.custcol_2win_as_identificador_fila}`
                                    });
                                    return;
                                }
                            }

                            this.crearLinea(lineaData);

                            resultado.lineasExitosas.push({
                                identificador: lineaData.custcol_2win_as_identificador_fila,
                                item: lineaData.item
                            });
                        } catch (error) {
                            resultado.lineasDuplicadas.push({
                                identificador: lineaData.custcol_2win_as_identificador_fila,
                                item: lineaData.item || "NO_DEFINIDO",
                                error: error.message
                            });
                        }
                    });
                }

                return resultado;
            } catch (error) {
                nLog.error("OrdenFarmacia - guardarOrden error", error);
                resultado.errorGeneral = error.message;
                return resultado;
            }
        }

        eliminarLineasProvisionales() {
            try {
                const lineCount = this._orden.getLineCount({ sublistId: "item" });
                let seEliminoAlguna = false;

                for (let i = lineCount - 1; i >= 0; i--) {
                    const isProvisional = this._orden.getSublistValue({
                        sublistId: "item",
                        fieldId: "custcol_2win_flag_item_provisional",
                        line: i
                    });

                    if (isProvisional) {
                        this._orden.removeLine({ sublistId: "item", line: i });
                        seEliminoAlguna = true;
                    }
                }

                if (seEliminoAlguna) this._indexarLineas(); // Re-indexamos si modificamos la longitud
            } catch (error) {
                nLog.error("OrdenFarmacia - eliminarLineasProvisionales error", error);
                throw error;
            }
        }
    }
    return OrdenFarmacia;
});
