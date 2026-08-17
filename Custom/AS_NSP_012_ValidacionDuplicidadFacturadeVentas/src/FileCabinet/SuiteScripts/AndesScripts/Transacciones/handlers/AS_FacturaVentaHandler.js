/**
 * @NApiVersion 2.1
 */
define(['N/search', 'N/ui/dialog'], (search, dialog) => {

    const validarDuplicidad = (currentRecord) => {

        const idInterno = currentRecord.id || '0';
        const cliente = currentRecord.getValue({fieldId: 'entity'});
        const subsidiaria = currentRecord.getValue({fieldId: 'subsidiary'});
        const folio = currentRecord.getValue({fieldId: 'custbody_2winfolioacepta'});
        const tipoDteSii = currentRecord.getValue({fieldId: 'custbody_2wintipodtesii'});


        if (!cliente) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'Debe seleccionar un cliente.'
            });
            return false;
        }


        if (!subsidiaria) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'Debe seleccionar una subsidiaria.'
            });
            return false;
        }


        if (!folio) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'Debe ingresar el Folio Acepta.'
            });
            return false;
        }

        if (!tipoDteSii) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'Debe seleccionar el Tipo DTE SII Acepta.'
            });
            return false;
        }


        const filtros = [
            ['type', 'anyof', 'CustInvc'],
            'AND',
            ['entity', 'anyof', cliente],
            'AND',
            ['subsidiary', 'anyof', subsidiaria],
            'AND',
            ['custbody_2winfolioacepta', 'equalto', folio],
            'AND',
            ['custbody_2wintipodtesii', 'anyof', tipoDteSii],
            'AND',
            ['mainline', 'is', 'T']
        ];


        if (idInterno !== '0') {
            filtros.push(
                'AND',
                ['internalidnumber', 'notequalto', idInterno]
            );
        }


        const resultado = search.create({
            type: search.Type.INVOICE,
            filters: filtros,
            columns: [
                'internalid',
                'tranid'
            ]
        }).run().getRange({
            start: 0,
            end: 1
        });


        if (resultado && resultado.length > 0) {

            const invoiceDuplicadaId = resultado[0].getValue({
                name: 'internalid'
            });

            const documentNumber = resultado[0].getValue({
                name: 'tranid'
            });


            dialog.alert({
                title: 'Documento duplicado',
                message:
                    'Ya existe una factura de venta con el Folio Acepta ' + folio +
                    ' para el mismo cliente, subsidiaria y Tipo DTE SII.' +
                    '<br><br>Transacción: ' + documentNumber +
                    '<br>ID interno: ' + invoiceDuplicadaId
            });

            return false;
        }


        return true;
    };


    return {
        validarDuplicidad
    };

});