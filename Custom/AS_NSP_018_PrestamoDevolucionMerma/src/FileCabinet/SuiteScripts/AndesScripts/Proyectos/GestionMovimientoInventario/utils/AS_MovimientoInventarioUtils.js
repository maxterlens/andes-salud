/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Funciones genericas del modulo, sin reglas de negocio.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

    const redondearCantidad = (valor) => Math.round(valor * 100000000) / 100000000;

    return { redondearCantidad };
});
