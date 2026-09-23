/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file AS_AsientoContableHandler.js
 * @description Validación de duplicidad del Asiento Diario.
 */
define(['N/search', 'N/log'], (search, log) => {

    const validar = (journal) => {
        const lineas = obtenerLineasControl(journal);
        if (!lineas.length) return { internos: [], externos: [] };

        return {
            internos: duplicidadInterna(lineas),
            externos: duplicidadExterna(lineas, journal.id)
        };
    };

    const obtenerCuentasExentas = () => {
        const exentas = new Set();

        search.create({
            type: 'account',
            filters: [['custrecord_as_cuenta_exenta_dup', search.Operator.IS, 'T']],
            columns: ['internalid']
        }).run().each((resultado) => {
            exentas.add(resultado.getValue({ name: 'internalid' }));
            return true;
        });

        return exentas;
    };

    const obtenerLineasControl = (journal) => {
        const subsidiariaCabecera = journal.getValue({ fieldId: 'subsidiary' });
        const cantidad = journal.getLineCount({ sublistId: 'line' });
        const cuentasExentas = obtenerCuentasExentas();
        const lineas = [];
        let exoneradas = 0;

        for (let i = 0; i < cantidad; i++) {
            const cuenta = journal.getSublistValue({ sublistId: 'line', fieldId: 'account', line: i });
            const entidad = journal.getSublistValue({ sublistId: 'line', fieldId: 'entity', line: i });
            const folio = journal.getSublistValue({ sublistId: 'line', fieldId: 'custcol_2w_folio', line: i });
            const debe = journal.getSublistValue({ sublistId: 'line', fieldId: 'debit', line: i });
            const subsidiaria = journal.getSublistValue({ sublistId: 'line', fieldId: 'linesubsidiary', line: i }) || subsidiariaCabecera;

            if (!cuenta || !entidad || !folio) continue;

            if (cuentasExentas.has(String(cuenta))) {
                exoneradas++;
                continue;
            }

            lineas.push({
                numero: i + 1,
                subsidiaria,
                cuenta,
                entidad,
                folio,
                movimiento: debe ? 'debit' : 'credit'
            });
        }

        if (exoneradas) {
            log.audit({
                title: 'Lineas exoneradas del control de duplicidad',
                details: `${exoneradas} de ${cantidad} lineas, por cuenta marcada como exenta de duplicidad`
            });
        }

        return lineas;
    };

    const crearClaveDuplicidad = (linea) => {
        const folioNormalizado = String(linea.folio).trim().toUpperCase();
        return [linea.subsidiaria, linea.cuenta, linea.entidad, folioNormalizado, linea.movimiento].join('|');
    };

    const descripcionLinea = (linea) => {
        const debeOHaber = linea.movimiento === 'debit' ? 'Debe' : 'Haber';
        return `cuenta ${linea.cuenta} / entidad ${linea.entidad} / folio ${linea.folio} en el ${debeOHaber}`;
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

    const buscarLineasExistentes = (lineas, journalId) => {
        const cuentas = Array.from(new Set(lineas.map((linea) => linea.cuenta)));
        const entidades = Array.from(new Set(lineas.map((linea) => linea.entidad)));
        const folios = Array.from(new Set(lineas.map((linea) => linea.folio)));

        const filtros = [
            ['account', search.Operator.ANYOF, cuentas],
            'AND', ['name', search.Operator.ANYOF, entidades],
            'AND', filtroFolios(folios)
        ];

        const subsidiarias = Array.from(new Set(lineas.map((linea) => linea.subsidiaria).filter(Boolean)));
        if (subsidiarias.length) {
            filtros.push('AND', ['subsidiary', search.Operator.ANYOF, subsidiarias]);
        }

        if (journalId) {
            filtros.push('AND', ['internalid', search.Operator.NONEOF, journalId]);
        }

        const existentes = new Map();

        search.create({
            type: search.Type.JOURNAL_ENTRY,
            filters: filtros,
            columns: ['internalid', 'tranid', 'subsidiary', 'account', 'name', 'custcol_2w_folio', 'debitamount']
        }).run().each((resultado) => {
            const llave = crearClaveDuplicidad({
                subsidiaria: resultado.getValue({ name: 'subsidiary' }),
                cuenta: resultado.getValue({ name: 'account' }),
                entidad: resultado.getValue({ name: 'name' }),
                folio: resultado.getValue({ name: 'custcol_2w_folio' }),
                movimiento: resultado.getValue({ name: 'debitamount' }) ? 'debit' : 'credit'
            });

            if (!existentes.has(llave)) {
                existentes.set(llave, {
                    id: resultado.getValue({ name: 'internalid' }),
                    numero: resultado.getValue({ name: 'tranid' })
                });
            }

            return true;
        });

        return existentes;
    };

    const filtroFolios = (folios) => {
        const expresion = [];

        folios.forEach((folio) => {
            if (expresion.length) expresion.push('OR');
            expresion.push(['custcol_2w_folio', search.Operator.IS, folio]);
        });

        return expresion;
    };

    // ─── Campos obligatorios por tipo de cuenta (form 115) ─────────────────────
    // Regla independiente del control de duplicidad de más arriba. Ver
    // ARQUITECTURA.md, sección "Campos obligatorios por tipo de cuenta", para el
    // detalle de por qué no se cruza con la exención de cuenta ni con el UE.

    const TIPOS_CUENTA_OBLIGAN_CAMPOS = ['Bank', 'AcctRec', 'AcctPay', 'OthCurrAsset'];

    /**
     * Determina, para una línea del Diario, qué campos obligatorios faltan
     * según el tipo de cuenta. Devuelve null si no aplica o si está todo
     * completo, o un array con los nombres de los campos faltantes.
     */
    const camposFaltantesAsiento = (cuenta, valores) => {
        if (!cuenta) return null;

        const resultado = search.lookupFields({
            type: 'account',
            id: cuenta,
            columns: ['type']
        });
        const tipoCuenta = resultado.type && resultado.type[0] && resultado.type[0].value;

        if (!TIPOS_CUENTA_OBLIGAN_CAMPOS.includes(tipoCuenta)) return null;

        const faltantes = Object.keys(valores).filter((campo) => !valores[campo]);
        return faltantes.length ? faltantes : null;
    };

    /**
     * Exige Folio, Fecha de Documento, Fecha de Vencimiento, Nombre, Departamento
     * y Nota en la línea del Diario Contable (sublist 'line') cuando la cuenta
     * seleccionada es de tipo Banco, CxC, CxP u Otros Activos Corrientes. Aplica
     * solo al formulario Andes - Diario Contable (customform 115); el CS es quien
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

        const faltantes = camposFaltantesAsiento(cuenta, valores);
        if (!faltantes) return true;

        dialog.alert({
            title: 'Campos requeridos',
            message: 'Para el tipo de cuenta seleccionado, son obligatorios en la línea: ' + faltantes.join(', ') + '.'
        });
        return false;
    };

    /**
     * Resguardo para saveRecord: recorre todas las líneas del Diario ya
     * confirmadas (no solo la que se está editando) y valida lo mismo que
     * validarCamposObligatoriosLinea. Cubre casos que no disparan validateLine.
     *
     * @param {Object} currentRecord
     * @param {Object} dialog - Módulo N/ui/dialog, inyectado por el CS
     * @returns {boolean} false si alguna línea tiene campos faltantes, true si no
     */
    const validarTodasLasLineasCamposObligatorios = (currentRecord, dialog) => {
        const cantidad = currentRecord.getLineCount({ sublistId: 'line' });
        const mensajes = [];

        for (let i = 0; i < cantidad; i++) {
            const cuenta = currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'account', line: i });
            const valores = {
                Folio: currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'custcol_2w_folio', line: i }),
                'Fecha de Documento': currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'custcol8', line: i }),
                'Fecha de Vencimiento': currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'custcol2', line: i }),
                Nombre: currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'entity', line: i }),
                Departamento: currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'department', line: i }),
                Nota: currentRecord.getSublistValue({ sublistId: 'line', fieldId: 'memo', line: i })
            };

            const faltantes = camposFaltantesAsiento(cuenta, valores);
            if (faltantes) {
                mensajes.push(`Línea ${i + 1}: Seleccione un valor para los campos de ${faltantes.join(', ')}.`);
            }
        }

        if (mensajes.length) {
            dialog.alert({
                title: 'Campos requeridos',
                message: mensajes.join('<br>')
            });
            return false;
        }

        return true;
    };

    return {
        validar,
        validarCamposObligatoriosLinea,
        validarTodasLasLineasCamposObligatorios
    };
});
