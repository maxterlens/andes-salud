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

        devolver(identificador, cantidadDevolucion) {
            try {
                const lineIndex = this._findLine(identificador, true);

                if (lineIndex === -1) {
                    throw new Error(`No se encontró línea con identificador ${identificador}`);
                }

                const cantidadActual = this._orden.getSublistValue({ sublistId: "item", fieldId: "quantity", line: lineIndex });
                let nuevaCantidad = Number(cantidadActual) - Number(cantidadDevolucion);
                nLog.debug("Devolución - calculando nueva cantidad", { identificador, cantidadActual, cantidadDevolucion, nuevaCantidad });
                if (nuevaCantidad <= 0) {
                    nLog.debug("Cantidad a devolver igual o mayor a la actual, eliminando línea", { identificador, cantidadActual, cantidadDevolucion });
                    const Autopicking = new domAutopicking();
                    const ordenLine = this._orden.getSublistValue({ sublistId: "item", fieldId: "line", line: lineIndex });

                    const deleted = Autopicking.deleteLineOnFulfillments(this._id, ordenLine);
                    if (deleted) {
                        this._orden = this._getRecord();
                        this._indexarLineas(); // Re-indexamos ya que refrescamos la orden

                        const currentLineIndex = this._findLine(identificador, true);
                        if (currentLineIndex !== -1) {
                            this._orden.removeLine({ sublistId: "item", line: currentLineIndex });
                            this._indexarLineas();
                        }
                    } else {
                        this._orden.removeLine({ sublistId: "item", line: lineIndex });
                        this._indexarLineas();
                    }
                } else {
                    // Solo ajustamos la cantidad a nivel de línea.
                    // La asignación/reducción de lotes se delega al autopicking al momento del fulfillment.
                    this._orden.setSublistValue({ sublistId: "item", fieldId: "quantity", line: lineIndex, value: Number(nuevaCantidad) });
                }
            } catch (error) {
                nLog.error("OrdenFarmacia - devolver error", error);
                throw error;
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
