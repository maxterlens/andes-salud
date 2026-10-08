/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description El MAIN del formulario de captura de la solicitud, con los datos
 *              que arma AS_RegistroHandler.mostrarFormulario. Arma la cabecera
 *              comun y llama a la parte del tipo:
 *
 *              AS_MovimientoInventarioFormPrestamo     lo propio del prestamo
 *              AS_MovimientoInventarioFormDevolucion   lo propio de la devolucion
 *              AS_MovimientoInventarioFormMerma        lo propio de la merma
 *
 *              construirFormulario se lee como indice: formulario y grupos,
 *              cabecera, datos para el CS, la parte del tipo, el detalle, el modo
 *              edicion y el boton de guardar.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', 'N/ui/message', '../constants/AS_MovimientoInventarioConstants', './AS_MovimientoInventarioFormPrestamo', './AS_MovimientoInventarioFormDevolucion', './AS_MovimientoInventarioFormMerma'],
    (serverWidget, message, CONSTANTES, formPrestamo, formDevolucion, formMerma) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(datos) {
        const form = crearFormulario(datos);

        agregarCabecera(form, datos);
        agregarDatosParaElCs(form, datos);

        if (datos.esPrestamo) formPrestamo.armarCampos(form, datos);
        if (datos.esDevolucion) formDevolucion.armarCampos(form, datos);
        if (datos.esMerma) formMerma.armarCampos(form, datos);
        if (!datos.esDevolucion) armarDetalleSalida(form, datos.nombreTipo, datos.esALaClinica);
        if (datos.movimiento) aplicarModoEdicion(form, datos);
        if (datos.esPrestamo && datos.esALaClinica) formPrestamo.ajustarALaClinica(form, datos);
        if (datos.esDevolucion && datos.esALaClinica) formDevolucion.ajustarALaClinica(form, datos);
        if (!datos.esDevolucion || datos.idPrestamo) form.addSubmitButton({ label: datos.movimiento ? 'Actualizar Solicitud' : 'Guardar Solicitud' });

        return form;
    }

    function construirAvisoSoloConsulta() {
        const form = serverWidget.createForm({ title: 'Movimiento de Inventario - Solo Consulta' });

        form.addPageInitMessage({
            type   : message.Type.WARNING,
            title  : 'Tu rol es de solo consulta',
            message: 'No puedes crear ni editar movimientos de inventario. '
                   + 'Puedes buscarlos, abrirlos en modo Ver e imprimir sus comprobantes.',
        });

        const aviso = form.addField({
            id   : 'custpage_aviso_solo_consulta',
            type : serverWidget.FieldType.INLINEHTML,
            label: 'Aviso',
        });

        aviso.defaultValue = '<p>Ingresa a <strong>Transacciones &gt; Gestion de Movimientos '
                           + '&gt; Movimientos de Inventario &gt; Buscar</strong> para consultar los registros.</p>';

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * El formulario con su titulo y los tres grupos: tipo, datos del movimiento
     * y los datos propios del tipo. Deja los ids de grupo en datos para que la
     * cabecera y cada tipo ubiquen sus campos.
     */
    function crearFormulario(datos) {
        const esPrestamo      = datos.esPrestamo;
        const esDevolucion    = datos.esDevolucion;
        const esMerma         = datos.esMerma;
        const esALaClinica    = datos.esALaClinica;
        const titulo          = datos.movimiento ? 'Edicion de Solicitud de Inventario' : 'Registro de Solicitud de Inventario';
        const form            = serverWidget.createForm({ title: titulo });
        const grupoTipo       = 'custpage_grupo_tipo_movimiento';
        const grupoMovimiento = 'custpage_grupo_datos_movimiento';

        let grupoEspecifico         = '';
        let etiquetaGrupoMovimiento = '2. Datos del Movimiento';

        if (esPrestamo) etiquetaGrupoMovimiento = esALaClinica ? '2. Destino' : '2. Origen y Destino';
        if (esDevolucion) etiquetaGrupoMovimiento = '2. Prestamo a Devolver';

        form.addFieldGroup({ id: grupoTipo, label: '1. Tipo de Movimiento' });
        form.addFieldGroup({ id: grupoMovimiento, label: etiquetaGrupoMovimiento });

        if (esPrestamo) {
            grupoEspecifico = 'custpage_grupo_datos_prestamo';
            form.addFieldGroup({ id: grupoEspecifico, label: '3. Datos del Prestamo' });
        } else if (esDevolucion) {
            grupoEspecifico = 'custpage_grupo_datos_devolucion';
            form.addFieldGroup({ id: grupoEspecifico, label: '3. Datos de la Devolucion' });
        } else if (esMerma) {
            grupoEspecifico = 'custpage_grupo_datos_baja';
            form.addFieldGroup({ id: grupoEspecifico, label: '3. Datos de la Baja' });
        }

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;

        datos.grupoTipo       = grupoTipo;
        datos.grupoMovimiento = grupoMovimiento;
        datos.grupoEspecifico = grupoEspecifico;

        return form;
    }

    /**
     * Los campos comunes a los tres tipos: tipo, sentido, fecha, subsidiaria,
     * servicio, entidad, ubicaciones, responsable y comentarios. Deja los campos
     * en datos.campos para que cada tipo los ajuste.
     */
    function agregarCabecera(form, datos) {
        const parametros   = datos.parametros;
        const nombreTipo   = datos.nombreTipo;
        const esPrestamo   = datos.esPrestamo;
        const esDevolucion = datos.esDevolucion;
        const esALaClinica = datos.esALaClinica;

        const campoTipo = agregarCampo(form, {
            id   : 'custpage_tipo',
            type : serverWidget.FieldType.SELECT,
            label: 'Tipo de Movimiento',
        }, datos.grupoTipo);
        campoTipo.isMandatory = true;
        campoTipo.defaultValue = datos.idTipo;
        campoTipo.addSelectOption({ value: '', text: '' });
        CONSTANTES.ORDEN_TIPOS.forEach((nombre) => {
            const opcion = datos.tipos.filter((tipo) => tipo.nombre === nombre)[0];
            campoTipo.addSelectOption({ value: opcion.id, text: opcion.nombre });
        });

        if (esPrestamo || esDevolucion) {
            const campoDeLaClinica = agregarCampo(form, {
                id   : 'custpage_de_la_clinica',
                type : serverWidget.FieldType.CHECKBOX,
                label: 'De la Clinica',
            }, datos.grupoTipo);
            campoDeLaClinica.defaultValue = esALaClinica ? 'F' : 'T';
            campoDeLaClinica.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
            const campoALaClinica = agregarCampo(form, {
                id   : 'custpage_a_la_clinica',
                type : serverWidget.FieldType.CHECKBOX,
                label: 'A la Clinica',
            }, datos.grupoTipo);
            campoALaClinica.defaultValue = esALaClinica ? 'T' : 'F';
            const campoSentido = form.addField({
                id   : 'custpage_sentido',
                type : serverWidget.FieldType.TEXT,
                label: 'Sentido',
            });
            campoSentido.defaultValue = esALaClinica ? CONSTANTES.SENTIDOS.A_LA_CLINICA : CONSTANTES.SENTIDOS.DE_LA_CLINICA;
            campoSentido.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            if (datos.movimiento || (esDevolucion && datos.idPrestamo)) {
                campoDeLaClinica.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
                campoALaClinica.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            }
        }

        const campoFecha = agregarCampo(form, {
            id   : 'custpage_fecha',
            type : serverWidget.FieldType.DATE,
            label: CONSTANTES.ETIQUETAS_FECHA[nombreTipo] || 'Fecha',
        }, (esPrestamo || esDevolucion) ? datos.grupoEspecifico : datos.grupoMovimiento);
        campoFecha.isMandatory = true;
        campoFecha.defaultValue = parametros.fecha;

        const campoSubsidiaria = agregarCampo(form, {
            id    : 'custpage_subsidiaria',
            type  : serverWidget.FieldType.SELECT,
            label : 'Subsidiaria',
            source: 'subsidiary',
        }, datos.grupoMovimiento);
        campoSubsidiaria.isMandatory = true;
        const campoServicio = agregarCampo(form, {
            id    : 'custpage_servicio',
            type  : serverWidget.FieldType.SELECT,
            label : 'Servicio',
            source: 'department',
        }, datos.grupoMovimiento);
        campoServicio.isMandatory = true;
        const campoEntidad = agregarCampo(form, {
            id   : 'custpage_entidad_receptora',
            type : serverWidget.FieldType.SELECT,
            label: esPrestamo ? 'Entidad Receptora del Prestamo' : 'Entidad Receptora',
        }, datos.grupoMovimiento);
        campoEntidad.addSelectOption({ value: '', text: '' });
        const campoFrom = agregarCampo(form, {
            id   : 'custpage_ubicacion',
            type : serverWidget.FieldType.SELECT,
            label: CONSTANTES.ETIQUETAS_UBICACION[nombreTipo] || 'Ubicacion Origen',
        }, datos.grupoMovimiento);
        campoFrom.isMandatory = true;
        campoFrom.addSelectOption({ value: '', text: '' });
        campoFrom.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        const campoTo = agregarCampo(form, {
            id   : 'custpage_ubicacion_dest',
            type : serverWidget.FieldType.SELECT,
            label: 'Ubicacion Destino',
        }, datos.grupoMovimiento);
        campoTo.isMandatory = true;
        campoTo.addSelectOption({ value: '', text: '' });
        const campoUsuario = agregarCampo(form, {
            id    : 'custpage_usuario_resp',
            type  : serverWidget.FieldType.SELECT,
            label : CONSTANTES.ETIQUETAS_RESPONSABLE[nombreTipo] || 'Usuario Responsable',
            source: 'employee',
        }, datos.grupoEspecifico || datos.grupoMovimiento);
        campoUsuario.isMandatory = true;
        campoUsuario.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        campoUsuario.defaultValue = parametros.responsable;
        const campoComentarios = agregarCampo(form, {
            id   : 'custpage_comentarios',
            type : serverWidget.FieldType.TEXTAREA,
            label: 'Comentarios',
        }, datos.grupoEspecifico || datos.grupoMovimiento);
        campoComentarios.defaultValue = parametros.comentarios;

        datos.campos          = {
            campoTipo       : campoTipo,
            campoFecha      : campoFecha,
            campoSubsidiaria: campoSubsidiaria,
            campoServicio   : campoServicio,
            campoEntidad    : campoEntidad,
            campoFrom       : campoFrom,
            campoTo         : campoTo,
            campoUsuario    : campoUsuario,
            campoComentarios: campoComentarios,
        };
    }

    /**
     * El JSON escondido con las ubicaciones, prestamos, entidades y cuentas de
     * todas las subsidiarias: el CS filtra los combos con el sin volver al servidor.
     */
    function agregarDatosParaElCs(form, datos) {
        const campoUbicaciones = form.addField({
            id   : 'custpage_ubicaciones_data',
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Ubicaciones',
        });
        campoUbicaciones.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoUbicaciones.defaultValue = JSON.stringify({
            esPrestamo  : datos.esPrestamo,
            esMerma     : datos.esMerma,
            esALaClinica: datos.esALaClinica,
            ubicaciones : datos.ubicaciones,
            prestamos   : datos.prestamosPendientes,
            entidades   : datos.entidades,
            cuentas     : datos.cuentasAjuste,
        });
    }

    function agregarCampo(form, opciones, contenedor) {
        if (contenedor) {
            opciones.container = contenedor;
        }

        return form.addField(opciones);
    }

    function armarDetalleSalida(form, nombreTipo, esALaClinica) {
        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.INLINEEDITOR,
            label: obtenerEtiquetaDetalle(nombreTipo),
        });

        sublista.addField({
            id    : 'custpage_col_articulo',
            type  : serverWidget.FieldType.SELECT,
            label : CONSTANTES.ETIQUETAS_DETALLE.ARTICULO,
            source: 'item',
        }).isMandatory = true;

        sublista.addField({
            id   : 'custpage_col_unidad',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_disponible',
            type : serverWidget.FieldType.FLOAT,
            label: 'Disponible',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        const campoLote = sublista.addField({
            id   : 'custpage_col_lote',
            type : esALaClinica ? serverWidget.FieldType.TEXT : serverWidget.FieldType.SELECT,
            label: CONSTANTES.ETIQUETAS_DETALLE.LOTE,
        });
        if (!esALaClinica) campoLote.addSelectOption({ value: '', text: '' });
        if (esALaClinica && nombreTipo === CONSTANTES.TIPOS.PRESTAMO) campoLote.isMandatory = true;

        const etiquetaCantidad = (nombreTipo === CONSTANTES.TIPOS.MERMA) ? 'Cantidad a Dar de Baja' : 'Cantidad Prestada';

        sublista.addField({
            id   : 'custpage_col_cantidad',
            type : serverWidget.FieldType.FLOAT,
            label: etiquetaCantidad,
        }).isMandatory = true;
    }

    function obtenerEtiquetaDetalle(nombreTipo) {
        if (nombreTipo === CONSTANTES.TIPOS.PRESTAMO) return '4. Productos a Prestar';
        if (nombreTipo === CONSTANTES.TIPOS.MERMA) return '4. Productos que se Daran de Baja';
        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) return '4. Productos a Devolver';
        return '3. ' + CONSTANTES.ETIQUETAS_DETALLE.TITULO;
    }

    function aplicarModoEdicion(form, datos) {
        aplicarModoEdicionComun(form, datos);

        if (datos.esDevolucion) {
            formDevolucion.aplicarModoEdicion(form, datos);
            return;
        }

        if (datos.esMerma) formMerma.aplicarModoEdicion(form, datos);
        aplicarModoEdicionSalida(form, datos);
    }

    function aplicarModoEdicionComun(form, datos) {
        const movimiento = datos.movimiento;
        const campoMovimiento = form.addField({
            id   : 'custpage_movimiento',
            type : serverWidget.FieldType.TEXT,
            label: 'Movimiento',
        });
        campoMovimiento.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoMovimiento.defaultValue = movimiento.id;
        const tieneTraslado = movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' });
        const campoBloqueado = form.addField({
            id   : 'custpage_detalle_bloqueado',
            type : serverWidget.FieldType.TEXT,
            label: 'Detalle bloqueado',
        });
        campoBloqueado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoBloqueado.defaultValue = tieneTraslado ? 'T' : 'F';
        datos.campos.campoFecha.defaultValue = movimiento.getText({ fieldId: 'custrecord_as_mov_fecha' });
        datos.campos.campoUsuario.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_usuario_resp' });
        datos.campos.campoComentarios.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_comentarios' });
        datos.campos.campoTipo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
    }

    function aplicarModoEdicionSalida(form, datos) {
        const movimiento = datos.movimiento;
        const campos = datos.campos;
        const entidadGuardada = movimiento.getValue({ fieldId: 'custrecord_as_mov_entidad_receptora' });
        if (entidadGuardada) {
            campos.campoEntidad.addSelectOption({
                value: entidadGuardada,
                text : movimiento.getText({ fieldId: 'custrecord_as_mov_entidad_receptora' }),
            });
            campos.campoEntidad.defaultValue = entidadGuardada;
        }
        const ubicacionOrigen = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const ubicacionDestino = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
        if (ubicacionOrigen) campos.campoFrom.addSelectOption({ value: ubicacionOrigen, text: movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion' }) });
        campos.campoTo.addSelectOption({ value: ubicacionDestino, text: movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }) });
        campos.campoSubsidiaria.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        campos.campoServicio.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_servicio' });
        campos.campoFrom.defaultValue = ubicacionOrigen;
        campos.campoTo.defaultValue = ubicacionDestino;
        campos.campoSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campos.campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campos.campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        const displaySalida = datos.esMerma ? serverWidget.FieldDisplayType.HIDDEN : serverWidget.FieldDisplayType.DISABLED;
        campos.campoTo.updateDisplayType({ displayType: displaySalida });
        campos.campoEntidad.updateDisplayType({ displayType: displaySalida });
        precargarDetalleSalida(form, datos);
        if (movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' })) {
            const sublista = form.getSublist({ id: 'custpage_sl_detalle' });
            sublista.getField({ id: 'custpage_col_articulo' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_cantidad' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_lote' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_disponible' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }
    }

    function precargarDetalleSalida(form, datos) {
        const sublista = form.getSublist({ id: 'custpage_sl_detalle' });
        const lineas   = datos.lineasSalida;

        if (datos.esALaClinica) {
            lineas.forEach((linea, indice) => {
                sublista.setSublistValue({ id: 'custpage_col_articulo', line: indice, value: String(linea.articulo) });
                sublista.setSublistValue({ id: 'custpage_col_cantidad', line: indice, value: String(linea.cantidad) });
                if (linea.lote) sublista.setSublistValue({ id: 'custpage_col_lote', line: indice, value: linea.lote });
                if (linea.unidadTexto) sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            });
            return;
        }

        const stock     = datos.stockSalida;
        const campoLote = sublista.getField({ id: 'custpage_col_lote' });

        const nombresCargados = {};
        const stockDeLotes    = {};

        lineas.forEach((linea) => {
            if (nombresCargados[linea.articulo]) {
                return;
            }

            nombresCargados[linea.articulo] = true;

            datos.lotesSalida[linea.articulo].forEach((lote) => {
                nombresCargados[lote.nombreLote] = true;
                stockDeLotes[linea.articulo + '|' + lote.nombreLote] = lote.enMano;

                campoLote.addSelectOption({
                    value: lote.nombreLote,
                    text : linea.articuloTexto + ' - ' + lote.nombreLote + ' (hay ' + lote.enMano + ')',
                });
            });
        });

        lineas.forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_articulo',   line: indice, value: String(linea.articulo) });
            sublista.setSublistValue({ id: 'custpage_col_cantidad',   line: indice, value: String(linea.cantidad) });
            const enMano = stockDeLotes[linea.articulo + '|' + linea.lote];

            sublista.setSublistValue({
                id   : 'custpage_col_disponible',
                line : indice,
                value: String(enMano === undefined ? stock[String(linea.articulo)].disponible : enMano),
            });

            if (linea.lote) {
                if (!nombresCargados[linea.lote]) {
                    campoLote.addSelectOption({ value: linea.lote, text: linea.lote });
                }

                sublista.setSublistValue({ id: 'custpage_col_lote', line: indice, value: linea.lote });
            }
            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    return {
        construirFormulario       : construirFormulario,
        construirAvisoSoloConsulta: construirAvisoSoloConsulta,
    };
});
