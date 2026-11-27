/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Valores fijos del modulo: ids del script, campos, grupos y sublista
 *              del formulario, el recuento nativo, la ficha de importes, los
 *              roles que aprueban, el boton y el archivo TXT y los textos.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.18.0
 *
 */

define([], () => {

    const FORMULARIO = {
        TITULO                    : 'Recuento de Inventario Manual',
        BOTON_GENERAR             : 'Generar recuento',
        GENERANDO_TITULO          : 'Enviando recuento',
        GENERANDO_TEXTO           : 'Se esta enviando el recuento a generar. No cierre ni recargue la pagina.',
        CARGANDO_ID               : 'as_rec_inv_cargando',
        CARGANDO_TITULO           : 'Información',
        CARGANDO_TEXTO            : 'Cargando artículos. Espere a que termine para marcar.',
        ALERTA_TITULO             : 'No se pudo generar el recuento',
        SIN_ARTICULOS             : 'Marque al menos un articulo.',
        GENERACION_PENDIENTE      : 'Ya hay un recuento en cola o generandose para esta ubicacion (solicitud ',
        PARTE                     : 'Parte ',
        PARTE_DE                  : ' de ',
        MAESTRO_TITULO            : 'Descargar TXT maestro',
        MAESTRO_ALERTA_TITULO     : 'No se pudo descargar el TXT maestro',
        SIN_SUBSIDIARIA           : 'Seleccione la subsidiaria.',
        REVISANDO_TITULO          : 'Revisando el recuento',
        REVISANDO_TEXTO           : 'Buscando movimientos de los articulos despues del recuento.',
        MOVIMIENTOS_TITULO        : 'Articulos con movimiento despues del recuento',
        MOVIMIENTOS_TEXTO         : 'Estos articulos tuvieron salidas despues de crear el recuento y puede que NetSuite '
                                  + 'no lo apruebe. Quite esas lineas o vuelva a contarlas.',
        MOVIMIENTOS_MAXIMO        : 15,
        MOVIMIENTOS_MAS           : 'Y otros ',
        CLIENT_SCRIPT             : '/SuiteScripts/AndesScripts/Proyectos/RecuentoInventarioManual/AS_RecuentoInventarioManual_CS_2.1.js',
    };

    const SCRIPT = {
        ID        : 'customscript_as_rec_inv_man_stlt',
        DEPLOYMENT: 'customdeploy_as_rec_inv_man_stlt',
    };

    const COLA = {
        TIPO                 : 'customrecord_as_rec_inv_man_cola',
        CAMPOS               : {
            TIPO     : 'custrecord_as_rec_inv_man_cola_tipo',
            ESTADO   : 'custrecord_as_rec_inv_man_cola_estado',
            RECUENTO : 'custrecord_as_rec_inv_man_cola_recuento',
            UBICACION: 'custrecord_as_rec_inv_man_cola_ubicacion',
            DATOS    : 'custrecord_as_rec_inv_man_cola_datos',
            ERROR    : 'custrecord_as_rec_inv_man_cola_error',
            TIEMPOS  : 'custrecord_as_rec_inv_man_cola_tiempos',
            INICIO   : 'custrecord_as_rec_inv_man_cola_inicio',
            FIN      : 'custrecord_as_rec_inv_man_cola_fin',
        },
        TIPOS                : {
            GENERACION: 'GENERACION',
            CARGA     : 'CARGA',
            APROBACION: 'APROBACION',
        },
        TIPOS_LABEL          : {
            GENERACION: 'Creación de recuento',
            CARGA     : 'Carga de recuento',
            APROBACION: 'Aprobación de recuento',
        },
        CAMPO_INACTIVO       : 'isinactive',
        VISTA                : {
            GRUPO    : 'custpage_grp_cola',
            TITULO   : 'Historial de Recuento',
            TIPO     : 'custpage_cola_tipo',
            INICIO   : 'custpage_cola_inicio',
            FIN      : 'custpage_cola_fin',
        },
        ESTADOS              : {
            PENDIENTE : 'PENDIENTE',
            PROCESANDO: 'PROCESANDO',
            LISTO     : 'LISTO',
            ERROR     : 'ERROR',
        },
        PROCESADOR           : 'customscript_as_rec_inv_man_ss',
        DEPLOYMENT           : 'customdeploy_as_rec_inv_man_ss',
        DEPLOYMENT_APROBACION: 'customdeploy_as_rec_inv_man_ss_aprob',
        GENERADOR            : 'customscript_as_rec_inv_man_gen_mr',
        DEPLOYMENT_GENERACION: 'customdeploy_as_rec_inv_man_gen_mr',
        LINEAS_POR_RECUENTO  : 1500,
        UNIDADES_MINIMAS     : 500,
        MINUTOS_MAXIMOS      : 30,
        REFRESCO_SEGUNDOS    : 15,
        TITULOS              : {
            PENDIENTE : 'En cola',
            PROCESANDO: 'Procesando',
            LISTO     : 'Listo',
            ERROR     : 'Error',
        },
        TEXTOS               : {
            PENDIENTE   : 'En cola. Solicitudes antes de esta: ',
            PROCESANDO  : 'Procesando. Con miles de articulos tarda varios minutos.',
            APROBANDO   : 'Aprobando. NetSuite crea los ajustes de inventario: con miles de lineas tarda '
                        + 'hasta media hora.',
            LISTO       : 'Listo.',
            APROBADO    : 'Recuento aprobado. NetSuite creo los ajustes de inventario.',
            ERROR       : 'No se pudo completar. ',
            REFRESCO    : 'Esta pagina se actualiza sola mientras la solicitud no termine. Puede cerrarla: '
                        + 'la solicitud sigue igual.',
            ABRIR       : 'Abrir el recuento',
            NO_APROBADO : 'NetSuite no aprobo el recuento: ',
            NO_APROBADO_CAUSA: '. Revise si algun articulo tuvo una merma, un traslado o un despacho despues '
                        + 'del recuento.',
            INTERRUMPIDA: 'El proceso se interrumpio antes de terminar. Revise si el recuento quedo creado '
                        + 'o con las cantidades antes de volver a enviar.',
            EN_CURSO    : 'Aprobacion en proceso: no apruebe ni rechace hasta que termine. ',
            SOLICITUD   : 'Ver la solicitud',
            CREADOS     : ' Recuentos que si se crearon: ',
        },
    };

    const GRUPOS = {
        CABECERA: 'custpage_grp_cabecera',
        CARGA   : 'custpage_grp_carga',
        MAESTRO : 'custpage_grp_maestro',
    };

    const CAMPOS = {
        SUBSIDIARIA      : 'custpage_subsidiaria',
        SUBSIDIARIA_MAESTRO: 'custpage_subsidiaria_maestro',
        TOTAL_ARTICULOS  : 'custpage_total_articulos',
        UBICACION        : 'custpage_ubicacion',
        DEPARTAMENTO     : 'custpage_departamento',
        CLASE            : 'custpage_clase',
        FECHA            : 'custpage_fecha',
        CUENTA           : 'custpage_cuenta',
        NOTA             : 'custpage_nota',
        CUENTAS_DATA     : 'custpage_cuentas_data',
        UBICACIONES_DATA : 'custpage_ubicaciones_data',
        RECUENTO         : 'custpage_recuento',
        SUBSIDIARIA_CARGA: 'custpage_subsidiaria_carga',
        RECUENTO_CARGA   : 'custpage_recuento_carga',
        RECUENTOS_DATA   : 'custpage_recuentos_data',
        LOTE_CARGA       : 'custpage_lote_carga',
        LOTES_DATA       : 'custpage_lotes_data',
        CARGA            : 'custpage_carga',
        APROBAR          : 'custpage_aprobar',
        REVISAR          : 'custpage_revisar',
        DETALLE          : 'custpage_detalle',
        IMPORTES         : 'custpage_importes',
        TXT_MAESTRO      : 'custpage_txt_maestro',
        MAESTRO          : 'custpage_maestro',
        ARCHIVO          : 'custpage_archivo',
        REFRESCO         : 'custpage_refresco',
        CARGANDO         : 'custpage_cargando',
    };

    const BOTONES = {
        TXT          : 'custpage_as_rec_inv_txt',
        TXT_LABEL    : 'Descargar TXT',
        CSV          : 'custpage_as_rec_inv_csv',
        CSV_LABEL    : 'Cargar CSV',
        APROBAR      : 'custpage_as_rec_inv_aprobar',
        APROBAR_LABEL: 'Aprobar',
        DETALLE      : 'custpage_as_rec_inv_detalle',
        DETALLE_LABEL: 'Detalle de conteo',
        IMPORTES      : 'custpage_as_rec_inv_importes_csv',
        IMPORTES_LABEL: 'Importes del recuento',
        MAESTRO      : 'custpage_as_rec_inv_maestro',
        MAESTRO_LABEL: 'Descargar TXT maestro',
        MAESTRO_DESCARGAR      : 'custpage_as_rec_inv_maestro_txt',
        MAESTRO_DESCARGAR_LABEL: 'Descargar TXT',
    };

    const CARGA = {
        TITULO        : 'Cargar cantidades del recuento',
        CLIENT_SCRIPT : '/SuiteScripts/AndesScripts/Proyectos/RecuentoInventarioManual/AS_RecuentoInventarioManualCarga_CS_2.1.js',
        BOTON_CARGAR  : 'Cargar',
        RECUENTO_LABEL: 'Recuento',
        LOTE_LABEL    : 'Lote',
        ARCHIVO_LABEL : 'Archivo CSV (UPC;RECUENTO)',
        ALERTA_TITULO : 'No se pudieron cargar las cantidades',
        SIN_ARCHIVO   : 'Seleccione el archivo CSV',
        SIN_FILAS     : 'El archivo no trae ninguna fila con UPC',
        SIN_LOTE      : 'El lote elegido no esta configurado para la subsidiaria del recuento',
    };

    const ARCHIVO = {
        PREFIJO        : 'RecuentoInventario',
        PREFIJO_MAESTRO: 'MaestroArticulos',
        SEPARADOR      : ',',
        ENCABEZADO     : ['PRO_CORREL', 'PRO_CODIGO', 'COD_BARRA', 'COD 3', 'COD 4', 'COD 5', 'pro_nombre', '',
                          'PRO_CORREL1', '', '', '', '', 'Cantidad'],
    };

    const DETALLE = {
        PREFIJO   : 'DetalleConteo',
        SEPARADOR : ',',
        ENCABEZADO: ['ID interno', 'Articulo', 'Unidades', 'Cantidad de instantanea', 'Cantidad del recuento',
                     'Cantidad ajustada', 'Tarifa', 'Nota'],
    };

    const RECUENTO = {
        TIPO                       : 'inventorycount',
        CAMPO_CARGA                : 'custbody_as_rec_inv_carga',
        ACCION_COMENZAR            : 'startcount',
        ACCION_APROBAR             : 'approve',
        ESTADO_INICIADO            : 'B',
        CAMPO_CANTIDAD             : 'countquantity',
        CAMPO_DETALLE              : 'countdetail',
        DETALLE_SUBLISTA           : 'inventorydetail',
        DETALLE_LOTE               : 'inventorynumber',
        DETALLE_ESTADO             : 'inventorystatus',
        ESTADO_INVENTARIO          : '1',
        DETALLE_CANTIDAD           : 'quantity',
        ESTADO_PENDIENTE_APROBACION: 'C',
        ESTADO_APROBADO            : 'D',
        BOTON_APROBAR              : 'approve',
        BOTON_RECHAZAR             : 'reject',
    };

    const IMPORTES = {
        FICHA      : 'custpage_as_rec_inv_importes_ficha',
        FICHA_LABEL: 'Importes del recuento',
        CAMPO      : 'custpage_as_rec_inv_importes',
        PREFIJO    : 'ImportesRecuento',
        SEPARADOR  : ',',
        ENCABEZADO : ['ID interno', 'Articulo', 'UPC', 'Cantidad de instantanea', 'Cantidad del recuento', 'Cantidad ajustada',
                      'Tarifa', 'Importe instantanea', 'Importe recuento', 'Importe variacion'],
        TOTAL      : 'Total',
    };

    const ROLES_AUTORIZADOS = [3, 1455];

    const SUBLISTA = {
        ID      : 'custpage_lineas',
        COLUMNAS: {
            CONTAR  : 'custpage_col_contar',
            ARTICULO: 'custpage_col_articulo',
            NOMBRE  : 'custpage_col_nombre',
            UNIDAD  : 'custpage_col_unidad',
            STOCK   : 'custpage_col_stock',
        },
    };

    return {
        FORMULARIO       : FORMULARIO,
        SCRIPT           : SCRIPT,
        COLA             : COLA,
        GRUPOS           : GRUPOS,
        CAMPOS           : CAMPOS,
        BOTONES          : BOTONES,
        CARGA            : CARGA,
        ARCHIVO          : ARCHIVO,
        DETALLE          : DETALLE,
        RECUENTO         : RECUENTO,
        IMPORTES         : IMPORTES,
        ROLES_AUTORIZADOS: ROLES_AUTORIZADOS,
        SUBLISTA         : SUBLISTA,
    };
});
