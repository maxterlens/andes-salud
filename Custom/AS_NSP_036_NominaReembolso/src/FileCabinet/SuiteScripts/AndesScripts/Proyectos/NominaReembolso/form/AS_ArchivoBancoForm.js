/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Arma el TXT del banco con los datos ya leidos: el FreeMarker
 *              guardado en la AS Plantilla Banco y el payload que lee
 *              (datos.nomina, datos.pagos, alias jsonString, como AS_NSP_018).
 *
 *              El archivo no se guarda: se crea en memoria para responderlo
 *              como descarga. Windows-1252, el encoding de los archivos que
 *              hoy reciben los bancos (2WIN).
 *
 * CHANGELOG v1.0.0 (2026-11-11):
 * - [FEAT] construirArchivo.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/render', 'N/file', '../constants/AS_NominaReembolsoConstants'],
    (render, file, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * El nombre sigue al de 2WIN: NominaReembolso-idNomina-fecha sin barras.
     */
    function construirArchivo(plantilla, nomina, pagos) {
        const renderizador = render.create();

        renderizador.templateContent = plantilla.contenido;
        renderizador.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias : 'jsonString',
            data  : { text: JSON.stringify({ nomina: nomina, pagos: pagos }) },
        });

        return file.create({
            name    : CONSTANTES.ARCHIVO.PREFIJO + '-' + nomina.id + '-' + nomina.fecha.split('/').join('') + '.txt',
            fileType: file.Type.PLAINTEXT,
            contents: renderizador.renderAsString(),
            encoding: file.Encoding.WINDOWS_1252,
        });
    }

    return {
        construirArchivo: construirArchivo,
    };
});
