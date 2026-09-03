/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['./AS_EtiquetaArticuloConstants'],
    (CONSTANTES) => {
        
    const elegir = (subsidiarias, formatos, subsidiariaArticulo) => {
        return new Promise((resolver) => {
            const fondo  = crearFondo();
            const panel  = crearPanel();
            const titulo = crearTitulo();

            const opcionesSubsidiaria = [{ valor: '', texto: '' }].concat(
                subsidiarias.map((subsidiaria) => ({ valor: subsidiaria.id, texto: subsidiaria.nombre })));

            const selectorSubsidiaria = crearSelector(opcionesSubsidiaria);
            const selectorFormato     = crearSelector([]);

            selectorSubsidiaria.onchange = () => {
                llenarSelector(selectorFormato, formatosDe(formatos, selectorSubsidiaria.value));
            };

            selectorSubsidiaria.value = subsidiariaArticulo;

            llenarSelector(selectorFormato, formatosDe(formatos, selectorSubsidiaria.value));

            const cerrar = (formatoId) => {
                document.body.removeChild(fondo);
                resolver(formatos.find((formato) => formato.id === formatoId) || null);
            };

            const aceptar = () => {
                if (!selectorFormato.value) {
                    alert(CONSTANTES.MENSAJES.SIN_FORMATO);

                    return;
                }

                cerrar(selectorFormato.value);
            };

            panel.appendChild(titulo);
            panel.appendChild(crearEtiqueta(CONSTANTES.SELECTOR.SUBSIDIARIA));
            panel.appendChild(selectorSubsidiaria);
            panel.appendChild(crearEtiqueta(CONSTANTES.SELECTOR.FORMATO));
            panel.appendChild(selectorFormato);
            panel.appendChild(crearBotones(aceptar, () => cerrar('')));

            fondo.appendChild(panel);
            document.body.appendChild(fondo);
        });
    };

    const formatosDe = (formatos, subsidiariaId) => {
        return formatos
            .filter((formato) => formato.subsidiariaId === subsidiariaId)
            .map((formato) => ({ valor: formato.id, texto: formato.nombre }));
    };

    const crearFondo = () => {
        const fondo = document.createElement('div');

        fondo.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;'
                            + 'background:rgba(0,0,0,0.45);z-index:100000;'
                            + 'display:flex;align-items:center;justify-content:center;';

        return fondo;
    };

    const crearPanel = () => {
        const panel = document.createElement('div');

        panel.style.cssText = 'background:#fff;padding:24px 28px;border-radius:6px;min-width:340px;'
                            + 'font-family:Arial,sans-serif;font-size:13px;'
                            + 'box-shadow:0 4px 20px rgba(0,0,0,0.3);';

        return panel;
    };

    const crearTitulo = () => {
        const titulo = document.createElement('div');

        titulo.textContent  = CONSTANTES.SELECTOR.TITULO;
        titulo.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:18px;color:#333;';

        return titulo;
    };

    const crearEtiqueta = (texto) => {
        const etiqueta = document.createElement('div');

        etiqueta.textContent  = texto;
        etiqueta.style.cssText = 'margin-bottom:4px;color:#666;';

        return etiqueta;
    };

    const crearSelector = (opciones) => {
        const selector = document.createElement('select');

        selector.style.cssText = 'width:100%;padding:6px;margin-bottom:16px;font-size:13px;';

        llenarSelector(selector, opciones);

        return selector;
    };

    const llenarSelector = (selector, opciones) => {
        selector.innerHTML = '';

        opciones.forEach((opcion) => {
            const item = document.createElement('option');

            item.value       = opcion.valor;
            item.textContent = opcion.texto;

            selector.appendChild(item);
        });
    };

    const crearBotones = (alAceptar, alCancelar) => {
        const contenedor = document.createElement('div');

        contenedor.style.cssText = 'text-align:right;margin-top:8px;';
        contenedor.appendChild(crearBoton(CONSTANTES.SELECTOR.CANCELAR, '#eee', '#333', alCancelar));
        contenedor.appendChild(crearBoton(CONSTANTES.SELECTOR.ACEPTAR, '#1a73e8', '#fff', alAceptar));

        return contenedor;
    };

    const crearBoton = (texto, fondo, color, alHacerClic) => {
        const boton = document.createElement('button');

        boton.textContent = texto;
        boton.style.cssText = 'margin-left:8px;padding:7px 18px;border:none;border-radius:4px;'
                            + 'cursor:pointer;font-size:13px;background:' + fondo + ';color:' + color + ';';
        boton.onclick = alHacerClic;

        return boton;
    };

    return { elegir: elegir };
});
