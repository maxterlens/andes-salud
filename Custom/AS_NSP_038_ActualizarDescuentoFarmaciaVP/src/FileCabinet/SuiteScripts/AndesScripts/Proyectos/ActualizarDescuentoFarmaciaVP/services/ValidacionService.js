/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Validación: busca las facturas abiertas de Farmacia Venta Público,
 *              lee sus líneas y clasifica cada una (DeteccionService):
 *                - POR_PROCESAR: algún descuento con cantidad distinta y el ajuste cuadra con el importe restante.
 *                - NO_PROCESABLE: hay diferencia pero no cuadra, o la estructura de la factura no se reconoce.
 *                - SIN_DIFERENCIA: los descuentos ya tienen la cantidad de su artículo.
 *              No modifica nada en NetSuite.
 */
define(["N/log", "../constants/ActualizarDescuentoFarmaciaVPConstants", "../repositories/FacturaRepository", "./DeteccionService"], (nLog, CONST, facturaRepo, deteccion) => {
    const { CLASIFICACION } = CONST;

    const r2 = (n) => Math.round(Number(n) * 100) / 100;

    /**
     * @param {object} o
     * @param {number} o.subsidiaria
     * @param {string} [o.desde] - 'YYYY-MM-DD'
     * @param {string} [o.hasta] - 'YYYY-MM-DD'
     * @param {{departamentos: string, ubicacionesExcluidas: string, restanteMinimo: number, tolerancia: number, iva: number}} o.config
     * @returns {{ facturas: object[], resumen: object }}
     */
    const validar = ({ subsidiaria, desde, hasta, config }) => {
        const cabeceras = facturaRepo.buscarAbiertas({
            subsidiaria,
            desde,
            hasta,
            departamentos: config.departamentos,
            ubicacionesExcluidas: config.ubicacionesExcluidas,
            restanteMinimo: config.restanteMinimo
        });
        const lineasPorFactura = cabeceras.length ? facturaRepo.obtenerLineas(cabeceras.map((c) => c.id)) : {};

        const facturas = cabeceras.map((c) => deteccion.clasificarFactura(c, lineasPorFactura[c.id] || [], { iva: config.iva, tolerancia: config.tolerancia }));

        const contar = (codigo) => facturas.filter((f) => f.clasificacion === codigo).length;
        const porProcesar = facturas.filter((f) => f.clasificacion === CLASIFICACION.POR_PROCESAR.codigo);
        const resumen = {
            revisadas: facturas.length,
            procesables: porProcesar.length,
            noProcesables: contar(CLASIFICACION.NO_PROCESABLE.codigo),
            sinDiferencia: contar(CLASIFICACION.SIN_DIFERENCIA.codigo),
            lineasPorProcesar: porProcesar.reduce((s, f) => s + f.lineas.length, 0),
            restantePorProcesar: r2(porProcesar.reduce((s, f) => s + Number(f.restante || 0), 0)),
            ajustePorProcesar: r2(porProcesar.reduce((s, f) => s + Number(f.importeEsperado || 0), 0)),
            parametros: { subsidiaria, desde: desde || "", hasta: hasta || "", ...config }
        };
        resumen.conDiferencia = resumen.procesables + resumen.noProcesables;
        nLog.audit({ title: "AS_NSP_038 - Validación", details: JSON.stringify(resumen) });
        return { facturas, resumen };
    };

    return { validar };
});
