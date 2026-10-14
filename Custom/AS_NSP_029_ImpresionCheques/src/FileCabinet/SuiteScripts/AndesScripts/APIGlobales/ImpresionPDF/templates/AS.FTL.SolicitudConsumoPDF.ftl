<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<#-- Parsear el payload JSON inyectado por el Renderer (addCustomDataSource alias='jsonString') -->
<#assign doc = jsonString.text?eval>
<pdf>
<head>
	<link name="NotoSans" type="font" subtype="truetype" src="${nsfont.NotoSans_Regular}" src-bold="${nsfont.NotoSans_Bold}" src-italic="${nsfont.NotoSans_Italic}" src-bolditalic="${nsfont.NotoSans_BoldItalic}" bytes="2" />
	<#if .locale == "zh_CN">
		<link name="NotoSansCJKsc" type="font" subtype="opentype" src="${nsfont.NotoSansCJKsc_Regular}" src-bold="${nsfont.NotoSansCJKsc_Bold}" bytes="2" />
	<#elseif .locale == "zh_TW">
		<link name="NotoSansCJKtc" type="font" subtype="opentype" src="${nsfont.NotoSansCJKtc_Regular}" src-bold="${nsfont.NotoSansCJKtc_Bold}" bytes="2" />
	<#elseif .locale == "ja_JP">
		<link name="NotoSansCJKjp" type="font" subtype="opentype" src="${nsfont.NotoSansCJKjp_Regular}" src-bold="${nsfont.NotoSansCJKjp_Bold}" bytes="2" />
	<#elseif .locale == "ko_KR">
		<link name="NotoSansCJKkr" type="font" subtype="opentype" src="${nsfont.NotoSansCJKkr_Regular}" src-bold="${nsfont.NotoSansCJKkr_Bold}" bytes="2" />
	<#elseif .locale == "th_TH">
		<link name="NotoSansThai" type="font" subtype="opentype" src="${nsfont.NotoSansThai_Regular}" src-bold="${nsfont.NotoSansThai_Bold}" bytes="2" />
	</#if>
    <macrolist>
        <macro id="nlheader">

<table class="header-table"><tr>
<td class="logo-cell" align="left"><#if companyInformation.logoUrl?length != 0> <@filecabinet nstype="image" style="width: 72px; height: auto;" src="${companyInformation.logoUrl}" /> </#if></td>
<td class="title-cell" align="center">
<div class="doc-title"><span style="font-size: 14pt;">SOLICITUD DE CONSUMO </span> <span style="font-size: 14pt;">${doc.header.name}</span></div>
</td>
<td class="right-cell"></td>
</tr></table>

        </macro>
        <macro id="nlfooter">
        </macro>
    </macrolist>
    <style>
        * {
        <#if .locale == "zh_CN">
            font-family: NotoSans, NotoSansCJKsc, sans-serif;
        <#elseif .locale == "zh_TW">
            font-family: NotoSans, NotoSansCJKtc, sans-serif;
        <#elseif .locale == "ja_JP">
            font-family: NotoSans, NotoSansCJKjp, sans-serif;
        <#elseif .locale == "ko_KR">
            font-family: NotoSans, NotoSansCJKkr, sans-serif;
        <#elseif .locale == "th_TH">
            font-family: NotoSans, NotoSansThai, sans-serif;
        <#else>
            font-family: NotoSans, sans-serif;
        </#if>
        }

        body {
            color: #2f3e4e;
            font-size: 9pt;
        }

        table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
        }

        td {
            vertical-align: top;
            padding: 4px 6px;
            word-wrap: break-word;
        }

        th {
            font-size: 8pt;
            font-weight: bold;
            color: #2f3e4e;
            background-color: #efefef;
            border-bottom: 1px solid #cfd5db;
            padding: 8px 6px;
            text-align: left;
        }

        /* Header */
        .header-table {
            width: 100%;
            margin-bottom: 6px;
        }

        .header-table td {
            padding: 0;
            vertical-align: middle;
        }

        .logo-cell {
            width: 16%;
        }

        .title-cell {
            width: 68%;
            text-align: center;
        }

        .right-cell {
            width: 16%;
        }

        .doc-title {
            font-size: 15pt;
            font-weight: 700;
            color: #2f3e4e;
            text-align: center;
            letter-spacing: 0.4px;
        }

        /* Blocks */
        .block {
            border: 1px solid #97a3af;
            margin-top: 10px;
        }

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

        /* Layout */
        .main-top {
            margin-top: 10px;
        }

        /* Items table */
        .itemtable {
            margin-top: 12px;
            border: 1px solid #97a3af;
        }

        .itemtable thead th {
            white-space: nowrap;
            word-wrap: normal;
            overflow: hidden;
            font-size: 8pt;
            padding-top: 8px;
            padding-bottom: 8px;
        }

        .itemtable td {
            border-bottom: 1px solid #e3e7ea;
            padding-top: 8px;
            padding-bottom: 8px;
            vertical-align: top;
        }

        .itemname {
            font-weight: bold;
            color: #1f2f40;
            line-height: 140%;
        }

        .text-center {
            text-align: center;
        }

        .text-right {
            text-align: right;
        }
    </style>
</head>
<body header="nlheader" header-height="11%" footer="nlfooter" footer-height="20pt" padding="0.45in 0.45in 0.45in 0.45in" size="Letter">

<!-- DATOS DEL SOLICITANTE -->
<table class="main-top"><tr>
<td style="padding: 0;">
<table class="block"><tr>
<td class="block-title" style="text-align: left;">Datos del solicitante</td>
<td class="block-title" style="text-align: right;"><strong>Fecha de emision:</strong> ${doc.header.fecha}</td>
</tr>
<tr>
<td class="label">Numero de solicitud</td>
<td class="value">${doc.header.name}</td>
</tr>
<tr>
<td class="label">Nombre del solicitante</td>
<td class="value">${doc.header.solicitante}</td>
</tr>
<tr>
<td class="label">Ubicacion</td>
<td class="value">${doc.header.ubicacion}</td>
</tr>
<tr>
<td class="label">Departamento solicitante</td>
<td class="value">${doc.header.departamento}</td>
</tr>
<tr>
<td class="label">Nota:</td>
<td class="value">${doc.header.nota}</td>
</tr></table>
</td>
</tr></table>

<!-- DETALLE DE ARTICULOS -->
<table class="itemtable">
<thead>
<tr>
<th colspan="6">Articulo</th>
<th align="center" colspan="4">Unidad de Medida</th>
<th align="center" colspan="4">Cant. Solicitada</th>
<th align="center" colspan="4">Cant. Despachada</th>
<th align="center" colspan="6">Centro de Costo</th>
</tr>
</thead>
<#list doc.items as line>
<tr>
<td colspan="6"><p style="text-align: left;"><span class="itemname" style="font-size: 8pt;">${line.articulo}</span></p></td>
<td align="center" colspan="4"><span style="font-size: 8pt;">${line.unidad}</span></td>
<td align="right" colspan="4" style="text-align: right;"><span style="font-size: 8pt; padding-right: 16px;">${line.cantidad?string["0.##"]}</span></td>
<td align="right" colspan="4" style="text-align: right;"><#if doc.header.fechaEntrega?has_content><span style="font-size: 8pt; padding-right: 16px;">${line.cantidad?string["0.##"]}</span></#if></td>
<td align="center" colspan="6"><span style="font-size: 8pt;">${line.departamento}</span></td>
</tr>
</#list>
</table>


<!--<pbr/>-->

<table class="block" style="margin-top: 16px;">
<tr>
<td class="block-title" colspan="2">Datos de la entrega</td>
</tr>
<tr>
<td class="label">Fecha</td>
<td class="value">${doc.header.fechaEntrega!''}</td>
</tr>
<tr>
<td class="label">Nombre del Receptor</td>
<td class="value">
<table style="width: 100%; table-layout: fixed;"><tr>
<td style="border-bottom: 1px solid #2f3e4e; padding: 0; height: 16px;"></td>
</tr></table>
</td>
</tr>
<tr style="padding-top:5px;">
<td class="label">Firma</td>
<td class="value">
<table style="width: 100%; table-layout: fixed;"><tr>
<td style="border-bottom: 1px solid #2f3e4e; padding: 0; height: 16px; width: 45%;"></td>
<td style="width: 55%;"></td>
</tr></table>
</td>
</tr>
</table>

</body>
</pdf>
