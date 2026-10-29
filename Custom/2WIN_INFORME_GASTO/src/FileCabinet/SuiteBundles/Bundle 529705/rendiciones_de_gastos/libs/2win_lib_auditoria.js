/**
 * @desc Librería para registrar procesos en tabla de audítoría.
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @author Sebastian Alayon <sebastian.alayon@2win.cl>
 */
define(["N/search","N/record"], function(search,record){

    /**
     * @function obtenerResultados
     * @param {{"type": String,"filters": Array,"columns": Array}} createSearch - Objeto con parametros para la busqueda
     * @returns {Array} - Resultados de la busqueda
     */
    function obtenerResultados (createSearch)  {
        try {
            log.audit("obtenerResultados - createSearch", {
                "type": createSearch.type,
                "filters": createSearch.filters,
                "tipoDato": typeof(createSearch)
            })

            // Array que almacenara resultados
            var searchResults = [];

            var saveSearch = search.create(createSearch);
            var searchResultCount;

            // Ejecutar busqueda estandar
            searchResultCount = saveSearch.runPaged().count;
            if (searchResultCount == 0) {
                log.debug("obtenerResultados - searchResultCount","la busqueda no retorno resultados")
                return searchResultCount
            }
            saveSearch.run().each(function (item) {
                var objectCompiled = {};
                for (var i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            log.debug("obtenerResultados - ejecutada","Obtuvo resultados")

            return searchResults;
        } catch (error) {
            log.error("obtenerResultados - error", error)
            throw error
        }
    };
    
    /**
    * @description Función que se utiliza para generar Token tabla Auditoria.
    * @function obtenerToken.
    */
    function obtenerToken() {
       var uuid = "", i, random;
       for (i = 0; i < 32; i++) {
           random = Math.random() * 16 | 0;

           if (i == 8 || i == 12 || i == 16 || i == 20) {
               uuid += "-"
           }
           uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8)  : random))
               .toString(16);
       }
       var existsToken = validarToken(uuid);

       if (existsToken.length > 0) obtenerToken();
       else return uuid;
   }

   /**
    * @function validarToken - Función para realizar una busqueda en una tabla de netsuite
    * @param {string} token - Parametro usado en el filtro de la busqueda
    * @returns {Array} - Resultado de busqueda
    */
   function validarToken(token) {
       try {
           // Tipo, filtros y columnas para la busqueda
           var objSearch = {
               type: "customrecord_2win_auditoria",
               filters: [
                   ["custrecord_2win_auditoria_token", "contains", token]
               ],
               columns: [
                   search.createColumn({ name: "internalid", label: "internal_id" })
               ]
           }
   
           // Ejecutar busqueda
           var result = obtenerResultados(objSearch);

           log.audit("validarToken - resultados", {
               "extencionResultado": result.length,
               "resultado": result
           });
           return result;
       } catch (error) {
           log.error("validarToken - error", error.message);
           throw error
       }
   }

   /**
    * @function crearReporteAuditoria - Crea un nuevo registro en base a los datos recibidos
    * @param {Object} datos - Datos necesarios para crear el registro
    * @returns {Number} - id registro creado
    */
   function crearReporteAuditoria(datos) {
       try {
           log.debug("crearReporteAuditoria - datos",{
               "datos": datos,
               "tipoDato": typeof(datos)
           })  
           
           // Crear el registro
           var crearRegistro = record.create({ type: "customrecord_2win_auditoria", isDynamic: true }); 

           // Definir Body fields
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_fecha", value: new Date() }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_fecha");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_proceso", value: datos.nombreProceso });
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_proceso");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_id_script", value: datos.scriptId  }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_id_script");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_tipo_registro", value: datos.tipoRegistroCreado }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_tipo_registro");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_registro_cread", value: datos.idRegistroCreado }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_registro_cread");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_etapa", value: datos.etapa }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_etapa");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_estado", value: datos.estado }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_estado");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_token", value: datos.tokenProceso }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_token");
           crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_descripcion", value: datos.decripcionResultado }); 
           //log.debug("crearReporteAuditoria - bodyFields","custrecord_2win_auditoria_descripcion");

           // Guarda registro
           var guardarRegistro = crearRegistro.save({ enableSourcing: true});  
           log.audit("crearReporteAuditoria - guardarRegistro","Se guardo registro satisfactoriamente: " + guardarRegistro);

           return guardarRegistro;
       } catch (error) {
           log.error("crearReporteAuditoria - error", error)
           throw error
       }
   }

   return {
       obtenerToken: obtenerToken,
       crearReporteAuditoria: crearReporteAuditoria
   }
});