/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_create_customer_payment
 * @NModuleScope public
 */

define(['N/record', 'N/log'], function (record, log) {

  function createCustomerPayment(data) {
    try {
      log.audit('Inicio createCustomerPayment', data);

      var payment = record.create({
        type: record.Type.CUSTOMER_PAYMENT,
        isDynamic: true,
        defaultValues: {
          entity: Number(data.cliente),
          subsidiary: Number(data.subsidiaria)
        }
      });

    //   try { payment.setValue({ fieldId: 'autoapply', value: false }); } catch (e) {}

      payment.setValue({ fieldId: 'payment', value: Number(data.monto) });

      if (data.cuenta) {
        payment.setValue({ fieldId: 'account', value: Number(data.cuenta) });
      }
      var folioNCEsAlfanumerico = data.folio_doc_forma_pago && !/^[0-9]+$/.test(String(data.folio_doc_forma_pago));
      if (folioNCEsAlfanumerico) {
          payment.setValue({ fieldId: 'custbody_2winfolio_transbank', value: data.folio_doc_forma_pago });
      } else {
          payment.setValue({ fieldId: 'custbody_2winfolioacepta', value: data.folio_doc_forma_pago });
      }
      
      var invoiceId = Number(data.id_invoice);

      var count = payment.getLineCount({ sublistId: 'apply' });
      log.audit('Apply lineCount', count);

      var lineNum = payment.findSublistLineWithValue({
        sublistId: 'apply',
        fieldId: 'internalid',
        value: invoiceId
      });

      if (lineNum === -1) {
        var sample = [];
        for (var i = 0; i < Math.min(count, 10); i++) {
          sample.push({
            line: i,
            internalid: payment.getSublistValue({ sublistId: 'apply', fieldId: 'internalid', line: i }),
            doc: payment.getSublistValue({ sublistId: 'apply', fieldId: 'doc', line: i }),
            due: payment.getSublistValue({ sublistId: 'apply', fieldId: 'due', line: i }),
            amount: payment.getSublistValue({ sublistId: 'apply', fieldId: 'amount', line: i })
          });
        }

        log.error('Invoice no está en apply', {
          invoiceId: invoiceId,
          applyCount: count,
          sample: sample
        });

        throw new Error('No se encontró la factura ' + invoiceId + ' en la sublista apply');
      }

      payment.selectLine({ sublistId: 'apply', line: lineNum });
      payment.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply', value: true });
      payment.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'amount', value: Number(data.monto) });
      payment.commitLine({ sublistId: 'apply' });

      // Aplicar Journal de redondeo si existe
      if (data.id_journal) {
        var journalLineNum = payment.findSublistLineWithValue({
          sublistId: 'apply',
          fieldId: 'internalid',
          value: Number(data.id_journal)
        });

        if (journalLineNum !== -1) {
          payment.selectLine({ sublistId: 'apply', line: journalLineNum });
          payment.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply', value: true });
          payment.commitLine({ sublistId: 'apply' });
          log.audit('Journal de redondeo aplicado al pago', { journalId: data.id_journal, line: journalLineNum });
        } else {
          log.error('Journal de redondeo no encontrado en apply', { journalId: data.id_journal });
        }
      }

      var paymentId = payment.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });

      return { success: true, result: paymentId };

    } catch (e) {
      log.error('Error en createCustomerPayment', e);
      return { success: false, result: (e && e.message) ? e.message : String(e) };
    }
  }

  return { createCustomerPayment: createCustomerPayment };
});