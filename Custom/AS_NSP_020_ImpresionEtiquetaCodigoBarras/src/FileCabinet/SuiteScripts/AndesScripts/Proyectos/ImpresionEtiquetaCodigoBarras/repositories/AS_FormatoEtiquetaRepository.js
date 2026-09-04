/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search', '../lib/AS_EtiquetaArticuloConstants'],
    (search, CONSTANTES) => {

    const buscarFormatos = () => {
        const formatos = [];

        search.create({
            type   : CONSTANTES.FORMATO.RECORD,
            filters: [['isinactive', 'is', 'F']],
            columns: [
                'name',
                CONSTANTES.FORMATO.SUBSIDIARIA,
                CONSTANTES.FORMATO.ANCHO,
                CONSTANTES.FORMATO.ALTO,
                CONSTANTES.FORMATO.Y_NOMBRE,
                CONSTANTES.FORMATO.FUENTE_NOMBRE,
                CONSTANTES.FORMATO.LINEAS_NOMBRE,
                CONSTANTES.FORMATO.Y_CODIGO,
                CONSTANTES.FORMATO.ALTO_CODIGO,
                CONSTANTES.FORMATO.MODULO,
            ],
        }).run().each((resultado) => {
            formatos.push({
                id               : resultado.id,
                nombre           : resultado.getValue({ name: 'name' }),
                subsidiariaId    : resultado.getValue({ name: CONSTANTES.FORMATO.SUBSIDIARIA }),
                subsidiariaNombre: resultado.getText({ name: CONSTANTES.FORMATO.SUBSIDIARIA }),
                ancho        : Number(resultado.getValue({ name: CONSTANTES.FORMATO.ANCHO })),
                alto         : Number(resultado.getValue({ name: CONSTANTES.FORMATO.ALTO })),
                yNombre      : Number(resultado.getValue({ name: CONSTANTES.FORMATO.Y_NOMBRE })),
                fuenteNombre : Number(resultado.getValue({ name: CONSTANTES.FORMATO.FUENTE_NOMBRE })),
                lineasNombre : Number(resultado.getValue({ name: CONSTANTES.FORMATO.LINEAS_NOMBRE })),
                yCodigo      : Number(resultado.getValue({ name: CONSTANTES.FORMATO.Y_CODIGO })),
                altoCodigo   : Number(resultado.getValue({ name: CONSTANTES.FORMATO.ALTO_CODIGO })),
                modulo       : Number(resultado.getValue({ name: CONSTANTES.FORMATO.MODULO })),
            });

            return true;
        });

        return formatos;
    };

    return { buscarFormatos: buscarFormatos };
});
