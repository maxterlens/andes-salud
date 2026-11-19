/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Valores de las listas personalizadas del proyecto.
 *              Resuelve el ID interno de cada valor a partir de su scriptid (mismo patrón que
 *              EstadoEjecucionRepository de R003), para no depender de los IDs que NetSuite asigna
 *              al desplegar ni del texto visible del valor.
 */
define(["../utils/SuiteQLUtils"], (sql) => {
    const _cache = {};

    /** Mapa scriptid (minúsculas) → { id, nombre } de una lista. */
    const _cargar = (lista) => {
        if (_cache[lista]) return _cache[lista];
        const mapa = {};
        sql.consultar(`SELECT id, name, LOWER(scriptid) AS scriptid FROM ${lista}`).forEach((r) => {
            mapa[r.scriptid] = { id: String(r.id), nombre: r.name };
        });
        _cache[lista] = mapa;
        return mapa;
    };

    /**
     * ID interno de un valor.
     * @param {string} lista - ID de la lista (Constants.LISTAS)
     * @param {string} scriptid - scriptid del valor
     * @returns {string}
     */
    const getId = (lista, scriptid) => {
        const valor = _cargar(lista)[String(scriptid).toLowerCase()];
        if (!valor) throw new Error(`No existe el valor ${scriptid} en ${lista}.`);
        return valor.id;
    };

    /**
     * scriptid de un valor a partir de su ID interno.
     * @returns {string|null}
     */
    const getScriptId = (lista, id) => {
        const mapa = _cargar(lista);
        return Object.keys(mapa).find((k) => mapa[k].id === String(id)) || null;
    };

    /** Valores de la lista: [{ id, scriptid, nombre }] */
    const getValores = (lista) =>
        Object.entries(_cargar(lista)).map(([scriptid, v]) => ({ id: v.id, scriptid, nombre: v.nombre }));

    return { getId, getScriptId, getValores };
});
