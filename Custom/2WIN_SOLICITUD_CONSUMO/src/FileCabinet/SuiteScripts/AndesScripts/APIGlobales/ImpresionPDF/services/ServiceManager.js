/**
 * @NApiVersion 2.1
 * ServiceManager: registro y despacho de servicios por tipo de registro.
 *
 * Actúa como un router/factory: dado un recordType y un reportName,
 * localiza el servicio correcto y delega la ejecución.
 *
 * Para registrar un nuevo servicio:
 *   ServiceManager.register('mirecordtype', MiServicio);
 */
define([
    './ASSolicitudConsumoService'
], (SolicitudConsumoService) => {

    /** Mapa interno: recordType → servicio */
    const _registry = {
        customrecord_2win_solicitud_consumo: SolicitudConsumoService
        //transferorder: SolicitudConsumoService,
        //itemreceipt:   SolicitudConsumoService
        // Para agregar soporte a nuevos tipos de registro:
        // 'itemfulfillment': ItemFulfillmentService,
    };

    class ServiceManager {

        /**
         * Registra un servicio para un tipo de registro.
         * Permite extensión sin modificar el código fuente del manager.
         *
         * @param {string} recordType - Tipo de registro NetSuite (ej. 'transferorder')
         * @param {Object} service    - Objeto con métodos nombrados igual que los reportNames
         */
        static register(recordType, service) {
            _registry[recordType] = service;
        }

        /**
         * Ejecuta el método del servicio correspondiente al reporte solicitado.
         *
         * @param {string}   reportName   - Nombre del reporte (clave en Constants.REPORTS_BASE)
         * @param {Object}   reportConfig - Configuración del reporte (de Constants.getReportConfig)
         * @param {string[]} ids          - IDs del registro a procesar
         * @param {Object}   customData   - Datos adicionales del request (parámetro customdata)
         * @returns {Object} Payload listo para el Renderer
         * @throws {string} Si no hay servicio registrado o el método no existe
         */
        fetchData(reportName, reportConfig, ids, customData) {
            const { recordType } = reportConfig;
            const service = _registry[recordType];

            if (!service) {
                throw new Error(`[ServiceManager] No hay servicio registrado para recordType: "${recordType}"`);
            }

            if (typeof service[reportName] !== 'function') {
                throw new Error(`[ServiceManager] El reporte "${reportName}" no está implementado en el servicio de "${recordType}"`);
            }

            return service[reportName](ids, customData);
        }
    }

    return ServiceManager;
});
