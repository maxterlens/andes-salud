/**
 * @NApiVersion 2.1
 * @module ./2win_dao_evento.js
 * @NModuleScope Public
 */
define(["N/util"], function (util) {
    const NivelEvento = {
        INFO: "INFO", // Estos valores deben coincidir con tu Custom List si la usaste, o ser los valores de texto directos
        WARNING: "WARNING",
        ERROR: "ERROR",
        CRITICAL: "CRITICAL"
    };
    /**
     * Constructor para la entidad Evento.
     * @param {Object} options
     * @param {string} [options.id] - El ID interno del registro del evento si ya existe.
     * @param {string} [options.uuid] - Un UUID personalizado si se usa.
     * @param {string} options.tipo - El tipo de evento.
     * @param {string} options.fuente - La fuente del evento (e.g., script ID).
     * @param {Object} options.datos - Datos adicionales del evento.
     * @param {Date} [options.timestamp] - Fecha y hora del evento (default: now).
     * @param {string} [options.nivel] - Nivel del evento (default: INFO). Ver NivelEvento.js.
     * @param {string} [options.relatedRecordType] - Tipo de registro NetSuite relacionado (opcional).
     * @param {string|number} [options.relatedRecordId] - ID del registro NetSuite relacionado (opcional).
     */
    class Evento {
        constructor(options) {
            this.id = options.id || null; // Internal ID del Custom Record
            this.uuid = options.uuid || null; // Si tienes un campo UUID separado
            this.tipo = options.tipo;
            this.fuente = options.fuente;
            this.datos = options.datos || {};
            this.timestamp = options.timestamp || new Date();
            this.nivel = options.nivel || NivelEvento.INFO;
            this.relatedRecordType = options.relatedRecordType || null;
            this.relatedRecordId = options.relatedRecordId || null;

            if (util.isString(this.timestamp)) {
                // NetSuite a veces devuelve fechas como strings desde búsquedas, intenta convertir.
                // Esto puede necesitar un módulo de parseo de fechas más robusto si los formatos varían.
                this.timestamp = new Date(this.timestamp);
            }

            if (!this.tipo) {
                throw new Error("El tipo de evento es requerido.");
            }
            if (!this.fuente) {
                throw new Error("La fuente del evento es requerida.");
            }
        }
    }
    return { Evento, NivelEvento };
});
