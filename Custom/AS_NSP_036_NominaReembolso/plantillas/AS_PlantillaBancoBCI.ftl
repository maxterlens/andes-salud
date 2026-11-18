<#function quitarCaracteresEspeciales texto>
    <#return texto?replace(".", "")?replace(",", "")?replace("-", "")>
</#function>
<#assign datos = jsonString.text?eval>
<#list datos.pagos as pago>
<#-- Datos del reembolso y su cliente -->
<#assign rutCliente  = pago.rut!"">
<#assign nombre      = pago.nombre!"">
<#assign tipoCuenta  = pago.tipoCuenta!"">
<#assign codigoBanco = pago.codigoBanco!"">
<#assign cuenta      = pago.cuenta!"">
<#assign monto       = pago.monto!"">
<#assign correo      = pago.correo!"">
<#-- RUT: cliente, ceros a la izquierda -->
<#assign rutCompleto = quitarCaracteresEspeciales(rutCliente)?left_pad(9, "0")>
<#assign rut = rutCompleto?substring(0, rutCompleto?length - 1)>
<#-- DV: ultimo caracter del RUT -->
<#assign dv = rutCompleto?substring(rutCompleto?length - 1)>
<#-- Razon social: nombre del cliente -->
<#assign razonSocial = nombre?right_pad(45)?substring(0, 45)>
<#-- Forma de pago, banco destino y oficina: segun tipo de cuenta (3 Ahorros, 4 Vale Vista) y banco del cliente (016 BCI) -->
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
<#-- Cuenta abono: cuenta del cliente -->
<#assign cuentaAbono = quitarCaracteresEspeciales(cuenta)?left_pad(20, "0")?substring(0, 20)>
<#assign rellenoMonto = ""?right_pad(14)>
<#-- Monto: del reembolso -->
<#assign montoPago = monto?left_pad(11, "0")>
<#-- Fecha de pago: del reembolso -->
<#assign fechaPago = pago.fecha?date("yyyy-MM-dd")?string("ddMMyyyy")>
<#-- Retirador: vacio -->
<#assign retirador = ""?right_pad(15)>
<#-- N documento: fijo -->
<#assign numeroDocumento = "00000000">
<#assign rellenoTipo = ""?right_pad(3)>
<#-- Tipo documento: fijo, NCR nota de credito (el reembolso nace de una nota de credito) -->
<#assign tipoDocumento = "NCR">
<#-- Glosa: vacia -->
<#assign glosa = ""?right_pad(30)>
<#-- Aviso: E = correo -->
<#assign medioAviso = "E">
<#-- Correo: del cliente -->
<#assign correoAviso = correo?lower_case?right_pad(35)?substring(0, 35)>
${rut}${dv}${razonSocial} ${formaPago} ${bancoDestino} ${cuentaAbono}${rellenoMonto}${montoPago} ${oficinaAbono} ${fechaPago} ${retirador} ${retirador} ${retirador} ${numeroDocumento}${rellenoTipo}${tipoDocumento} ${glosa} ${medioAviso}${correoAviso}<#if pago_has_next>${"\r\n"}</#if><#t>
</#list>
