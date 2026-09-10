/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/runtime', 'N/task', 'N/ui/message', '../repositories/AS_FacturaCompraRepository', '../lib/AS_FactoringConstants'],
    (runtime, task, message, facturaCompraRepository, CONSTANTES) => {

    const construirVista = (context) => {
        if (context.type !== context.UserEventType.VIEW) {
            return;
        }

        if (!CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) {
            return;
        }

        agregarBoton(context.form);

        if (context.request.parameters[CONSTANTES.BOTON.PARAMETRO] !== CONSTANTES.BOTON.MARCA) {
            return;
        }

        const diario = context.newRecord.getValue({ fieldId: CONSTANTES.CAMPOS.DIARIO });

        if (diario) {
            const nombreDiario = context.newRecord.getText({ fieldId: CONSTANTES.CAMPOS.DIARIO });

            avisar(context.form, message.Type.INFORMATION, CONSTANTES.MENSAJES.TITULO_LISTA,
                   CONSTANTES.MENSAJES.CON_DIARIO + armarEnlaceDiario(diario, nombreDiario));

            return;
        }

        const faltantes = obtenerFaltantes(context.newRecord);

        if (faltantes.length) {
            avisar(context.form, message.Type.WARNING, CONSTANTES.MENSAJES.TITULO_PENDIENTE,
                   armarListaFaltantes(faltantes));

            return;
        }

        if (!encolarDiario(context.newRecord.id)) {
            avisar(context.form, message.Type.WARNING, CONSTANTES.MENSAJES.TITULO_OCUPADO,
                   CONSTANTES.MENSAJES.OCUPADO);

            return;
        }

        avisar(context.form, message.Type.CONFIRMATION, CONSTANTES.MENSAJES.TITULO_ENCOLADA,
               CONSTANTES.MENSAJES.ENCOLADA);
    };

    const agregarBoton = (form) => {
        form.addButton({
            id          : CONSTANTES.BOTON.ID,
            label       : CONSTANTES.BOTON.LABEL,
            functionName: CONSTANTES.BOTON.ACCION,
        });

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;
    };

    const obtenerFaltantes = (factura) => {
        const faltantes = [];
        const factor    = factura.getValue({ fieldId: CONSTANTES.CAMPOS.FACTOR });

        if (factura.getValue({ fieldId: CONSTANTES.CAMPOS.APROBACION }) !== CONSTANTES.APROBACION_APROBADA) faltantes.push(CONSTANTES.MENSAJES.SIN_APROBAR);
        if (!factura.getValue({ fieldId: CONSTANTES.CAMPOS.FACTORING })) faltantes.push(CONSTANTES.MENSAJES.SIN_FACTORING);
        if (!factor)                                                     faltantes.push(CONSTANTES.MENSAJES.SIN_FACTOR);
        if (factura.getValue({ fieldId: CONSTANTES.CAMPOS.HOLD }))       faltantes.push(CONSTANTES.MENSAJES.CON_HOLD);

        if (factor) {
            const subsidiarias = facturaCompraRepository.obtenerSubsidiariasDelFactor(factor);

            if (!subsidiarias.includes(factura.getValue({ fieldId: 'subsidiary' }))) faltantes.push(armarMensajeSubsidiaria(factura));
        }

        return faltantes;
    };

    const encolarDiario = (idFactura) => {
        const tarea = task.create({
            taskType    : task.TaskType.MAP_REDUCE,
            scriptId    : CONSTANTES.MAPREDUCE.SCRIPT,
            deploymentId: CONSTANTES.MAPREDUCE.DEPLOYMENT,
            params      : { [CONSTANTES.MAPREDUCE.FACTURA]: idFactura },
        });

        try {
            const idTarea = tarea.submit();

            log.audit({
                title  : CONSTANTES.LOGS.ENCOLADA,
                details: 'factura: ' + idFactura + ' | tarea: ' + idTarea,
            });

            return true;
        } catch (fallo) {
            log.audit({
                title  : CONSTANTES.LOGS.OCUPADO,
                details: 'factura: ' + idFactura + ' | motivo: ' + (fallo.message || fallo),
            });

            return false;
        }
    };

    const armarMensajeSubsidiaria = (factura) => {
        return CONSTANTES.MENSAJES.SIN_SUBSIDIARIA_INICIO
             + factura.getText({ fieldId: CONSTANTES.CAMPOS.FACTOR })
             + CONSTANTES.MENSAJES.SIN_SUBSIDIARIA_MEDIO
             + factura.getText({ fieldId: 'subsidiary' });
    };

    const armarListaFaltantes = (faltantes) => {
        return CONSTANTES.MENSAJES.ENCABEZADO_PENDIENTE
             + '<ul style="margin:8px 0 0 18px;padding:0;">'
             + faltantes.map((faltante) => '<li style="margin-bottom:4px;">' + faltante + '</li>').join('')
             + '</ul>';
    };

    const armarEnlaceDiario = (idDiario, nombreDiario) => {
        return '<a href="/app/accounting/transactions/transaction.nl?id=' + idDiario + '" target="_blank">'
             + nombreDiario + '</a>.';
    };

    const avisar = (form, tipo, titulo, texto) => {
        form.addPageInitMessage({
            type   : tipo,
            title  : titulo,
            message: texto,
        });
    };

    return { construirVista: construirVista };
});
