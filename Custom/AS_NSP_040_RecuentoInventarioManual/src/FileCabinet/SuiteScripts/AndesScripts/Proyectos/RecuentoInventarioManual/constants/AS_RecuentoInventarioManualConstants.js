/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Valores fijos del modulo: ids del script, campos, grupos y sublista
 *              del formulario, el recuento nativo, la ficha de importes, los
 *              roles que aprueban, el boton y el archivo TXT y los textos.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.8.2
 */
define([], () => {

    const FORMULARIO = {
        TITULO                    : 'Recuento de Inventario Manual',
        BOTON_GENERAR             : 'Generar recuento',
        GENERANDO_TITULO          : 'Enviando recuento',
        GENERANDO_TEXTO           : 'Se esta enviando el recuento a generar. No cierre ni recargue la pagina.',
        ALERTA_TITULO             : 'No se pudo generar el recuento',
        SIN_ARTICULOS             : 'Marque al menos un articulo.',
        GENERACION_PENDIENTE      : 'Ya hay un recuento en cola o generandose para esta ubicacion (solicitud ',
        CLIENT_SCRIPT             : '/SuiteScripts/AndesScripts/Proyectos/RecuentoInventarioManual/AS_RecuentoInventarioManual_CS_2.1.js',
    };

    const SCRIPT = {
        ID        : 'customscript_as_rec_inv_man_stlt',
        DEPLOYMENT: 'customdeploy_as_rec_inv_man_stlt',
    };

    const COLA = {
        TIPO              : 'customrecord_as_rec_inv_man_cola',
        CAMPOS            : {
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
        TIPOS             : {
            GENERACION: 'GENERACION',
            CARGA     : 'CARGA',
        },
        TIPOS_LABEL       : {
            GENERACION: 'Creación de recuento',
            CARGA     : 'Carga de recuento',
        },
        CAMPO_INACTIVO    : 'isinactive',
        VISTA             : {
            GRUPO    : 'custpage_grp_cola',
            TITULO   : 'Historial de Recuento',
            RECUENTO : 'custpage_cola_recuento',
            TIPO     : 'custpage_cola_tipo',
            INICIO   : 'custpage_cola_inicio',
            FIN      : 'custpage_cola_fin',
        },
        ESTADOS           : {
            PENDIENTE : 'PENDIENTE',
            PROCESANDO: 'PROCESANDO',
            LISTO     : 'LISTO',
            ERROR     : 'ERROR',
        },
        PROCESADOR        : 'customscript_as_rec_inv_man_ss',
        DEPLOYMENT        : 'customdeploy_as_rec_inv_man_ss',
        UNIDADES_MINIMAS  : 500,
        MINUTOS_MAXIMOS   : 30,
        REFRESCO_SEGUNDOS : 15,
        TITULOS           : {
            PENDIENTE : 'En cola',
            PROCESANDO: 'Procesando',
            LISTO     : 'Listo',
            ERROR     : 'Error',
        },
        TEXTOS            : {
            PENDIENTE   : 'En cola. Solicitudes antes de esta: ',
            PROCESANDO  : 'Procesando. Con miles de articulos tarda varios minutos.',
            LISTO       : 'Listo.',
            ERROR       : 'No se pudo completar. ',
            REFRESCO    : 'Esta pagina se actualiza sola mientras la solicitud no termine. Puede cerrarla: '
                        + 'la solicitud sigue igual.',
            ABRIR       : 'Abrir el recuento',
            INTERRUMPIDA: 'El proceso se interrumpio antes de terminar. Revise si el recuento quedo creado '
                        + 'o con las cantidades antes de volver a enviar.',
        },
    };

    const GRUPOS = {
        CABECERA: 'custpage_grp_cabecera',
        CARGA   : 'custpage_grp_carga',
    };

    const CAMPOS = {
        SUBSIDIARIA      : 'custpage_subsidiaria',
        UBICACION        : 'custpage_ubicacion',
        DEPARTAMENTO     : 'custpage_departamento',
        CLASE            : 'custpage_clase',
        FECHA            : 'custpage_fecha',
        CUENTA           : 'custpage_cuenta',
        NOTA             : 'custpage_nota',
        CUENTAS_DATA     : 'custpage_cuentas_data',
        UBICACIONES_DATA : 'custpage_ubicaciones_data',
        RECUENTO         : 'custpage_recuento',
        RECUENTO_CARGA   : 'custpage_recuento_carga',
        CARGA            : 'custpage_carga',
        ARCHIVO          : 'custpage_archivo',
        REFRESCO         : 'custpage_refresco',
    };

    const BOTONES = {
        TXT      : 'custpage_as_rec_inv_txt',
        TXT_LABEL: 'Descargar TXT',
        CSV      : 'custpage_as_rec_inv_csv',
        CSV_LABEL: 'Cargar CSV',
    };

    const CARGA = {
        TITULO        : 'Cargar cantidades del recuento',
        BOTON_CARGAR  : 'Cargar',
        RECUENTO_LABEL: 'Recuento',
        ARCHIVO_LABEL : 'Archivo CSV (UBICACION;ID;ARTICULO;RECUENTO;LOTE)',
        ALERTA_TITULO : 'No se pudieron cargar las cantidades',
        SIN_ARCHIVO   : 'Seleccione el archivo CSV',
        SIN_FILAS     : 'El archivo no trae ninguna fila con ID',
    };

    const ARCHIVO = {
        PREFIJO   : 'RecuentoInventario',
        SEPARADOR : ',',
        ENCABEZADO: ['PRO_CORREL', 'PRO_CODIGO', 'COD_BARRA', 'COD 3', 'COD 4', 'COD 5', 'pro_nombre', '',
                     'PRO_CORREL1', '', '', '', '', 'Cantidad'],
    };

    const RECUENTO = {
        TIPO                       : 'inventorycount',
        CAMPO_CARGA                : 'custbody_as_rec_inv_carga',
        ACCION_COMENZAR            : 'startcount',
        ESTADO_INICIADO            : 'B',
        CAMPO_CANTIDAD             : 'countquantity',
        CAMPO_DETALLE              : 'countdetail',
        DETALLE_SUBLISTA           : 'inventorydetail',
        DETALLE_LOTE               : 'inventorynumber',
        DETALLE_ESTADO             : 'inventorystatus',
        ESTADO_INVENTARIO          : '1',
        DETALLE_CANTIDAD           : 'quantity',
        ESTADO_PENDIENTE_APROBACION: 'C',
        BOTON_APROBAR              : 'approve',
        BOTON_RECHAZAR             : 'reject',
    };

    const IMPORTES = {
        FICHA      : 'custpage_as_rec_inv_importes_ficha',
        FICHA_LABEL: 'Importes del recuento',
        CAMPO      : 'custpage_as_rec_inv_importes',
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
        RECUENTO         : RECUENTO,
        IMPORTES         : IMPORTES,
        ROLES_AUTORIZADOS: ROLES_AUTORIZADOS,
        SUBLISTA         : SUBLISTA,
    };
});
