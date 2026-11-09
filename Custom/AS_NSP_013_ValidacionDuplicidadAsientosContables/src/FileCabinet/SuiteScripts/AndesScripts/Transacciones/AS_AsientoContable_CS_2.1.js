/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_AsientoContable_CS_2.1.js
 * @description Ver ARQUITECTURA.md, sección "Las tres piezas", para el detalle de por qué
 *              el reintento de guardado se hace simulando el click del botón nativo de
 *              NetSuite en vez de currentRecord.save() (no existe del lado cliente), de
 *              document.forms.submit() (salta el pipeline de NetSuite), o de devolver la
 *              Promise de dialog.confirm() directamente (NetSuite no la espera).
 *              Ver también la sección "Campos obligatorios por tipo de cuenta" para el
 *              validateLine y el resguardo en saveRecord (independientes de la duplicidad).
 */
define(['./handlers/AS_AsientoContableHandler', 'N/ui/dialog', 'N/https', 'N/log'], (AsientoContableHandler, dialog, https, log) => {


    const IDS_BOTON_GUARDAR = ['btn_multibutton_submitter', 'spanEDIT_bottom', 'spanEDIT', 'spanSAVE_bottom', 'spanSAVE'];

    // Formulario Andes - Diario Contable: unico donde aplica la regla de campos obligatorios.
    const FORMULARIO_DIARIO_CONTABLE = 273;

    const SCRIPT_ID_VALIDACION = 'customscript_as_val_dup_asiento_stlt';
    const DEPLOY_ID_VALIDACION = 'customdeploy_as_val_dup_asiento_stlt';

    let continuarTrasConfirmar = false;

    const clickBotonGuardarNativo = () => {
        for (const id of IDS_BOTON_GUARDAR) {
            const contenedor = document.getElementById(id);
            if (!contenedor) continue;

            const boton = contenedor.matches('input, a, button') ? contenedor : contenedor.querySelector('input, a, button');
            if (boton && typeof boton.click === 'function') {
                boton.click();
                return true;
            }
        }
        return false;
    };

    const consultarValidacion = (currentRecord, validarCampos) => {
        const respuesta = https.requestSuitelet({
            scriptId    : SCRIPT_ID_VALIDACION,
            deploymentId: DEPLOY_ID_VALIDACION,
            headers     : { 'Content-Type': 'application/json' },
            body        : JSON.stringify({
                journalId: currentRecord.id,
                validarCampos,
                lineas: AsientoContableHandler.leerLineasRegistro(currentRecord)
            })
        });

        if (respuesta.code !== 200) throw new Error('Suitelet de validacion respondio ' + respuesta.code + ': ' + respuesta.body);

        return JSON.parse(respuesta.body);
    };

    const validateLine = (context) => {
        const customForm = Number(
            context.currentRecord.getValue({ fieldId: 'customform' })
        );

        if (customForm !== FORMULARIO_DIARIO_CONTABLE) return true;

        return AsientoContableHandler.validarCamposObligatoriosLinea(context, dialog);
    };

    const saveRecord = (context) => {
        try {
            const currentRecord = context.currentRecord;

            if (continuarTrasConfirmar) {
                continuarTrasConfirmar = false;
                return true;
            }

            const customForm = Number(currentRecord.getValue({ fieldId: 'customform' }));
            const { camposFaltantes, internos, externos, alertasSaldo, avisosSaldo } = consultarValidacion(currentRecord, customForm === FORMULARIO_DIARIO_CONTABLE);

            if (camposFaltantes.length) {
                dialog.alert({
                    title: 'Campos requeridos',
                    message: camposFaltantes.join('<br>')
                });
                return false;
            }

            if (alertasSaldo.length) {
                dialog.alert({
                    title: 'Saldo excedido',
                    message: alertasSaldo.concat(externos).join('<br><br>')
                });
                return false;
            }

            if (externos.length) {
                dialog.alert({
                    title: 'Duplicidad de Asiento Contable',
                    message: externos.join('<br><br>')
                });
                return false;
            }

            const avisos = avisosSaldo.concat(internos);
            if (avisos.length) {
                const titulo = avisosSaldo.length ? 'Sin saldo vigente' : 'Posible duplicidad en este asiento';

                dialog.confirm({
                    title: titulo,
                    message: avisos.join('<br><br>') + '<br><br>¿Deseas continuar de todas formas?',
                    buttons: [
                        { label: 'Guardar de todas formas', value: true },
                        { label: 'Cancelar', value: false }
                    ]
                }).then((confirmado) => {
                    if (!confirmado) return;

                    continuarTrasConfirmar = true;
                    const disparado = clickBotonGuardarNativo();

                    if (!disparado) {
                        continuarTrasConfirmar = false;
                        log.error({
                            title: 'CS saveRecord - reintento tras confirm',
                            details: 'No se encontró el botón nativo de Guardar en el DOM (revisar IDS_BOTON_GUARDAR).'
                        });
                        dialog.alert({
                            title: 'No se pudo guardar automáticamente',
                            message: 'Hacé click en Guardar nuevamente para completar el guardado.'
                        });
                    }
                }).catch((e) => {
                    log.error({ title: 'CS saveRecord - dialog.confirm', details: e && e.message });
                });

                return false;
            }

            return true;
        } catch (e) {
            log.error({ title: 'CS saveRecord - AS_AsientoContable', details: e.message });
            throw e;
        }
    };

    return { validateLine, saveRecord };
});
