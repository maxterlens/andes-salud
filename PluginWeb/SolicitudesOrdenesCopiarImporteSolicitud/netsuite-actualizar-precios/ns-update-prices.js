/**
 * ns-update-prices.js — Mundo: MAIN
 *
 * Responsabilidad única: escuchar el evento 'ns:updatePrices' y ejecutar la
 * lógica de negocio contra la API de NetSuite (N/currentRecord).
 *
 * Al correr en el mundo MAIN tiene acceso directo al objeto `require` de
 * NetSuite. NO manipula el DOM ni conoce la estructura del botón — solo
 * reacciona al evento que despacha content.js.
 */

'use strict';

// ---------------------------------------------------------------------------
// Configuración de la operación
// Centralizar estos valores facilita cambiarlos sin tocar la lógica.
// ---------------------------------------------------------------------------


const NS_CONFIG = {
  sublist: {
    items: 'items'
  },
  field: {
    orderrate: 'itemrate',
    estimatedrate: 'itemestimatedrate'
  }
}

const EVENTS = {
  updatePrices: 'ns:updatePrices',
};

// ---------------------------------------------------------------------------
// UpdatePricesService — encapsula la llamada a la API de NetSuite.
// ---------------------------------------------------------------------------

const UpdatePricesService = {
  /**
   * Recorre todas las líneas de la sublista y actualiza el campo de precio.
   * @param {Object} currentRecord - Instancia de currentRecord obtenida con NcurrentRecord.get().
   * @returns {{ updated: number }} Cantidad de líneas actualizadas.
   */
  applyToRecord(currentRecord) {
    const lines = currentRecord.getLineCount({ sublistId: NS_CONFIG.sublist.items });

    if (lines <= 0) {
      //throw new RangeError('No hay líneas en la sublista "' + NS_CONFIG.sublist.items + '".');
      alert('No hay líneas que copiar');
    }

    for (let i = 0; i < lines; i++) {
      currentRecord.selectLine({ sublistId: NS_CONFIG.sublist.items, line: i });
      let isDisabled = currentRecord.getSublistField({ sublistId: NS_CONFIG.sublist.items, fieldId: NS_CONFIG.field.orderrate, line: 0});
      if (isDisabled) continue;
      let estimatedRate = currentRecord.getSublistField({ sublistId: NS_CONFIG.sublist.items, fieldId: NS_CONFIG.field.estimatedrate, line});
      currentRecord.selectLine({ sublistId: NS_CONFIG.sublist.items, line: i });
      currentRecord.setCurrentSublistValue({
        sublistId: NS_CONFIG.sublist.items,
        fieldId: NS_CONFIG.field.orderrate,
        value: estimatedRate,
        ignoreFieldChange: false,
      });
    }

    return { updated: lines };
  },
};

// ---------------------------------------------------------------------------
// UpdatePricesAction — orquesta la carga del módulo y la ejecución del servicio.
// ---------------------------------------------------------------------------

const UpdatePricesAction = {
  execute() {
    try {
      require(['N/currentRecord'], (NcurrentRecord) => {
        try {
          const currentRecord = NcurrentRecord.get();
          const { updated } = UpdatePricesService.applyToRecord(currentRecord);
          //alert(`Precios actualizados correctamente en ${updated} línea(s).`);
        } catch (innerError) {
          console.error('[ns-update-prices]', innerError);
          //alert(`Error al actualizar precios:\n${innerError.message}`);
        }
      });
    } catch (outerError) {
      console.error('[ns-update-prices] require falló:', outerError);
      alert(`No se pudo cargar el módulo de NetSuite:\n${outerError.message}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Punto de entrada — escucha el evento lanzado por content.js.
// ---------------------------------------------------------------------------

window.addEventListener(EVENTS.updatePrices, () => UpdatePricesAction.execute());
