/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Todo el comportamiento del User Event sobre la Factura de Compra.
 *              Si algo se ve mal en la pantalla de la factura, es aqui.
 *
 *              construirVista hace dos cosas segun como se entro. En una vista
 *              normal solo pinta el boton. Cuando el boton recarga la pagina con
 *              su marca en la URL, decide entre tres finales: la factura ya se
 *              reclasifico y muestra el enlace al diario, le falta algo y muestra
 *              la lista de lo que hay que completar, o esta lista y encola la
 *              tarea que crea el diario.
 *
 *              La lista de faltantes se arma completa de una pasada, no de a uno,
 *              para que el usuario corrija todo junto en vez de descubrir un
 *              pendiente nuevo en cada intento.
 *
 *              El Payment Hold es el faltante que menos se entiende, por eso su
 *              mensaje explica el porque: con la factura retenida NetSuite no la
 *              lista en el select de transaccion relacionada y el diario no se
 *              puede aplicar.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/task', 'N/ui/message', '../lib/AS_FactoringConstants'],
    (task, message, CONSTANTES) => {

    const construirVista = (context) => {
        if (context.type !== context.UserEventType.VIEW) {
            return;
        }

        agregarBoton(context.form);

        if (context.request.parameters[CONSTANTES.BOTON.PARAMETRO] !== CONSTANTES.BOTON.MARCA) {
            return;
        }

        const diario = context.newRecord.getValue({ fieldId: CONSTANTES.CAMPOS.DIARIO });

        if (diario) {
            avisar(context.form, message.Type.INFORMATION, CONSTANTES.MENSAJES.TITULO_LISTA,
                   CONSTANTES.MENSAJES.CON_DIARIO + enlaceDiario(diario));

            return;
        }

        const faltantes = faltantesDeLaFactura(context.newRecord);

        if (faltantes.length) {
            avisar(context.form, message.Type.WARNING, CONSTANTES.MENSAJES.TITULO_PENDIENTE,
                   listaDeFaltantes(faltantes));

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

    const faltantesDeLaFactura = (factura) => {
        const faltantes = [];

        if (factura.getValue({ fieldId: CONSTANTES.CAMPOS.APROBACION }) !== CONSTANTES.APROBACION_APROBADA) faltantes.push(CONSTANTES.MENSAJES.SIN_APROBAR);
        if (!factura.getValue({ fieldId: CONSTANTES.CAMPOS.FACTORING })) faltantes.push(CONSTANTES.MENSAJES.SIN_FACTORING);
        if (!factura.getValue({ fieldId: CONSTANTES.CAMPOS.FACTOR }))    faltantes.push(CONSTANTES.MENSAJES.SIN_FACTOR);
        if (factura.getValue({ fieldId: CONSTANTES.CAMPOS.HOLD }))       faltantes.push(CONSTANTES.MENSAJES.CON_HOLD);

        return faltantes;
    };

    const listaDeFaltantes = (faltantes) => {
        return CONSTANTES.MENSAJES.ENCABEZADO_PENDIENTE
             + '<ul style="margin:8px 0 0 18px;padding:0;">'
             + faltantes.map((faltante) => '<li style="margin-bottom:4px;">' + faltante + '</li>').join('')
             + '</ul>';
    };

    const enlaceDiario = (idDiario) => {
        return '<a href="/app/accounting/transactions/transaction.nl?id=' + idDiario + '" target="_blank">'
             + 'diario ' + idDiario + '</a>.';
    };

    const avisar = (form, tipo, titulo, texto) => {
        form.addPageInitMessage({
            type   : tipo,
            title  : titulo,
            message: texto,
        });
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

    return { construirVista: construirVista };
});
