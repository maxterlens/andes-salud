/**
 * AS_NSP_025 — Consulta MCP con creacion controlada
 * @description Decide que se puede consultar y que no. Todo lo que llega del
 *              servidor MCP pasa por aca antes de tocar el repository.
 *
 *              El switch de ejecutarOperacion es cerrado: una operacion que no este
 *              en los case cae en el default y se rechaza. La unica persistencia
 *              autorizada crea una Saved Search o un Dataset nuevo de consulta.
 *
 *              validarOperacion corre antes que cualquier consulta y devuelve texto
 *              vacio cuando todo esta bien. Para suiteql revisa tres cosas: que la
 *              consulta empiece con SELECT o WITH, que no traiga palabras de
 *              escritura ni SELECT *, y que todas las tablas del FROM y del JOIN
 *              esten en la whitelist. Basta que una no lo este para rechazar.
 *
 *              El tope de bytes es el fusible: se mide la respuesta ya armada y si
 *              pasa el limite se devuelve el error en lugar del contenido, para que
 *              la consulta se rehaga mas especifica en vez de mandar cientos de KB.
 *
 *              La auditoria registra la operacion, el usuario, el rol, las tablas,
 *              las filas, los bytes y la duracion, pero nunca la consulta completa
 *              ni los valores devueltos: alcanza con saber que se consulto.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * CHANGELOG v1.1.0 (2026-09-25):
 * - [FEAT] Consultas de registros, archivos, busquedas y datasets.
 * - [FEAT] Creacion limitada a artefactos nuevos de consulta.
 */
define(['N/runtime', './../repositories/AS_ConsultaMCPRepository', './../lib/AS_ConsultaMCPConstants'],
    (runtime, consultaMCPRepository, CONSTANTES) => {

    const atenderConsulta = (payload) => {
        const inicio     = Date.now();
        const parametros = obtenerParametros(payload);
        const rechazo    = validarOperacion(parametros);

        if (rechazo) {
            auditar(parametros, 0, 0, Date.now() - inicio, rechazo);

            return { error: rechazo };
        }

        const respuesta = ejecutarOperacion(parametros);

        if (respuesta.error) {
            auditar(parametros, 0, 0, Date.now() - inicio, respuesta.error);
            return respuesta;
        }

        const bytes     = JSON.stringify(respuesta).length;

        if (bytes > CONSTANTES.LIMITES.BYTES) {
            auditar(parametros, 0, bytes, Date.now() - inicio, CONSTANTES.ERRORES.RESPUESTA_GRANDE);

            return { error: CONSTANTES.ERRORES.RESPUESTA_GRANDE, bytes: bytes };
        }

        auditar(parametros, contarFilas(respuesta), bytes, Date.now() - inicio, 'OK');

        return respuesta;
    };

    const obtenerParametros = (payload) => {
        return {
            operacion: payload.operacion,
            consulta : payload.consulta,
            familia  : payload.familia,
            scriptid : payload.scriptid,
            carpeta  : payload.carpeta,
            tipo     : payload.tipo,
            id       : payload.id,
            sublista : payload.sublista,
            desde    : payload.desde,
            busqueda : payload.busqueda,
            filtro   : payload.filtro,
            filtros  : payload.filtros,
            columnas : payload.columnas,
            titulo   : payload.titulo,
        };
    };

    const validarOperacion = (parametros) => {
        const permitidas = Object.keys(CONSTANTES.OPERACIONES).map((clave) => CONSTANTES.OPERACIONES[clave]);

        if (!parametros.operacion) return CONSTANTES.ERRORES.SIN_OPERACION + permitidas.join(', ');
        if (!permitidas.includes(parametros.operacion)) return CONSTANTES.ERRORES.OPERACION_INVALIDA + parametros.operacion;

        if (parametros.operacion === CONSTANTES.OPERACIONES.SUITEQL) {
            return validarConsulta(parametros.consulta);
        }

        if (parametros.operacion === CONSTANTES.OPERACIONES.CAMPOS && !CONSTANTES.TABLAS_CAMPOS[parametros.familia]) {
            return CONSTANTES.ERRORES.SIN_FAMILIA + Object.keys(CONSTANTES.TABLAS_CAMPOS).join(', ');
        }

        if (parametros.operacion === CONSTANTES.OPERACIONES.CUSTOM_RECORD && !parametros.scriptid) {
            return CONSTANTES.ERRORES.SIN_SCRIPTID;
        }

        if (parametros.operacion === CONSTANTES.OPERACIONES.CARPETA && !parametros.carpeta) {
            return CONSTANTES.ERRORES.SIN_CARPETA;
        }

        if ([CONSTANTES.OPERACIONES.REGISTRO, CONSTANTES.OPERACIONES.BUSQUEDA_DINAMICA,
                CONSTANTES.OPERACIONES.CREAR_BUSQUEDA, CONSTANTES.OPERACIONES.CREAR_DATASET]
                .includes(parametros.operacion) && !parametros.tipo) {
            return CONSTANTES.ERRORES.SIN_TIPO;
        }

        if ([CONSTANTES.OPERACIONES.REGISTRO, CONSTANTES.OPERACIONES.ARCHIVO,
                CONSTANTES.OPERACIONES.EJECUTAR_DATASET].includes(parametros.operacion)
                && !parametros.id) {
            return CONSTANTES.ERRORES.SIN_ID;
        }

        if (parametros.operacion === CONSTANTES.OPERACIONES.BUSQUEDA && !parametros.busqueda) {
            return CONSTANTES.ERRORES.SIN_BUSQUEDA;
        }

        if ([CONSTANTES.OPERACIONES.CREAR_BUSQUEDA, CONSTANTES.OPERACIONES.CREAR_DATASET]
                .includes(parametros.operacion) && !parametros.titulo) {
            return CONSTANTES.ERRORES.SIN_TITULO;
        }

        if ([CONSTANTES.OPERACIONES.BUSQUEDA_DINAMICA,
                CONSTANTES.OPERACIONES.CREAR_BUSQUEDA, CONSTANTES.OPERACIONES.CREAR_DATASET]
                .includes(parametros.operacion)
                && (!Array.isArray(parametros.columnas) || !parametros.columnas.length)) {
            return CONSTANTES.ERRORES.SIN_COLUMNAS;
        }

        if ([CONSTANTES.OPERACIONES.BUSQUEDA_DINAMICA,
                CONSTANTES.OPERACIONES.CREAR_BUSQUEDA, CONSTANTES.OPERACIONES.CREAR_DATASET]
                .includes(parametros.operacion)
                && !CONSTANTES.TIPOS_BUSQUEDA_PERMITIDOS.includes(parametros.tipo)) {
            return CONSTANTES.ERRORES.TIPO_NO_PERMITIDO + parametros.tipo;
        }

        if (parametros.operacion === CONSTANTES.OPERACIONES.REGISTRO
                && !CONSTANTES.TIPOS_REGISTRO_PERMITIDOS.includes(parametros.tipo)) {
            return CONSTANTES.ERRORES.TIPO_NO_PERMITIDO + parametros.tipo;
        }

        if ([CONSTANTES.OPERACIONES.BUSQUEDA_DINAMICA,
                CONSTANTES.OPERACIONES.CREAR_BUSQUEDA, CONSTANTES.OPERACIONES.CREAR_DATASET]
                .includes(parametros.operacion)
                && !parametros.columnas.every((columna) => validarCampoBase(columna))) {
            return CONSTANTES.ERRORES.COLUMNA_NO_PERMITIDA;
        }

        if ([CONSTANTES.OPERACIONES.BUSQUEDA_DINAMICA,
                CONSTANTES.OPERACIONES.CREAR_BUSQUEDA].includes(parametros.operacion)
                && !validarFiltros(parametros.filtros || [], false)) {
            return CONSTANTES.ERRORES.FILTRO_NO_PERMITIDO;
        }

        return '';
    };

    const validarCampoBase = (campo) => {
        return typeof campo === 'string'
            && /^[a-z_][a-z0-9_]*$/i.test(campo)
            && !/^formula/i.test(campo);
    };

    const validarFiltros = (filtros, permitirObjetos) => {
        if (!Array.isArray(filtros)) return false;

        return filtros.every((filtro) => {
            if (typeof filtro === 'string') {
                return filtro === 'AND' || filtro === 'OR';
            }

            if (Array.isArray(filtro)) {
                if (filtro.length === 3 && typeof filtro[0] === 'string') {
                    const valor = filtro[2];
                    const primitivo = (dato) => ['string', 'number', 'boolean'].includes(typeof dato);
                    return validarCampoBase(filtro[0])
                        && typeof filtro[1] === 'string'
                        && /^[a-z_]+$/i.test(filtro[1])
                        && (primitivo(valor) || (Array.isArray(valor) && valor.every(primitivo)));
                }
                return permitirObjetos && validarFiltros(filtro, true);
            }

            return permitirObjetos && filtro && typeof filtro === 'object'
                && !filtro.join && !filtro.formula && validarCampoBase(filtro.name);
        });
    };

    const validarConsulta = (consulta) => {
        if (!consulta) return CONSTANTES.ERRORES.SIN_CONSULTA;

        const normalizada = consulta.trim().toUpperCase();

        if (!CONSTANTES.INICIOS_PERMITIDOS.some((inicio) => normalizada.indexOf(inicio) === 0)) return CONSTANTES.ERRORES.NO_LECTURA;
        if (/\/\*|--|;|"/.test(consulta)) return CONSTANTES.ERRORES.SINTAXIS_NO_PERMITIDA;
        if (/\bSELECT\s+\*/.test(normalizada)) return CONSTANTES.ERRORES.SELECT_ASTERISCO;

        const prohibida = CONSTANTES.PALABRAS_PROHIBIDAS.find((palabra) => new RegExp('\\b' + palabra + '\\b').test(normalizada));

        if (prohibida) return CONSTANTES.ERRORES.PALABRA_PROHIBIDA + prohibida;

        const noPermitida = obtenerTablas(consulta).find((tabla) => !CONSTANTES.TABLAS_PERMITIDAS.includes(tabla));

        if (noPermitida) return CONSTANTES.ERRORES.TABLA_NO_PERMITIDA + noPermitida;

        return '';
    };

    // Saca los nombres que siguen a FROM y a JOIN. Es lo que se compara contra la
    // whitelist y lo que se deja en la auditoria.
    const obtenerTablas = (consulta) => {
        const patron = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
        const tablas = [];
        let hallazgo = patron.exec(consulta);

        while (hallazgo) {
            tablas.push(hallazgo[1].toLowerCase());
            hallazgo = patron.exec(consulta);
        }

        return tablas;
    };

    const ejecutarOperacion = (parametros) => {
        switch (parametros.operacion) {
            case CONSTANTES.OPERACIONES.SUITEQL:
                return armarBloque(consultaMCPRepository.ejecutarConsulta(parametros.consulta));

            case CONSTANTES.OPERACIONES.CAMPOS:
                return armarBloque(consultaMCPRepository.obtenerCamposCustom(CONSTANTES.TABLAS_CAMPOS[parametros.familia]));

            case CONSTANTES.OPERACIONES.CUSTOM_RECORD:
                return {
                    registro: armarBloque(consultaMCPRepository.obtenerCustomRecord(parametros.scriptid)),
                    campos  : armarBloque(consultaMCPRepository.obtenerCamposDeCustomRecord(parametros.scriptid)),
                };

            case CONSTANTES.OPERACIONES.CARPETA:
                return armarBloque(consultaMCPRepository.obtenerArchivosDeCarpeta(parametros.carpeta));

            case CONSTANTES.OPERACIONES.REGISTRO:
                return consultaMCPRepository.leerRegistro(parametros.tipo, parametros.id,
                    parametros.sublista, parametros.desde);

            case CONSTANTES.OPERACIONES.ARCHIVO:
                return consultaMCPRepository.leerArchivo(parametros.id, parametros.desde);

            case CONSTANTES.OPERACIONES.BUSQUEDA: {
                const busqueda = consultaMCPRepository.cargarBusqueda(parametros.busqueda);
                const rechazo = validarBusquedaCargada(busqueda);
                return rechazo ? { error: rechazo }
                    : armarBloque(consultaMCPRepository.ejecutarBusqueda(busqueda));
            }

            case CONSTANTES.OPERACIONES.BUSQUEDA_DINAMICA:
                return armarBloque(consultaMCPRepository.ejecutarBusquedaDinamica(
                    parametros.tipo, parametros.filtros, parametros.columnas));

            case CONSTANTES.OPERACIONES.CREAR_BUSQUEDA:
                return consultaMCPRepository.crearBusqueda(parametros.tipo, parametros.titulo,
                    parametros.filtros, parametros.columnas);

            case CONSTANTES.OPERACIONES.LISTAR_BUSQUEDAS:
                return armarBloque(consultaMCPRepository.obtenerBusquedasGuardadas(parametros.filtro));

            case CONSTANTES.OPERACIONES.LISTAR_DATASETS:
                return armarBloque(consultaMCPRepository.listarDatasets());

            case CONSTANTES.OPERACIONES.EJECUTAR_DATASET: {
                const existente = consultaMCPRepository.cargarDataset(parametros.id);
                const rechazo = validarDatasetCargado(existente);
                return rechazo ? { error: rechazo }
                    : armarBloque(consultaMCPRepository.ejecutarDataset(existente));
            }

            case CONSTANTES.OPERACIONES.CREAR_DATASET:
                return consultaMCPRepository.crearDataset(parametros.tipo, parametros.titulo,
                    parametros.columnas);

            default:
                return { error: CONSTANTES.ERRORES.OPERACION_INVALIDA + parametros.operacion };
        }
    };

    const validarBusquedaCargada = (busqueda) => {
        if (!CONSTANTES.TIPOS_BUSQUEDA_PERMITIDOS.includes(busqueda.searchType)) {
            return CONSTANTES.ERRORES.TIPO_NO_PERMITIDO + busqueda.searchType;
        }

        if (!busqueda.columns.every((columna) => !columna.join && !columna.formula
                && validarCampoBase(columna.name))) {
            return CONSTANTES.ERRORES.COLUMNA_NO_PERMITIDA;
        }

        if (!validarFiltros(busqueda.filters || [], true)
                || !validarFiltros(busqueda.filterExpression || [], true)) {
            return CONSTANTES.ERRORES.FILTRO_NO_PERMITIDO;
        }

        return '';
    };

    const validarDatasetCargado = (existente) => {
        if (!CONSTANTES.TIPOS_BUSQUEDA_PERMITIDOS.includes(existente.type)) {
            return CONSTANTES.ERRORES.TIPO_NO_PERMITIDO + existente.type;
        }

        if (!existente.columns.every((columna) => !columna.join && !columna.formula
                && validarCampoBase(columna.fieldId))) {
            return CONSTANTES.ERRORES.COLUMNA_NO_PERMITIDA;
        }

        if (!validarCondicionDataset(existente.condition)) {
            return CONSTANTES.ERRORES.FILTRO_NO_PERMITIDO;
        }

        return '';
    };

    const validarCondicionDataset = (condicion) => {
        if (!condicion) return true;

        if (condicion.column && (condicion.column.join || condicion.column.formula
                || !validarCampoBase(condicion.column.fieldId))) return false;

        return !condicion.children || condicion.children.every(validarCondicionDataset);
    };

    // Formato columnar: los nombres de columna viajan una sola vez en vez de
    // repetirse en cada fila. Sobre 50 filas ahorra cerca de la mitad del payload.
    const armarBloque = (filas) => {
        if (!filas.length) {
            return { cols: [], rows: [] };
        }

        const cols = Object.keys(filas[0]);

        return {
            cols: cols,
            rows: filas.map((fila) => cols.map((col) => recortarValor(fila[col]))),
        };
    };

    const recortarValor = (valor) => {
        if (valor === null || valor === undefined) {
            return '';
        }

        return String(valor).substring(0, CONSTANTES.LIMITES.TEXTO);
    };

    const contarFilas = (respuesta) => {
        if (respuesta.rows) {
            return respuesta.rows.length;
        }

        if (respuesta.registro && respuesta.campos) {
            return respuesta.registro.rows.length + respuesta.campos.rows.length;
        }

        return 0;
    };

    const auditar = (parametros, filas, bytes, duracion, resultado) => {
        log.audit({
            title  : CONSTANTES.LOGS.CONSULTA,
            details: 'operacion: ' + parametros.operacion
                   + ' | usuario: ' + runtime.getCurrentUser().id
                   + ' | rol: ' + runtime.getCurrentUser().role
                   + ' | tablas: ' + obtenerTablas(parametros.consulta || '').join(',')
                   + ' | busqueda: ' + (parametros.busqueda || '')
                   + ' | tipo: ' + (parametros.tipo || '')
                   + ' | filas: ' + filas
                   + ' | bytes: ' + bytes
                   + ' | ms: ' + duracion
                   + ' | resultado: ' + resultado,
        });
    };

    return { atenderConsulta: atenderConsulta };
});
