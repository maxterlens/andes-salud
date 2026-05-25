define(["N/record", "N/log", "N/query", "../domain/2win_dom_autopicking"], function (record, nLog, query, domAutopicking) {
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
                    const isProvisional = this._orden.getSublistValue({
                        sublistId: "item",
                        fieldId: "custcol_2win_flag_item_provisional",
                        line: i
                    });

                    // La llave se forma combinando el ID con su estado (prov o perm)
                    const key = `${Number(idFila)}_${isProvisional ? "prov" : "perm"}`;
                    this._lineIndexMap.set(key, i);
                }
            }
        }

        /**
         * Busca una línea por su identificador en milisegundos usando el Map.
         * @param {string} identificador - El identificador único de la fila.
         * @param {boolean} isPermanent - Si true, busca líneas permanentes. Si false, busca provisionales.
         * @returns {number} El índice de la línea encontrada, o -1 si no se encuentra.
         */
        _findLine(identificador, isPermanent = false) {
            const key = `${Number(identificador)}_${!isPermanent ? "prov" : "perm"}`;
            return this._lineIndexMap.has(key) ? this._lineIndexMap.get(key) : -1;
        }

        /**
         * Pre-carga el inventario agrupando (chunking) para evitar el límite de 1000 en Oracle IN clause.
         */
        _precargarInventario(lineas) {
            const itemIds = [...new Set(lineas.filter((l) => l.item && l.inventorylocation).map((l) => Number(l.item)))];
            const locationIds = [...new Set(lineas.filter((l) => l.item && l.inventorylocation).map((l) => Number(l.inventorylocation)))];

            if (itemIds.length === 0 || locationIds.length === 0) {
                this._inventarioCache = new Map();
                return;
            }

            this._inventarioCache = new Map();
            const CHUNK_SIZE = 500; // Límite seguro para Oracle

            for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
                const itemChunk = itemIds.slice(i, i + CHUNK_SIZE);

                for (let j = 0; j < locationIds.length; j += CHUNK_SIZE) {
                    const locChunk = locationIds.slice(j, j + CHUNK_SIZE);

                    const results = query
                        .runSuiteQL({
                            query: `
                            SELECT
                                ib.item,
                                ib.location,
                                inl.quantityavailable,
                                ib.inventorynumber,
                                ib.binnumber,
                                ib.inventorystatus
                            FROM
                            InventoryBalance ib
                            INNER JOIN AggregateItemLocation ail ON ib.item = ail.item
                            AND ib.location = ail.location
                            INNER JOIN InventoryNumberLocation inl ON ib.inventorynumber = inl.inventorynumber
                            AND ib.location = inl.location
                            --AND ib.item = inl.item
                            WHERE
                            ib.item IN (${itemChunk.join(",")})
                            AND ib.location IN (${locChunk.join(",")})
                            AND ib.quantityavailable > 0
                            AND inl.quantityavailable > 0
                            -- Condición clave: Validar que la ubicación también tenga disponibilidad general
                            AND (
                                NVL (ail.quantityonhand, 0) - NVL (ail.quantitycommitted, 0)
                            ) > 0
                            -- Filtrar estados de inventario inválidos
                            AND ib.inventorystatus NOT IN (
                                SELECT
                                id
                                FROM
                                InventoryStatus
                                WHERE
                                name IN ('Bloqueado', 'En Inspección', 'Damaged')
                            )
                            ORDER BY
                            ib.item,
                            ib.location,
                            ib.lastmodifieddate ASC
                        `
                        })
                        .asMappedResults();

                    for (const r of results) {
                        const key = `${r.item}|${r.location}`;
                        if (!this._inventarioCache.has(key)) {
                            this._inventarioCache.set(key, []);
                        }
                        this._inventarioCache.get(key).push({
                            inventorynumber: r.inventorynumber,
                            binnumber: r.binnumber,
                            inventorystatus: r.inventorystatus,
                            disponible: parseFloat(r.quantityavailable)
                        });
                    }
                }
            }
            nLog.debug("_precargarInventario - Total items agrupados cargados", this._inventarioCache.size);
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

        _asignarInventario(subrec, itemId, location, quantity) {
            const key = `${itemId}|${location}`;
            let lotes;

            if (this._inventarioCache) {
                lotes = (this._inventarioCache.get(key) || []).filter((l) => l.disponible > 0);
            } else {
                nLog.debug("_asignarInventario - Sin caché, ejecutando query individual", key);
                lotes = query
                    .runSuiteQL({
                        query: `
                            SELECT
                                inl.quantityavailable,
                                ib.inventorynumber,
                                ib.binnumber,
                                ib.inventorystatus
                            FROM
                                InventoryBalance ib
                                INNER JOIN AggregateItemLocation ail 
                                    ON ib.item = ail.item 
                                    AND ib.location = ail.location
                                -- Reincorporamos la tabla vital para la disponibilidad estricta del lote
                                INNER JOIN InventoryNumberLocation inl 
                                    ON ib.inventorynumber = inl.inventorynumber
                                    AND ib.location = inl.location
                                --AND ib.item = inl.item
                            WHERE
                                ib.item = ?
                                AND ib.location = ?
                                AND ib.quantityavailable > 0
                                AND inl.quantityavailable > 0 -- Validamos el saldo del lote
                                -- Condición clave: Validar que la ubicación también tenga disponibilidad general
                                AND (
                                    NVL(ail.quantityonhand, 0) - NVL(ail.quantitycommitted, 0)
                                ) > 0
                                -- Filtrar estados de inventario inválidos
                                AND ib.inventorystatus NOT IN (
                                    SELECT id 
                                    FROM InventoryStatus 
                                    WHERE name IN ('Bloqueado', 'En Inspección', 'Damaged')
                                )
                            ORDER BY
                                ib.lastmodifieddate ASC
                        `,
                        params: [itemId, location]
                    })
                    .asMappedResults()
                    .map((r) => ({
                        inventorynumber: r.inventorynumber,
                        binnumber: r.binnumber,
                        inventorystatus: r.inventorystatus,
                        disponible: parseFloat(r.quantityavailable)
                    }));
            }

            let cantidadAsignada = 0;
            // En modo estándar obtenemos la cantidad de líneas actuales del subregistro
            let subrecLineIdx = subrec.getLineCount({ sublistId: "inventoryassignment" });

            for (const lote of lotes) {
                if (cantidadAsignada >= quantity) break;
                if (lote.disponible <= 0) continue;

                const pendiente = quantity - cantidadAsignada;
                const aAsignar = Math.min(lote.disponible, pendiente);

                if (!lote.inventorynumber || aAsignar <= 0) continue;

                try {
                    // Inserción directa (isDynamic: false)
                    subrec.setSublistValue({ sublistId: "inventoryassignment", fieldId: "issueinventorynumber", line: subrecLineIdx, value: lote.inventorynumber });

                    if (lote.binnumber) {
                        subrec.setSublistValue({ sublistId: "inventoryassignment", fieldId: "binnumber", line: subrecLineIdx, value: lote.binnumber });
                    }
                    if (lote.inventorystatus) {
                        subrec.setSublistValue({ sublistId: "inventoryassignment", fieldId: "inventorystatus", line: subrecLineIdx, value: lote.inventorystatus });
                    }
                    subrec.setSublistValue({ sublistId: "inventoryassignment", fieldId: "quantity", line: subrecLineIdx, value: aAsignar });

                    lote.disponible -= aAsignar;
                    cantidadAsignada += aAsignar;
                    subrecLineIdx++;
                } catch (e) {
                    nLog.error("Race condition en commit de lote", `Lote ${lote.inventorynumber}: ${e.message}`);
                    lote.disponible = 0;
                }
            }

            if (cantidadAsignada < quantity - 0.00001) {
                throw new Error(`Stock insuficiente: item ${itemId} en loc ${location}. Requerido: ${quantity}, asignado: ${cantidadAsignada}.`);
            }
        }

        crearLinea(datosLinea) {
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

                // Intentamos capturar el subregistro de inventario. En modo standard esto fallaría si el artículo no requiere detalle.
                let subrec = null;
                try {
                    subrec = this._orden.getSublistSubrecord({ sublistId: "item", fieldId: "inventorydetail", line: newLineIndex });
                } catch (e) {
                    nLog.error("Error al obtener subregistro de inventario en crearLinea", e);
                    throw new Error(`No se pudo obtener el detalle de inventario para el item ${datosLinea.item}. Todos los items requieren asignación de lote.`);
                }

                if (subrec) {
                    this._asignarInventario(subrec, datosLinea.item, datosLinea.inventorylocation, datosLinea.quantity);
                } else {
                    throw new Error(`No se pudo obtener el detalle de inventario para el item ${datosLinea.item}. Todos los items requieren asignación de lote.`);
                }

                // Actualizamos el Map en memoria de forma ultra rápida
                if (datosLinea.custcol_2win_as_identificador_fila) {
                    const isProv = datosLinea.custcol_2win_flag_item_provisional ? "prov" : "perm";
                    this._lineIndexMap.set(`${Number(datosLinea.custcol_2win_as_identificador_fila)}_${isProv}`, newLineIndex);
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

                let subrec = null;
                try {
                    subrec = this._orden.getSublistSubrecord({ sublistId: "item", fieldId: "inventorydetail", line: lineIndex });
                } catch (e) {}

                if (subrec && datosActualizados.quantity) {
                    const invLineCount = subrec.getLineCount({ sublistId: "inventoryassignment" });
                    for (let i = invLineCount - 1; i >= 0; i--) {
                        subrec.removeLine({ sublistId: "inventoryassignment", line: i });
                    }

                    const itemId = this._orden.getSublistValue({ sublistId: "item", fieldId: "item", line: lineIndex });
                    const locationId = this._orden.getSublistValue({ sublistId: "item", fieldId: "inventorylocation", line: lineIndex });

                    this._asignarInventario(subrec, itemId, locationId, datosActualizados.quantity);
                }
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
                    this._orden.setSublistValue({ sublistId: "item", fieldId: "quantity", line: lineIndex, value: Number(nuevaCantidad) });

                    let subrec = null;
                    try {
                        subrec = this._orden.getSublistSubrecord({ sublistId: "item", fieldId: "inventorydetail", line: lineIndex });
                    } catch (e) {}

                    if (subrec) {
                        const lineCount = subrec.getLineCount({ sublistId: "inventoryassignment" });
                        let cantidadAReducir = Number(cantidadDevolucion);

                        for (let i = lineCount - 1; i >= 0; i--) {
                            const cantidadAsignada = subrec.getSublistValue({ sublistId: "inventoryassignment", fieldId: "quantity", line: i });

                            if (cantidadAReducir >= cantidadAsignada) {
                                subrec.removeLine({ sublistId: "inventoryassignment", line: i });
                                cantidadAReducir -= cantidadAsignada;
                            } else {
                                subrec.setSublistValue({
                                    sublistId: "inventoryassignment",
                                    fieldId: "quantity",
                                    line: i,
                                    value: cantidadAsignada - cantidadAReducir
                                });
                                cantidadAReducir = 0;
                            }

                            if (cantidadAReducir === 0) break;
                        }
                    }
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
                    const lineasNumeradas = lineasAgregar.filter((l) => l.item && l.inventorylocation && l.quantity);
                    this._precargarInventario(lineasNumeradas);

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
