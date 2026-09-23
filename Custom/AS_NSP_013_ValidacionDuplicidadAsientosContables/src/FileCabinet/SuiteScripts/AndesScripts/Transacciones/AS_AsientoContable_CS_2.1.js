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
define(['./handlers/AS_AsientoContableHandler', 'N/ui/dialog', 'N/log'], (AsientoContableHandler, dialog, log) => {

    // Id confirmado del botón "Guardar" en esta cuenta: es un input type="submit" del
    // widget "multibutton" de NetSuite (name="multibutton_submitter"), cuyo onclick llama
    // a getNLMultiButtonByName('multibutton_submitter').onMainButtonClick(this) — por eso
    // .click() funciona bien acá: dispara ese mismo onclick, que es el que hace todo el
    // trabajo real de guardado (a diferencia de un form.submit() directo, que lo saltearía).
    // Los demás quedan de fallback por si en otro tipo de formulario cambia el id.
    const IDS_BOTON_GUARDAR = ['btn_multibutton_submitter', 'spanEDIT_bottom', 'spanEDIT', 'spanSAVE_bottom', 'spanSAVE'];

    let continuarConDuplicidadInterna = false;

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

    const validateLine = (context) => {
        const customForm = Number(
            context.currentRecord.getValue({ fieldId: 'customform' })
        );

        if (customForm !== 115) return true;

        return AsientoContableHandler.validarCamposObligatoriosLinea(context, dialog);
    };

    const saveRecord = (context) => {
        try {
            const currentRecord = context.currentRecord;

            const customForm = Number(currentRecord.getValue({ fieldId: 'customform' }));
            if (customForm === 115 && !AsientoContableHandler.validarTodasLasLineasCamposObligatorios(currentRecord, dialog)) {
                return false;
            }

            if (continuarConDuplicidadInterna) {
                continuarConDuplicidadInterna = false;
                return true;
            }

            const { internos, externos } = AsientoContableHandler.validar(currentRecord);

            if (externos.length) {
                dialog.alert({
                    title: 'Duplicidad de Asiento Contable',
                    message: externos.concat(internos).join('<br><br>')
                });
                return false;
            }

            if (internos.length) {
                dialog.confirm({
                    title: 'Posible duplicidad en este asiento',
                    message: internos.join('<br><br>') + '<br><br>¿Deseas continuar de todas formas?',
                    buttons: [
                        { label: 'Guardar de todas formas', value: true },
                        { label: 'Cancelar', value: false }
                    ]
                }).then((confirmado) => {
                    if (!confirmado) return;

                    continuarConDuplicidadInterna = true;
                    const disparado = clickBotonGuardarNativo();

                    if (!disparado) {
                        continuarConDuplicidadInterna = false;
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
