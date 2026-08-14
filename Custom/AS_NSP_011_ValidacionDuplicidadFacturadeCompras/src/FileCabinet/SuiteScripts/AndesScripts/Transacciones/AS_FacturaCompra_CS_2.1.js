
/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/search', 'N/ui/dialog'], (search, dialog) => {

    const pageInit = (context) => {
        const currentRecord = context.currentRecord;

        const customForm = Number(
            currentRecord.getValue({
                fieldId: 'customform'
            })
        );

        currentRecord.setValue({
            fieldId: 'custbody_as_es_honorario_sin_dte',
            value: customForm === 117,
            ignoreFieldChange: true
        });

        console.log(
            'PAGE INIT HONORARIO | form:',
            customForm,
            '| valor:',
            customForm === 117
        );
    };
        

    const saveRecord = (context) => {
            console.log('>>> ENTRO AS DUPLICIDAD <<<');

        const currentRecord = context.currentRecord;

        const idInterno = currentRecord.id || '0';
        const proveedor = currentRecord.getValue({ fieldId: 'entity' });
        const subsidiaria = currentRecord.getValue({ fieldId: 'subsidiary' });
        const folio = currentRecord.getValue({ fieldId: 'tranid' });
        const tipoDteSii = currentRecord.getValue({fieldId: 'custbody_2wintipodtesii'});
        const esHonorario = currentRecord.getValue({fieldId: 'custbody_as_es_honorario_sin_dte'});

        if (!proveedor) {
            dialog.alert({
                title: 'Campo requerido',
                message: 'Debe seleccionar un proveedor.'
            });
            return false;dake
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
                message: 'Debe ingresar el folio.'
            });
            return false;
        }

        const filtros = [
            ['type', 'anyof', 'VendBill'],
            'AND',
            ['entity', 'anyof', proveedor],
            'AND',
            ['subsidiary', 'anyof', subsidiaria],
            'AND',
            ['number', 'equalto', folio],
            'AND',
            ['mainline', 'is', 'T']
        ];

        if (esHonorario) {
            filtros.push(
                'AND',
                ['custbody_as_es_honorario_sin_dte', 'is', 'T'],
                'AND',
                ['custbody_2wintipodtesii', 'isempty', '']
            );
        } else {
            filtros.push(
                'AND',
                ['custbody_2wintipodtesii', 'anyof', tipoDteSii]
            );
        }

        if (idInterno !== '0') {
            filtros.push(
                'AND',
                ['internalidnumber', 'notequalto', idInterno]
            );
        }
        const resultado = search.create({
            type: search.Type.VENDOR_BILL,
            filters: filtros,
            columns: [
                'internalid',
                'transactionnumber'
            ]
        }).run().getRange({
            start: 0,
            end: 1
        });

        if (resultado && resultado.length > 0) {

            const billDuplicadaId = resultado[0].getValue({
                name: 'internalid'
            });

            const transactionNumber = resultado[0].getValue({
                name: 'transactionnumber'
            });

            dialog.alert({
                title: 'Documento duplicado',
                message:
                    'Ya existe un documento con el folio ' + folio +
                    ' para el mismo proveedor y subsidiaria.' +
                    '<br><br>Transacción: ' + transactionNumber +
                    '<br>ID interno: ' + billDuplicadaId
            });

            return false;
        }

        return true;
    };

    return {
        pageInit,
        saveRecord
    };
});
