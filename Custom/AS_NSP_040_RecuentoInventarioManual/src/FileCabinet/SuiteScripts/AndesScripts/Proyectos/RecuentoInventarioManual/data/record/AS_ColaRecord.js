/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description La solicitud de AS Recuento Inventario Manual Cola: una por cada
 *              Generar recuento y cada Cargar CSV.
 *
 *              crearSolicitud    → la deja Pendiente con su tipo y sus datos.
 *              leerSolicitud     → el tipo, los datos ya como objeto y el
 *                                  recuento, para procesarla.
 *              marcarProcesando  → el Scheduled la tomo: la hora de inicio.
 *              marcarListo       → termino: el recuento, los tiempos y la hora
 *                                  de fin.
 *              marcarError       → fallo o se interrumpio: el mensaje y la hora
 *                                  de fin.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 */
define(['N/record', '../../constants/AS_RecuentoInventarioManualConstants'],
    (record, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function crearSolicitud(tipo, solicitud) {
        const campos = CONSTANTES.COLA.CAMPOS;
        const cola   = record.create({ type: CONSTANTES.COLA.TIPO });

        cola.setValue({ fieldId: campos.TIPO,   value: tipo });
        cola.setValue({ fieldId: campos.ESTADO, value: CONSTANTES.COLA.ESTADOS.PENDIENTE });
        cola.setValue({ fieldId: campos.DATOS,  value: JSON.stringify(solicitud.datos) });
        if (solicitud.recuento) cola.setValue({ fieldId: campos.RECUENTO, value: solicitud.recuento });
        if (solicitud.ubicacion) cola.setValue({ fieldId: campos.UBICACION, value: solicitud.ubicacion });

        return cola.save();
    }

    function leerSolicitud(solicitudId) {
        const campos = CONSTANTES.COLA.CAMPOS;
        const cola   = record.load({ type: CONSTANTES.COLA.TIPO, id: solicitudId });

        return {
            id      : solicitudId,
            tipo    : cola.getValue({ fieldId: campos.TIPO }),
            datos   : JSON.parse(cola.getValue({ fieldId: campos.DATOS })),
            recuento: cola.getValue({ fieldId: campos.RECUENTO }),
        };
    }

    function marcarProcesando(solicitudId) {
        const campos = CONSTANTES.COLA.CAMPOS;
        actualizarSolicitud(solicitudId, {
            [campos.ESTADO]: CONSTANTES.COLA.ESTADOS.PROCESANDO,
            [campos.INICIO]: new Date(),
        });
    }

    function marcarListo(solicitudId, recuentoId, tiempos) {
        const campos = CONSTANTES.COLA.CAMPOS;
        actualizarSolicitud(solicitudId, {
            [campos.ESTADO]  : CONSTANTES.COLA.ESTADOS.LISTO,
            [campos.RECUENTO]: recuentoId,
            [campos.TIEMPOS] : tiempos,
            [campos.FIN]     : new Date(),
        });
    }

    function marcarError(solicitudId, mensaje) {
        const campos = CONSTANTES.COLA.CAMPOS;
        actualizarSolicitud(solicitudId, {
            [campos.ESTADO]: CONSTANTES.COLA.ESTADOS.ERROR,
            [campos.ERROR] : mensaje,
            [campos.FIN]   : new Date(),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function actualizarSolicitud(solicitudId, valores) {
        record.submitFields({ type: CONSTANTES.COLA.TIPO, id: solicitudId, values: valores });
    }

    return {
        crearSolicitud  : crearSolicitud,
        leerSolicitud   : leerSolicitud,
        marcarProcesando: marcarProcesando,
        marcarListo     : marcarListo,
        marcarError     : marcarError,
    };
});
