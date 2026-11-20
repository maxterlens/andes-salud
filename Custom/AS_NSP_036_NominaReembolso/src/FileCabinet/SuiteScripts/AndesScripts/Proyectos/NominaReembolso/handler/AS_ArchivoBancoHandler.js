/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Proceso del boton Descargar TXT de la nomina: arma el archivo
 *              del banco con la AS Plantilla Banco y lo responde como descarga.
 *
 *              El formato de cada banco vive en el FreeMarker de su AS
 *              Plantilla Banco, no en el codigo: aqui solo se elige la
 *              plantilla por el banco de la nomina y se le pasan los
 *              reembolsos con los datos del cliente. Un banco nuevo es un
 *              registro nuevo de plantilla.
 *              Cada clic vuelve a generar el archivo y no se guarda en el File
 *              Cabinet.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 */
define(['N/error', '../form/AS_ArchivoBancoForm', '../data/search/AS_NominaReembolsoSearch', '../data/query/AS_NominaReembolsoQuery'],
    (error, archivoBancoForm, nominaReembolsoSearch, nominaReembolsoQuery) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function descargarArchivo(context, nominaId) {
        const nomina    = nominaReembolsoSearch.buscarNomina(nominaId);
        const plantilla = nominaReembolsoSearch.buscarPlantilla(nomina.banco);
        if (!plantilla) {
            throw error.create({
                name   : 'AS_NOM_REEMB_SIN_PLANTILLA',
                message: 'No hay una Plantilla de Banco activa para el banco ' + nomina.bancoTexto + '.',
            });
        }
        const pagos   = nominaReembolsoSearch.buscarReembolsosConCliente(nominaId).concat(nominaReembolsoQuery.buscarDevolucionesConCliente(nominaId));
        const archivo = archivoBancoForm.construirArchivo(plantilla, nomina, pagos);

        log.audit({
            title  : 'NOMINA REEMBOLSO TXT DESCARGADO',
            details: 'nomina: ' + nominaId + ' | banco: ' + nomina.bancoTexto
                   + ' | reembolsos: ' + pagos.length + ' | archivo: ' + archivo.name,
        });

        context.response.writeFile({ file: archivo, isInline: false });
    }

    return {
        descargarArchivo: descargarArchivo,
    };
});
