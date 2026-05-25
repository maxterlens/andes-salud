/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/log"], function (nLog) {
    /**
     * @function formatearFecha - Formatea una fecha a un string en formato "YYYY-MM-DD".
     * @param {Date} parametro - Fecha a formatear.
     * @returns {String} - Fecha formateada en "YYYY-MM-DD".
     */
    function formatearFecha(parametro) {
        try {
            nLog.audit("formatearFecha - parametro", {
                parametro: parametro,
                tipo: typeof parametro
            });

            // Validar si el parámetro es una fecha válida
            if (parametro && typeof parametro === "object") {
                // Crear un objeto Date
                let d = new Date(parametro);

                // Darle formato YYYY-MM-DD
                let yyyy = d.getFullYear();
                let mm = String(d.getMonth() + 1).padStart(2, "0");
                let dd = String(d.getDate()).padStart(2, "0");
                let fechaFormateada = `${yyyy}${mm}${dd}`; // resultado: "YYYYMMDD"
                nLog.debug("formatearFecha - fechaFormateada", fechaFormateada);
                return fechaFormateada;
            } else {
                throw new Error("Fecha no proporcionada o inválida");
            }
        } catch (error) {
            nLog.error("formatearFecha - error", error);
            throw error;
        }
    }

    /**
     * @function verificarPropiedades - Verificar que la peticion tenga los datos esperados
     * @param {object} datosPeticion - Datos peticion
     * @param {Array} propiedadesVerificar - Arreglo de claves a verificar en el objeto
     * @returns {object | Error} -Objeto con datos verificados o mensaje de error
     */
    function verificarPropiedades(datosPeticion, propiedadesVerificar) {
        try {
            nLog.audit("verificarPropiedades - parametros", {
                datosPeticion: datosPeticion,
                propiedadesVerificar: propiedadesVerificar
            });

            // Verificar las propiedades esperadas en la estructura
            for (const key of propiedadesVerificar) {
                // ¿Existe la propiedad?
                if (!Object.prototype.hasOwnProperty.call(datosPeticion, key)) {
                    throw new Error(`Estructura de objeto invalida, falta propiedad: ${key}`);
                }

                // Aislar valor de propiedad
                const val = datosPeticion[key];

                // null o undefined
                if (val === null || val === undefined) {
                    throw new Error(`La propiedad: ${key} tiene un valor invalido`);
                }

                // string vacio
                if (typeof val === "string" && val.trim() === "") {
                    throw new Error(`La propiedad: ${key} tiene un valor invalido`);
                }
            }
        } catch (error) {
            nLog.error("verificarPropiedades - error", error);
            throw error;
        }
    }
    /**
     * @function formatearRut - Formatear dato a Rut
     * @param {string|number} parametro - Dato a formatear ejemplo "79123456k" o "184162865"
     * @returns {string} - Rut formateado ejemplo "79123456-K" o "18416286-5"
     */
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

            // Formatera con guion
            let formateado = `${body}-${digitoVerificador}`;
            

            return formateado;
        } catch (error) {
            nLog.error("formatearRut - error", error);
            throw error;
        }
    }
    return {
        formatearFecha: formatearFecha,
        verificarPropiedades: verificarPropiedades,
        formatearRut: formatearRut
    };
});
