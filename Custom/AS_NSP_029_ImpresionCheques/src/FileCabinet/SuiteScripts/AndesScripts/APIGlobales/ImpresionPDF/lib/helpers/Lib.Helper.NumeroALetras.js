/**
 * @NApiVersion 2.1
 * Helper: conversión de montos en pesos chilenos (enteros) a letras en mayúsculas.
 *
 * - Usa la forma apocopada ("UN", "VEINTIUN", "TREINTA Y UN") porque en el cheque
 *   el texto va seguido de "PESOS M/L" preimpreso.
 * - Sin tildes, igual que la impresión actual de la macro.
 * - Rango soportado: 0 a 999.999.999.999.
 *
 * Ej.: 337022 → "TRESCIENTOS TREINTA Y SIETE MIL VEINTIDOS"
 */
define([], () => {

    const UNIDADES   = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const DIEZ_A_19  = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
                        'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
    const VEINTI     = ['VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO',
                        'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    const DECENAS    = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA',
                        'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const CENTENAS   = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
                        'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const MAXIMO = 999999999999;

    /** 0..99 */
    const _decenas = (n) => {
        if (n < 10) return UNIDADES[n];
        if (n < 20) return DIEZ_A_19[n - 10];
        if (n < 30) return VEINTI[n - 20];
        const d = Math.floor(n / 10);
        const u = n % 10;
        return u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d];
    };

    /** 0..999 */
    const _centenas = (n) => {
        if (n === 100) return 'CIEN';
        const c = Math.floor(n / 100);
        const r = n % 100;
        return [CENTENAS[c], _decenas(r)].filter(Boolean).join(' ');
    };

    /** 0..999.999 */
    const _miles = (n) => {
        const m = Math.floor(n / 1000);
        const r = n % 1000;
        const partes = [];
        if (m === 1)     partes.push('MIL');
        else if (m > 1)  partes.push(`${_centenas(m)} MIL`);
        if (r)           partes.push(_centenas(r));
        return partes.join(' ');
    };

    /**
     * Convierte un monto a letras. Los decimales se redondean (CLP no usa decimales).
     * @param {number|string} monto
     * @returns {string}
     */
    const convertir = (monto) => {
        const n = Math.round(Math.abs(Number(monto) || 0));
        if (n === 0) return 'CERO';
        if (n > MAXIMO) {
            throw new Error(`[NumeroALetras] Monto fuera de rango: ${n}`);
        }

        const millones = Math.floor(n / 1000000);
        const resto    = n % 1000000;
        const partes   = [];

        if (millones === 1)     partes.push('UN MILLON');
        else if (millones > 1)  partes.push(`${_miles(millones)} MILLONES`);
        if (resto)              partes.push(_miles(resto));

        return partes.join(' ');
    };

    return { convertir };
});
