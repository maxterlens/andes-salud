/**
 * @NApiVersion 2.1
 * Service: lógica de negocio para la impresión de cheques de Pago de Factura (vendorpayment).
 *
 * Arma los textos del cheque (valor, fecha, beneficiario, valor en letras) y calcula
 * la posición absoluta (cm) de cada campo sobre la hoja carta según el layout del reporte.
 *
 * customData soportado:
 *   posiciones  {Object}  { idPago: posicion } — varios pagos (máx. 4), cada uno en su posición
 *   posicion    {number}  1..4 — posición de un solo pago (default 1). Usado por el botón del pago
 *   calibracion {boolean} true — imprime el primer pago en las 4 posiciones con recuadros
 *   configuracion {string} id de customrecord_as_config_cheque (impresora). Si no viene, se usa
 *                          la predeterminada de la subsidiaria del pago; si no hay, el layout base.
 */
define([
    '../repositories/ASPagoFacturaRepository',
    '../lib/helpers/Lib.Helper.NumeroALetras'
], (PagoFacturaRepository, NumeroALetras) => {

    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
                   'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    /** Número → "x.xxcm" (con punto decimal fijo, independiente del locale FTL). */
    const _cm = (valor) => `${(Math.round(valor * 100) / 100).toFixed(2)}cm`;

    /** 337022 → "337.022" */
    const _formatearMiles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    /** Quita caracteres que romperían el XML de la plantilla. */
    const _limpiar = (texto) => String(texto || '').replace(/[<>]/g, '').trim();

    // Courier es monoespaciada: cada carácter mide 0,6 × tamaño de fuente (pt).
    const PT_POR_CM        = 28.3465;
    const ANCHO_CARACTER   = 0.6;
    const FUENTE_MINIMA_PT = 6;

    const _capacidad = (anchoCm, fuentePt) => Math.floor((anchoCm * PT_POR_CM) / (fuentePt * ANCHO_CARACTER));

    /** Corta el texto en líneas por palabra sin superar la capacidad de caracteres. */
    const _cortarLineas = (texto, capacidad) => {
        const lineas = [];
        let actual = '';
        texto.split(' ').filter(Boolean).forEach((palabra) => {
            const candidata = actual ? `${actual} ${palabra}` : palabra;
            if (candidata.length <= capacidad || !actual) {
                actual = candidata;
            } else {
                lineas.push(actual);
                actual = palabra;
            }
        });
        if (actual) lineas.push(actual);
        return lineas;
    };

    /**
     * Ajusta el texto al ancho del campo para que BFO nunca lo corte ni lo justifique:
     * - Campo de una línea: reduce la fuente hasta que el texto quepa.
     * - Campo multilínea: corta en líneas (máx. maxLineas); si no alcanza, reduce la fuente.
     * @returns {{ lineas: string[], fontSize: string }}
     */
    const _ajustarTexto = (texto, anchoCm, fontSize, maxLineas) => {
        let fuente = parseFloat(fontSize) || 10;
        while (true) {
            const capacidad = _capacidad(anchoCm, fuente);
            const lineas    = maxLineas > 1 ? _cortarLineas(texto, capacidad) : [texto];
            const cabe      = maxLineas > 1
                ? lineas.length <= maxLineas && lineas.every(l => l.length <= capacidad)
                : texto.length <= capacidad;
            if (cabe || fuente <= FUENTE_MINIMA_PT) {
                return { lineas, fontSize: `${fuente}pt` };
            }
            fuente = Math.round((fuente - 0.5) * 10) / 10;
        }
    };

    /** Interlineado usado para calcular el alto (1,3 × tamaño de fuente). */
    const INTERLINEADO = 1.3;

    /**
     * Alto del campo: el configurado o el que necesita el texto con su fuente final,
     * el que sea mayor. Evita que overflow:hidden corte letras con fuentes grandes.
     */
    const _altoNecesario = (altoCm, cantidadLineas, fontSize) => {
        const fuentePt  = parseFloat(fontSize) || 10;
        const necesario = (Math.max(1, cantidadLineas) * fuentePt * INTERLINEADO) / PT_POR_CM;
        return Math.max(Number(altoCm) || 0, necesario);
    };

    const _resolverPosicion = (customData, maxPosiciones) => {
        const p = parseInt(customData?.posicion, 10);
        return p >= 1 && p <= maxPosiciones ? p : 1;
    };

    /**
     * Calcula los campos con coordenadas absolutas para una posición de la hoja.
     * top  = margenSuperior + desplazamientoY + (posicion − 1) × altoCheque + campo.y
     * left = margenIzquierdo + desplazamientoX + campo.x
     */
    const _construirCampos = (valores, layout, posicion) => {
        const baseTop  = layout.margenSuperior + layout.desplazamientoY + (posicion - 1) * layout.altoCheque;
        const baseLeft = layout.margenIzquierdo + layout.desplazamientoX;

        return Object.keys(layout.campos).map((clave) => {
            const c = layout.campos[clave];
            const { lineas, fontSize } = _ajustarTexto(
                valores[clave] || '',
                c.ancho,
                c.fontSize || layout.fontSize,
                c.maxLineas || 1
            );
            return {
                clave,
                lineas,
                top:      _cm(baseTop + c.y),
                left:     _cm(baseLeft + c.x),
                width:    _cm(c.ancho),
                height:   _cm(_altoNecesario(c.alto, lineas.length, fontSize)),
                fontSize,
                align:    c.align || 'left'
            };
        });
    };

    /**
     * Arma los textos del cheque de un pago.
     * @param {Object} pago   - Datos del repository
     * @param {Object} layout - Layout del reporte
     */
    const _construirValores = (pago, layout) => {
        const monto   = Math.round(Math.abs(pago.total));
        const formato = layout.formato;
        return {
            valor:    `${formato.prefijoValor}${_formatearMiles(monto)}${formato.sufijoValor}`,
            dia:      String(pago.fecha.dia).padStart(2, '0'),
            mes:      MESES[pago.fecha.mes - 1] || '',
            anio:     String(pago.fecha.anio),
            nombre:   _limpiar(pago.beneficiario).toUpperCase(),
            cantidad: `${formato.prefijoLetras}${NumeroALetras.convertir(monto)}${formato.sufijoLetras}`
        };
    };

    /**
     * Determina qué pago va en qué posición y valida la asignación.
     * @returns {{ id: string, posicion: number }[]}
     */
    const _resolverAsignaciones = (ids, customData, maxPosiciones, calibracion) => {
        if (calibracion) {
            return Array.from({ length: maxPosiciones }, (_, i) => ({ id: ids[0], posicion: i + 1 }));
        }

        if (ids.length > maxPosiciones) {
            throw new Error(`[ASPagoFacturaService] Se pueden imprimir como máximo ${maxPosiciones} cheques por hoja.`);
        }

        let posiciones = customData.posiciones;
        if (typeof posiciones === 'string') {
            try { posiciones = JSON.parse(posiciones); } catch (e) { posiciones = null; }
        }

        if (!posiciones) {
            if (ids.length > 1) {
                throw new Error('[ASPagoFacturaService] Para imprimir varios pagos se debe indicar la posición de cada uno.');
            }
            return [{ id: ids[0], posicion: _resolverPosicion(customData, maxPosiciones) }];
        }

        const usadas = new Set();
        return ids.map((id) => {
            const posicion = parseInt(posiciones[id], 10);
            if (!(posicion >= 1 && posicion <= maxPosiciones)) {
                throw new Error(`[ASPagoFacturaService] Posición inválida para el pago ${id}: "${posiciones[id]}".`);
            }
            if (usadas.has(posicion)) {
                throw new Error(`[ASPagoFacturaService] La posición ${posicion} está asignada a más de un pago.`);
            }
            usadas.add(posicion);
            return { id: String(id), posicion };
        });
    };

    // ─── Configuración por impresora (customrecord_as_config_cheque) ─────────

    /** Campos del layout y su prefijo en el record de configuración. */
    const CAMPOS_CONFIG = [
        { campo: 'valor',    prefijo: 'valor'  },
        { campo: 'dia',      prefijo: 'dia'    },
        { campo: 'mes',      prefijo: 'mes'    },
        { campo: 'anio',     prefijo: 'anio'   },
        { campo: 'nombre',   prefijo: 'nombre' },
        { campo: 'cantidad', prefijo: 'cant'   }
    ];

    const _vacio = (v) => v === null || v === undefined || v === '';

    const _numero = (v) => {
        if (_vacio(v)) return null;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
    };

    const _asignar = (destino, clave, valor) => {
        if (!_vacio(valor)) destino[clave] = valor;
    };

    /** Solo letras, espacios, comas y guiones: evita romper el CSS de la plantilla. */
    const _fuenteSegura = (fuente) => {
        const limpia = String(fuente || '').replace(/[^A-Za-z ,\-]/g, '').trim();
        return limpia || null;
    };

    /**
     * Combina el layout base (Lib.Constants) con la configuración de la impresora.
     * Los campos vacíos del record conservan el valor base.
     */
    const _aplicarConfiguracion = (base, cfg) => {
        const layout = JSON.parse(JSON.stringify(base));
        if (!cfg) return layout;

        _asignar(layout, 'desplazamientoX', _numero(cfg.desp_x));
        _asignar(layout, 'desplazamientoY', _numero(cfg.desp_y));
        _asignar(layout, 'margenSuperior',  _numero(cfg.margen_sup));
        _asignar(layout, 'margenIzquierdo', _numero(cfg.margen_izq));
        _asignar(layout, 'altoCheque',      _numero(cfg.alto_cheque));
        _asignar(layout, 'fontFamily',      _fuenteSegura(cfg.fuente));
        if (!_vacio(cfg.negrita)) layout.fontWeight = (cfg.negrita === 'T' || cfg.negrita === true) ? 'bold' : 'normal';
        if (_numero(cfg.tam_fuente)) layout.fontSize = `${_numero(cfg.tam_fuente)}pt`;

        CAMPOS_CONFIG.forEach(({ campo, prefijo }) => {
            const destino = layout.campos[campo];
            _asignar(destino, 'x',     _numero(cfg[`${prefijo}_x`]));
            _asignar(destino, 'y',     _numero(cfg[`${prefijo}_y`]));
            _asignar(destino, 'ancho', _numero(cfg[`${prefijo}_ancho`]));
        });
        // Tamaño de fuente por campo (vacío = tamaño general)
        const _fuenteCampo = (campos, valor) => {
            if (_numero(valor)) campos.forEach(c => { layout.campos[c].fontSize = `${_numero(valor)}pt`; });
        };
        _fuenteCampo(['valor'],               cfg.valor_tam_fuente);
        _fuenteCampo(['dia', 'mes', 'anio'],  cfg.fecha_tam_fuente);
        _fuenteCampo(['nombre'],              cfg.nombre_tam_fuente);
        _fuenteCampo(['cantidad'],            cfg.cant_tam_fuente);
        if (_numero(cfg.cant_max_lineas)) layout.campos.cantidad.maxLineas = Math.max(1, Math.round(_numero(cfg.cant_max_lineas)));

        _asignar(layout.formato, 'prefijoValor',  cfg.pref_valor);
        _asignar(layout.formato, 'sufijoValor',   cfg.suf_valor);
        _asignar(layout.formato, 'prefijoLetras', cfg.pref_letras);
        _asignar(layout.formato, 'sufijoLetras',  cfg.suf_letras);

        return layout;
    };

    /**
     * Obtiene la configuración a usar y valida que corresponda a la subsidiaria de los pagos.
     * @returns {Object|null}
     */
    const _resolverConfiguracion = (customData, subsidiaria) => {
        const idConfig = customData.configuracion ? String(customData.configuracion) : '';

        if (idConfig) {
            const cfg = PagoFacturaRepository.getConfiguracionCheque({ id: idConfig });
            if (!cfg) {
                throw new Error(`[ASPagoFacturaService] La configuración de impresora ${idConfig} no existe o está inactiva.`);
            }
            if (subsidiaria && cfg.subsidiarias.length && !cfg.subsidiarias.includes(String(subsidiaria))) {
                throw new Error(`[ASPagoFacturaService] La impresora "${cfg.nombre}" no pertenece a la subsidiaria de los pagos.`);
            }
            return cfg;
        }

        return PagoFacturaRepository.getConfiguracionCheque({ subsidiaria });
    };

    /** yyyyMMdd de hoy, para el nombre del archivo con varios cheques. */
    const _fechaHoy = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };

    const PagoFacturaService = {

        /**
         * Reporte: Cheque BCI de Pago de Factura.
         * Record: vendorpayment
         *
         * @param {string[]} ids          - internalIds de los pagos (máx. 4)
         * @param {Object}   customData   - { posiciones?, posicion?, calibracion? }
         * @param {Object}   reportConfig - Config del reporte (incluye layout)
         * @returns {{ header: Object, cheques: Object[], debug: boolean, hoja: Object }}
         */
        pagofactura_cheque_pdf: (ids, customData = {}, reportConfig = {}) => {
            const layoutBase = reportConfig.layout;
            if (!layoutBase) {
                throw new Error('[ASPagoFacturaService] El reporte no tiene layout configurado.');
            }

            const calibracion  = customData.calibracion === true || customData.calibracion === 'true';
            const asignaciones = _resolverAsignaciones(ids, customData, layoutBase.maxPosiciones, calibracion);

            const idsUnicos = [...new Set(asignaciones.map(a => a.id))];
            const pagos     = PagoFacturaRepository.getDatosCheques(idsUnicos);
            const pagosPorId = {};
            pagos.forEach((p) => { pagosPorId[p.idInterno] = p; });

            const faltantes = idsUnicos.filter(id => !pagosPorId[id]);
            if (faltantes.length) {
                throw new Error(`[ASPagoFacturaService] No se encontraron los Pagos de Factura ID: ${faltantes.join(', ')}`);
            }

            const subsidiarias = [...new Set(pagos.map(p => p.subsidiaria))];
            if (subsidiarias.length > 1) {
                throw new Error('[ASPagoFacturaService] Todos los pagos de una hoja deben ser de la misma subsidiaria.');
            }

            const configuracion = _resolverConfiguracion(customData, subsidiarias[0]);
            const layout        = _aplicarConfiguracion(layoutBase, configuracion);

            const cheques = asignaciones
                .sort((a, b) => a.posicion - b.posicion)
                .map(({ id, posicion }) => ({
                    posicion,
                    idPago:   id,
                    marcoTop: _cm(layout.margenSuperior + layout.desplazamientoY + (posicion - 1) * layout.altoCheque),
                    campos:   _construirCampos(_construirValores(pagosPorId[id], layout), layout, posicion)
                }));

            const unico = idsUnicos.length === 1 ? pagosPorId[idsUnicos[0]] : null;

            return {
                header: {
                    cantidadCheques: cheques.length,
                    numeroDocumento: unico ? unico.numeroDocumento : '',
                    nombreArchivo:   unico ? `Cheque-${unico.numeroDocumento}` : `Cheques-${_fechaHoy()}`
                },
                hoja: {
                    impresora:  configuracion ? _limpiar(configuracion.nombre) : 'Calibración base',
                    altoCheque: _cm(layout.altoCheque),
                    fontFamily: layout.fontFamily,
                    fontWeight: layout.fontWeight
                },
                cheques,
                debug: calibracion
            };
        }
    };

    return PagoFacturaService;
});
