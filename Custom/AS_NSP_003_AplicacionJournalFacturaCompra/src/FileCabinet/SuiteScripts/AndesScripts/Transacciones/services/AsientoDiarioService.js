/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([
    '../repositories/FacturaCompraRepository',
    'N/log'
], (FacturaCompraRepository, log) => {

    const TIPO_FACTURA_COMPRA = 'vendorbill';
    const TIPO_CUENTA_CP      = 'AcctPay';
    const ESTADO_ABIERTO_FACTURA = 'open';

    // ─── Lógica de negocio ────────────────────────────────────────────────────

    const procesarAplicaciones = (journalId, lineas) => {
        // IDs únicos para reducir las búsquedas a dos llamadas independientes del nº de líneas
        const transaccionIds = [...new Set(lineas.map(l => l.transaccionId))];
        const accountIds     = [...new Set(lineas.map(l => l.account))];

        const datosTransacciones = FacturaCompraRepository.obtenerDatosTransaccionesEnLote(transaccionIds);
        const tiposCuenta        = FacturaCompraRepository.obtenerTiposCuentaEnLote(accountIds);

        lineas.forEach(({ transaccionId, account, entity, importe }) => {
            const datosTransaccion = datosTransacciones[transaccionId];
            if (!datosTransaccion || datosTransaccion.recordtype != TIPO_FACTURA_COMPRA) {
                log.error({
                    title:   'AsientoDiarioService',
                    details: `Transacción ${transaccionId} ignorada: tipo '${datosTransaccion ? datosTransaccion.recordtype : 'desconocido'}' no es factura de compra.`
                });
                return;
            }

            if (datosTransaccion.status != ESTADO_ABIERTO_FACTURA) {
                log.error({
                    title:   'AsientoDiarioService',
                    details: `Transacción ${transaccionId} ignorada: estado '${datosTransaccion ? datosTransaccion.status : 'desconocido'}' no está abierta.`
                });
                return;
            }

            const tipoCuenta = tiposCuenta[account];
            if (tipoCuenta !== TIPO_CUENTA_CP) {
                log.error({
                    title:   'AsientoDiarioService',
                    details: `Cuenta ${account} ignorada: tipo '${tipoCuenta}' no es cuenta por pagar.`
                });
                return;
            }

            if (entity != datosTransaccion.entity) {
                log.error({
                    title:   'AsientoDiarioService',
                    details: `Línea ignorada: entidad de la línea (${entity}) no coincide con la entidad de la factura ${transaccionId} (${datosTransaccion.entity}).`
                });
                return;
            }

            if (account != datosTransaccion.account) {
                log.error({
                    title:   'AsientoDiarioService',
                    details: `Línea ignorada: cuenta por pagar de la línea (${account}) no coincide con la cuenta por pagar de la factura ${transaccionId} (${datosTransaccion.account}).`
                });
                return;
            }

            if (importe <= 0) {
                log.error({
                    title:   'AsientoDiarioService',
                    details: `Línea con transacción ${transaccionId} ignorada: importe ${importe} no es positivo.`
                });
                return;
            }

            FacturaCompraRepository.aplicarJournalAFactura(journalId, transaccionId, importe);
        });
    };

    return { procesarAplicaciones };
});
