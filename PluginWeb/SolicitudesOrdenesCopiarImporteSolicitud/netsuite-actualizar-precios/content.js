/**
 * content.js — Mundo: ISOLATED (default)
 *
 * Responsabilidad única: inyectar el script de lógica en el contexto de la
 * página, insertar el botón "Actualizar Precios" en la barra de NetSuite y
 * despachar un CustomEvent cuando el usuario lo presiona.
 *
 * NO contiene lógica de negocio ni referencias a la API de NetSuite.
 * La comunicación con ns-update-prices.js se realiza exclusivamente mediante
 * el evento personalizado definido en EVENTS.updatePrices.
 *
 * Compatibilidad: Chrome 88+ (Manifest V3 baseline).
 * ns-update-prices.js se inyecta vía <script src> (web_accessible_resources)
 * para que corra en el mundo MAIN de la página y tenga acceso a `require`.
 */

'use strict';

// ---------------------------------------------------------------------------
// Constantes de configuración
// ---------------------------------------------------------------------------

const SELECTORS = Object.freeze({
  buttonRow  : 'tr.uir-buttons',
  buttonTable: 'tbl__updatePrices',
  buttonInput: '_updatePrices',
});

const EVENTS = Object.freeze({
  updatePrices: 'ns:updatePrices',
});

// ---------------------------------------------------------------------------
// PageScriptInjector — inyecta ns-update-prices.js en el mundo MAIN de la
// página a través de un <script src> declarado en web_accessible_resources.
// Se ejecuta una sola vez al iniciar el content script.
// ---------------------------------------------------------------------------

const PageScriptInjector = {
  inject(filename) {
    const script  = document.createElement('script');
    script.src    = chrome.runtime.getURL(filename);
    script.onload = () => script.remove();
    (document.head ?? document.documentElement).appendChild(script);
  },
};

// ---------------------------------------------------------------------------
// ButtonTemplate — construye el marcado del botón siguiendo el Design System
// de NetSuite (estructura de tabla + clases uir-button).
// Los efectos hover de NetSuite (setButtonDown) se registran via addEventListener
// para evitar inline handlers, que están bloqueados en MV3.
// ---------------------------------------------------------------------------

const ButtonTemplate = {
  /**
   * Devuelve el elemento <td> listo para insertar en la barra de botones.
   * @returns {HTMLTableCellElement}
   */
  create() {
    const td = document.createElement('td');

    td.innerHTML = `
      <table id="tbl__updatePrices" cellpadding="0" cellspacing="0" border="0"
        class="uir-button" style="margin-right:6px;" role="presentation">
        <tbody>
          <tr id="tr__updatePrices" class="pgBntG">
            <td id="tdleftcap__updatePrices">
              <img src="/images/nav/ns_x.gif" class="bntLT" border="0" height="50%" width="3" alt="">
              <img src="/images/nav/ns_x.gif" class="bntLB" border="0" height="50%" width="3" alt="">
            </td>
            <td id="tdbody__updatePrices" height="20" valign="top" nowrap class="bntBgB">
              <input
                type="button"
                id="_updatePrices"
                name="_updatePrices"
                value="Actualizar Precios"
                class="rndbuttoninpt bntBgT"
                style="background: linear-gradient(to bottom, #003CA6 0%, #343333 100%) !important; cursor:pointer; color: #FFFFFF !important;"
                data-nsps-type="button"
                data-nsps-label="Actualizar Precios">
            </td>
            <td id="tdrightcap__updatePrices">
              <img src="/images/nav/ns_x.gif" height="50%" class="bntRT" border="0" width="3" alt="">
              <img src="/images/nav/ns_x.gif" height="50%" class="bntRB" border="0" width="3" alt="">
            </td>
          </tr>
        </tbody>
      </table>`;

    return td;
  },
};

// ---------------------------------------------------------------------------
// ButtonController — gestiona la inserción del botón y sus event listeners.
// ---------------------------------------------------------------------------

const ButtonController = {
  /**
   * Inserta el botón en la barra de botones si aún no existe.
   */
  inject() {
    if (document.getElementById(SELECTORS.buttonTable)) return;

    const buttonRow = document.querySelector(SELECTORS.buttonRow);
    if (!buttonRow) return;

    const td      = ButtonTemplate.create();
    const firstTd = buttonRow.querySelector('td');

    firstTd?.nextSibling
      ? buttonRow.insertBefore(td, firstTd.nextSibling)
      : buttonRow.appendChild(td);

    this._bindEvents();
  },

  /**
   * Registra los event listeners del botón:
   *  - click   → despacha el CustomEvent hacia ns-update-prices.js (MAIN world)
   *  - mouse*  → efectos hover de NetSuite via setButtonDown (llamada en MAIN world)
   */
  _bindEvents() {
    const btn = document.getElementById(SELECTORS.buttonInput);
    if (!btn) return;

    // Acción principal: notificar a ns-update-prices.js
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent(EVENTS.updatePrices));
    });

    // Efectos visuales hover de NetSuite — se despachan como eventos al MAIN world
    btn.addEventListener('mousedown', () => {
      btn.setAttribute('_mousedown', 'T');
      window.dispatchEvent(new CustomEvent('ns:buttonDown', { detail: { state: true } }));
    });
    btn.addEventListener('mouseup', () => {
      btn.setAttribute('_mousedown', 'F');
      window.dispatchEvent(new CustomEvent('ns:buttonDown', { detail: { state: false } }));
    });
    btn.addEventListener('mouseout', () => {
      if (btn.getAttribute('_mousedown') === 'T') {
        window.dispatchEvent(new CustomEvent('ns:buttonDown', { detail: { state: false } }));
      }
    });
    btn.addEventListener('mouseover', () => {
      if (btn.getAttribute('_mousedown') === 'T') {
        window.dispatchEvent(new CustomEvent('ns:buttonDown', { detail: { state: true } }));
      }
    });
  },
};

// ---------------------------------------------------------------------------
// DOMWatcher — observa el DOM hasta que el elemento objetivo esté disponible.
// Necesario porque NetSuite renderiza su interfaz de forma dinámica.
// ---------------------------------------------------------------------------

const DOMWatcher = {
  /**
   * Ejecuta `callback` en cuanto `selector` aparezca en el DOM.
   * @param {string}   selector - Selector CSS a esperar.
   * @param {Function} callback - Función a ejecutar al detectarlo.
   */
  waitFor(selector, callback) {
    if (document.querySelector(selector)) {
      callback();
      return;
    }

    const observer = new MutationObserver((_, obs) => {
      if (document.querySelector(selector)) {
        obs.disconnect();
        callback();
      }
    });

    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree  : true,
    });
  },
};

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

// 1. Inyectar el script de lógica NetSuite en el mundo MAIN de la página
PageScriptInjector.inject('ns-update-prices.js');

// 2. Esperar el DOM e insertar el botón
DOMWatcher.waitFor(SELECTORS.buttonRow, () => ButtonController.inject());
