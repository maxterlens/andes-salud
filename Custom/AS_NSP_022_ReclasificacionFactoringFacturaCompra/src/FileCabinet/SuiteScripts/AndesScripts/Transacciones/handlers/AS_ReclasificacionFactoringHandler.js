/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/runtime', '../repositories/AS_FacturaCompraRepository', '../repositories/AS_AsientoFactoringRepository', '../lib/AS_FactoringConstants'],
    (runtime, facturaCompraRepository, asientoFactoringRepository, CONSTANTES) => {

    const reclasificarAFactoring = (idFactura) => {
        const datos = facturaCompraRepository.obtenerDatosFactura(idFactura);

        if (datos.diario) {
            log.audit({
                title  : CONSTANTES.LOGS.YA_HECHA,
                details: 'factura: ' + idFactura + ' | diario: ' + datos.diario,
            });

            return;
        }

        const idDiario = asientoFactoringRepository.crearAsiento(datos);

        facturaCompraRepository.escribirDiario(idFactura, idDiario);

        log.audit({
            title  : CONSTANTES.LOGS.CREADO,
            details: 'factura: ' + idFactura + ' | folio: ' + datos.folio
                   + ' | proveedor: ' + datos.proveedor + ' | factor: ' + datos.factor
                   + ' | monto: ' + datos.monto + ' | diario: ' + idDiario
                   + ' | usuario: ' + runtime.getCurrentUser().id,
        });
    };

    return { reclasificarAFactoring: reclasificarAFactoring };
});
