/**
 * AS_NSP_025 — MCP remoto de consulta a NetSuite (Cloudflare Worker)
 *
 * El mensajero entre Claude y el RESTlet. No consulta ni decide nada: la
 * whitelist y los limites viven en NetSuite (AS_ConsultaMCPHandler.js).
 *
 * Por cada llamada:
 *   1. Ruta: /qa/mcp o /prod/mcp. Cada ambiente es un MCP distinto en Claude,
 *      para que consultar PROD sea una decision explicita.
 *   2. Clave: el secret API_KEYS es { "<clave>": "<desarrollador>" }, una por
 *      persona. Sin clave valida, 401. Llega de dos formas:
 *        - terminal (Claude Code): cabecera "Authorization: Bearer <clave>"
 *        - web (claude.ai): al final de la URL, /qa/mcp/<clave>, porque el
 *          conector personalizado de la web no deja poner cabeceras.
 *      Por la segunda, wrangler.toml apaga los invocation logs de Cloudflare:
 *      guardan la URL completa y dejarian la clave a la vista.
 *   3. Ambiente habilitado: PROD nace en false; abrirlo exige cambiar este
 *      archivo y volver a desplegar. Si no, 503.
 *   4. Herramientas: arma el servidor MCP y le pasa la llamada al RESTlet.
 *   5. Log: una linea "MCP CONSULTA" con desarrollador, ambiente, operacion,
 *      estado y duracion. Nunca la consulta ni los datos devueltos.
 *
 * Los tokens de NetSuite son secrets de Cloudflare con prefijo QA_ o PROD_: las
 * credenciales de una cuenta nunca se cruzan con las de la otra.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { llamarRestlet } from './AS_NetsuiteClient.js';
import { registrarHerramientas } from './AS_ConsultaMCPTools.js';

const AMBIENTES = {
    qa  : { nombre: 'qa',   prefijo: 'QA_',   habilitado: true  },
    prod: { nombre: 'prod', prefijo: 'PROD_', habilitado: false },
};

export default {
    async fetch(request, env) {
        try {
            // /qa/mcp -> ['', 'qa', 'mcp']   /qa/mcp/<clave> -> ['', 'qa', 'mcp', '<clave>']
            const partes     = new URL(request.url).pathname.split('/');
            const rutaValida = partes[2] === 'mcp' && partes.length <= 4 && Object.hasOwn(AMBIENTES, partes[1]);

            if (!rutaValida) return Response.json({ error: 'Ruta no encontrada' }, { status: 404 });

            const ambiente      = AMBIENTES[partes[1]];
            const desarrollador = identificarDesarrollador(request, env, partes[3]);

            if (!desarrollador)       return Response.json({ error: 'API Key invalida o ausente' }, { status: 401 });
            if (!ambiente.habilitado) return Response.json({ error: 'Ambiente ' + ambiente.nombre + ' no habilitado' }, { status: 503 });

            return await atenderMcp(request, env, ambiente, desarrollador);
        } catch (fallo) {
            console.error(JSON.stringify({ evento: 'MCP ERROR', detalle: String(fallo) }));

            return Response.json({ error: 'Error interno del Worker' }, { status: 500 });
        }
    },
};

// Object.hasOwn y no un acceso directo: con desarrolladores[clave] una clave
// como "constructor" devolveria la funcion heredada de Object y pasaria como valida.
const identificarDesarrollador = (request, env, claveUrl) => {
    const clave           = claveUrl || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const desarrolladores = JSON.parse(env.API_KEYS);

    if (!clave || !Object.hasOwn(desarrolladores, clave)) return null;

    return desarrolladores[clave];
};

// Servidor MCP nuevo por request: un Worker no garantiza que dos llamadas caigan
// en la misma instancia, asi que una sesion en memoria se perderia.
const atenderMcp = async (request, env, ambiente, desarrollador) => {
    const credenciales = obtenerCredenciales(env, ambiente);
    const servidor     = new McpServer({ name: 'netsuite-' + ambiente.nombre, version: '2.0.0' });

    registrarHerramientas(servidor, (payload) => consultarNetsuite(credenciales, ambiente, desarrollador, payload));

    const transporte = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    await servidor.connect(transporte);

    return transporte.handleRequest(request);
};

const obtenerCredenciales = (env, ambiente) => {
    return {
        cuenta        : env[ambiente.prefijo + 'NS_ACCOUNT_ID'],
        consumerKey   : env[ambiente.prefijo + 'NS_CONSUMER_KEY'],
        consumerSecret: env[ambiente.prefijo + 'NS_CONSUMER_SECRET'],
        tokenId       : env[ambiente.prefijo + 'NS_TOKEN_ID'],
        tokenSecret   : env[ambiente.prefijo + 'NS_TOKEN_SECRET'],
    };
};

const consultarNetsuite = async (credenciales, ambiente, desarrollador, payload) => {
    const inicio    = Date.now();
    const respuesta = await llamarRestlet(credenciales, { ...payload, desarrollador: desarrollador });

    console.log(JSON.stringify({
        evento       : 'MCP CONSULTA',
        ambiente     : ambiente.nombre,
        desarrollador: desarrollador,
        operacion    : payload.operacion,
        estado       : respuesta.estado,
        ms           : Date.now() - inicio,
    }));

    if (!respuesta.ok) {
        return { content: [{ type: 'text', text: 'HTTP ' + respuesta.estado + '\n' + respuesta.texto }], isError: true };
    }

    return { content: [{ type: 'text', text: respuesta.texto }] };
};
