/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description El comprobante en PDF del movimiento. Arma el payload que la
 *              plantilla espera y lo renderiza contra el FTL del tipo.
 *
 *              Son dos plantillas y no una con condicionales: el comprobante de
 *              prestamo lleva el seguimiento por linea (Prestada, Devuelta,
 *              Pendiente) y firma quien recibe el material; el de devolucion
 *              solo dice cuanto volvio, contra que prestamo, y firma al reves.
 *
 *              La plantilla no calcula nada: recibe los totales y las cantidades
 *              ya como texto, para que el locale de la cuenta no le meta
 *              separador de miles a una cantidad de insumos.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/render', 'N/file', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository'],
    (render, file, CONSTANTES, movimientoRepository) => {

    function imprimirMovimiento(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        const movimiento = movimientoRepository.cargarMovimiento(idMovimiento);
        const tipo       = movimiento.getText({ fieldId: 'custrecord_as_mov_tipo' });
        const lineas     = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        const totales = lineas.reduce((acumulado, linea) => ({
            cantidad : acumulado.cantidad + linea.cantidad,
            devuelta : acumulado.devuelta + linea.devuelta,
            pendiente: acumulado.pendiente + linea.pendiente,
        }), { cantidad: 0, devuelta: 0, pendiente: 0 });

        const documento = {
            cabecera: {
                numero     : movimiento.getValue({ fieldId: 'name' }),
                fecha      : movimiento.getText({ fieldId: 'custrecord_as_mov_fecha' }),
                subsidiaria: movimiento.getText({ fieldId: 'custrecord_as_mov_subsidiaria' }),
                servicio   : movimiento.getText({ fieldId: 'custrecord_as_mov_servicio' }),
                origen     : movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion' }),
                destino    : movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
                responsable: movimiento.getText({ fieldId: 'custrecord_as_mov_usuario_resp' }),
                estado     : movimiento.getText({ fieldId: 'custrecord_as_mov_estado' }),
                traslado   : movimiento.getText({ fieldId: 'custrecord_as_mov_transfer' }) || '',
                prestamo   : movimiento.getText({ fieldId: 'custrecord_as_mov_prestamo_ref' }) || '',
                comentarios: movimiento.getValue({ fieldId: 'custrecord_as_mov_comentarios' }) || '',
            },
            lineas: lineas.map((linea) => ({
                articulo : linea.articuloTexto,
                unidad   : linea.unidadTexto || '',
                cantidad : String(linea.cantidad),
                devuelta : String(linea.devuelta),
                pendiente: String(linea.pendiente),
            })),
            totales: {
                articulos: String(lineas.length),
                cantidad : String(totales.cantidad),
                devuelta : String(totales.devuelta),
                pendiente: String(totales.pendiente),
            },
        };

        const plantilla = (tipo === CONSTANTES.TIPOS.PRESTAMO)
                        ? CONSTANTES.PLANTILLAS.PRESTAMO
                        : CONSTANTES.PLANTILLAS.DEVOLUCION;

        // El alias 'jsonString' y el escape del & son los mismos que usa el motor
        // de impresion de AS_NSP_008: las plantillas del repo leen el payload
        // siempre igual, con <#assign doc = jsonString.text?eval>.
        const renderizador = render.create();

        renderizador.templateContent = file.load({ id: plantilla }).getContents();
        renderizador.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias : 'jsonString',
            data  : { text: JSON.stringify(documento).replace(/&/g, '&amp;') },
        });

        context.response.renderPdf(renderizador.renderAsString());
    }

    return {
        imprimirMovimiento: imprimirMovimiento,
    };
});
