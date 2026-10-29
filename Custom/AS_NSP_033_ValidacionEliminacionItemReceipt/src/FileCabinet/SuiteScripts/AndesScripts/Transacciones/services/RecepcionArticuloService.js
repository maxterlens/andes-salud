/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file RecepcionArticuloService.js
 * @description Service — reglas de negocio para validar la eliminación de Recepciones de Artículo.
 */
define([
    'N/format',
    'N/log',
    '../repositories/RecepcionArticuloRepository'
], (format, log, RecepcionArticuloRepository) => {

    const ERROR_LOTE_CONSUMIDO = 'AS_LOTE_CONSUMIDO';

    // Tolerancia para evitar falsos positivos por decimales.
    const TOLERANCIA = 0.00001;

    // Máximo de transacciones a mostrar por lote en el mensaje.
    const MAX_CONSUMOS_POR_LOTE = 5;

    // Abreviaturas (2 letras) por tipo interno de transacción.
    const ABREVIATURAS = {
        ItemShip: 'EA',  // Ejecución de orden de artículo (mismo prefijo que usa la cuenta: EA-103873)
        InvAdjst: 'AJ',  // Ajuste de inventario
        InvTrnfr: 'TR',  // Transferencia de inventario
        WOIssue: 'CO',   // Consumo de orden de trabajo
        Build: 'EN',     // Ensamblaje
        InvWksht: 'HI',  // Hoja de cálculo de inventario
        InvCount: 'CI'   // Conteo de inventario
    };
    const ABREVIATURA_OTROS = 'TX';

    /**
     * Devuelve los lotes/ubicaciones de la recepción que quedarían negativos
     * si se elimina la recepción, con las transacciones que los consumieron.
     * @param {number|string} recepcionId - Internal ID de la recepción.
     * @param {Date|string} [fechaRecepcion] - Fecha de la recepción (para acotar los consumos).
     * @returns {Array<Object>} Lotes en conflicto.
     */
    function obtenerLotesEnConflicto(recepcionId, fechaRecepcion) {
        const conflictos = RecepcionArticuloRepository.obtenerLotesRecepcion(recepcionId)
            .map((l) => Object.assign({}, l, {
                saldoResultante: l.fisicoActual - l.cantidadRecepcion
            }))
            .filter((l) => l.saldoResultante < -TOLERANCIA);

        if (!conflictos.length) return conflictos;
        return adjuntarConsumos(conflictos, recepcionId, fechaRecepcion);
    }

    /**
     * Agrega a cada conflicto las transacciones que consumieron el lote.
     * Si la búsqueda falla, se registra el error y los conflictos se devuelven
     * con consumos = null: la eliminación se bloquea igual.
     */
    function adjuntarConsumos(conflictos, recepcionId, fechaRecepcion) {
        try {
            const unicos = (arr) => Array.from(new Set(arr.filter(Boolean)));
            const fechaDesde = fechaRecepcion instanceof Date
                ? format.format({ value: fechaRecepcion, type: format.Type.DATE })
                : (fechaRecepcion || null);

            const consumos = RecepcionArticuloRepository.obtenerConsumosLotes({
                recepcionId,
                fechaDesde,
                loteIds: unicos(conflictos.map((c) => c.loteId)),
                ubicacionIds: unicos(conflictos.map((c) => c.ubicacionId))
            });

            return conflictos.map((c) => Object.assign({}, c, {
                consumos: consumos[`${c.loteId}|${c.ubicacionId}`] || []
            }));
        } catch (e) {
            log.error({
                title: `Trazabilidad de consumos - Recepción ${recepcionId}`,
                details: `${(e && e.name) || ''} - ${(e && e.message) || e}`
            });
            return conflictos.map((c) => Object.assign({}, c, { consumos: null }));
        }
    }

    const fmt = (n) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: 4 });

    /**
     * Construye el mensaje de error para el usuario.
     * @param {Array<Object>} conflictos - Lotes en conflicto.
     * @param {Object} [opciones]
     * @param {boolean} [opciones.html=false] - true para la interfaz de usuario (saltos de línea con <br>).
     * @param {string} [opciones.numeroRecepcion] - Número de documento de la recepción.
     * @returns {string} Mensaje.
     */
    function construirMensaje(conflictos, opciones) {
        const html = !!(opciones && opciones.html);
        const br = html ? '<br>' : '\n';
        const sp = (n) => (html ? '&nbsp;' : ' ').repeat(n);
        const b = (t) => (html ? `<b>${t}</b>` : t);
        const esc = (t) => {
            const s = t == null ? '' : String(t);
            return html ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : s;
        };

        // Formato: <ABREV>-<tranid> (<cantidad>). Ej.: EA-103873 (100)
        // Si el tranid ya trae prefijo de letras con guion (p. ej. 'EA-103873'), se usa tal cual.
        const describirConsumo = (k) => {
            const numero = String(k.numero || k.id);
            const abrev = ABREVIATURAS[k.tipoId] || ABREVIATURA_OTROS;
            const texto = esc(/^[A-Za-z]{2,}-/.test(numero) ? numero : `${abrev}-${numero}`);
            // Sin link: la pantalla de error de NetSuite no interpreta <a> y muestra el HTML como texto.
            return `${b(texto)} (${fmt(k.cantidad)})`;
        };

        const describirConsumos = (consumos) => {
            const titulo = `${sp(2)}${b('Consumido en:')}`;
            if (!consumos) return [`${titulo} no fue posible obtener el detalle.`];
            if (!consumos.length) return [`${titulo} no se identificaron salidas desde la fecha de la recepción.`];

            let lista = consumos.slice(0, MAX_CONSUMOS_POR_LOTE).map(describirConsumo).join(', ');
            if (consumos.length > MAX_CONSUMOS_POR_LOTE) {
                lista += ` y ${consumos.length - MAX_CONSUMOS_POR_LOTE} más`;
            }
            return [`${titulo} ${lista}`];
        };

        const detalle = conflictos.map((c) => [
            `• ${b('Artículo:')} ${esc(c.articulo)}`,
            `${sp(2)}${b('Lote:')} ${esc(c.lote)} | ${b('Ubicación:')} ${esc(c.ubicacion)}`,
            `${sp(2)}Ingresado por esta recepción: ${fmt(c.cantidadRecepcion)} | ` +
            `Stock actual: ${fmt(c.fisicoActual)} | ` +
            `Stock si se elimina: ${fmt(c.saldoResultante)}`
        ].concat(describirConsumos(c.consumos)).join(br)).join(br + br);

        const numeroRecepcion = opciones && opciones.numeroRecepcion;
        const titulo = numeroRecepcion
            ? `No es posible eliminar la recepción ${esc(numeroRecepcion)}.`
            : 'No es posible eliminar esta recepción.';

        return [
            b(titulo),
            '',
            'Los siguientes lotes ingresados por esta recepción ya fueron utilizados en otras ' +
            'transacciones. Si se elimina, su stock quedaría negativo:',
            '',
            detalle,
            '',
            'Para continuar, primero corrija o anule las transacciones indicadas (por ejemplo, ' +
            'cambiando el lote en la ejecución si salió otro lote), o comuníquese con el área de Inventario.'
        ].join(br);
    }

    return {
        ERROR_LOTE_CONSUMIDO,
        obtenerLotesEnConflicto,
        construirMensaje
    };
});
