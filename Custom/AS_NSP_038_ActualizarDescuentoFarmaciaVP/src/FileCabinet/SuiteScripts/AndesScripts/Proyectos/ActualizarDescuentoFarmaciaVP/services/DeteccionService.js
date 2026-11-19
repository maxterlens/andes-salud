/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Reglas para detectar descuentos con cantidad distinta a la de su artículo.
 *              Sin acceso a NetSuite: recibe las líneas ya leídas (SuiteQL en la validación o record.load
 *              en el Map/Reduce), para que ambas etapas apliquen exactamente la misma regla.
 *
 *              Regla de emparejamiento: el descuento es un artículo de tipo Servicio cuyo nombre contiene
 *              "descuento" y corresponde al artículo que está inmediatamente encima en la factura.
 *              Las líneas de impuesto no cuentan para el orden.
 *
 *              Cuadre: igual que NetSuite, el IVA se calcula y redondea en cada línea. Por cada descuento se
 *              calcula (importe nuevo − importe actual) + (IVA nuevo − IVA actual), con el IVA de cada importe
 *              redondeado a la precisión de la moneda; la suma de las líneas debe ser igual al importe
 *              restante de la factura, con una tolerancia de pocos pesos. La diferencia (restante − ajuste) debe
 *              estar entre 0 y la tolerancia: si es negativa la factura no es procesable.
 */
define(["../constants/ActualizarDescuentoFarmaciaVPConstants"], (CONST) => {
    const { REGLAS, CLASIFICACION } = CONST;

    const r2 = (n) => Math.round(Number(n) * 100) / 100;
    const r5 = (n) => Math.round(Number(n) * 100000) / 100000;

    /** Texto en minúsculas y sin tildes. */
    const normalizar = (texto) =>
        String(texto || "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase();

    /**
     * ¿La línea es un descuento? Artículo de tipo Servicio cuyo nombre contiene el texto de descuento.
     * @param {{tipo: string, nombre: string, nombreBusqueda?: string}} l
     */
    const esDescuento = (l) => l.tipo === REGLAS.TIPO_DESCUENTO && normalizar(l.nombreBusqueda || l.nombre).includes(REGLAS.TEXTO_DESCUENTO);

    /** Tarifa unitaria del descuento en valor absoluto (de la tarifa o, si no hay, importe / cantidad). */
    const tarifaDescuento = (d) => {
        if (d.tarifa !== undefined && d.tarifa !== null && d.tarifa !== "" && Number.isFinite(Number(d.tarifa)) && Number(d.tarifa) !== 0) return Math.abs(Number(d.tarifa));
        return d.cantidad ? Math.abs(Number(d.importe)) / Math.abs(Number(d.cantidad)) : 0;
    };

    /**
     * Empareja artículos con su descuento y detecta las diferencias de cantidad.
     * @param {Array<{linea: number, articuloId: number, nombre: string, nombreBusqueda?: string, tipo: string,
     *          cantidad: number, importe: number, tarifa?: number, esImpuesto?: boolean, indice?: number}>} lineas
     *        En el orden de la factura. cantidad e importe en valor absoluto.
     * @returns {{ pares: number, diferencias: object[], anomalias: string[], netoAdicional: number }}
     */
    const analizar = (lineas) => {
        const items = (lineas || []).filter((l) => !l.esImpuesto);
        const diferencias = [];
        const anomalias = [];
        let pares = 0;

        items.forEach((actual, i) => {
            if (esDescuento(actual)) {
                const anterior = items[i - 1];
                if (!anterior || esDescuento(anterior)) anomalias.push(`Línea ${actual.linea}: descuento "${actual.nombre}" sin artículo encima.`);
                return;
            }
            const siguiente = items[i + 1];
            if (!siguiente || !esDescuento(siguiente)) return;

            pares++;
            const cantArticulo = Math.abs(Number(actual.cantidad) || 0);
            const cantDescuento = Math.abs(Number(siguiente.cantidad) || 0);
            if (Math.abs(cantArticulo - cantDescuento) <= REGLAS.EPSILON) return;

            const tarifa = tarifaDescuento(siguiente);
            if (!tarifa) {
                anomalias.push(`Línea ${siguiente.linea}: no se pudo determinar la tarifa del descuento.`);
                return;
            }
            diferencias.push({
                lineaArticulo: actual.linea,
                indiceArticulo: actual.indice,
                articuloId: actual.articuloId,
                articuloNombre: actual.nombre,
                cantArticulo: r5(cantArticulo),
                lineaDescuento: siguiente.linea,
                indiceDescuento: siguiente.indice,
                descuentoId: siguiente.articuloId,
                descuentoNombre: siguiente.nombre,
                cantDescuento: r5(cantDescuento),
                tarifaDescuento: r5(tarifa),
                importeDescuento: r2(Math.abs(Number(siguiente.importe) || cantDescuento * tarifa)),
                cantDescuentoNueva: r5(cantArticulo),
                importeDescuentoNuevo: r2(cantArticulo * tarifa),
                ajusteNeto: r2((cantArticulo - cantDescuento) * tarifa)
            });
        });

        return { pares, diferencias, anomalias, netoAdicional: r2(diferencias.reduce((s, d) => s + d.ajusteNeto, 0)) };
    };

    /** IVA de una línea redondeado a la precisión de la moneda (NetSuite calcula y redondea el IVA por línea). */
    const ivaLinea = (importe, iva) => {
        const factor = Math.pow(10, REGLAS.DECIMALES_MONEDA);
        return Math.round(Math.abs(Number(importe)) * (Number(iva || 0) / 100) * factor) / factor;
    };

    /**
     * Calcula, línea por línea, el IVA del descuento antes y después de corregir la cantidad
     * (cada uno redondeado como lo hace NetSuite) y el ajuste con IVA de cada línea.
     * @param {object[]} diferencias - resultado de analizar (se completan en el mismo objeto)
     * @returns {number} ajuste total con IVA (suma de las líneas)
     */
    const calcularIvaPorLinea = (diferencias, iva) =>
        r2(
            diferencias.reduce((total, d) => {
                d.ivaDescuento = ivaLinea(d.importeDescuento, iva);
                d.ivaDescuentoNuevo = ivaLinea(d.importeDescuentoNuevo, iva);
                d.ajusteConIva = r2(d.importeDescuentoNuevo - d.importeDescuento + d.ivaDescuentoNuevo - d.ivaDescuento);
                return total + d.ajusteConIva;
            }, 0)
        );

    /**
     * Compara el ajuste esperado (con IVA calculado por línea) contra el importe restante.
     * @returns {{ importeEsperado: number, diferenciaCuadre: number, restanteEsperado: number, cuadra: boolean }}
     */
    const evaluarCuadre = ({ netoAdicional, diferencias, restante, iva, tolerancia }) => {
        const importeEsperado = calcularIvaPorLinea(diferencias || [], iva);
        const diferenciaCuadre = r2(Number(restante) - importeEsperado);
        return {
            importeEsperado,
            diferenciaCuadre,
            restanteEsperado: diferenciaCuadre,
            // Diferencia negativa = el ajuste supera el importe restante (la factura quedaría con saldo a favor): no cuadra
            cuadra: Number(netoAdicional) > 0 && diferenciaCuadre >= 0 && diferenciaCuadre <= Number(tolerancia || 0)
        };
    };

    const num = (n) => String(r5(n));

    /** Texto con lo que se hará en cada línea: "XUMADOL…: descuento 1 → 2". */
    const textoAccion = (diferencias) => diferencias.map((d) => `${d.articuloNombre}: descuento ${num(d.cantDescuento)} → ${num(d.cantDescuentoNueva)}`).join(" | ");

    /**
     * Clasifica una factura para la validación.
     * @param {object} factura - { id, numero, fecha, cliente, ubicacion, total, restante }
     * @param {object[]} lineas - líneas de la factura (ver analizar)
     * @param {{ iva: number, tolerancia: number }} opciones
     * @returns {object} factura con clasificacion, motivo, accion, lineas (solo las que tienen diferencia) e importes del cuadre
     */
    const clasificarFactura = (factura, lineas, { iva, tolerancia }) => {
        const analisis = analizar(lineas);
        const cuadre = evaluarCuadre({ netoAdicional: analisis.netoAdicional, diferencias: analisis.diferencias, restante: factura.restante, iva, tolerancia });
        const base = {
            ...factura,
            pares: analisis.pares,
            lineas: analisis.diferencias,
            netoAdicional: analisis.netoAdicional,
            importeEsperado: cuadre.importeEsperado,
            diferenciaCuadre: cuadre.diferenciaCuadre,
            restanteEsperado: cuadre.restanteEsperado,
            accion: textoAccion(analisis.diferencias)
        };

        if (!lineas || !lineas.length) return { ...base, clasificacion: CLASIFICACION.NO_PROCESABLE.codigo, motivo: "No se encontraron líneas de artículo en la factura." };
        if (analisis.anomalias.length) return { ...base, clasificacion: CLASIFICACION.NO_PROCESABLE.codigo, motivo: `Estructura no reconocida. ${analisis.anomalias.join(" ")}` };
        if (!analisis.diferencias.length) {
            return {
                ...base,
                clasificacion: CLASIFICACION.SIN_DIFERENCIA.codigo,
                motivo: analisis.pares ? "Todos los descuentos tienen la misma cantidad que su artículo." : "La factura no tiene artículos con descuento."
            };
        }
        if (!cuadre.cuadra && cuadre.diferenciaCuadre < 0 && Number(analisis.netoAdicional) > 0) {
            return {
                ...base,
                clasificacion: CLASIFICACION.NO_PROCESABLE.codigo,
                motivo: `No cuadra: el ajuste del descuento con IVA (${num(cuadre.importeEsperado)}) es mayor que el importe restante (${num(factura.restante)}); diferencia ${num(cuadre.diferenciaCuadre)}.`
            };
        }
        if (!cuadre.cuadra) {
            return {
                ...base,
                clasificacion: CLASIFICACION.NO_PROCESABLE.codigo,
                motivo: `No cuadra: el ajuste del descuento con IVA es ${num(cuadre.importeEsperado)} y el importe restante es ${num(factura.restante)} (diferencia ${num(cuadre.diferenciaCuadre)}).`
            };
        }
        return {
            ...base,
            clasificacion: CLASIFICACION.POR_PROCESAR.codigo,
            motivo: `Cuadra: ajuste con IVA ${num(cuadre.importeEsperado)} vs importe restante ${num(factura.restante)} (diferencia ${num(cuadre.diferenciaCuadre)}).`
        };
    };

    return { normalizar, esDescuento, tarifaDescuento, analizar, evaluarCuadre, clasificarFactura, textoAccion };
});
