/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 *
 * Suitelet de Gestión de Solicitud de Consumo
 * ─────────────────────────────────────────────
 * Punto de entrada único para las operaciones de Ver, Crear y Editar
 * del registro Solicitud de Consumo para el rol Centro de Empleados.
 *
 * Este script actúa exclusivamente como router y orquestador:
 * delega toda la lógica a los módulos especializados.
 *
 * Capas:
 *  dao/GSC_Dao_Catalogos             → catálogos nativos (subsidiarias, departamentos, etc.)
 *  dao/GSC_Dao_SolicitudConsumo      → header: cargar, guardar, enviar a bodega
 *  dao/GSC_Dao_SolicitudConsumoDetalle → detalle: buscar y sincronizar líneas
 *  form/GSC_Form_Header              → renderizado de campos del header
 *  form/GSC_Form_Detalle             → renderizado de tabla de detalle HTML
 *  form/GSC_Form_Scripts             → inyección de scripts cliente y error renderer
 *  lib/GSC_Lib_Utils                 → utilidades puras (sin dependencias NS)
 *
 * Rutas GET:
 *   ?op=view&recid=X  → Vista read-only
 *   ?op=create        → Formulario de creación
 *   ?op=edit&recid=X  → Formulario de edición
 *
 * Ruta POST:
 *   custpage_accion=guardar|enviar + campos del form
 */
define([
    'N/log',
    'N/redirect',
    'N/runtime',
    'N/search',
    'N/ui/serverWidget',
    'N/url',
    './dao/GSC_Dao_Config',
    './dao/GSC_Dao_Catalogos',
    './dao/GSC_Dao_SolicitudConsumo',
    './dao/GSC_Dao_SolicitudConsumoDetalle',
    './form/GSC_Form_Header',
    './form/GSC_Form_Detalle',
    './form/GSC_Form_Scripts'
], function (
    nLog,
    redirect,
    runtime,
    search,
    serverWidget,
    url,
    daoConfig,
    daoCatalogos,
    daoSolicitudConsumo,
    daoDetalle,
    formHeader,
    formDetalle,
    formScripts
) {

    /* =========================================================
     * CONSTANTES
     * ========================================================= */
    const ESTADOS = {
        ENVIO_PENDIENTE : '7',
        ENVIADA         : '8',
        CERRADA         : '9'
    };

    const ACCIONES = {
        VIEW          : 'view',
        CREATE        : 'create',
        EDIT          : 'edit',
        ENVIAR        : 'enviar',
        BUSCAR_ART    : 'buscarArticulo',
        BUSCAR_UBK    : 'buscarUbicaciones'
    };

    const SCRIPT_ID     = 'customscript_as_solicitud_consumo_stlt';
    const DEPLOYMENT_ID = 'customdeploy_as_solicitud_consumo_stlt';

    /* =========================================================
     * ENTRADA PRINCIPAL
     * ========================================================= */
    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                _handleGet(context);
            } else {
                _handlePost(context);
            }
        } catch (e) {
            nLog.error('onRequest - error', e);
            formScripts.renderError(context.response, e.message || String(e));
        }
    }

    /* =========================================================
     * HANDLER GET — Routing por operación
     * ========================================================= */
    function _handleGet(context) {
        const params = context.request.parameters;
        const op     = params.op    || ACCIONES.VIEW;
        const id     = params.recid || null;

        nLog.error('_handleGet', { op: op, recid: id });

        switch (op) {
            case ACCIONES.CREATE:
                _renderCreate(context);
                break;
            case ACCIONES.EDIT:
                if (!id) { formScripts.renderError(context.response, 'Parámetro "recid" requerido para edición.'); return; }
                _renderEdit(context, id);
                break;
            case ACCIONES.ENVIAR:
                if (!id) { formScripts.renderError(context.response, 'Parámetro "recid" requerido para enviar.'); return; }
                _enviarABodegaGet(context, id);
                break;
            case ACCIONES.BUSCAR_ART:
                _buscarDatosArticulo(context);
                break;
            case ACCIONES.BUSCAR_UBK:
                _buscarUbicacionesPorSubsidiaria(context);
                break;
            case ACCIONES.VIEW:
            default:
                if (!id) { formScripts.renderError(context.response, 'Parámetro "recid" requerido para vista.'); return; }
                _renderView(context, id);
                break;
        }
    }

    /* =========================================================
     * HANDLER POST — Guardar + redirigir
     * ========================================================= */
    function _handlePost(context) {
        const params = context.request.parameters;
        log.error('handlePost params', params);
        const accion = params.custpage_accion || 'guardar';
        const id     = params.custpage_id     || null;

        nLog.error('_handlePost', { accion: accion, id: id });

        // Si la acción es editar: redirigir sin guardar
        if (accion === 'editar') {
            redirect.redirect({
                url: url.resolveScript({
                    scriptId    : SCRIPT_ID,
                    deploymentId: DEPLOYMENT_ID,
                    params      : { op: 'edit', recid: id }
                })
            });
            return;
        }

        // 1. Guardar header + líneas de detalle en un único record.save
        const solicitudId = daoSolicitudConsumo.guardar(context.request, id);

        // 3. Si la acción es enviar: cambiar estado a Enviada
        if (accion === 'enviar') {
            daoSolicitudConsumo.enviarABodega(solicitudId);
        }

        // 4. Redirigir a vista del registro
        redirect.redirect({
            url: url.resolveScript({
                scriptId    : SCRIPT_ID,
                deploymentId: DEPLOYMENT_ID,
                params      : { op: 'view', recid: solicitudId }
            })
        });
    }

    /* =========================================================
     * HANDLER GET: ENVIAR A BODEGA
     * Cambia el estado del registro a Enviada y redirige a view.
     * Permite al CS llamar esta acción sin necesitar N/record.
     * ========================================================= */
    function _enviarABodegaGet(context, id) {
        daoSolicitudConsumo.enviarABodega(id);
        redirect.redirect({
            url: url.resolveScript({
                scriptId    : SCRIPT_ID,
                deploymentId: DEPLOYMENT_ID,
                params      : { op: 'view', recid: id }
            })
        });
    }

    /* =========================================================
     * HANDLER GET: BUSCAR UBICACIONES POR SUBSIDIARIA (API JSON)
     * Recibe ?subsidiaria=X y devuelve JSON con:
     *   [{ id, name }, ...]
     * Permite al CS repoblar el select de ubicaciones sin N/search.
     * ========================================================= */
    function _buscarUbicacionesPorSubsidiaria(context) {
        const subsidiariaId = context.request.parameters.subsidiaria || '';
        const ubicaciones   = daoCatalogos.buscarUbicaciones(subsidiariaId || null);
        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        context.response.write(JSON.stringify(ubicaciones));
    }

    /* =========================================================
     * HANDLER GET: BUSCAR DATOS DE ARTÍCULO (API JSON)
     * Recibe ?articulo=X&ubicacion=Y y devuelve JSON con:
     *   { unidadTxt, unidadId, disponible }
     * Permite al CS obtener estos datos sin necesitar N/search.
     * ========================================================= */
    function _buscarDatosArticulo(context) {
        const params      = context.request.parameters;
        const articuloId  = params.articulo  || '';
        const ubicacionId = params.ubicacion  || '';

        var resultado = { unidadTxt: '', unidadId: '', disponible: 0 };

        try {
            if (articuloId) {
                const itemFields = search.lookupFields({
                    type   : search.Type.ITEM,
                    id     : articuloId,
                    columns: ['stockunit']
                });
                const stockUnit  = (itemFields.stockunit && itemFields.stockunit.length > 0)
                    ? itemFields.stockunit[0] : null;
                resultado.unidadTxt = stockUnit ? (stockUnit.text  || '') : '';
                resultado.unidadId  = stockUnit ? (stockUnit.value || '') : '';
            }
            if (articuloId && ubicacionId) {
                resultado.disponible = _obtenerStockDisponible(articuloId, ubicacionId);
            }
        } catch (e) {
            nLog.error('_buscarDatosArticulo - error', e);
        }

        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        context.response.write(JSON.stringify(resultado));
    }

    /* =========================================================
     * HELPER: STOCK DISPONIBLE
     * ========================================================= */
    function _obtenerStockDisponible(articuloId, ubicacionId) {
        try {
            const resultados = search.create({
                type   : search.Type.INVENTORY_BALANCE,
                filters: [
                    ['item.internalid',     'anyof', articuloId],
                    'AND',
                    ['location.internalid', 'anyof', ubicacionId]
                ],
                columns: [search.createColumn({ name: 'available', summary: 'SUM' })]
            }).run().getRange({ start: 0, end: 1 });
            return (resultados && resultados.length > 0)
                ? parseFloat(resultados[0].getValue({ name: 'available', summary: 'SUM' })) || 0
                : 0;
        } catch (e) {
            nLog.error('_obtenerStockDisponible - error', e);
            return 0;
        }
    }

    /* =========================================================
     * RENDER: VIEW
     * ========================================================= */
    function _renderView(context, id) {
        const datos       = daoSolicitudConsumo.cargar(id);
        const estado      = datos.custrecord_2win_consumo_estado;
        const currentUser = runtime.getCurrentUser();
        const userId      = String(currentUser.id);
        const solicitante = String(datos.custrecord_2win_consumo_solicitante || '');
        const ubicacionId = datos.custrecord_2win_consumo_ubicacion;

        const form = serverWidget.createForm({ title: 'Solicitud de Consumo' });
        form.clientScriptModulePath = './AS_Gestion_Solicitud_Consumo_CS_2.1.js';

        // ── Links de navegación ────────────────────────────────────────────
        form.addPageLink({ type: serverWidget.FormPageLinkType.CROSSLINK, title: 'Lista', url: _resolverUrlLista() });
        form.addPageLink({ type: serverWidget.FormPageLinkType.CROSSLINK, title: 'Nuevo', url: url.resolveScript({ scriptId: SCRIPT_ID, deploymentId: DEPLOYMENT_ID, params: { op: 'create' } }) });

        // ── Botones condicionales ──────────────────────────────────────────

        // Editar (si no está cerrada) — submit button para usar el POST del formulario
        if (estado !== ESTADOS.CERRADA) {
            form.addSubmitButton({ label: 'Editar' });
        }

        // Enviar a Bodega (Envío Pendiente + solicitante actual)
        if (estado === ESTADOS.ENVIO_PENDIENTE && userId === solicitante) {
            form.addButton({ id: 'custpage_btn_enviar', label: 'Enviar a Bodega', functionName: 'enviarABodega(' + id + ')' });
        }

        // Consumir (Enviada + responsable de ubicación)
        if (estado === ESTADOS.ENVIADA && ubicacionId) {
            const responsableId = daoCatalogos.obtenerResponsableUbicacion(ubicacionId);
            if (userId === responsableId) {
                form.addButton({ id: 'custpage_btn_consumir', label: 'Consumir', functionName: 'consumirSolicitud(' + id + ')' });
            }
        }

        // PDF Constancia Entrega (siempre visible)
        form.addButton({ id: 'custpage_btn_pdf', label: 'Impresion Solicitud', functionName: 'generarPdf(' + id + ')' });

        // Campos ocultos para acciones (Enviar a Bodega necesita accion e id en POST)
        const fViewAccion = form.addField({ id: 'custpage_accion', type: serverWidget.FieldType.TEXT, label: 'Acción' });
        fViewAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fViewAccion.defaultValue = 'editar';

        const fViewId = form.addField({ id: 'custpage_id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        fViewId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fViewId.defaultValue = id;

        // ── Número de solicitud (inyectado después de .uir-page-title-firstline-record) ──
        const fRecordName = form.addField({ id: 'custpage_record_secondtitle', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        fRecordName.defaultValue = [
            '<script>',
            '(function () {',
            '    var recordName = ' + JSON.stringify(datos.name || '') + ';',
            '    function inject() {',
            '        var firstLine = document.querySelector(".uir-page-title-firstline.uir-page-title-firstline-record");',
            '        if (!firstLine) return;',
            '        if (document.querySelector(".uir-page-title-secondline.uir-page-title-secondline-record")) return;',
            '        var div = document.createElement("div");',
            '        div.className = "uir-page-title-secondline uir-page-title-secondline-record";',
            '        var inner = document.createElement("div");',
            '        inner.className = "uir-record-name";',
            '        inner.textContent = recordName;',
            '        div.appendChild(inner);',
            '        firstLine.insertAdjacentElement("afterend", div);',
            '    }',
            '    if (document.readyState === "loading") {',
            '        document.addEventListener("DOMContentLoaded", inject);',
            '    } else {',
            '        inject();',
            '    }',
            '})();',
            '<\/script>'
        ].join('\n');

        // ── Contenido del formulario ───────────────────────────────────────
        const catalogos = _cargarCatalogos(String(datos.custrecord_2win_consumo_subsidiaria || ''));
        formHeader.agregarCamposHeader(form, datos, 'view', catalogos);

        const lineas = daoDetalle.buscarLineas(id);
        formDetalle.agregarTablaDetalle(form, lineas, 'view');

        formScripts.inyectarScriptsCliente(form, id, 'view');

        context.response.writePage(form);
    }

    /* =========================================================
     * RENDER: CREATE
     * ========================================================= */
    function _renderCreate(context) {
        const form = serverWidget.createForm({ title: 'Nueva Solicitud de Consumo' });
        form.clientScriptModulePath = './AS_Gestion_Solicitud_Consumo_CS_2.1.js';

        // ── Links de navegación ────────────────────────────────────────────
        form.addPageLink({ type: serverWidget.FormPageLinkType.CROSSLINK, title: 'Lista', url: _resolverUrlLista() });

        form.addSubmitButton({ label: 'Guardar' });
        form.addButton({ id: 'custpage_btn_cancelar', label: 'Cancelar', functionName: 'cancelar()' });

        const fCreateAccion = form.addField({ id: 'custpage_accion', type: serverWidget.FieldType.TEXT, label: 'Acción' });
        fCreateAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fCreateAccion.defaultValue = 'guardar';

        const fCreateId = form.addField({ id: 'custpage_id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        fCreateId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // Valores por defecto: subsidiaria y nombre del usuario actual
        const currentUser  = runtime.getCurrentUser();
        const empleadoData = _lookupEmpleado(currentUser.id);

        // Cuenta de consumo — se obtiene de la configuración contable para mostrarlo en el form
        const cuentaConsumo= _lookupCuentaConsumo();

        const datosDefault = {
            custrecord_2win_consumo_solicitante          : currentUser.id,
            custrecord_2win_consumo_fecha                : new Date(),
            custrecord_2win_consumo_estado               : ESTADOS.ENVIO_PENDIENTE,
            custrecord_2win_consumo_subsidiaria          : empleadoData.subsidiaria,
            custrecord_2win_consumo_departamento         : empleadoData.departamento,
            custrecord_2win_consumo_ubicacion            : '',
            custrecord_2win_consumo_clase                : '',
            custrecord_2win_consumo_nota                 : '',
            custrecord_2win_consumo_comentarios          : '',
            custrecord_2win_consumo_cuenta_consumo       : cuentaConsumo
        };
        log.error('datosDefault', datosDefault)

        const catalogos = _cargarCatalogos(String(empleadoData.subsidiaria || ''));
        const opcionesCreate = { disableSubsidiaria: currentUser.roleCenter === 'EMPLOYEE' };
        formHeader.agregarCamposHeader(form, datosDefault, 'create', catalogos, opcionesCreate);
        formDetalle.agregarTablaDetalle(form, [], 'create');
        formScripts.inyectarScriptsCliente(form, null, 'create');

        context.response.writePage(form);
    }

    /* =========================================================
     * RENDER: EDIT
     * ========================================================= */
    function _renderEdit(context, id) {
        const datos       = daoSolicitudConsumo.cargar(id);
        const estado      = datos.custrecord_2win_consumo_estado;
        const currentUser = runtime.getCurrentUser();
        const userId      = String(currentUser.id);
        const solicitante = String(datos.custrecord_2win_consumo_solicitante || '');
        const ubicacionId = datos.custrecord_2win_consumo_ubicacion;

        // ── Validar permiso de edición ─────────────────────────────────────
        if (false || !_puedeEditar(estado, userId, solicitante, ubicacionId)) {
            redirect.redirect({
                url: url.resolveScript({
                    scriptId    : SCRIPT_ID,
                    deploymentId: DEPLOYMENT_ID,
                    params      : { op: 'view', recid: id }
                })
            });
            return;
        }

        const form = serverWidget.createForm({ title: 'Editar Solicitud de Consumo' });
        form.clientScriptModulePath = './AS_Gestion_Solicitud_Consumo_CS_2.1.js';

        // ── Links de navegación ────────────────────────────────────────────
        form.addPageLink({ type: serverWidget.FormPageLinkType.CROSSLINK, title: 'Lista', url: _resolverUrlLista() });

        form.addSubmitButton({ label: 'Guardar' });


        form.addButton({ id: 'custpage_btn_cancelar', label: 'Cancelar', functionName: 'irAVer(' + id + ')' });

        const fEditAccion = form.addField({ id: 'custpage_accion', type: serverWidget.FieldType.TEXT, label: 'Acción' });
        fEditAccion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fEditAccion.defaultValue = 'guardar';

        const fEditId = form.addField({ id: 'custpage_id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        fEditId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        fEditId.defaultValue = id;

        // ── Número de solicitud (inyectado después de .uir-page-title-firstline-record) ──
        const fRecordName = form.addField({ id: 'custpage_record_secondtitle', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        fRecordName.defaultValue = [
            '<script>',
            '(function () {',
            '    var recordName = ' + JSON.stringify(datos.name || '') + ';',
            '    function inject() {',
            '        var firstLine = document.querySelector(".uir-page-title-firstline.uir-page-title-firstline-record");',
            '        if (!firstLine) return;',
            '        if (document.querySelector(".uir-page-title-secondline.uir-page-title-secondline-record")) return;',
            '        var div = document.createElement("div");',
            '        div.className = "uir-page-title-secondline uir-page-title-secondline-record";',
            '        var inner = document.createElement("div");',
            '        inner.className = "uir-record-name";',
            '        inner.textContent = recordName;',
            '        div.appendChild(inner);',
            '        firstLine.insertAdjacentElement("afterend", div);',
            '    }',
            '    if (document.readyState === "loading") {',
            '        document.addEventListener("DOMContentLoaded", inject);',
            '    } else {',
            '        inject();',
            '    }',
            '})();',
            '<\/script>'
        ].join('\n');

        const catalogos = _cargarCatalogos(datos.custrecord_2win_consumo_subsidiaria || '');
        const opcionesEdit = { disableSubsidiaria: currentUser.roleCenter === 'EMPLOYEE' };
        formHeader.agregarCamposHeader(form, datos, 'edit', catalogos, opcionesEdit);

        const lineas = daoDetalle.buscarLineas(id);
        formDetalle.agregarTablaDetalle(form, lineas, 'edit');
        formScripts.inyectarScriptsCliente(form, id, 'edit');

        context.response.writePage(form);
    }

    /* =========================================================
     * HELPERS PRIVADOS
     * ========================================================= */

    /**
     * Carga todos los catálogos necesarios para el formulario en una sola llamada.
     * @param {string} subsidiariaId
     * @returns {{ subsidiarias, departamentos, clases, ubicaciones, articulos }}
     */
    function _cargarCatalogos(subsidiariaId) {
        return {
            subsidiarias : daoCatalogos.buscarSubsidiarias(),
            departamentos: daoCatalogos.buscarDepartamentos(),
            clases       : daoCatalogos.buscarClases(),
            ubicaciones  : daoCatalogos.buscarUbicaciones(subsidiariaId)
        };
    }

    /**
     * Resuelve la URL del listado nativo de registros Solicitud de Consumo.
     * Busca el internal ID del tipo de registro custom para construir la URL correcta.
     * @returns {string}
     */
    function _resolverUrlLista() {
        try {
            const resultados = search.create({
                type   : 'customrecordtype',
                filters: [['scriptid', 'is', 'customrecord_2win_solicitud_consumo']],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 });

            const recTypeId = resultados.length > 0 ? resultados[0].id : '';
            return recTypeId ? '/app/common/custom/custrecordentrylist.nl?rectype=' + recTypeId : '';
        } catch (e) {
            nLog.error('_resolverUrlLista - error', e);
            return '';
        }
    }

    /**
     * Determina si el usuario actual puede editar el registro según el estado.
     */
    function _puedeEditar(estado, userId, solicitante, ubicacionId) {
        if (estado === ESTADOS.ENVIO_PENDIENTE && userId === solicitante) return true;
        if (estado === ESTADOS.ENVIADA && ubicacionId) {
            const responsableId = daoCatalogos.obtenerResponsableUbicacion(ubicacionId);
            if (userId === responsableId) return true;
        }
        return false;
    }

    /**
     * Recupera el nombre de la cuenta de consumo desde la configuración contable.
     * Usa GSC_Dao_Config para obtener el ID y luego resuelve el nombre con N/search.
     * @returns {string} Nombre de la cuenta o cadena vacía si falla
     */
    function _lookupCuentaConsumo() {
        try {
            return daoConfig.recuperarCuentaConsumo();
        } catch (e) {
            nLog.error('_lookupCuentaConsumo - error', e);
            return '';
        }
    }

    /**
     * Recupera subsidiaria y departamento del empleado actual para auto-populate en create.
     * @param {string|number} empleadoId
     * @returns {{ subsidiaria: string, departamento: string }}
     */
    function _lookupEmpleado(empleadoId) {
        try {
            const datos = search.lookupFields({
                type   : search.Type.EMPLOYEE,
                id     : empleadoId,
                columns: ['subsidiary', 'department']
            });
            return {
                subsidiaria : datos.subsidiary  && datos.subsidiary.length  > 0 ? String(datos.subsidiary[0].value)  : '',
                departamento: datos.department  && datos.department.length  > 0 ? String(datos.department[0].value)  : ''
            };
        } catch (e) {
            nLog.error('_lookupEmpleado - error', e);
            return { subsidiaria: '', departamento: '' };
        }
    }

    return { onRequest };
});
