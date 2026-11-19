<#function quitarCaracteresEspeciales texto>
    <#return texto?replace(".", "")?replace(",", "")?replace("-", "")>
</#function>
<#function validarCaracteres texto>
    <#return texto?replace("á", "a")?replace("é", "e")?replace("í", "i")?replace("ó", "o")?replace("ú", "u")
                  ?replace("Á", "A")?replace("É", "E")?replace("Í", "I")?replace("Ó", "O")?replace("Ú", "U")
                  ?replace("ü", "u")?replace("Ü", "U")?replace("ñ", "n")?replace("Ñ", "N")
                  ?replace("[^ -~]", "", "r")>
</#function>
<#assign datos = jsonString.text?eval>
<#list datos.pagos as pago>
<#assign rutCliente  = pago.rut!"">
<#assign nombre      = pago.nombre!"">
<#assign tipoCuenta  = pago.tipoCuenta!"">
<#assign codigoBanco = pago.codigoBanco!"">
<#assign cuenta      = pago.cuenta!"">
<#assign monto       = pago.monto!"">
<#assign correo      = pago.correo!"">
<#assign rutCompleto = quitarCaracteresEspeciales(rutCliente)?left_pad(9, "0")>
<#assign rut = rutCompleto?substring(0, rutCompleto?length - 1)>
<#assign dv = rutCompleto?substring(rutCompleto?length - 1)>
<#assign razonSocial = validarCaracteres(nombre)?right_pad(45)?substring(0, 45)>
<#if tipoCuenta == "4">
    <#assign formaPago    = "VVC">
    <#assign bancoDestino = "016">
    <#assign oficinaAbono = "245">
<#elseif tipoCuenta == "3">
    <#assign formaPago    = "AHO">
    <#assign bancoDestino = codigoBanco?left_pad(3, "0")>
    <#assign oficinaAbono = "000">
<#elseif codigoBanco == "016">
    <#assign formaPago    = "CCT">
    <#assign bancoDestino = "016">
    <#assign oficinaAbono = "000">
<#elseif codigoBanco == "">
    <#assign formaPago    = "OTA">
    <#assign bancoDestino = "000">
    <#assign oficinaAbono = "000">
<#else>
    <#assign formaPago    = "OTC">
    <#assign bancoDestino = codigoBanco?left_pad(3, "0")>
    <#assign oficinaAbono = "000">
</#if>
<#assign cuentaAbono = quitarCaracteresEspeciales(cuenta)?left_pad(20, "0")?substring(0, 20)>
<#assign rellenoMonto = ""?right_pad(14)>
<#assign montoPago = monto?left_pad(11, "0")>
<#assign fechaPago = pago.fecha?date("yyyy-MM-dd")?string("ddMMyyyy")>
<#assign retirador = ""?right_pad(15)>
<#assign numeroDocumento = "00000000">
<#assign rellenoTipo = ""?right_pad(3)>
<#assign tipoDocumento = "ABO">
<#assign glosa = ""?right_pad(30)>
<#assign medioAviso = "E">
<#assign correoAviso = validarCaracteres(correo)?lower_case?right_pad(35)?substring(0, 35)>
${rut}${dv}${razonSocial} ${formaPago} ${bancoDestino} ${cuentaAbono}${rellenoMonto}${montoPago} ${oficinaAbono} ${fechaPago} ${retirador} ${retirador} ${retirador} ${numeroDocumento}${rellenoTipo}${tipoDocumento} ${glosa} ${medioAviso}${correoAviso}<#if pago_has_next>${"\r\n"}</#if><#t>
</#list>
