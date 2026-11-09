/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file AS_AsientoContableHandler.js
 * @description Validación de duplicidad del Asiento Diario.
 *
 */
define(['N/search', 'N/query', 'N/log'], (search, query, log) => {

    // Oracle acepta hasta 1.000 valores en un IN: los folios se consultan en lotes de ese tamano.
    const TAMANO_LOTE_IN = 1000;
    const MAXIMO_MENSAJES = 50;

    // Libro contable principal, igual que el Reporte Analitico (AS_NSP_014): sin el filtro, un asiento con
    // varios libros cuenta cada linea una vez por libro y el saldo sale duplicado.
    const LIBRO_CONTABLE = 1;

    const validar = (journal) => {
        const lineas = leerLineasRegistro(journal);
        const datosCuentas = obtenerDatosCuentas(lineas.map((linea) => linea.cuenta));

        const { internos, externos } = validarLineas(lineas, journal.id, datosCuentas);
        const { excedidos, sinSaldo } = validarSaldos(lineas, journal.id, datosCuentas);

        return { internos, externos, alertasSaldo: excedidos, avisosSaldo: sinSaldo };
    };

    /**
     * Valida un asiento a partir de las lineas que lee el Client Script (leerLineasRegistro).
     * Si validarCampos viene en true y falta algun campo obligatorio, devuelve solo eso y no
     * busca duplicidad: el usuario corrige primero y recien despues se revisa la identidad.
     *
     * Ademas de la duplicidad, revisa el saldo historico de las cuentas exentas (validarSaldos):
     * si el asiento rebaja mas que un saldo positivo, el CS bloquea el guardado (alertasSaldo); si la
     * deuda no tiene saldo vigente, solo avisa y deja guardar (avisosSaldo).
     *
     * @param {Object} datos - { journalId, validarCampos, lineas }
     * @returns {{camposFaltantes: string[], internos: string[], externos: string[], alertasSaldo: string[], avisosSaldo: string[]}}
     */
    const validarAsiento = (datos) => {
        const datosCuentas = obtenerDatosCuentas(datos.lineas.map((linea) => linea.cuenta));
        const camposFaltantes = datos.validarCampos ? validarCamposLineas(datos.lineas, datosCuentas) : [];

        if (camposFaltantes.length) return { camposFaltantes: limitarMensajes(camposFaltantes), internos: [], externos: [], alertasSaldo: [], avisosSaldo: [] };

        const { internos, externos } = validarLineas(datos.lineas, datos.journalId, datosCuentas);
        const { excedidos, sinSaldo } = validarSaldos(datos.lineas, datos.journalId, datosCuentas);

        return {
            camposFaltantes: [],
            internos:     limitarMensajes(internos),
            externos:     limitarMensajes(externos),
            alertasSaldo: limitarMensajes(excedidos),
            avisosSaldo:  limitarMensajes(sinSaldo)
        };
    };

    const limitarMensajes = (mensajes) => {
        if (mensajes.length <= MAXIMO_MENSAJES) return mensajes;
        return mensajes.slice(0, MAXIMO_MENSAJES).concat(`... y ${mensajes.length - MAXIMO_MENSAJES} más.`);
    };

    const leerLineasRegistro = (journal) => {
        const esIntercompania = journal.type === 'advintercompanyjournalentry';
        const subsidiariaCabecera = journal.getValue({ fieldId: 'subsidiary' });
        const cantidad = journal.getLineCount({ sublistId: 'line' });
        const lineas = [];

        for (let i = 0; i < cantidad; i++) {
            const debe = journal.getSublistValue({ sublistId: 'line', fieldId: 'debit', line: i });
            const haber = journal.getSublistValue({ sublistId: 'line', fieldId: 'credit', line: i });

            lineas.push({
                numero: i + 1,
                subsidiaria: esIntercompania ? journal.getSublistValue({ sublistId: 'line', fieldId: 'linesubsidiary', line: i }) : subsidiariaCabecera,
                cuenta: journal.getSublistValue({ sublistId: 'line', fieldId: 'account', line: i }),
                entidad: journal.getSublistValue({ sublistId: 'line', fieldId: 'entity', line: i }),
                folio: journal.getSublistValue({ sublistId: 'line', fieldId: 'custcol_2w_folio', line: i }),
                movimiento: debe ? 'debit' : 'credit',
                debe: Number(debe) || 0,
                haber: Number(haber) || 0,
                fechaDocumento: journal.getSublistValue({ sublistId: 'line', fieldId: 'custcol8', line: i }),
                fechaVencimiento: journal.getSublistValue({ sublistId: 'line', fieldId: 'custcol2', line: i }),
                departamento: journal.getSublistValue({ sublistId: 'line', fieldId: 'department', line: i }),
                nota: journal.getSublistValue({ sublistId: 'line', fieldId: 'memo', line: i })
            });
        }

        return lineas;
    };

    /**
     * Una sola busqueda para todas las cuentas del asiento: devuelve el tipo y si la cuenta
     * esta marcada como exenta de duplicidad, indexado por id interno de la cuenta.
     */
    const obtenerDatosCuentas = (cuentas) => {
        const ids = Array.from(new Set(cuentas.filter(Boolean).map(String)));
        const datosCuentas = new Map();
        if (!ids.length) return datosCuentas;

        search.create({
            type: 'account',
            filters: [['internalid', search.Operator.ANYOF, ids]],
            columns: ['type', 'custrecord_as_cuenta_exenta_dup']
        }).run().each((resultado) => {
            const exenta = resultado.getValue({ name: 'custrecord_as_cuenta_exenta_dup' });
            datosCuentas.set(String(resultado.id), {
                tipo: resultado.getValue({ name: 'type' }),
                exenta: exenta === true || exenta === 'T'
            });
            return true;
        });

        return datosCuentas;
    };

    const validarLineas = (lineas, journalId, datosCuentas) => {
        const candidatas = lineas.filter((linea) => linea.cuenta && linea.entidad && linea.folio);
        const lineasControl = candidatas.filter((linea) => !(datosCuentas.get(String(linea.cuenta)) || {}).exenta);
        const exoneradas = candidatas.length - lineasControl.length;

        if (exoneradas) {
            log.audit({
                title: 'Lineas exoneradas del control de duplicidad',
                details: `${exoneradas} de ${lineas.length} lineas, por cuenta marcada como exenta de duplicidad`
            });
        }

        if (!lineasControl.length) return { internos: [], externos: [] };

        return {
            internos: duplicidadInterna(lineasControl),
            externos: duplicidadExterna(lineasControl, journalId)
        };
    };

    const crearClaveDuplicidad = (linea) => {
        return [linea.subsidiaria, linea.cuenta, linea.entidad, normalizarFolio(linea.folio), linea.movimiento].join('|');
    };

    const descripcionLinea = (linea) => {
        const debeOHaber = linea.movimiento === 'debit' ? 'Debe' : 'Haber';
        return `cuenta <b>${linea.cuenta}</b> / entidad <b>${linea.entidad}</b> / folio <b>${linea.folio}</b> en el ${debeOHaber}`;
    };

    const duplicidadInterna = (lineas) => {
        const porLlave = new Map();

        lineas.forEach((linea) => {
            const llave = crearClaveDuplicidad(linea);
            if (!porLlave.has(llave)) porLlave.set(llave, []);
            porLlave.get(llave).push(linea);
        });

        return Array.from(porLlave.values())
            .filter((repetidas) => repetidas.length > 1)
            .map((repetidas) => {
                const numeros = repetidas.map((linea) => linea.numero).join(', ');
                return `Líneas ${numeros}: repiten ${descripcionLinea(repetidas[0])} en este mismo asiento.`;
            });
    };

    const duplicidadExterna = (lineas, journalId) => {
        const existentes = buscarLineasExistentes(lineas, journalId);
        const mensajes = [];

        lineas.forEach((linea) => {
            const asiento = existentes.get(crearClaveDuplicidad(linea));
            if (!asiento) return;

            mensajes.push(
                `Línea ${linea.numero}: ${descripcionLinea(linea)} ya está registrado `
                + `en el asiento ${asiento.numero || asiento.id}.`
            );

            try {
                log.error({
                    title: 'DUPLICIDAD_ASIENTO_CONTABLE - ID interno',
                    details: `Línea ${linea.numero}: asiento ${asiento.numero || asiento.id}, ID interno ${asiento.id}`
                });
            } catch (e) {
            }
        });

        return mensajes;
    };

    /**
     * Busca en asientos ya guardados las llaves de duplicidad de estas lineas. SuiteQL en lotes de
     * folios (no un OR por folio): con 10.000 lineas la busqueda N/search reventaba o se cortaba en
     * los 4.000 resultados de each(). La entidad se compara en memoria con la llave, asi el unico
     * IN grande es el de folios. Devuelve llave -> { id, numero } del primer asiento encontrado.
     * El folio se filtra tal cual (tl.custcol_2w_folio IN), sin UPPER/TRIM sobre la columna: la
     * funcion anula el indice y la consulta pasaba los 45 s de requestSuitelet (QA, asiento 277282).
     */
    const buscarLineasExistentes = (lineas, journalId) => {
        const cuentas = Array.from(new Set(lineas.map((linea) => String(linea.cuenta))));
        const subsidiarias = Array.from(new Set(lineas.map((linea) => linea.subsidiaria).filter(Boolean).map(String)));
        const folios = Array.from(new Set(lineas.map((linea) => String(linea.folio).trim())));
        const existentes = new Map();

        dividirEnLotes(folios).forEach((lote) => {
            const sql = 'SELECT tl.subsidiary AS subsidiaria, tal.account AS cuenta, tl.entity AS entidad,'
                      + ' UPPER(TRIM(tl.custcol_2w_folio)) AS folio,'
                      + ' CASE WHEN NVL(tal.debit, 0) > 0 THEN \'debit\' ELSE \'credit\' END AS movimiento,'
                      + ' MIN(t.id) AS id'
                      + ' FROM transaction t'
                      + ' JOIN transactionline tl ON tl.transaction = t.id'
                      + ' JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id'
                      + ' WHERE t.type = \'Journal\''
                      + ' AND tal.account IN (' + marcadores(cuentas) + ')'
                      + (subsidiarias.length ? ' AND tl.subsidiary IN (' + marcadores(subsidiarias) + ')' : '')
                      + ' AND tl.custcol_2w_folio IN (' + marcadores(lote) + ')'
                      + (journalId ? ' AND t.id <> ?' : '')
                      + ' GROUP BY tl.subsidiary, tal.account, tl.entity, UPPER(TRIM(tl.custcol_2w_folio)),'
                      + ' CASE WHEN NVL(tal.debit, 0) > 0 THEN \'debit\' ELSE \'credit\' END';
            const params = cuentas.concat(subsidiarias, lote, journalId ? [journalId] : []);

            ejecutarConsulta(sql, params).forEach((fila) => {
                const llave = crearClaveDuplicidad(fila);
                if (!existentes.has(llave)) existentes.set(llave, { id: fila.id, numero: null });
            });
        });

        completarNumerosAsiento(existentes);
        return existentes;
    };

    const completarNumerosAsiento = (existentes) => {
        const ids = Array.from(new Set(Array.from(existentes.values()).map((asiento) => String(asiento.id))));
        const numeros = new Map();

        dividirEnLotes(ids).forEach((lote) => {
            ejecutarConsulta('SELECT id, tranid FROM transaction WHERE id IN (' + marcadores(lote) + ')', lote)
                .forEach((fila) => numeros.set(String(fila.id), fila.tranid));
        });

        existentes.forEach((asiento) => { asiento.numero = numeros.get(String(asiento.id)); });
    };

    const validarSaldos = (lineas, journalId, datosCuentas) => {
        const deudas = agruparDeudasDelAsiento(lineas, datosCuentas);
        if (!deudas.size) return { excedidos: [], sinSaldo: [] };

        const saldos = buscarSaldosHistoricos(Array.from(deudas.values()), journalId);
        const excedidos = [];
        const sinSaldo = [];

        deudas.forEach((deuda, llave) => {
            if (!deuda.rebaja) return;

            const saldoDisponible = (saldos.get(llave) || 0) + deuda.cargo;
            const saldoResultante = Math.round((saldoDisponible - deuda.rebaja) * 100) / 100;
            if (saldoResultante >= 0) return;

            const lineasTexto = `Línea${deuda.numeros.length > 1 ? 's' : ''} ${deuda.numeros.join(', ')}`;
            const deudaTexto = `El folio <b>${deuda.folio}</b> de la entidad <b>${deuda.entidad}</b> en la cuenta <b>${deuda.cuenta}</b>`;

            if (saldoDisponible > 0) {
                excedidos.push(
                    `${lineasTexto}: no se puede guardar, el asiento rebaja más que el saldo. `
                    + `${deudaTexto} tiene un saldo de ${saldoDisponible}; `
                    + `este asiento lo rebaja en ${deuda.rebaja} y el saldo quedaría en ${saldoResultante}. `
                    + `Corrige el monto para que no supere el saldo.`
                );
                return;
            }

            const saldoActualTexto = saldos.has(llave) || deuda.cargo ? `no tiene saldo vigente (saldo ${saldoDisponible})` : 'no existe, no tiene saldo vigente';
            sinSaldo.push(
                `${lineasTexto}: ${deudaTexto} ${saldoActualTexto}; `
                + `este asiento lo rebaja en ${deuda.rebaja} y el saldo quedaría en ${saldoResultante}.`
            );
        });

        return { excedidos, sinSaldo };
    };

    /**
     * Junta las lineas del asiento por deuda, solo en cuentas exentas y con entidad y folio.
     * En todas las cuentas el Debe carga la deuda y el Haber la rebaja (sin importar el tipo de
     * cuenta), y suma varias lineas de la misma deuda antes de compararlas contra el saldo.
     */
    const agruparDeudasDelAsiento = (lineas, datosCuentas) => {
        const deudas = new Map();

        lineas.forEach((linea) => {
            const datosCuenta = datosCuentas.get(String(linea.cuenta));
            if (!datosCuenta || !datosCuenta.exenta || !linea.entidad || !linea.folio) return;

            const llave = crearClaveDeuda(linea);
            if (!deudas.has(llave)) {
                deudas.set(llave, {
                    subsidiaria: linea.subsidiaria,
                    cuenta: linea.cuenta,
                    entidad: linea.entidad,
                    folio: String(linea.folio),
                    cargo: 0,
                    rebaja: 0,
                    numeros: []
                });
            }

            const deuda = deudas.get(llave);
            deuda.cargo += linea.debe;
            deuda.rebaja += linea.haber;
            deuda.numeros.push(linea.numero);
        });

        return deudas;
    };

    /**
     * Saldo historico contabilizado de cada deuda, sin contar el asiento que se esta guardando.
     * Agrupa en la base: vuelve una fila por deuda, no las lineas del historial. Todos los tipos
     * de transaccion cuentan (Journal, CustPymt, VendBill), igual que el reporte de AS_NSP_014.
     */
    const buscarSaldosHistoricos = (deudas, journalId) => {
        const cuentas = Array.from(new Set(deudas.map((deuda) => String(deuda.cuenta))));
        const subsidiarias = Array.from(new Set(deudas.map((deuda) => deuda.subsidiaria).filter(Boolean).map(String)));
        const folios = Array.from(new Set(deudas.map((deuda) => deuda.folio)));
        const saldos = new Map();

        dividirEnLotes(folios).forEach((lote) => {
            const sql = 'SELECT tl.subsidiary AS subsidiaria, tal.account AS cuenta, tl.entity AS entidad,'
                      + ' tl.custcol_2w_folio AS folio,'
                      + ' SUM(NVL(tal.debit, 0)) AS debe, SUM(NVL(tal.credit, 0)) AS haber'
                      + ' FROM transactionaccountingline tal'
                      + ' JOIN transactionline tl ON tl.transaction = tal.transaction AND tl.id = tal.transactionline'
                      + ' WHERE tal.posting = \'T\''
                      + ' AND tal.accountingbook = ' + LIBRO_CONTABLE
                      + ' AND tal.account IN (' + marcadores(cuentas) + ')'
                      + (subsidiarias.length ? ' AND tl.subsidiary IN (' + marcadores(subsidiarias) + ')' : '')
                      + ' AND tl.custcol_2w_folio IN (' + marcadores(lote) + ')'
                      + (journalId ? ' AND tal.transaction <> ?' : '')
                      + ' GROUP BY tl.subsidiary, tal.account, tl.entity, tl.custcol_2w_folio';
            const params = cuentas.concat(subsidiarias, lote, journalId ? [journalId] : []);

            ejecutarConsulta(sql, params).forEach((fila) => {
                saldos.set(crearClaveDeuda(fila), (Number(fila.debe) || 0) - (Number(fila.haber) || 0));
            });
        });

        return saldos;
    };

    const crearClaveDeuda = (linea) => {
        return [linea.subsidiaria, linea.cuenta, linea.entidad, String(linea.folio)].join('|');
    };

    const normalizarFolio = (folio) => String(folio).trim().toUpperCase();

    const dividirEnLotes = (valores) => {
        const lotes = [];
        for (let i = 0; i < valores.length; i += TAMANO_LOTE_IN) lotes.push(valores.slice(i, i + TAMANO_LOTE_IN));
        return lotes;
    };

    const marcadores = (valores) => valores.map(() => '?').join(', ');

    const ejecutarConsulta = (sql, params) => {
        const resultados = [];
        const paginado = query.runSuiteQLPaged({ query: sql, params, pageSize: 1000 });

        paginado.pageRanges.forEach((rango) => {
            paginado.fetch({ index: rango.index }).data.asMappedResults().forEach((fila) => resultados.push(fila));
        });

        return resultados;
    };

    // ─── Campos obligatorios por tipo de cuenta (form 273) ─────────────────────
    // Regla independiente del control de duplicidad de más arriba. Ver
    // ARQUITECTURA.md, sección "Campos obligatorios por tipo de cuenta", para el
    // detalle de por qué no se cruza con la exención de cuenta ni con el UE.

    const TIPOS_CUENTA_OBLIGAN_FOLIO = ['Bank', 'AcctRec', 'AcctPay', 'OthCurrAsset'];
    const TIPOS_CUENTA_OBLIGAN_DEPARTAMENTO = ['FixedAsset', 'Income', 'COGS', 'Expense', 'OthIncome', 'OthExpense', 'DeferExpense'];

    /**
     * Determina, para una línea del Diario, qué campos obligatorios faltan.
     * Fecha de Documento, Fecha de Vencimiento, Nombre y Nota son obligatorios
     * en toda línea, sin importar el tipo de cuenta. Folio y Departamento
     * tienen cada uno su propia condición de tipo de cuenta, independiente
     * entre sí. Devuelve null si está todo completo, o un array con los
     * nombres de los campos faltantes.
     */
    const camposFaltantesAsiento = (tipoCuenta, valores) => {
        const faltantes = [];

        if (tipoCuenta && TIPOS_CUENTA_OBLIGAN_FOLIO.includes(tipoCuenta) && !valores.Folio) {
            faltantes.push('Folio');
        }
        if (!valores['Fecha de Documento']) faltantes.push('Fecha de Documento');
        if (!valores['Fecha de Vencimiento']) faltantes.push('Fecha de Vencimiento');
        if (!valores.Nombre) faltantes.push('Nombre');
        if (tipoCuenta && TIPOS_CUENTA_OBLIGAN_DEPARTAMENTO.includes(tipoCuenta) && !valores.Departamento) {
            faltantes.push('Departamento');
        }
        if (!valores.Nota) faltantes.push('Nota');

        return faltantes.length ? faltantes : null;
    };

    /**
     * Exige, en toda línea del Diario Contable (sublist 'line'): Fecha de
     * Documento, Fecha de Vencimiento, Nombre y Nota siempre; Folio solo si
     * la cuenta es de tipo Banco, CxC, CxP u Otros Activos Corrientes;
     * Departamento solo si la cuenta es de tipo Activo Fijo, Ingresos, COGS,
     * Gastos, Otros Ingresos, Otros Gastos o Gastos Diferidos. Aplica solo
     * al formulario Andes - Diario Contable (customform 273); el CS es quien
     * filtra por formulario antes de llamar a esta función.
     *
     * @param {Object} context - Contexto validateLine del Client Script
     * @param {Object} dialog - Módulo N/ui/dialog, inyectado por el CS (este
     *                          handler no lo importa directamente porque no está
     *                          soportado server-side)
     * @returns {boolean} false si falta algún campo obligatorio, true en caso contrario
     */
    const validarCamposObligatoriosLinea = (context, dialog) => {
        const { currentRecord, sublistId } = context;
        if (sublistId !== 'line') return true;

        const cuenta = currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'account' });

        const valores = {
            Folio: currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_2w_folio' }),
            'Fecha de Documento': currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol8' }),
            'Fecha de Vencimiento': currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol2' }),
            Nombre: currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'entity' }),
            Departamento: currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'department' }),
            Nota: currentRecord.getCurrentSublistValue({ sublistId: 'line', fieldId: 'memo' })
        };

        const tipoCuenta = (obtenerDatosCuentas([cuenta]).get(String(cuenta)) || {}).tipo;
        const faltantes = camposFaltantesAsiento(tipoCuenta, valores);
        if (!faltantes) return true;

        dialog.alert({
            title: 'Campos requeridos',
            message: 'Son obligatorios en esta línea: ' + faltantes.join(', ') + '.'
        });
        return false;
    };

    /**
     * Resguardo para saveRecord: recorre todas las líneas del Diario ya
     * confirmadas (no solo la que se está editando) y valida lo mismo que
     * validarCamposObligatoriosLinea. Cubre casos que no disparan validateLine.
     * Corre en el Suitelet, con los tipos de cuenta resueltos en una sola busqueda.
     *
     * @returns {string[]} un mensaje por cada línea con campos faltantes
     */
    const validarCamposLineas = (lineas, datosCuentas) => {
        const mensajes = [];

        lineas.forEach((linea) => {
            const valores = {
                Folio: linea.folio,
                'Fecha de Documento': linea.fechaDocumento,
                'Fecha de Vencimiento': linea.fechaVencimiento,
                Nombre: linea.entidad,
                Departamento: linea.departamento,
                Nota: linea.nota
            };

            const tipoCuenta = (datosCuentas.get(String(linea.cuenta)) || {}).tipo;
            const faltantes = camposFaltantesAsiento(tipoCuenta, valores);
            if (faltantes) {
                mensajes.push(`Línea ${linea.numero}: Seleccione un valor para los campos de ${faltantes.join(', ')}.`);
            }
        });

        return mensajes;
    };

    return {
        validar,
        validarAsiento,
        leerLineasRegistro,
        validarCamposObligatoriosLinea
    };
});
