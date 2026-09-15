/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file PagoAnticipadoProveedorHandler.js
 * @description Validación del importe del Pago Anticipado de Proveedor contra
 * el total de la Orden de Compra asociada.
 */
define([
    '../repositories/PagoAnticipadoProveedorRepository'
], (PagoAnticipadoProveedorRepository) => {

    const TOLERANCIA = 0.01;

    /**
     * Formatea un monto en formato de moneda chilena (ej. $50.700,00).
     *
     * @param {number} valor - Monto a formatear.
     * @returns {string} Monto formateado.
     */
    const formatearMonto = (valor) => {
        return '$' + Number(valor).toLocaleString('es-CL', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    /**
     * Valida que el importe del Pago Anticipado de Proveedor, sumado a los
     * importes de otros Pagos Anticipados ya contabilizados y no anulados
     * de la misma Orden de Compra, no supere el total de dicha OC.
     *
     * Solo aplica cuando el Pago Anticipado está asociado a una Orden de Compra.
     *
     * @param {Record} currentRecord - Registro actual del Pago Anticipado de Proveedor.
     * @returns {string[]} Lista de mensajes de error (vacía si la validación pasa).
     */
    const validarImporteNoSuperaTotalOC = (currentRecord) => {
        const ocId = currentRecord.getValue({ fieldId: 'purchaseorder' });
        if (!ocId) return [];

        const importe = Number(currentRecord.getValue({ fieldId: 'payment' })) || 0;
        const idInterno = currentRecord.id || '0';

        const totalOC = PagoAnticipadoProveedorRepository.obtenerTotalOC(ocId);
        const sumaExistente = PagoAnticipadoProveedorRepository.obtenerSumaPagosAnticipadosExistentes(ocId, idInterno);
        const totalAcumulado = sumaExistente + importe;

        if (totalAcumulado > totalOC + TOLERANCIA) {
            const excedente = totalAcumulado - totalOC;
            const ocTexto = currentRecord.getText({ fieldId: 'purchaseorder' });

            return [
                `El importe de pago supera el total disponible a pagar de la Orden de Compra ${ocTexto}.` +
                '<br><br>' + `Pagos anticipados registrados:&nbsp;<b>${formatearMonto(sumaExistente)}</b>` +                
                '<br>' + `Importe ingresado:&nbsp;<b>${formatearMonto(importe)}</b>` +
                '<br>' + `Total OC:&nbsp;<b>${formatearMonto(totalOC)}</b>` +
                '<br>' + `Exceso:&nbsp;<b>${formatearMonto(excedente)}</b>`
            ];
        }

        return [];
    };

    return {
        validarImporteNoSuperaTotalOC
    };
});
