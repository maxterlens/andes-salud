/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Valores fijos del modulo: ids de campos, grupos y sublista del
 *              formulario y sus textos.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.8.0
 *
 */
define([], () => {

    const FORMULARIO = {
        TITULO          : 'Carga de Recuento de Inventario',
        BOTON_CARGAR    : 'Cargar',
        BOTON_GENERAR   : 'Generar',
        GENERANDO_TITULO: 'Generando recuento',
        GENERANDO_TEXTO : 'Se esta creando el recuento de inventario. No cierre ni recargue la pagina.',
        ALERTA_TITULO   : 'No se pudo generar el recuento',
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
        UBICACIONES_DATA : 'custpage_ubicaciones_data',
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
        TIPO                       : 'inventorycount',
        CAMPO_CARGA                : 'custbody_as_rec_inv_carga',
        ACCION_COMENZAR            : 'startcount',
        ESTADO_PENDIENTE_APROBACION: 'C',
        BOTON_APROBAR              : 'approve',
        BOTON_RECHAZAR             : 'reject',
    };

    const ROLES_AUTORIZADOS = [3, 1455];

    const SUBLISTA = {
        ID      : 'custpage_lineas',
        COLUMNAS: {
            ARTICULO   : 'custpage_col_articulo',
            ARTICULO_ID: 'custpage_col_articulo_id',
            UNIDAD     : 'custpage_col_unidad',
        },
    };

    return {
        FORMULARIO       : FORMULARIO,
        GRUPOS           : GRUPOS,
        CAMPOS           : CAMPOS,
        BOTONES          : BOTONES,
        OPERACIONES      : OPERACIONES,
        RECUENTO         : RECUENTO,
        ROLES_AUTORIZADOS: ROLES_AUTORIZADOS,
        SUBLISTA         : SUBLISTA,
    };
});
