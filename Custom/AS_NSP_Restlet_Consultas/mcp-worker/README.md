# MCP remoto — AS_NSP_025

Reemplazo en Cloudflare Workers del `mcp-server/` local (borrado; respaldo en
`Custom/AS_NSP_025_Restlet_0255/mcp-server`). Un solo Worker para todo el
equipo; cada ambiente es una ruta y un MCP distinto en Claude.

```
Claude Code ──HTTPS + API Key──► as-mcp.andessalud.workers.dev
                                   ├─ /qa/mcp    → RESTlet QA   → Handler → Repository
                                   └─ /prod/mcp  → RESTlet PROD (bloqueado)
```

El RESTlet, el Handler y el Repository no cambian: la whitelist y los límites siguen
en NetSuite. El Worker solo autentica, firma TBA y audita.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/index.js` | la puerta: ruta QA/PROD, API Key (401), PROD bloqueado (503), log de cada consulta |
| `src/AS_NetsuiteClient.js` | la llave: firma OAuth 1.0a (HMAC-SHA256) y llama al RESTlet |
| `src/AS_ConsultaMCPTools.js` | las 13 herramientas |

## Regla de seguridad

Todo es lectura, con una sola excepcion: `crear_busqueda` y `crear_dataset` guardan una
Saved Search o un Dataset **nuevo**, solo de consulta y solo cuando el usuario lo pide.
Nunca modifican uno existente, ni registros, scripts, archivos o deployments.

## Seguridad

- **Una API Key por desarrollador**, en el secret `API_KEYS`:
  `{"<clave>":"pepo","<clave>":"dev2","<clave>":"dev3"}`. Para revocar a alguien, se saca
  su entrada y se vuelve a subir el secret.
- **Credenciales separadas por prefijo**: `QA_NS_*` y `PROD_NS_*`. Un token de QA no
  sirve contra el dominio de PROD.
- **PROD bloqueado en código**: `habilitado: false` en `src/index.js`.
  Para abrirlo hay que cambiarlo y volver a desplegar; no alcanza con cargar los secrets.

## Auditoría

Cada llamada deja una línea `MCP CONSULTA` en los logs del Worker: ambiente,
desarrollador, operación, estado HTTP y duración. No se registra la consulta ni los datos.

- En vivo: `npm run logs`.
- Histórico: *Cloudflare → Workers & Pages → as-mcp → Observability*.

El Worker además manda `desarrollador` en el payload, pero **el RESTlet hoy lo ignora**:
en el Execution Log de NetSuite todas las llamadas figuran con el usuario del token.

## Desplegar

Solo si cambió el código. Quien despliega necesita acceso a la cuenta de Cloudflare
(se le invita desde el panel), no los tokens: los secrets quedan guardados en Cloudflare
entre un despliegue y otro.

```bash
cd Custom/AS_NSP_Restlet_Consultas/mcp-worker
npm install                 # descarga las librerias a node_modules (no va a git)
npx wrangler login          # una vez por PC
npx wrangler deploy
```

Los secrets se cargan una sola vez, o cuando cambian, con `npx wrangler secret put <NOMBRE>`:
`API_KEYS`, `QA_NS_ACCOUNT_ID`, `QA_NS_CONSUMER_KEY`, `QA_NS_CONSUMER_SECRET`,
`QA_NS_TOKEN_ID`, `QA_NS_TOKEN_SECRET` (y los mismos con `PROD_` cuando se habilite).
`.dev.vars` guarda esos valores en la PC de Pepo, fuera de git.

## Registrar en Claude (cada desarrollador)

**Terminal (Claude Code)**, una vez por PC:

```bash
claude mcp add --transport http --scope user netsuite-qa-remoto https://as-mcp.andessalud.workers.dev/qa/mcp --header "Authorization: Bearer <su clave>"
```

**Web (claude.ai)**: *Configuración → Conectores → Agregar conector personalizado*, con la
clave al final de la URL, porque la web no deja poner cabeceras:

```
https://as-mcp.andessalud.workers.dev/qa/mcp/<su clave>
```

Esa URL es la clave: no se comparte. Por ella los invocation logs de Cloudflare están
apagados en `wrangler.toml` (guardan la URL completa).

## Habilitar PROD (pendiente)

1. Desplegar el proyecto SDF en `AndesSaludProd`, con su rol, integración y token.
2. Cargar `PROD_NS_ACCOUNT_ID`, `PROD_NS_CONSUMER_KEY`, `PROD_NS_CONSUMER_SECRET`,
   `PROD_NS_TOKEN_ID` y `PROD_NS_TOKEN_SECRET` con `wrangler secret put`.
3. Cambiar `prod.habilitado` a `true` y `npx wrangler deploy`.
4. Cada desarrollador que deba verlo registra `netsuite-prod` con `/prod/mcp`.
