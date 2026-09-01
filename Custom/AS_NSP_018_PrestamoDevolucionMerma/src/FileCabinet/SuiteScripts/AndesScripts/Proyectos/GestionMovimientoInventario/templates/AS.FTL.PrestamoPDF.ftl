<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<#-- AS_NSP_018 - Prestamo, Devolucion y Merma
     Comprobante de prestamo: lo que sale de la bodega y su seguimiento por linea.
     Los datos llegan como JSON en el data source 'jsonString' que arma
     ImpresionHandler: doc.cabecera, doc.lineas y doc.totales. Aqui no se
     calcula nada, solo se pinta. -->
<#assign doc = jsonString.text?eval>
<pdf>
<head>
    <link name="NotoSans" type="font" subtype="truetype" src="${nsfont.NotoSans_Regular}" src-bold="${nsfont.NotoSans_Bold}" src-italic="${nsfont.NotoSans_Italic}" src-bolditalic="${nsfont.NotoSans_BoldItalic}" bytes="2" />
    <macrolist>
        <macro id="nlheader">
            <table class="header-table"><tr>
            <td class="logo-cell"><#if companyInformation.logoUrl?length != 0><@filecabinet nstype="image" style="width: 72px; height: auto;" src="${companyInformation.logoUrl}" /></#if></td>
            <td class="title-cell" align="center">
            <div class="doc-title"><span style="font-size: 14pt;">COMPROBANTE DE PRESTAMO </span><span style="font-size: 14pt;">${doc.cabecera.numero}</span></div>
            </td>
            <td class="right-cell"></td>
            </tr></table>
        </macro>
        <macro id="nlfooter">
            <table class="footer-table"><tr>
            <td>${doc.cabecera.subsidiaria}</td>
            <td class="text-right">Pagina <pagenumber/> de <totalpages/></td>
            </tr></table>
        </macro>
    </macrolist>
    <style>
        * { font-family: NotoSans, sans-serif; }

        body { color: #2f3e4e; font-size: 9pt; }

        table { width: 100%; table-layout: fixed; border-collapse: collapse; }

        td { vertical-align: top; padding: 4px 6px; word-wrap: break-word; }

        th {
            font-size: 8pt;
            font-weight: bold;
            color: #2f3e4e;
            background-color: #efefef;
            border-bottom: 1px solid #cfd5db;
            padding: 8px 6px;
            text-align: left;
        }

        /* Encabezado y pie */
        .header-table { width: 100%; margin-bottom: 6px; }
        .header-table td { padding: 0; vertical-align: middle; }
        .logo-cell { width: 18%; }
        .title-cell { width: 64%; text-align: center; }
        .right-cell { width: 18%; }

        .doc-title {
            font-size: 15pt;
            font-weight: bold;
            color: #2f3e4e;
            text-align: center;
            letter-spacing: 0.4px;
        }

        .footer-table { font-size: 7.5pt; color: #7a8794; }
        .footer-table td { padding: 0; }

        /* Bloques de datos */
        .block { border: 1px solid #97a3af; margin-top: 16px; }

        .block-title {
            background-color: #edf0f2;
            color: #2e4a62;
            font-size: 10.5pt;
            font-weight: bold;
            padding: 6px 10px;
            border-bottom: 1px solid #d5dce2;
        }

        .label {
            width: 34%;
            font-weight: bold;
            color: #415364;
            padding-top: 4px;
            padding-bottom: 4px;
        }

        .value {
            width: 66%;
            color: #1f2f40;
            padding-top: 4px;
            padding-bottom: 4px;
        }

        /* Tabla de articulos */
        .itemtable { margin-top: 16px; border: 1px solid #97a3af; }

        .itemtable thead th {
            white-space: nowrap;
            word-wrap: normal;
            overflow: hidden;
            padding-top: 8px;
            padding-bottom: 8px;
        }

        .itemtable td {
            font-size: 8pt;
            border-bottom: 1px solid #e3e7ea;
            padding-top: 8px;
            padding-bottom: 8px;
        }

        .itemname { font-weight: bold; color: #1f2f40; line-height: 140%; }

        .totalrow td {
            font-weight: bold;
            background-color: #f6f7f8;
            border-bottom: none;
        }

        /* Firmas */
        .text-center { text-align: center; }
        .text-right { text-align: right; }
    </style>
</head>
<body header="nlheader" header-height="13%" footer="nlfooter" footer-height="24pt" padding="0.45in 0.45in 0.45in 0.45in" size="Letter">

<table class="block">
<tr>
<td class="block-title">Datos del prestamo</td>
<td class="block-title text-right"><strong>Fecha de prestamo:</strong> ${doc.cabecera.fecha}</td>
</tr>
<tr>
<td class="label">Subsidiaria</td>
<td class="value">${doc.cabecera.subsidiaria}</td>
</tr>
<tr>
<td class="label">Servicio</td>
<td class="value">${doc.cabecera.servicio}</td>
</tr>
<tr>
<td class="label">Ubicacion origen</td>
<td class="value">${doc.cabecera.origen}</td>
</tr>
<tr>
<td class="label">Ubicacion destino</td>
<td class="value">${doc.cabecera.destino}</td>
</tr>
<tr>
<td class="label">Responsable del prestamo</td>
<td class="value">${doc.cabecera.responsable}</td>
</tr>
<tr>
<td class="label">Estado</td>
<td class="value">${doc.cabecera.estado}</td>
</tr>
<#if doc.cabecera.traslado?has_content>
<tr>
<td class="label">Traslado generado</td>
<td class="value">${doc.cabecera.traslado}</td>
</tr>
</#if>
<#if doc.cabecera.comentarios?has_content>
<tr>
<td class="label">Comentarios</td>
<td class="value">${doc.cabecera.comentarios}</td>
</tr>
</#if>
</table>

<table class="itemtable">
<thead>
<tr>
<th style="width: 46%;">Articulo</th>
<th style="width: 14%;">Unidad</th>
<th style="width: 13%;" class="text-right">Prestada</th>
<th style="width: 13%;" class="text-right">Devuelta</th>
<th style="width: 14%;" class="text-right">Pendiente</th>
</tr>
</thead>
<#list doc.lineas as linea>
<tr>
<td><span class="itemname">${linea.articulo}</span></td>
<td>${linea.unidad}</td>
<td class="text-right">${linea.cantidad}</td>
<td class="text-right">${linea.devuelta}</td>
<td class="text-right">${linea.pendiente}</td>
</tr>
</#list>
<tr class="totalrow">
<td colspan="2">Total: ${doc.totales.articulos} articulos</td>
<td class="text-right">${doc.totales.cantidad}</td>
<td class="text-right">${doc.totales.devuelta}</td>
<td class="text-right">${doc.totales.pendiente}</td>
</tr>
</table>

<table class="block">
<tr>
<td class="block-title" colspan="2">Datos de la entrega</td>
</tr>
<tr>
<td class="label">Fecha</td>
<td class="value">
<table style="width: 100%; table-layout: fixed;"><tr>
<td style="border-bottom: 1px solid #2f3e4e; padding: 0; height: 16px; width: 60%;"></td>
<td style="width: 40%;"></td>
</tr></table>
</td>
</tr>
<tr>
<td class="label">Nombre del Receptor</td>
<td class="value">
<table style="width: 100%; table-layout: fixed;"><tr>
<td style="border-bottom: 1px solid #2f3e4e; padding: 0; height: 16px; width: 60%;"></td>
<td style="width: 40%;"></td>
</tr></table>
</td>
</tr>
<tr>
<td class="label">Firma</td>
<td class="value">
<table style="width: 100%; table-layout: fixed;"><tr>
<td style="border-bottom: 1px solid #2f3e4e; padding: 0; height: 16px; width: 60%;"></td>
<td style="width: 40%;"></td>
</tr></table>
</td>
</tr>
</table>

</body>
</pdf>
