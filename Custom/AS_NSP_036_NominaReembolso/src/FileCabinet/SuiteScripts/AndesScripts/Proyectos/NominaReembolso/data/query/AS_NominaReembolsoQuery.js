/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Todas las consultas SuiteQL del modulo (N/query).
 *
 *              Devoluciones: las lineas a credito de la cuenta 2120021
 *              (Devolucion a paciente) que se registran con asiento manual,
 *              una por paciente, con el paciente en el Nombre de la linea.
 *                - buscarDevolucionesPendientes: las de la subsidiaria, desde
 *                  la fecha Desde de la pantalla, que todavia no estan en una nomina.
 *                - buscarDevolucionesNomina: las de una nomina, para la grilla
 *                  de la vista. Las dos usan buscarDevoluciones con su condicion.
 *                - buscarDevolucionesConCliente: las de una nomina con los
 *                  datos bancarios de su cliente, para el TXT del banco.
 *
 *              La fecha y el numero son los de la linea (Fecha Documento y
 *              Folio), no los del asiento: el asiento junta un mes de caja.
 *              Si la linea no los trae, se usan los del asiento.
 *
 *              Un asiento trae varias devoluciones: lo que se paga es la linea,
 *              asi que el cruce con el detalle es por transaccion y linea. La
 *              linea es el uniquekey (lineuniquekey en la UI), no el numero de
 *              linea: el asiento se sigue editando despues de crearlo (se le
 *              agregan devoluciones otros dias) y el uniquekey no cambia. Se lee
 *              desde el detalle, no con el join inverso desde la transaccion (ver
 *              AS_NominaReembolsoSearch).
 *
 *              Sin subconsultas correlacionadas contra el detalle: un NOT EXISTS
 *              por cada linea de la 2120021 tardaba 14 s (QA, 2026-11-20). Los
 *              pendientes leen una sola vez las lineas que ya estan en una nomina
 *              y las descartan aqui, como los reembolsos; la nomina filtra con un
 *              IN que se resuelve una vez.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 */
define(['N/query', 'N/format', '../../constants/AS_NominaReembolsoConstants'],
    (query, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function buscarDevolucionesPendientes(subsidiaria, desde) {
        const fecha      = format.parse({ value: desde, type: format.Type.DATE });
        const fechaDesde = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');

        const devoluciones = buscarDevoluciones([
            '  AND t.posting = \'T\'',
            '  AND t.voided = \'F\'',
            '  AND tl.subsidiary = ?',
            '  AND NVL(tl.' + CONSTANTES.DEVOLUCION.FECHA + ', t.trandate) >= TO_DATE(?, \'YYYY-MM-DD\')',
        ], [Number(subsidiaria), fechaDesde]);
        if (!devoluciones.length) return devoluciones;
        const enNomina = new Set(buscarLineasEnNomina());
        return devoluciones.filter((devolucion) => !enNomina.has(devolucion.linea));
    }

    function buscarDevolucionesNomina(nominaId) {
        return buscarDevoluciones([armarCondicionNomina()], [Number(nominaId)]);
    }

    function buscarDevolucionesConCliente(nominaId) {
        const filas = query.runSuiteQL({
            query : [
                'SELECT c.' + CONSTANTES.CLIENTE.RUT + ' AS rut,',
                '       CASE WHEN c.isperson = \'T\'',
                '            THEN TRIM(REGEXP_REPLACE(c.firstname || \' \' || c.middlename || \' \' || c.lastname, \' +\', \' \'))',
                '            ELSE c.companyname END AS nombre,',
                '       c.' + CONSTANTES.CLIENTE.TIPO_CUENTA + ' AS tipocuenta,',
                '       c.' + CONSTANTES.CLIENTE.CODIGO_BANCO + ' AS codigobanco,',
                '       c.' + CONSTANTES.CLIENTE.CUENTA + ' AS cuenta,',
                '       TO_CHAR(tl.creditforeignamount) AS monto,',
                '       TO_CHAR(NVL(tl.' + CONSTANTES.DEVOLUCION.FECHA + ', t.trandate), \'YYYY-MM-DD\') AS fecha,',
                '       c.email AS correo',
                'FROM transactionline tl',
                'INNER JOIN transaction t ON t.id = tl.transaction',
                'INNER JOIN account a ON a.id = tl.expenseaccount',
                'INNER JOIN customer c ON c.id = tl.entity',
                'WHERE t.type = ?',
                '  AND a.acctnumber = ?',
                '  AND tl.creditforeignamount > 0',
                armarCondicionNomina(),
                'ORDER BY t.trandate, t.id, tl.id',
            ].join(' '),
            params: [CONSTANTES.DEVOLUCION.TIPO, CONSTANTES.DEVOLUCION.CUENTA, Number(nominaId)],
        }).asMappedResults();

        return filas.map((fila) => ({
            rut        : fila.rut || '',
            nombre     : fila.nombre || '',
            tipoCuenta : fila.tipocuenta ? String(fila.tipocuenta) : '',
            codigoBanco: fila.codigobanco ? String(fila.codigobanco) : '',
            cuenta     : fila.cuenta || '',
            monto      : fila.monto || '',
            fecha      : fila.fecha || '',
            correo     : fila.correo || '',
        }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function buscarDevoluciones(condicion, parametros) {
        const devoluciones = [];
        const inicio       = Date.now();
        const paginado     = query.runSuiteQLPaged({
            query   : [
                'SELECT t.id AS transaccion,',
                '       tl.uniquekey AS linea,',
                '       NVL(tl.' + CONSTANTES.DEVOLUCION.FOLIO + ', t.tranid) AS numero,',
                '       NVL(tl.' + CONSTANTES.DEVOLUCION.FECHA + ', t.trandate) AS fecha,',
                '       tl.entity AS entidad,',
                '       BUILTIN.DF(tl.entity) AS cliente,',
                '       tl.creditforeignamount AS monto',
                'FROM transactionline tl',
                'INNER JOIN transaction t ON t.id = tl.transaction',
                'WHERE t.type = ?',
                '  AND tl.expenseaccount = (SELECT a.id FROM account a WHERE a.acctnumber = ?)',
                '  AND tl.creditforeignamount > 0',
            ].concat(condicion, ['ORDER BY t.trandate, t.id, tl.id']).join(' '),
            params  : [CONSTANTES.DEVOLUCION.TIPO, CONSTANTES.DEVOLUCION.CUENTA].concat(parametros),
            pageSize: 1000,
        });

        paginado.pageRanges.forEach((rango) => {
            paginado.fetch({ index: rango.index }).data.asMappedResults().forEach((fila) => {
                devoluciones.push({
                    entidad: fila.entidad,
                    clave  : fila.transaccion + '-' + fila.linea,
                    id     : String(fila.transaccion),
                    linea  : String(fila.linea),
                    tipo   : CONSTANTES.DEVOLUCION.TEXTO,
                    numero : fila.numero,
                    fecha  : fila.fecha,
                    cliente: fila.cliente || '',
                    monto  : Number(fila.monto) || 0,
                });
            });
        });
        const medio    = Date.now();
        const clientes = new Set(buscarClientes(devoluciones.map((devolucion) => devolucion.entidad)));
        log.audit({ title: 'NOMINA REEMBOLSO TIEMPOS TEMPORAL QUERY', details: 'lineas: ' + (medio - inicio) + ' ms | clientes: ' + (Date.now() - medio) + ' ms' });

        return devoluciones.filter((devolucion) => clientes.has(devolucion.entidad));
    }

    /**
     * De las entidades de las lineas, las que son Cliente: el TXT lee los datos
     * bancarios del cliente. Va aparte del cruce de lineas: el join con
     * customer en esa consulta la llevaba a 14-17 s (QA, 2026-11-20).
     */
    function buscarClientes(entidades) {
        const ids = Array.from(new Set(entidades.filter((entidad) => entidad)));
        if (!ids.length) return [];
        const clientes = [];

        for (let inicio = 0; inicio < ids.length; inicio += 1000) {
            const bloque = ids.slice(inicio, inicio + 1000);
            query.runSuiteQL({
                query : 'SELECT c.id AS id FROM customer c WHERE c.id IN (' + bloque.map(() => '?').join(',') + ')',
                params: bloque,
            }).asMappedResults().forEach((fila) => clientes.push(fila.id));
        }

        return clientes;
    }

    /**
     * El uniquekey de todas las lineas de asiento que ya estan en una nomina
     * (los reembolsos no llevan linea). Crece con el historico: runSuiteQLPaged.
     */
    function buscarLineasEnNomina() {
        const detalle  = CONSTANTES.DETALLE;
        const lineas   = [];
        const paginado = query.runSuiteQLPaged({
            query   : 'SELECT d.' + detalle.CAMPOS.LINEA + ' AS linea FROM ' + detalle.TIPO + ' d WHERE d.' + detalle.CAMPOS.LINEA + ' IS NOT NULL',
            pageSize: 1000,
        });

        paginado.pageRanges.forEach((rango) => {
            paginado.fetch({ index: rango.index }).data.asMappedResults().forEach((fila) => lineas.push(String(fila.linea)));
        });

        return lineas;
    }

    /**
     * Las lineas que tienen detalle en la nomina. El uniquekey no se repite
     * entre transacciones, asi que basta con el; el IN no depende de la linea
     * y se resuelve una vez.
     */
    function armarCondicionNomina() {
        const detalle = CONSTANTES.DETALLE;

        return '  AND tl.uniquekey IN ('
             + ' SELECT d.' + detalle.CAMPOS.LINEA + ' FROM ' + detalle.TIPO + ' d'
             + ' WHERE d.' + detalle.CAMPOS.NOMINA + ' = ?'
             + ' )';
    }

    return {
        buscarDevolucionesPendientes: buscarDevolucionesPendientes,
        buscarDevolucionesNomina    : buscarDevolucionesNomina,
        buscarDevolucionesConCliente: buscarDevolucionesConCliente,
    };
});
