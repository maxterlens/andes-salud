/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/log"], function (nLog) {

    /**
     * @function normalizarTexto - Normaliza un texto convirtiéndolo a mayúsculas, eliminando espacios extra y caracteres especiales no deseados
     * @param {string} texto - Texto a normalizar
     * @returns {string} - Texto normalizado
     */
    function normalizarTexto(texto) {
        try {
            nLog.audit("normalizarTexto - texto", texto);
            
            if (texto === null || texto === undefined) {
                return "";
            }
            
            // Convertir a string si no lo es
            let textoStr = String(texto);
            
            // Convertir a mayúsculas
            textoStr = textoStr.toUpperCase();
            
            // Eliminar espacios al inicio y al final
            textoStr = textoStr.trim();
            
            // Reemplazar múltiples espacios por uno solo
            textoStr = textoStr.replace(/\s+/g, " ");
            
            // Eliminar caracteres especiales no deseados (manteniendo letras, números, espacios y algunos caracteres específicos)
            textoStr = textoStr.replace(/[^A-Z0-9\s\-_]/g, "");
            
            nLog.debug("normalizarTexto - resultado", textoStr);
            return textoStr;
        } catch (error) {
            nLog.error("normalizarTexto - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarEspaciosExtra - Reemplaza múltiples espacios consecutivos por un solo espacio
     * @param {string} texto - Texto a procesar
     * @returns {string} - Texto sin espacios extra
     */
    function eliminarEspaciosExtra(texto) {
        try {
            nLog.audit("eliminarEspaciosExtra - texto", texto);
            
            if (texto === null || texto === undefined) {
                return "";
            }
            
            let textoStr = String(texto);
            // Reemplazar múltiples espacios por uno solo
            textoStr = textoStr.replace(/\s+/g, " ");
            
            nLog.debug("eliminarEspaciosExtra - resultado", textoStr);
            return textoStr;
        } catch (error) {
            nLog.error("eliminarEspaciosExtra - error", error);
            throw error;
        }
    }

    /**
     * @function convertirAMayusculas - Convierte todo el texto a mayúsculas
     * @param {string} texto - Texto a convertir
     * @returns {string} - Texto en mayúsculas
     */
    function convertirAMayusculas(texto) {
        try {
            nLog.audit("convertirAMayusculas - texto", texto);
            
            if (texto === null || texto === undefined) {
                return "";
            }
            
            let textoStr = String(texto);
            let resultado = textoStr.toUpperCase();
            
            nLog.debug("convertirAMayusculas - resultado", resultado);
            return resultado;
        } catch (error) {
            nLog.error("convertirAMayusculas - error", error);
            throw error;
        }
    }

    /**
     * @function convertirAMinusculas - Convierte todo el texto a minúsculas
     * @param {string} texto - Texto a convertir
     * @returns {string} - Texto en minúsculas
     */
    function convertirAMinusculas(texto) {
        try {
            nLog.audit("convertirAMinusculas - texto", texto);
            
            if (texto === null || texto === undefined) {
                return "";
            }
            
            let textoStr = String(texto);
            let resultado = textoStr.toLowerCase();
            
            nLog.debug("convertirAMinusculas - resultado", resultado);
            return resultado;
        } catch (error) {
            nLog.error("convertirAMinusculas - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarCaracteresEspeciales - Elimina caracteres especiales no alfanuméricos
     * @param {string} texto - Texto a procesar
     * @param {boolean} mantenerEspacios - Si se deben mantener los espacios (por defecto true)
     * @returns {string} - Texto sin caracteres especiales
     */
    function eliminarCaracteresEspeciales(texto, mantenerEspacios = true) {
        try {
            nLog.audit("eliminarCaracteresEspeciales - texto", texto);
            
            if (texto === null || texto === undefined) {
                return "";
            }
            
            let textoStr = String(texto);
            let resultado;
            
            if (mantenerEspacios) {
                resultado = textoStr.replace(/[^A-Z0-9\s]/gi, "");
            } else {
                resultado = textoStr.replace(/[^A-Z0-9]/gi, "");
            }
            
            nLog.debug("eliminarCaracteresEspeciales - resultado", resultado);
            return resultado;
        } catch (error) {
            nLog.error("eliminarCaracteresEspeciales - error", error);
            throw error;
        }
    }

    /**
     * @function normalizarIdentificador - Normaliza identificadores como RUT, DNI, etc. eliminando puntos, guiones, espacios
     * @param {string} identificador - Identificador a normalizar
     * @returns {string} - Identificador normalizado
     */
    function normalizarIdentificador(identificador) {
        try {
            nLog.audit("normalizarIdentificador - identificador", identificador);
            
            if (identificador === null || identificador === undefined) {
                return "";
            }
            
            let identificadorStr = String(identificador);
            // Eliminar puntos, guiones y espacios
            let resultado = identificadorStr.replace(/[\.\-\s]/g, "");
            
            nLog.debug("normalizarIdentificador - resultado", resultado);
            return resultado;
        } catch (error) {
            nLog.error("normalizarIdentificador - error", error);
            throw error;
        }
    }

    /**
     * @function quitarAcentos - Convierte caracteres acentuados a su versión sin acento
     * @param {string} texto - Texto a procesar
     * @returns {string} - Texto sin acentos
     */
    function quitarAcentos(texto) {
        try {
            nLog.audit("quitarAcentos - texto", texto);
            
            if (texto === null || texto === undefined) {
                return "";
            }
            
            let textoStr = String(texto);
            // Reemplazar caracteres acentuados
            let resultado = textoStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            nLog.debug("quitarAcentos - resultado", resultado);
            return resultado;
        } catch (error) {
            nLog.error("quitarAcentos - error", error);
            throw error;
        }
    }

    return {
        normalizarTexto: normalizarTexto,
        eliminarEspaciosExtra: eliminarEspaciosExtra,
        convertirAMayusculas: convertirAMayusculas,
        convertirAMinusculas: convertirAMinusculas,
        eliminarCaracteresEspeciales: eliminarCaracteresEspeciales,
        normalizarIdentificador: normalizarIdentificador,
        quitarAcentos: quitarAcentos
    };
});
