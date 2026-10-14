/**
 * @NApiVersion 2.1
 * Clase auxiliar para mapear columnas de resultados de N/search.
 * Proporciona acceso tipado a valores y textos por label de columna.
 */
define([], () => {

    class Row {
        constructor(index) {
            this.index = index;
            this.data = {};
        }

        /** Retorna el valor interno de la columna, o '' si no existe. */
        getValue(id) {
            return this.data[id]?.value ?? '';
        }

        /** Retorna el texto de la columna, o '' si no existe. */
        getText(id) {
            return this.data[id]?.text ?? '';
        }

        /** Retorna el valor como número. Retorna 0 si no es numérico. */
        getNumber(id) {
            return Number(this.data[id]?.value) || 0;
        }

        /** Retorna getValue si tiene valor, de lo contrario getText. */
        getValueOrText(id) {
            const val = this.getValue(id);
            return val !== '' ? val : this.getText(id);
        }

        /** Registra el valor e texto de una columna por su label. */
        setValues(id, value, text) {
            this.data[id] = { value, text };
        }
    }

    return Row;
});
