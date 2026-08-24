/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */

/**
 * AS_AlertaContactoNotificacionOC_CS_2.1.js
 *
 * Client Script: Alerta de Contacto de Notificación - Orden de Compra
 *
 * Avisa al guardar cuando la OC no tiene Contacto de Notificación y tampoco
 * está marcada la agrupación por proveedor, escenario en el que el correo de
 * aprobación llegará únicamente al creador de la OC.
 *
 * Se usa alert() y no N/ui/dialog porque el diálogo es asíncrono: NetSuite no
 * espera su Promise, continúa el guardado y la recarga de página lo cierra solo.
 *
 * El aviso es informativo: el guardado siempre continúa.
 *
 * @author      Andes Salud
 * @version     2.1
 */

define([], () => {

    const saveRecord = (context) => {

        const rec      = context.currentRecord;
        const contacto = rec.getValue({ fieldId: 'custbody_as_contacto_notif' });
        const agrupar  = rec.getValue({ fieldId: 'custbody_as_agrupar_contacto_prov' });

        if (contacto || agrupar) return true;

        alert(
            'Esta Orden de Compra no tiene Contacto de Notificación configurado.\n\n' +
            'Al aprobarse, el correo llegará únicamente al creador de la OC.'
        );

        return true;
    };

    return { saveRecord };
});
