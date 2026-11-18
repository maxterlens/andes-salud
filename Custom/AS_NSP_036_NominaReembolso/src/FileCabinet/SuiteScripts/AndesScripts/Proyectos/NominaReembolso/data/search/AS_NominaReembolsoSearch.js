/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Todas las busquedas del modulo (N/search).
 *
 *              Cuentas
 *                - buscarBancosConPlantilla: los bancos que tienen una AS
 *                  Plantilla Banco activa, para el select Banco.
 *                - buscarCuentasBanco: las cuentas bancarias activas que tienen
 *                  Banco y Empresa de 2WIN, con los dos valores, para filtrar el
 *                  select Cuenta Banco en la pantalla.
 *              Reembolsos
 *                - buscarReembolsosPendientes: los Reembolsos al cliente de la
 *                  subsidiaria y la cuenta banco que todavia no estan en una
 *                  nomina. Mismo filtro que AS_NSP_026 con CustRfnd en vez de
 *                  los pagos a proveedor.
 *                - buscarReembolsosNomina: los reembolsos que ya estan en una
 *                  nomina, para la ficha Detalle de la vista. Las dos usan
 *                  buscarReembolsos con su filtro.
 *              Archivo del banco
 *                - buscarNomina: banco y fecha de la nomina.
 *                - buscarPlantilla: la AS Plantilla Banco activa del banco,
 *                  con su FreeMarker.
 *                - buscarReembolsosConCliente: los reembolsos de la nomina
 *                  (monto y fecha) con los datos bancarios de su cliente, sin
 *                  relleno.
 *
 *              El cruce reembolso-nomina se lee siempre desde el detalle
 *              (buscarReembolsosDetalle) y nunca con el join inverso desde la
 *              transaccion (custrecord_as_nom_reemb_det_transaccion.xxx): ese
 *              join no existe cuando el record se crea con isparent T en el
 *              primer deploy, y devuelve vacio sin error. Caso real: QA,
 *              2026-11-12, al borrar y volver a desplegar los records.
 *
 * CHANGELOG v1.6.0 (2026-11-13):
 * - [REFACTOR] buscarPagosNomina pasa a buscarReembolsosConCliente: solo el
 *              monto y la fecha son del reembolso, lo demas es del cliente.
 *
 * CHANGELOG v1.5.0 (2026-11-12):
 * - [FEAT] buscarBancosConPlantilla.
 *
 * CHANGELOG v1.4.0 (2026-11-12):
 * - [FIX] buscarReembolsos y buscarReembolsosDetalle con runPaged: each()
 *         corta en 4.000 filas sin avisar y el historico de la cuenta crece.
 * - [FIX] Pendientes resta el detalle entero en vez de un anyof con todos
 *         los ids de la cuenta, que con miles de reembolsos no escala.
 *
 * CHANGELOG v1.3.0 (2026-11-12):
 * - [FIX] Pendientes, ficha Detalle y TXT leen el cruce desde el detalle: el
 *         join inverso desde el reembolso quedaba vacio tras recrear los
 *         records (la ficha salia en 0 y los reembolsos volvian a pendientes).
 *
 * CHANGELOG v1.2.0 (2026-11-11):
 * - [FEAT] buscarReembolsosNomina.
 * - [FIX] buscarReembolsosConCliente: el nombre va sin el ID del cliente.
 * - [REFACTOR] Pendientes y los de la nomina comparten buscarReembolsos:
 *              solo cambia el filtro.
 *
 * CHANGELOG v1.1.0 (2026-11-11):
 * - [FEAT] buscarNomina, buscarPlantilla y buscarReembolsosConCliente.
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] Cuentas banco y reembolsos pendientes.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.6.0
 *
 */
define(['N/search', '../../constants/AS_NominaReembolsoConstants'],
    (search, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Una plantilla por banco: si hubiera dos activas del mismo banco, el
     * banco sale una sola vez.
     */
    function buscarBancosConPlantilla() {
        const campos = CONSTANTES.PLANTILLA.CAMPOS;
        const bancos = [];

        search.create({
            type   : CONSTANTES.PLANTILLA.TIPO,
            filters: [['isinactive', 'is', 'F']],
            columns: [search.createColumn({ name: campos.BANCO, sort: search.Sort.ASC })],
        }).run().each((resultado) => {
            const id = resultado.getValue(campos.BANCO);
            if (!bancos.some((banco) => banco.id === id)) bancos.push({ id: id, nombre: resultado.getText(campos.BANCO) });
            return true;
        });

        return bancos;
    }

    function buscarCuentasBanco() {
        const cuenta  = CONSTANTES.CUENTA_BANCO;
        const cuentas = [];

        search.create({
            type   : search.Type.ACCOUNT,
            filters: [
                ['type',             'anyof',      'Bank'], 'AND',
                ['issummary',        'is',         'F'],    'AND',
                ['isinactive',       'is',         'F'],    'AND',
                [cuenta.BANCO,       'noneof',     '@NONE@'], 'AND',
                [cuenta.SUBSIDIARIA, 'noneof',     '@NONE@'],
            ],
            columns: ['name', cuenta.BANCO, cuenta.SUBSIDIARIA],
        }).run().each((resultado) => {
            cuentas.push({
                id         : resultado.id,
                nombre     : resultado.getValue('name'),
                banco      : resultado.getValue(cuenta.BANCO),
                subsidiaria: resultado.getValue(cuenta.SUBSIDIARIA),
            });
            return true;
        });

        return cuentas;
    }

    /**
     * Los reembolsos de la cuenta menos los que ya tienen detalle en alguna
     * nomina. Los dos lados crecen con el historico: el detalle se lee entero
     * en vez de armar un anyof con miles de ids.
     */
    function buscarReembolsosPendientes(subsidiaria, cuentaBanco) {
        const reembolsos = buscarReembolsos([
            ['voided',     'is',    'F'],                                            'AND',
            ['subsidiary', 'anyof', subsidiaria],                                    'AND',
            ['account',    'anyof', cuentaBanco],                                    'AND',
            ['account.' + CONSTANTES.CUENTA_BANCO.NUMERO_BANCARIO, 'isnotempty', ''],
        ]);
        if (!reembolsos.length) return reembolsos;
        const enNomina = new Set(buscarReembolsosDetalle([]));
        return reembolsos.filter((reembolso) => !enNomina.has(reembolso.id));
    }

    function buscarReembolsosNomina(nominaId) {
        const ids = buscarReembolsosDetalle([[CONSTANTES.DETALLE.CAMPOS.NOMINA, 'anyof', nominaId]]);
        if (!ids.length) return [];
        return buscarReembolsos([['internalid', 'anyof', ids]]);
    }

    function buscarNomina(nominaId) {
        const campos  = CONSTANTES.NOMINA.CAMPOS;
        const valores = search.lookupFields({ type: CONSTANTES.NOMINA.TIPO, id: nominaId, columns: [campos.BANCO, campos.FECHA] });

        return {
            id        : nominaId,
            banco     : valores[campos.BANCO][0].value,
            bancoTexto: valores[campos.BANCO][0].text,
            fecha     : valores[campos.FECHA],
        };
    }

    /**
     * null si el banco no tiene una plantilla activa.
     */
    function buscarPlantilla(banco) {
        const campos     = CONSTANTES.PLANTILLA.CAMPOS;
        const resultados = search.create({
            type   : CONSTANTES.PLANTILLA.TIPO,
            filters: [
                [campos.BANCO, 'anyof', banco], 'AND',
                ['isinactive', 'is',    'F'],
            ],
            columns: [campos.CONTENIDO],
        }).run().getRange({ start: 0, end: 1 });

        if (!resultados.length) return null;
        return { contenido: resultados[0].getValue(campos.CONTENIDO) };
    }

    /**
     * Los valores van tal cual estan en NetSuite: el relleno, el largo y los
     * codigos de cada banco los pone la plantilla. El nombre es el del
     * cliente sin el ID: nombre y apellidos si es persona, la razon social si
     * es empresa ({name} trae el ID con la ficha, "Juan Perez - 545706"). El
     * monto va en positivo y sin decimales, la fecha en yyyy-MM-dd para que la
     * plantilla la formatee.
     */

    //pago template
    function buscarReembolsosConCliente(nominaId) {
        const cliente       = CONSTANTES.CLIENTE;
        const columnaNombre = search.createColumn({
            name   : 'formulatext',
            formula: "CASE WHEN {customer.isperson} = 'T'"
                   + " THEN TRIM(REGEXP_REPLACE({customer.firstname} || ' ' || {customer.middlename} || ' ' || {customer.lastname}, ' +', ' '))"
                   + ' ELSE {customer.companyname} END',
        });
        const columnaMonto  = search.createColumn({ name: 'formulatext', formula: 'TO_CHAR(ABS({amount}))' });
        const columnaFecha  = search.createColumn({ name: 'formulatext', formula: "TO_CHAR({trandate}, 'YYYY-MM-DD')" });
        const ids           = buscarReembolsosDetalle([[CONSTANTES.DETALLE.CAMPOS.NOMINA, 'anyof', nominaId]]);
        const pagos         = [];

        if (!ids.length) return pagos;
        search.create({
            type   : search.Type.TRANSACTION,
            filters: [
                ['type',       'anyof', CONSTANTES.REEMBOLSO.TIPO], 'AND',
                ['mainline',   'is',    'T'],                       'AND',
                ['internalid', 'anyof', ids],
            ],
            columns: [
                columnaNombre,
                columnaMonto,
                columnaFecha,
                search.createColumn({ name: cliente.RUT,          join: cliente.JOIN }),
                search.createColumn({ name: cliente.CUENTA,       join: cliente.JOIN }),
                search.createColumn({ name: cliente.CODIGO_BANCO, join: cliente.JOIN }),
                search.createColumn({ name: cliente.TIPO_CUENTA,  join: cliente.JOIN }),
                search.createColumn({ name: cliente.CORREO,       join: cliente.JOIN }),
            ],
        }).run().each((resultado) => {
            pagos.push({
                rut        : resultado.getValue({ name: cliente.RUT,          join: cliente.JOIN }),
                nombre     : resultado.getValue(columnaNombre),
                tipoCuenta : resultado.getValue({ name: cliente.TIPO_CUENTA,  join: cliente.JOIN }),
                codigoBanco: resultado.getValue({ name: cliente.CODIGO_BANCO, join: cliente.JOIN }),
                cuenta     : resultado.getValue({ name: cliente.CUENTA,       join: cliente.JOIN }),
                monto      : resultado.getValue(columnaMonto),
                fecha      : resultado.getValue(columnaFecha),
                correo     : resultado.getValue({ name: cliente.CORREO,       join: cliente.JOIN }),
            });
            return true;
        });

        return pagos;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los Reembolsos al cliente con el filtro de quien llama: la pantalla
     * (pendientes) y la vista (los de una nomina) muestran lo mismo. El monto
     * sale negativo en la linea principal (es un egreso del banco): se trae en
     * positivo, que es lo que se paga. runPaged: con los pendientes trae todo
     * el historico de la cuenta, que pasa de las 4.000 filas de each().
     */
    function buscarReembolsos(filtros) {
        const reembolsos = [];
        const paginado   = search.create({
            type   : search.Type.TRANSACTION,
            filters: [
                ['type',     'anyof', CONSTANTES.REEMBOLSO.TIPO], 'AND',
                ['mainline', 'is',    'T'],                       'AND',
                filtros,
            ],
            columns: [
                'tranid',
                'trandate',
                'entity',
                search.createColumn({ name: 'formulacurrency', formula: 'ABS({amount})' }),
            ],
        }).runPaged({ pageSize: 1000 });

        paginado.pageRanges.forEach((rango) => {
            paginado.fetch({ index: rango.index }).data.forEach((resultado) => {
                reembolsos.push({
                    id     : resultado.id,
                    numero : resultado.getValue('tranid'),
                    fecha  : resultado.getValue('trandate'),
                    cliente: resultado.getText('entity'),
                    monto  : parseFloat(resultado.getValue({ name: 'formulacurrency' })) || 0,
                });
            });
        });

        return reembolsos;
    }

    /**
     * Los ids de los reembolsos que tienen detalle, con los filtros de quien
     * llama: los de una nomina, o sin filtro todos los que ya estan en alguna.
     * runPaged: sin filtro es todo el historico del detalle.
     */
    function buscarReembolsosDetalle(filtros) {
        const ids      = [];
        const paginado = search.create({
            type   : CONSTANTES.DETALLE.TIPO,
            filters: filtros,
            columns: [CONSTANTES.DETALLE.CAMPOS.TRANSACCION],
        }).runPaged({ pageSize: 1000 });

        paginado.pageRanges.forEach((rango) => {
            paginado.fetch({ index: rango.index }).data.forEach((resultado) => {
                ids.push(resultado.getValue(CONSTANTES.DETALLE.CAMPOS.TRANSACCION));
            });
        });

        return ids;
    }

    return {
        buscarBancosConPlantilla  : buscarBancosConPlantilla,
        buscarCuentasBanco        : buscarCuentasBanco,
        buscarReembolsosPendientes: buscarReembolsosPendientes,
        buscarReembolsosNomina    : buscarReembolsosNomina,
        buscarNomina              : buscarNomina,
        buscarPlantilla           : buscarPlantilla,
        buscarReembolsosConCliente: buscarReembolsosConCliente,
    };
});
