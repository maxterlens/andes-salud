/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Valores fijos del modulo: ids del script, campos, grupos y sublista
 *              del formulario, el recuento nativo, la ficha de importes, los
 *              roles que aprueban, el boton y el archivo TXT y los textos.
 *
 * CHANGELOG v1.6.0 (2026-11-16):
 * - [FEAT] TXT con el formato de la pistola: 14 columnas separadas por coma,
 *          PRO_CORREL,PRO_CODIGO,COD_BARRA,...,Cantidad.
 *
 * CHANGELOG v1.5.0 (2026-11-16):
 * - [FEAT] Seguimiento de la generacion: campos del codigo, la tarea, el estado y
 *          el tiempo, textos de cada estado y cada cuanto se consulta.
 *
 * CHANGELOG v1.4.0 (2026-11-16):
 * - [FEAT] Lista de articulos con check y la generacion del recuento en segundo
 *          plano.
 *          Se quitan ARTICULOS_DATA y los textos del articulo repetido.
 *
 * CHANGELOG v1.3.2 (2026-11-16):
 * - [FIX] DETALLE_ESTADO: NetSuite exige el estado de inventario en cada lote
 *         del detalle ("Introduzca valores para: Estado"). ESTADO_INVENTARIO 1 =
 *         Good, el de todo el stock en QA.
 *
 * CHANGELOG v1.3.1 (2026-11-16):
 * - [FIX] El detalle del recuento usa la sublista inventorydetail y el lote va en
 *         inventorynumber (no inventoryassignment ni receiptinventorynumber, que
 *         NetSuite ignoraba sin error). Confirmado con el log del 2026-11-16.
 *
 * CHANGELOG v1.3.0 (2026-11-16):
 * - [FEAT] Archivo de 5 columnas ID;ARTICULO;RECUENTO;UBICACION;LOTE, textos de
 *          validacion de la carga. Se quita el lote fijo de prueba.
 *
 * CHANGELOG v1.2.0 (2026-11-15):
 * - [FEAT] Carga de cantidades por CSV: parametros, boton, textos y campos del
 *          detalle del recuento. TXT con ID en vez de AJUSTADA.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FEAT] Parametro del recuento, boton Descargar TXT y nombre del archivo.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Constantes de la pantalla de recuento con articulos agregados a mano.
 * - [FEAT] Estados, botones, importes y roles del UE que viene del AS_NSP_032.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.6.0
 */
define([], () => {

    const FORMULARIO = {
        TITULO                    : 'Recuento de Inventario Manual',
        BOTON_GENERAR             : 'Generar recuento',
        GENERANDO_TITULO          : 'Enviando recuento',
        GENERANDO_TEXTO           : 'Se esta enviando el recuento a generar. No cierre ni recargue la pagina.',
        ALERTA_TITULO             : 'No se pudo generar el recuento',
        SIN_ARTICULOS             : 'Marque al menos un articulo.',
        OCUPADO                   : 'Se esta generando otro recuento. Intente de nuevo en unos minutos.',
        ENVIADO_TITULO            : 'Generando recuento',
        ENVIADO_TEXTO             : 'Se esta creando el recuento en segundo plano. Al terminar, esta pagina abre '
                                  + 'el recuento. Con miles de articulos tarda varios minutos: no recargue la pagina.',
        FALLO_GENERACION          : 'El recuento no se pudo generar. Revise el log del script AS Recuento '
                                  + 'Inventario Manual SS.',
        CODIGO_PREFIJO            : 'AS_REC_INV_',
        SEGUIMIENTO_SEGUNDOS      : 5,
        ESTADOS_TAREA             : {
            PENDING   : 'En cola, esperando turno',
            PROCESSING: 'Creando el recuento',
            COMPLETE  : 'Abriendo el recuento',
            FAILED    : 'Fallo',
        },
        CLIENT_SCRIPT             : '/SuiteScripts/AndesScripts/Proyectos/RecuentoInventarioManual/AS_RecuentoInventarioManual_CS_2.1.js',
    };

    const SCRIPT = {
        ID        : 'customscript_as_rec_inv_man_stlt',
        DEPLOYMENT: 'customdeploy_as_rec_inv_man_stlt',
    };

    /**
     * El Scheduled que crea el recuento. Recibe la cabecera y los articulos
     * marcados en un solo parametro de texto largo, como JSON. Un Scheduled y
     * no un Map/Reduce: el recuento es un solo registro que se guarda de una
     * vez, y el reduce de un Map/Reduce corta a los 15 minutos.
     */
    const GENERACION = {
        ID             : 'customscript_as_rec_inv_man_ss',
        DEPLOYMENT     : 'customdeploy_as_rec_inv_man_ss',
        PARAMETRO_DATOS: 'custscript_as_rec_inv_man_datos',
        COLA_OCUPADA   : 'FAILED_TO_SUBMIT_JOB_REQUEST_1',
    };

    const GRUPOS = {
        CABECERA  : 'custpage_grp_cabecera',
        GENERACION: 'custpage_grp_generacion',
    };

    const CAMPOS = {
        SUBSIDIARIA     : 'custpage_subsidiaria',
        UBICACION       : 'custpage_ubicacion',
        DEPARTAMENTO    : 'custpage_departamento',
        CLASE           : 'custpage_clase',
        FECHA           : 'custpage_fecha',
        CUENTA          : 'custpage_cuenta',
        NOTA            : 'custpage_nota',
        CUENTAS_DATA    : 'custpage_cuentas_data',
        UBICACIONES_DATA: 'custpage_ubicaciones_data',
        RECUENTO        : 'custpage_recuento',
        RECUENTO_CARGA  : 'custpage_recuento_carga',
        ARCHIVO         : 'custpage_archivo',
        GENERACION      : 'custpage_generacion',
        TAREA           : 'custpage_tarea',
        ESTADO          : 'custpage_estado_generacion',
        TIEMPO          : 'custpage_tiempo_generacion',
        TOTAL_ARTICULOS : 'custpage_total_articulos',
    };

    const BOTONES = {
        TXT      : 'custpage_as_rec_inv_txt',
        TXT_LABEL: 'Descargar TXT',
        CSV      : 'custpage_as_rec_inv_csv',
        CSV_LABEL: 'Cargar CSV',
    };

    const CARGA = {
        TITULO       : 'Cargar cantidades del recuento',
        BOTON_CARGAR : 'Cargar',
        ARCHIVO_LABEL: 'Archivo CSV (ID;ARTICULO;RECUENTO;UBICACION;LOTE)',
        ALERTA_TITULO: 'No se pudieron cargar las cantidades',
        SIN_ARCHIVO  : 'Seleccione el archivo CSV',
        SIN_FILAS    : 'El archivo no trae ninguna fila con RECUENTO',
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
        GENERACION       : GENERACION,
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
