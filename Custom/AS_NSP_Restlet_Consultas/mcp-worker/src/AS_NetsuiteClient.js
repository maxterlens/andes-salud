/**
 * AS_NSP_025 — Cliente del RESTlet de consulta MCP
 *
 * Firma la llamada con TBA (OAuth 1.0a, HMAC-SHA256) usando Web Crypto, la API
 * nativa de los Workers. Es la misma firma del mcp-server local que reemplaza
 * (respaldo en Custom/AS_NSP_025_Restlet_0255/mcp-server/server.js).
 *
 * Los query params script y deploy entran en la base string junto a los oauth_*:
 * dejarlos fuera es el motivo mas comun de INVALID_LOGIN.
 */
// Mismo scriptid en las dos cuentas: el dominio de la cuenta separa un RESTlet del otro.
const RESTLET = {
    scriptId: 'customscript_as_consulta_mcp',
    deployId: 'customdeploy_as_consulta_mcp',
};

export const llamarRestlet = async (credenciales, payload) => {
    const url       = armarUrl(credenciales.cuenta);
    const respuesta = await fetch(url + '?script=' + RESTLET.scriptId + '&deploy=' + RESTLET.deployId, {
        method : 'POST',
        headers: {
            'Authorization': await armarCabecera(credenciales, url),
            'Content-Type' : 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return { ok: respuesta.ok, estado: respuesta.status, texto: await respuesta.text() };
};

const armarUrl = (cuenta) => {
    const dominio = cuenta.toLowerCase().replace(/_/g, '-');

    return 'https://' + dominio + '.restlets.api.netsuite.com/app/site/hosting/restlet.nl';
};

const armarCabecera = async (credenciales, url) => {
    const oauth = {
        oauth_consumer_key    : credenciales.consumerKey,
        oauth_nonce           : generarNonce(),
        oauth_signature_method: 'HMAC-SHA256',
        oauth_timestamp       : Math.floor(Date.now() / 1000).toString(),
        oauth_token           : credenciales.tokenId,
        oauth_version         : '1.0',
    };

    const todos = { ...oauth, script: RESTLET.scriptId, deploy: RESTLET.deployId };
    const orden = Object.keys(todos).sort().map((k) => codificar(k) + '=' + codificar(todos[k])).join('&');
    const base  = ['POST', codificar(url), codificar(orden)].join('&');
    const llave = codificar(credenciales.consumerSecret) + '&' + codificar(credenciales.tokenSecret);

    oauth.oauth_signature = await firmar(llave, base);

    return 'OAuth realm="' + credenciales.cuenta.toUpperCase() + '", ' + Object.keys(oauth).sort()
        .map((k) => codificar(k) + '="' + codificar(oauth[k]) + '"').join(', ');
};

const generarNonce = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));

    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const firmar = async (llave, base) => {
    const codificador = new TextEncoder();
    const clave       = await crypto.subtle.importKey('raw', codificador.encode(llave),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const firma       = await crypto.subtle.sign('HMAC', clave, codificador.encode(base));

    return btoa(String.fromCharCode(...new Uint8Array(firma)));
};

const codificar = (valor) => encodeURIComponent(valor)
    .replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
