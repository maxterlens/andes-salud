/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['../services/AsientoDiarioService', 'N/log'], (AsientoDiarioService, log) => {

    const FIELD_APLICAR        = 'custcol_as_aplicar_trans_relacionada';
    const FIELD_TRANS_RELAC    = 'custcol_as_transaccion_relacionada';
    const FIELD_ACCOUNT        = 'account';
    const FIELD_ENTITY         = 'entity';
    const FIELD_DEBIT          = 'debit';
    const FIELD_APPROVAL_STATUS = 'approvalstatus';
    const SUBLIST_LINE         = 'line';

    const APPROVAL_PENDING = '1';

    // ─── Funcionalidades afterSubmit ─────────────────────────────────────────

    const aplicarTransaccionesRelacionadas = (context) => {
        const { newRecord, type, UserEventType } = context;

        if (type === UserEventType.DELETE) return;

        const approvalStatus = newRecord.getValue({ fieldId: FIELD_APPROVAL_STATUS }) || '';
        log.error('approvalStatus', approvalStatus);
        if (approvalStatus == APPROVAL_PENDING) return;

        const journalId = newRecord.id;
        const lineCount = newRecord.getLineCount({ sublistId: SUBLIST_LINE });
        const lineas    = [];

        for (let i = 0; i < lineCount; i++) {
            const aplicar       = newRecord.getSublistValue({ sublistId: SUBLIST_LINE, fieldId: FIELD_APLICAR,     line: i });
            const transaccionId = newRecord.getSublistValue({ sublistId: SUBLIST_LINE, fieldId: FIELD_TRANS_RELAC, line: i });

            if (!aplicar || !transaccionId) continue;

            const account = newRecord.getSublistValue({ sublistId: SUBLIST_LINE, fieldId: FIELD_ACCOUNT, line: i });
            const entity  = newRecord.getSublistValue({ sublistId: SUBLIST_LINE, fieldId: FIELD_ENTITY,  line: i });
            const debit   = Number(newRecord.getSublistValue({ sublistId: SUBLIST_LINE, fieldId: FIELD_DEBIT, line: i }) || 0);

            lineas.push({ transaccionId, account, entity, importe: debit });
        }

        if (lineas.length === 0) return;

        log.error({ title: 'AsientoDiarioHandler', details: `Journal ${journalId}: ${lineas.length} línea(s) con aplicación pendiente.` });

        AsientoDiarioService.procesarAplicaciones(journalId, lineas);
    };

    // ─── Triggers (índice público) ───────────────────────────────────────────

    return { aplicarTransaccionesRelacionadas };
});
