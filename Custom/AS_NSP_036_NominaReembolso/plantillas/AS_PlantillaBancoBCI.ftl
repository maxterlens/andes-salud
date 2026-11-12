<#assign datos = jsonString.text?eval>
<#list datos.pagos as pago>
<#-- ─────────────────────────────────────────────────────────────────────────
     1. Datos del cliente: si un dato no viene, queda en ""
     ───────────────────────────────────────────────────────────────────────── -->
<#assign rutCliente  = pago.rut!"">
<#assign nombre      = pago.nombre!"">
<#assign tipoCuenta  = pago.tipoCuenta!"">
<#assign codigoBanco = pago.codigoBanco!"">
<#assign cuenta      = pago.cuenta!"">
<#assign monto       = pago.monto!"">
<#assign correo      = pago.correo!"">
<#-- ─────────────────────────────────────────────────────────────────────────
     2. Campos
     ───────────────────────────────────────────────────────────────────────── -->
<#-- RUT sin puntos, comas ni guion, con ceros a la izquierda hasta 9 (8 + DV) -->
<#assign rutCompleto = rutCliente?replace("[.,-]", "", "r")?left_pad(9, "0")>
<#-- 001-008 | 8 | ceros | RUT sin DV -->
<#assign rut = rutCompleto?substring(0, rutCompleto?length - 1)>
<#-- 009 | 1 | DV -->
<#assign dv = rutCompleto?substring(rutCompleto?length - 1)>
<#-- 010-054 | 45 | espacios | Razon social -->
<#assign razonSocial = nombre?right_pad(45)?substring(0, 45)>
<#-- 056-058 | 3 | Forma de pago (codigos de BCI)
     tipo de cuenta 4 → VVC vale vista · 3 → AHO ahorro (ids de Tipos de Cuenta Bancaria)
     banco 016 (BCI) → CCT · sin banco → OTA · otro banco → OTC -->
<#if tipoCuenta == "4">
    <#assign formaPago = "VVC">
<#elseif tipoCuenta == "3">
    <#assign formaPago = "AHO">
<#elseif codigoBanco == "016">
    <#assign formaPago = "CCT">
<#elseif codigoBanco == "">
    <#assign formaPago = "OTA">
<#else>
    <#assign formaPago = "OTC">
</#if>
<#-- 060-062 | 3 | ceros | Banco destino: vale vista va a BCI (016) -->
<#-- 110-112 | 3 |       | Oficina de abono: vale vista se retira en la 245 -->
<#if tipoCuenta == "4">
    <#assign bancoDestino = "016">
    <#assign oficinaAbono = "245">
<#else>
    <#assign bancoDestino = codigoBanco?left_pad(3, "0")>
    <#assign oficinaAbono = "000">
</#if>
<#-- 064-083 | 20 | ceros | Cuenta de abono, sin puntos, comas ni guion -->
<#assign cuentaAbono = cuenta?replace("[.,-]", "", "r")?left_pad(20, "0")?substring(0, 20)>
<#-- 084-097 | 14 | espacios | Relleno antes del monto -->
<#assign rellenoMonto = ""?right_pad(14)>
<#-- 098-108 | 11 | ceros | Monto -->
<#assign montoPago = monto?left_pad(11, "0")>
<#-- 114-121 | 8 | ddMMyyyy | Fecha de pago (la fecha del reembolso siempre viene) -->
<#assign fechaPago = pago.fecha?date("yyyy-MM-dd")?string("ddMMyyyy")>
<#-- 123-169 | 3 x 15 | espacios | Retirador: ap. paterno, ap. materno, nombres -->
<#assign retirador = ""?right_pad(15)>
<#-- 171-178 | 8 | ceros | N documento -->
<#assign numeroDocumento = "00000000">
<#-- 179-181 | 3 | espacios | Relleno antes del tipo de documento -->
<#assign rellenoTipo = ""?right_pad(3)>
<#-- 182-184 | 3 | Tipo de documento -->
<#assign tipoDocumento = "NDB">
<#-- 186-215 | 30 | espacios | Glosa -->
<#assign glosa = ""?right_pad(30)>
<#-- 217 | 1 | Medio de aviso: E = correo -->
<#assign medioAviso = "E">
<#-- 218-252 | 35 | espacios | Correo de aviso, en minusculas -->
<#assign correoAviso = correo?lower_case?right_pad(35)?substring(0, 35)>
<#-- ─────────────────────────────────────────────────────────────────────────
     3. Linea del TXT: los campos en orden. Cada espacio entre dos campos es
        un separador de 1 caracter (posiciones 055, 059, 063, 109, 113, 122,
        138, 154, 170, 185 y 216).
     ───────────────────────────────────────────────────────────────────────── -->
${rut}${dv}${razonSocial} ${formaPago} ${bancoDestino} ${cuentaAbono}${rellenoMonto}${montoPago} ${oficinaAbono} ${fechaPago} ${retirador} ${retirador} ${retirador} ${numeroDocumento}${rellenoTipo}${tipoDocumento} ${glosa} ${medioAviso}${correoAviso}<#if pago_has_next>${"\r\n"}</#if><#t>
</#list>
