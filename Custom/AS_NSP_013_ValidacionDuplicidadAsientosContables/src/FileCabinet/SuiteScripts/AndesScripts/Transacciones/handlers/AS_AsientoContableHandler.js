/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file AS_AsientoContableHandler.js
 * @description Validación de duplicidad del Asiento Diario.
 */
define(['N/search', 'N/log'], (search, log) => {

    const validar = (journal) => {
        const lineas = obtenerLineasControl(journal);
        if (!lineas.length) return [];

        return [
            ...duplicidadInterna(lineas),
            ...duplicidadExterna(lineas, journal.id)
        ];
    };

    const obtenerLineasControl = (journal) => {
        const subsidiariaCabecera = journal.getValue({ fieldId: 'subsidiary' });
        const cantidad = journal.getLineCount({ sublistId: 'line' });
        const lineas = [];

        for (let i = 0; i < cantidad; i++) {
            const cuenta = journal.getSublistValue({ sublistId: 'line', fieldId: 'account', line: i });
            const entidad = journal.getSublistValue({ sublistId: 'line', fieldId: 'entity', line: i });
            const folio = journal.getSublistValue({ sublistId: 'line', fieldId: 'custcol_2w_folio', line: i });
            const debe = journal.getSublistValue({ sublistId: 'line', fieldId: 'debit', line: i });
            const subsidiaria = journal.getSublistValue({ sublistId: 'line', fieldId: 'linesubsidiary', line: i }) || subsidiariaCabecera;

            if (!cuenta || !entidad || !folio) continue;

            lineas.push({
                numero: i + 1,
                subsidiaria,
                cuenta,
                entidad,
                folio,
                movimiento: debe ? 'debit' : 'credit'
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

    return { validar };
});
