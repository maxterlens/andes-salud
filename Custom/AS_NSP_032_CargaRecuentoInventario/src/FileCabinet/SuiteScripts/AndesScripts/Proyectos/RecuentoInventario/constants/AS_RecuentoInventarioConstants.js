/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Valores fijos del modulo: ids de campos, grupos y sublista del
 *              formulario y sus textos.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 *
 * CHANGELOG v1.5.0 (2026-10-14):
 *   - [FEAT] Boton Generar: operaciones Cargar/Generar, el campo oculto de la
 *            operacion, la ubicacion con la que se valido el CSV, el check
 *            AS Recuento Inventario Carga del recuento y la accion startcount
 *            (Comenzar recuento), y los textos del aviso "Generando recuento".
 *
 * CHANGELOG v1.4.0 (2026-10-13):
 *   - [FEAT] CUENTAS_DATA (campo oculto con las cuentas configuradas) y la ruta
 *            del client script que filtra el select Cuenta.
 *
 * CHANGELOG v1.3.0 (2026-10-13):
 *   - [FEAT] NO_ENCONTRADOS pasa a ERRORES: el campo lista todos los errores de
 *            validacion del CSV.
 *
 * CHANGELOG v1.2.0 (2026-10-13):
 *   - [FEAT] El CSV es solo una lista (UPC, ITEM): se quitan las columnas FISICO y
 *            OBSERVACION y se agrega el campo de codigos no encontrados.
 *
 * CHANGELOG v1.1.0 (2026-10-09):
 *   - [FEAT] Sublista de articulos cargados y sus columnas.
 *
 * CHANGELOG v1.0.0 (2026-10-09):
 *   - [FEAT] Ids de campos, grupos y textos del formulario de carga.
 */
define([], () => {

    const FORMULARIO = {
        TITULO          : 'Carga de Recuento de Inventario',
        BOTON_CARGAR    : 'Cargar',
        BOTON_GENERAR   : 'Generar',
        GENERANDO_TITULO: 'Generando recuento',
        GENERANDO_TEXTO : 'Se esta creando el recuento de inventario. No cierre ni recargue la pagina.',
        CLIENT_SCRIPT   : '/SuiteScripts/AndesScripts/Proyectos/RecuentoInventario/AS_RecuentoInventario_CS_2.1.js',
    };

    const GRUPOS = {
        CABECERA: 'custpage_grp_cabecera',
    };

    const CAMPOS = {
        SUBSIDIARIA      : 'custpage_subsidiaria',
        UBICACION        : 'custpage_ubicacion',
        DEPARTAMENTO     : 'custpage_departamento',
        CLASE            : 'custpage_clase',
        FECHA            : 'custpage_fecha',
        CUENTA           : 'custpage_cuenta',
        NOTA             : 'custpage_nota',
        ARCHIVO          : 'custpage_archivo',
        ERRORES          : 'custpage_errores',
        CUENTAS_DATA     : 'custpage_cuentas_data',
        OPERACION        : 'custpage_operacion',
        UBICACION_CARGADA: 'custpage_ubicacion_cargada',
    };

    const BOTONES = {
        GENERAR: 'custpage_btn_generar',
    };

    const OPERACIONES = {
        CARGAR : 'cargar',
        GENERAR: 'generar',
    };

    const RECUENTO = {
        TIPO           : 'inventorycount',
        CAMPO_CARGA    : 'custbody_as_rec_inv_carga',
        ACCION_COMENZAR: 'startcount',
    };

    const SUBLISTA = {
        ID      : 'custpage_lineas',
        COLUMNAS: {
            CODIGO     : 'custpage_col_codigo',
            ARTICULO   : 'custpage_col_articulo',
            ARTICULO_ID: 'custpage_col_articulo_id',
            UNIDAD     : 'custpage_col_unidad',
        },
    };

    return {
        FORMULARIO   : FORMULARIO,
        GRUPOS       : GRUPOS,
        CAMPOS       : CAMPOS,
        BOTONES      : BOTONES,
        OPERACIONES  : OPERACIONES,
        RECUENTO     : RECUENTO,
        SUBLISTA     : SUBLISTA,
    };
});
