define([], function () {
    /**
     * =================================================================================
     *  Motor de Mapeo de Mensajes HL7 a JSON Estructurado (Versión Final)
     * =================================================================================
     *
     * Este script contiene una función principal, `transformHL7`, que convierte un
     * objeto JSON (representando un mensaje HL7) en otro objeto JSON con una
     * estructura definida por un conjunto de tablas de mapeo.
     *
     * Es compatible con todas las estructuras de mensaje discutidas, incluyendo:
     * - Múltiples segmentos OBX.
     * - Múltiples formatos de fecha.
     * - Lógica de mapeo condicional para eventos A01, A31, A06, y A23.
     */

    // ---------------------------------------------------------------------------------
    // Sección 1: Funciones Auxiliares (Helpers)
    // ---------------------------------------------------------------------------------

    /**
     * Encuentra el PRIMER segmento por su nombre (ej. 'MSH').
     * @param {object} data - El objeto JSON completo del mensaje.
     * @param {string} segmentName - El nombre del segmento a buscar.
     * @returns {object|null} El objeto del segmento o null si no se encuentra.
     */
    function findSegment(data, segmentName) {
        if (!data || !data.children) return null;
        return data.children.find((child) => child && child.name === segmentName);
    }

    /**
     * Encuentra TODOS los segmentos por su nombre (ej. 'OBX').
     * @param {object} data - El objeto JSON completo del mensaje.
     * @param {string} segmentName - El nombre de los segmentos a buscar.
     * @returns {Array<object>} Un array con los segmentos encontrados.
     */
    function findSegments(data, segmentName) {
        if (!data || !data.children) return [];
        return data.children.filter((child) => child && child.name === segmentName);
    }

    /**
     * Encuentra un campo por su nombre (ej. 'PV1-2') dentro de un objeto de segmento.
     * @param {object} segment - El objeto del segmento.
     * @param {string} fieldName - El nombre del campo a buscar.
     * @returns {object|null} El objeto del campo o null si no se encuentra.
     */
    function findField(segment, fieldName) {
        if (!segment || !segment.children) return null;
        return segment.children.find((child) => child && child.name === fieldName);
    }

    /**
     * Encuentra el valor de un sub-campo (componente) por su nombre (ej. 'PV1-3.1').
     * @param {object} field - El objeto del campo que contiene sub-campos.
     * @param {string} subFieldName - El nombre del sub-campo a buscar.
     * @returns {string|null} El valor del sub-campo o null si no se encuentra.
     */
    function findSubField(field, subFieldName) {
        if (!field || !field.children) return null;
        const subField = field.children.find((child) => child && child.name === subFieldName);
        return subField ? subField.value : null;
    }

    /**
     * Parsea una fecha de varios formatos (HL7 o SQL) a un objeto Date de JavaScript.
     * @param {string} dateString - La fecha en formato 'YYYYMMDD...' o 'YYYY-MM-DD...'.
     * @returns {Date|null} Un objeto Date o null si el formato es inválido.
     */
    function parseDate(dateString) {
        if (!dateString || typeof dateString !== "string") return null;
        try {
            // Formato: 'YYYY-MM-DD HH:MM:SS.s'
            if (dateString.includes("-")) {
                return new Date(dateString);
            }
            // Formato: 'YYYYMMDDHHMMSS'
            if (dateString.length >= 8) {
                const year = dateString.substring(0, 4);
                const month = dateString.substring(4, 6) - 1; // Meses en JS son 0-11
                const day = dateString.substring(6, 8);
                const hour = dateString.substring(8, 10) || "00";
                const minute = dateString.substring(10, 12) || "00";
                const second = dateString.substring(12, 14) || "00";
                return new Date(year, month, day, hour, minute, second);
            }
        } catch (e) {
            console.error("Error al parsear fecha:", e);
            return null;
        }
        return null;
    }

    // ---------------------------------------------------------------------------------
    // Sección 2: Función Principal de Transformación
    // ---------------------------------------------------------------------------------

    function transformHL7(sourceData) {
        const mshSegment = findSegment(sourceData, "MSH");
        const evnSegment = findSegment(sourceData, "EVN");
        const pidSegment = findSegment(sourceData, "PID");
        const pv1Segment = findSegment(sourceData, "PV1");
        const obxSegments = findSegments(sourceData, "OBX");

        const triggerEvent = findSubField(findField(mshSegment, "MSH-9"), "MSH-9.1").trim();

        let pv1Data = {};

        // Mapeo Condicional del PV1 basado en el tipo de evento
        switch (triggerEvent) {
            case "A01":
            case "ADT^A01":
            case "A1":
            case "A31":
            case "A031":
            case "ADT^A31":
            case "ADT^A031":
                pv1Data = {
                    "PV1-2.1": findField(pv1Segment, "PV1-2")?.value,
                    "PV1-3.1": findSubField(findField(pv1Segment, "PV1-3"), "PV1-3.0"),
                    "PV1-3.2": findSubField(findField(pv1Segment, "PV1-3"), "PV1-3.1"),
                    "PV1-3.3": findSubField(findField(pv1Segment, "PV1-3"), "PV1-3.2"),
                    "PV1-3.4": findSubField(findField(pv1Segment, "PV1-3"), "PV1-3.3"),
                    "PV1-3.5": findSubField(findField(pv1Segment, "PV1-3"), "PV1-3.4"),
                    "PV1-5.1": findSubField(findField(pv1Segment, "PV1-5"), "PV1-5.0"),
                    "PV1-5.2": parseDate(findSubField(findField(pv1Segment, "PV1-5"), "PV1-5.1")),
                    "PV1-5.3": parseDate(findSubField(findField(pv1Segment, "PV1-5"), "PV1-5.2")),
                    "PV1-7.1": findField(pv1Segment, "PV1-10")?.value,
                    "PV1-7.2": findField(pv1Segment, "PV1-12")?.value,
                    "PV1-8.1": findField(pv1Segment, "PV1-13")?.value?.trim(),
                    "PV1-8.2": findField(pv1Segment, "PV1-14")?.value,
                    "PV1-11.1": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.0"),
                    "PV1-11.2": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.1"),
                    "PV1-11.3": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.2"),
                    "PV1-11.5": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.4"),
                    "PV1-11.6": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.5"),
                    "PV1-11.7": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.6"),
                    "PV1-11.8": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.7"),
                    "PV1-11.9": findSubField(findField(pv1Segment, "PV1-11"), "PV1-11.8"),
                    "PV1-18.1": findField(pv1Segment, "PV1-18")?.value,
                    "PV1-19.1": findField(pv1Segment, "PV1-19")?.value,
                    "PV1-20.1": findSubField(findField(pv1Segment, "PV1-20"), "PV1-20.0"),
                    "PV1-20.2": findSubField(findField(pv1Segment, "PV1-20"), "PV1-20.1")
                };
                break;

            case "A06":
            case "ADT^A06":
                pv1Data = {
                    "PV1-2.1": findField(pv1Segment, "PV1-2")?.value,//numero registro hospitalizado
                    "PV1-4.1": findField(pv1Segment, "PV1-4")?.value,//numero registro urgencia
                    "PV1-5.1": findField(pv1Segment, "PV1-5")?.value,//numero ingreso hospitalizado
                    "PV1-6.1": findField(pv1Segment, "PV1-6")?.value,//numero ingreso urgencia
                    "PV1-19.1": findField(pv1Segment, "PV1-19")?.value,//numero cuenta paciente hospitalizado
                    "PV1-20.1": findField(pv1Segment, "PV1-20")?.value,//no se usa se movio a PV1-21.1
                    "PV1-21.1": findField(pv1Segment, "PV1-21")?.value//numero cuenta paciente urgencia
                };
                break;

            case "A23":
            case "ADT^A23":
                pv1Data = {
                    "PV1-2.1": findField(pv1Segment, "PV1-2")?.value,
                    "PV1-5.1": findField(pv1Segment, "PV1-5")?.value,
                    "PV1-19.1": findField(pv1Segment, "PV1-19")?.value,
                    "PV1-10.1": findField(pv1Segment, "PV1-10")?.value
                };
                break;

            default:
                console.warn(`Tipo de evento no soportado: ${triggerEvent}. El segmento PV1 no será mapeado.`);
                break;
        }

        // Mapeo de todos los segmentos OBX a un array
        const obxData = obxSegments.map((obx) => {
            return {
                "OBX 3.2": findSubField(findField(obx, "OBX-3"), "OBX-3.1") || null,
                "OBX 4.1": findSubField(findField(obx, "OBX-6"), "OBX-6.1") || null,
                "OBX 7.1": findField(obx, "OBX-7")?.value || null,
                "OBX 13.1": findField(obx, "OBX-13")?.value || null
            };
        });

        // Ensamblar el objeto JSON final
        return {
            MSH: {
                "MSH-2.1": findField(mshSegment, "MSH-2")?.value || null,
                "MSH-3.1": findField(mshSegment, "MSH-3")?.value || null,
                "MSH-4.1": findField(mshSegment, "MSH-4")?.value || null,
                "MSH-5.1": findField(mshSegment, "MSH-5")?.value || null,
                "MSH-6.1": findField(mshSegment, "MSH-6")?.value || null,
                "MSH-7.1": findField(mshSegment, "MSH-7")?.value || null,
                "MSH-9.1": triggerEvent || null,
                "MSH-10.1": findField(mshSegment, "MSH-10")?.value || null,
                "MSH-11.1": findField(mshSegment, "MSH-11")?.value || null
            },
            EVN: {
                "EVN-1.1": findField(evnSegment, "EVN-1")?.value || null,
                "EVN-2.1": parseDate(findField(evnSegment, "EVN-2")?.value || null)
            },
            PID: {
                "PID-2.1": findField(pidSegment, "PID-2")?.value || null
            },
            PV1: pv1Data,
            OBX: obxData
        };
    }

    return { mapearCampos: transformHL7 };
});
