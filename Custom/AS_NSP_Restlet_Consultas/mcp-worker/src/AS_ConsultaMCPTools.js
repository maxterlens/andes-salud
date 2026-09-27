/**
 * AS_NSP_025 — Herramientas MCP de consulta
 *
 * Las mismas 13 del mcp-server local. Todo es lectura salvo la unica excepcion
 * de la regla de seguridad del MCP: crear_busqueda y crear_dataset guardan una
 * Saved Search o un Dataset NUEVO, solo de consulta y solo por pedido expreso.
 * Nunca modifican uno existente ni ningun registro.
 *
 * Cada herramienta solo arma el payload del RESTlet. La validacion real
 * (whitelist de tablas, limites de filas y bytes) ocurre en NetSuite.
 */
import { z } from 'zod';

export const registrarHerramientas = (servidor, consultar) => {
    const valorFiltro = z.union([
        z.string(), z.number(), z.boolean(),
        z.array(z.union([z.string(), z.number(), z.boolean()])),
    ]);
    const filtroPermitido = z.union([
        z.tuple([z.string(), z.string(), valorFiltro]),
        z.enum(['AND', 'OR']),
    ]);

    servidor.registerTool('suiteql', {
        title      : 'Ejecutar SuiteQL',
        description: 'Corre una consulta SuiteQL de solo lectura contra NetSuite. Solo SELECT o WITH, sin'
                   + ' SELECT *, y solo sobre las tablas de la whitelist. Devuelve como maximo 50 filas en'
                   + ' formato columnar {cols, rows}. Si el resultado supera 40 KB se rechaza: agrega un WHERE'
                   + ' mas especifico o agrega primero con COUNT/GROUP BY.',
        inputSchema: { consulta: z.string().describe('La consulta SuiteQL. Nombra las columnas, nunca SELECT *.') },
    }, async ({ consulta }) => consultar({ operacion: 'suiteql', consulta }));

    servidor.registerTool('campos_de_registro', {
        title      : 'Campos custom por familia',
        description: 'Lista los campos custom de una familia de NetSuite con su scriptid, etiqueta y tipo.'
                   + ' Devuelve campos custom, no los nativos.',
        inputSchema: { familia: z.enum(['transaccion', 'linea', 'entidad', 'articulo', 'otro'])
                                 .describe('transaccion = campos de cabecera de transaccion; linea = columnas de linea;'
                                         + ' entidad = cliente, proveedor, empleado; articulo = item; otro = el resto.') },
    }, async ({ familia }) => consultar({ operacion: 'campos_de_registro', familia }));

    servidor.registerTool('describir_custom_record', {
        title      : 'Describir custom record',
        description: 'Devuelve la cabecera de un custom record y la lista de sus campos, por scriptid.',
        inputSchema: { scriptid: z.string().describe('El scriptid del custom record, por ejemplo customrecord_as_algo.') },
    }, async ({ scriptid }) => consultar({ operacion: 'describir_custom_record', scriptid }));

    servidor.registerTool('listar_carpeta', {
        title      : 'Listar carpeta del File Cabinet',
        description: 'Lista hasta 50 archivos de una carpeta por nombre, solo dentro de'
                   + ' SuiteScripts o SuiteApps, con id, tipo, tamano y fecha de modificacion.'
                   + ' No lee contenido ni descarga archivos.',
        inputSchema: { carpeta: z.string().describe('Nombre de la carpeta, por ejemplo Transacciones.') },
    }, async ({ carpeta }) => consultar({ operacion: 'listar_carpeta', carpeta }));

    servidor.registerTool('leer_registro', {
        title      : 'Leer registro y sublistas',
        description: 'Lee todos los body fields y enumera las sublistas de un registro existente.'
                   + ' Si se indica una sublista, lee hasta 50 lineas desde la posicion solicitada.'
                   + ' Nunca guarda ni modifica el registro.',
        inputSchema: {
            tipo    : z.string().describe('Tipo de registro de NetSuite.'),
            id      : z.string().describe('ID interno del registro.'),
            sublista: z.string().optional().describe('Sublista especifica, si se necesita.'),
            desde   : z.number().int().nonnegative().optional().describe('Primera linea, desde cero.'),
        },
    }, async ({ tipo, id, sublista, desde }) => consultar({
        operacion: 'leer_registro', tipo, id, sublista, desde,
    }));

    servidor.registerTool('leer_archivo', {
        title      : 'Leer archivo tecnico',
        description: 'Devuelve hasta 10000 caracteres de un archivo tecnico de SuiteScripts'
                   + ' o SuiteApps. No lo descarga al equipo ni modifica el archivo.',
        inputSchema: {
            id   : z.string().describe('ID interno del archivo.'),
            desde: z.number().int().nonnegative().optional().describe('Primer caracter, desde cero.'),
        },
    }, async ({ id, desde }) => consultar({ operacion: 'leer_archivo', id, desde }));

    servidor.registerTool('ejecutar_busqueda', {
        title      : 'Ejecutar Saved Search',
        description: 'Ejecuta una busqueda guardada existente. Maximo 50 filas; solo tipos permitidos.',
        inputSchema: { busqueda: z.string().describe('Scriptid customsearch_... o ID interno.') },
    }, async ({ busqueda }) => consultar({ operacion: 'ejecutar_busqueda', busqueda }));

    servidor.registerTool('buscar', {
        title      : 'Busqueda dinamica',
        description: 'Crea en memoria y ejecuta una busqueda sin guardarla. Maximo 50 filas.',
        inputSchema: {
            tipo    : z.string().describe('Tipo de registro permitido.'),
            filtros : z.array(filtroPermitido).optional().describe('Filtros sobre campos base, sin joins ni formulas.'),
            columnas: z.array(z.string()).min(1).describe('IDs de columnas base, sin joins ni formulas.'),
        },
    }, async ({ tipo, filtros, columnas }) => consultar({
        operacion: 'buscar', tipo, filtros, columnas,
    }));

    servidor.registerTool('crear_busqueda', {
        title      : 'Crear Saved Search de consulta',
        description: 'Usar UNICAMENTE si el usuario pide expresamente crear una Saved Search.'
                   + ' Guarda una busqueda nueva, privada y solo de consulta; devuelve solo su ID.'
                   + ' Prohibido modificar una busqueda existente o cualquier registro.',
        inputSchema: {
            tipo    : z.string().describe('Tipo de registro permitido.'),
            titulo  : z.string().min(1).describe('Nombre de la nueva busqueda.'),
            filtros : z.array(filtroPermitido).optional().describe('Filtros sobre campos base, sin joins ni formulas.'),
            columnas: z.array(z.string()).min(1).describe('IDs de columnas base, sin joins ni formulas.'),
        },
    }, async ({ tipo, titulo, filtros, columnas }) => consultar({
        operacion: 'crear_busqueda', tipo, titulo, filtros, columnas,
    }));

    servidor.registerTool('listar_busquedas', {
        title      : 'Listar Saved Searches',
        description: 'Lista busquedas guardadas visibles, con id, titulo, tipo y propietario.',
        inputSchema: { filtro: z.string().optional().describe('Texto contenido en el titulo.') },
    }, async ({ filtro }) => consultar({ operacion: 'listar_busquedas', filtro }));

    servidor.registerTool('listar_datasets', {
        title      : 'Listar Datasets',
        description: 'Lista metadatos de Datasets existentes sin modificarlos.',
        inputSchema: {},
    }, async () => consultar({ operacion: 'listar_datasets' }));

    servidor.registerTool('ejecutar_dataset', {
        title      : 'Ejecutar Dataset',
        description: 'Ejecuta un Dataset existente permitido. Maximo 50 filas.',
        inputSchema: { id: z.string().describe('ID del Dataset existente.') },
    }, async ({ id }) => consultar({ operacion: 'ejecutar_dataset', id }));

    servidor.registerTool('crear_dataset', {
        title      : 'Crear Dataset de consulta',
        description: 'Usar UNICAMENTE si el usuario pide expresamente crear un Dataset.'
                   + ' Guarda un Dataset nuevo solo de consulta; devuelve solo su ID.'
                   + ' Prohibido modificar un Dataset existente o cualquier registro.',
        inputSchema: {
            tipo    : z.string().describe('Tipo base permitido.'),
            titulo  : z.string().min(1).describe('Nombre del nuevo Dataset.'),
            columnas: z.array(z.string()).min(1).describe('IDs de campos base.'),
        },
    }, async ({ tipo, titulo, columnas }) => consultar({
        operacion: 'crear_dataset', tipo, titulo, columnas,
    }));
};
