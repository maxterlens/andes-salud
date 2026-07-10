/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/currentRecord'], (currentRecord) => {

    // ─── Constantes ───────────────────────────────────────────────────────────

    const BANNER_ID = 'as_alerta_factura_pagada_inferior';

    const ESTILOS_BANNER = [
        'display:flex',
        'align-items:flex-start',
        'gap:12px',
        'background:#fff3cd',
        'border:1px solid #ffc107',
        'border-left:4px solid #f0a500',
        'border-radius:4px',
        'padding:12px 16px',
        'margin:4px 0 0',
        'font-family:Arial,sans-serif',
        'font-size:13px',
        'color:#664d03',
        'line-height:1.6',
        'box-shadow:0 1px 4px rgba(0,0,0,0.08)',
    ].join(';');

    const CONTENIDO_BANNER = `
        <span style="font-size:20px;line-height:1.4;flex-shrink:0;">⚠️</span>
        <div>
            <strong>Factura Totalmente Pagada — Acción Requerida Antes de Editar</strong><br>
            Esta factura de compra ha sido <strong>liquidada en su totalidad</strong>.
            Cualquier modificación podría comprometer la integridad de los registros contables,
            los comprobantes de pago asociados y los reportes financieros.<br>
            Si necesitas realizar un ajuste, por favor
            <strong>contacta al equipo de Finanzas o Contabilidad</strong>
            antes de continuar, para coordinar el proceso correcto y evitar
            inconsistencias en los libros.
        </div>
    `;

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Busca la barra de botones inferior del formulario NetSuite.
     * En el HTML real de NetSuite el contenedor tiene la clase
     * 'uir-buttons-bottom'. Se mantienen selectores alternativos
     * como fallback ante cambios entre versiones.
     * @returns {HTMLElement|null}
     */
    const obtenerBaraBotonesInferior = () =>
        document.querySelector('.uir-buttons-bottom') ||
        document.getElementById('div__bodytab') ||
        document.querySelector('[id$="__bodytab"]');

    /**
     * Crea e inserta el banner de advertencia justo encima
     * de la barra de botones inferior.
     */
    const insertarBannerInferior = () => {
        if (document.getElementById(BANNER_ID)) return; // idempotente

        const baraBotones = obtenerBaraBotonesInferior();
        if (!baraBotones) return;

        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.style.cssText = ESTILOS_BANNER;
        banner.innerHTML = CONTENIDO_BANNER;

        baraBotones.parentNode.insertBefore(banner, baraBotones);
    };

    // ─── Entry points ─────────────────────────────────────────────────────────

    const pageInit = (context) => {
        if (context.mode !== 'edit') return;

        const record = currentRecord.get();
        if (record.getValue({ fieldId: 'statusRef' }) !== 'paidInFull') return;

        // Garantizar que el DOM esté listo antes de manipularlo
        if (document.readyState === 'complete') {
            insertarBannerInferior();
        } else {
            window.addEventListener('load', insertarBannerInferior, { once: true });
        }
    };

    return { pageInit };
});
