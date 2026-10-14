<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<#-- AS_NSP_029 - Cheque BCI de Pago de Factura.
     Mismo patron que la plantilla nativa de cheques de NetSuite: un contenedor
     con position:relative (contenido en flujo, evita una pagina vacia) y cada campo
     como tabla con position:absolute. Coordenadas en cm calculadas por ASPagoFacturaService.
     Imprimir SIEMPRE a tamano real (100%). -->
<#assign doc = jsonString.text?eval>
<pdf>
<head>
    <style type="text/css">
        body {
            font-family: Courier;
            font-size: 10pt;
        }
        table.campo {
            position: absolute;
            overflow: hidden;
            table-layout: fixed;
            border-collapse: collapse;
        }
        table.campo td {
            padding: 0;
            font-family: ${doc.hoja.fontFamily};
            font-weight: ${doc.hoja.fontWeight};
            vertical-align: top;
        }
        <#if doc.debug>
        table.campo td { border: 0.5pt solid #d00000; }
        table.marco {
            position: absolute;
            left: 0cm;
            width: 21.5cm;
            border-top: 0.5pt dashed #0050d0;
        }
        table.marco td {
            font-family: Helvetica;
            font-size: 6pt;
            color: #0050d0;
        }
        </#if>
    </style>
</head>
<body size="Letter" padding="0in 0in 0in 0in">
<div style="position: relative; width: 21.5cm; height: 27.5cm;">
<#list doc.cheques as ch>
    <#if doc.debug>
    <table class="marco" style="top: ${ch.marcoTop};"><tr><td>Posicion ${ch.posicion} - Impresora: ${doc.hoja.impresora}</td></tr></table>
    </#if>
    <#list ch.campos as c>
    <table class="campo" style="top: ${c.top}; left: ${c.left}; width: ${c.width}; height: ${c.height};"><tr>
        <td style="width: ${c.width}; font-size: ${c.fontSize}; text-align: ${c.align};"><#list c.lineas as linea>${linea}<#sep><br/></#sep></#list></td>
    </tr></table>
    </#list>
</#list>
</div>
</body>
</pdf>
