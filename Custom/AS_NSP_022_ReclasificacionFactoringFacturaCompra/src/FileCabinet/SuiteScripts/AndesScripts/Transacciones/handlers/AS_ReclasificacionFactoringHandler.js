/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Orquesta la reclasificacion de una factura: lee sus datos, manda a
 *              crear el diario y le escribe de vuelta a la factura el diario
 *              generado. No toca datos, eso es de los repositories.
 *
 *              Corta si la factura ya tiene diario. Es el candado contra el doble
 *              diario: el parametro que dispara la reclasificacion viaja en la URL
 *              y sobrevive a un F5, asi que una recarga puede encolar una segunda
 *              tarea sobre la misma factura.
 *
 *              El log del cierre lleva el usuario que la reclasifico, porque es la
 *              unica huella de quien decidio ceder esa deuda.
 *
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
