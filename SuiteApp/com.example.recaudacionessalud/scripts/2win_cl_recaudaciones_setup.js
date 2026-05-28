/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
define([], function () {
    function pageInit(context) {
        let record = context.currentRecord;
        updateFieldVisibility(record);
    }

    function fieldChanged(context) {
        let record = context.currentRecord;
        if (context.fieldId === "custrecord_item_categoria") {
            updateFieldVisibility(record);
        }
    }

    function updateFieldVisibility(record) {
        let categoria = record.getText({
            fieldId: "custrecord_item_categoria"
        });

        let fieldsToShow = getFieldsByCategoria(categoria);
        let allFields = [
            "scriptid",
            "custrecord_item_codigo",
            "custrecord_item_articulo_boleta",
            "custrecord_item_cuenta_cobrar_boleta",
            "custrecord_item_id",
            "custrecord_item_cuenta_contable",
            "custrecord_item_forma_pago",
            "custrecord_item_articulo_asiento",
            "custrecord_2win_recaudaciones_subsidiary",
            "custrecord_2win_recaudaciones_cliente"
        ];

        for (let i = 0; i < allFields.length; i++) {
            let field = record.getField({
                fieldId: allFields[i]
            });
            if (field) {
                field.isDisabled = fieldsToShow.indexOf(allFields[i]) !== -1;
            }
        }
    }

    function getFieldsByCategoria(categoria) {
        let fieldsMap = {
            "bonosEmitidos": ["custrecord_item_codigo", "custrecord_item_cuenta_contable"],
            "formaPago": ["custrecord_item_codigo", "custrecord_item_cuenta_contable", "custrecord_item_forma_pago"],
            "boletasEmitidas": ["custrecord_item_codigo", "custrecord_item_articulo_boleta", "custrecord_item_id", "custrecord_item_cuenta_contable"],
            "BoletasEmitidasAnticipo": ["custrecord_item_codigo", "custrecord_item_articulo_boleta", "custrecord_item_id"],
            "bonifAdicional": ["custrecord_item_codigo", "custrecord_item_id"],
            "CoPago": ["custrecord_item_codigo", "custrecord_item_cuenta_contable"],
            "detalleIngresos": ["custrecord_item_codigo", "custrecord_item_articulo_boleta"],
            "detalleEgresos": ["custrecord_item_codigo", "custrecord_item_articulo_boleta", "custrecord_item_id"],
            "InterCompany": ["custrecord_item_articulo_boleta", "custrecord_item_id", "custrecord_item_cuenta_contable", "custrecord_2win_recaudaciones_cliente"],
            "BonoIva": ["custrecord_item_cuenta_contable"],
            "bonifAdicionalCliente": ["custrecord_2win_recaudaciones_cliente"],
            "VentaDirecta": ["custrecord_item_codigo", "custrecord_item_articulo_boleta", "custrecord_item_id"],
            "Redondeo": ["custrecord_item_cuenta_contable"],
            "Cierre Caja": ["custrecord_item_codigo", "custrecord_item_articulo_boleta", "custrecord_item_id", "custrecord_item_cuenta_contable"],
            "cargosCobradosAnticipo": ["custrecord_item_id"],
            "Reembolso": ["custrecord_item_codigo", "custrecord_item_articulo_boleta", "custrecord_item_id"],
            "coberturasEmitidas": ["custrecord_item_id", "custrecord_item_cuenta_contable"]
        };
        if (categoria === null || categoria === undefined || categoria === "") {
            return Object.values(fieldsMap).flat();
        }
        return fieldsMap[categoria] || [];
    }

    function validateField(context) {}

    return {
        pageInit: pageInit,
        // validateField: validateField,
        fieldChanged: fieldChanged
    };
});
