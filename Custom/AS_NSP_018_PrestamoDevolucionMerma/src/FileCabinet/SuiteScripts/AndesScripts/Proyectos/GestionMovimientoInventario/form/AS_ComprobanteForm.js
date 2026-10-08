/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Arma el PDF del comprobante con los datos ya leidos: el payload
 *              que leen las plantillas (doc.cabecera, doc.lineas, doc.totales,
 *              alias jsonString) y la plantilla FTL que corresponde al tipo.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/render', 'N/file', '../constants/AS_MovimientoInventarioConstants'],
    (render, file, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirComprobante(movimiento, tipo, lineas, prestadaPorLinea) {
        const renderizador = render.create();

        renderizador.templateContent = file.load({ id: elegirPlantilla(tipo) }).getContents();
        renderizador.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias : 'jsonString',
            data  : { text: JSON.stringify(armarDocumento(movimiento, lineas, prestadaPorLinea)).replace(/&/g, '&amp;') },
        });

        return renderizador.renderAsString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function elegirPlantilla(tipo) {
        if (tipo === CONSTANTES.TIPOS.PRESTAMO) return CONSTANTES.PLANTILLAS.PRESTAMO;
        if (tipo === CONSTANTES.TIPOS.DEVOLUCION) return CONSTANTES.PLANTILLAS.DEVOLUCION;
        return CONSTANTES.PLANTILLAS.MERMA;
    }

    function armarDocumento(movimiento, lineas, prestadaPorLinea) {
        const totales = lineas.reduce((acumulado, linea) => ({
            cantidad : acumulado.cantidad + linea.cantidad,
            devuelta : acumulado.devuelta + linea.devuelta,
            pendiente: acumulado.pendiente + linea.pendiente,
        }), { cantidad: 0, devuelta: 0, pendiente: 0 });

        return {
            cabecera: {
                numero     : movimiento.getValue({ fieldId: 'name' }),
                sentido    : movimiento.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' }) ? 'A la Clinica' : (movimiento.getValue({ fieldId: 'custrecord_as_mov_de_la_clinica' }) ? 'De la Clinica' : ''),
                fecha      : movimiento.getText({ fieldId: 'custrecord_as_mov_fecha' }),
                subsidiaria: movimiento.getText({ fieldId: 'custrecord_as_mov_subsidiaria' }),
                servicio   : movimiento.getText({ fieldId: 'custrecord_as_mov_servicio' }),
                entidad    : movimiento.getText({ fieldId: 'custrecord_as_mov_entidad_receptora' }) || '',
                origen     : movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion' }),
                destino    : movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
                responsable: movimiento.getText({ fieldId: 'custrecord_as_mov_usuario_resp' }),
                estado     : movimiento.getText({ fieldId: 'custrecord_as_mov_estado' }),
                traslado   : movimiento.getText({ fieldId: 'custrecord_as_mov_transfer' }) || '',
                prestamo   : movimiento.getText({ fieldId: 'custrecord_as_mov_prestamo_ref' }) || '',
                motivo     : movimiento.getText({ fieldId: 'custrecord_as_mov_motivo' }) || '',
                cuenta     : movimiento.getText({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }) || '',
                comentarios: movimiento.getValue({ fieldId: 'custrecord_as_mov_comentarios' }) || '',
            },
            lineas: lineas.map((linea) => ({
                articulo : linea.articuloTexto,
                unidad   : linea.unidadTexto || '',
                lote     : linea.lote || '',
                cantidad : String(linea.cantidad),
                devuelta : String(linea.devuelta),
                pendiente: String(linea.pendiente),
                prestada : String(prestadaPorLinea[linea.lineaPrestamo] === undefined ? '' : prestadaPorLinea[linea.lineaPrestamo]),
            })),
            totales: {
                articulos: String(lineas.length),
                cantidad : String(totales.cantidad),
                devuelta : String(totales.devuelta),
                pendiente: String(totales.pendiente),
            },
        };
    }

    return {
        construirComprobante: construirComprobante,
    };
});
