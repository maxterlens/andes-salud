define(['N/record'],

    function (record) {


        function save(facturas, gastos, id_subsidiaria) {

            try {

                var journalRecord = record.create({ type: record.Type.JOURNAL_ENTRY, isDynamic: true }); 
                journalRecord.setValue({ fieldId: 'subsidiary', value: id_subsidiaria });

                // Reversar las facturas de compra
                log.debug('save', 'Total facturas a reversar: ' + facturas.length);
                facturas.forEach(function (factura) {

                    var journalRecordDebit = journalRecord.selectNewLine({ sublistId: 'line' });
                    journalRecordDebit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: factura.id_cuenta });
                    journalRecordDebit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'entity', value: factura.id_proveedor });
                    journalRecordDebit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'debit', value: factura.credito });
                    journalRecordDebit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'credit', value: 0 });                
                    journalRecordDebit.commitLine({ sublistId: 'line' });
                    
                });

                // Reversar el gasto
                log.debug('save', 'Total gastos a reversar: ' + gastos.length);
                gastos.forEach(function (gasto) {
                    
                    var journalRecordCredit = journalRecord.selectNewLine({ sublistId: 'line' });
                    journalRecordCredit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: gasto.id_cuenta });
                    journalRecordCredit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'entity', value: gasto.id_empleado });
                    journalRecordCredit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'debit', value: 0 });
                    journalRecordCredit.setCurrentSublistValue({ sublistId: 'line', fieldId: 'credit', value: gasto.debito });
                    journalRecordCredit.commitLine({ sublistId: 'line' });

                });                

                return journalRecord.save({ ignoreMandatoryFields: true });
                
            } catch (error) {
                log.error("save - error", error);
                throw error;
            }
            
        }

        return {
            save: save
        }
    }
);
