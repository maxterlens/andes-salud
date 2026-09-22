define(["N/log"], function (nLog) {
    function formatearRut(parametro) {
        try {
            // Normalizar a string, eliminar espacios y caracteres no alfanuméricos
            const normalizado = String(parametro).trim();
            const alfaNumerico = normalizado.replace(/[^0-9A-Za-z]/g, "");
            if (alfaNumerico.length < 2) return alfaNumerico; // no hay cuerpo + digito verificador

            // Separar cuerpo y (último carácter)
            const body = alfaNumerico.slice(0, -1);
            let digitoVerificador = alfaNumerico.slice(-1);

            // Normalizar digito verificador
            digitoVerificador = digitoVerificador.toString().toUpperCase();

            // Agrega guion
            let formateado = `${body}-${digitoVerificador}`;

            return formateado;
        } catch (error) {
            nLog.error("formatearRut - error", error);
            throw error;
        }
    }
    /**
     * Valida si un valor representa "sí" o verdadero
     * Soporta: "S", "Si", "SI" (case-insensitive)
     * @param {*} valor - El valor a validar
     * @returns {boolean} - true si el valor representa sí, false en caso contrario
     */
    function esSi(valor) {
        if (valor === null || valor === undefined) return false;
        const valorStr = String(valor).trim().toLowerCase();
        return valorStr === "s" || valorStr === "si";
    }

    /**
     * Valida si un valor representa "no" o falso
     * Soporta: "N", "No", "NO", "" (cadena vacía, case-insensitive)
     * @param {*} valor - El valor a validar
     * @returns {boolean} - true si el valor representa no, false en caso contrario
     */
    function esNo(valor) {
        if (valor === null || valor === undefined) return true;
        const valorStr = String(valor).trim().toLowerCase();
        return valorStr === "" || valorStr === "n" || valorStr === "no";
    }

    return { formatearRut, esSi, esNo };
});
