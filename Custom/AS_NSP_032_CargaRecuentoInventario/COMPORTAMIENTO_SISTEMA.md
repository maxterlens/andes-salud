# Comportamiento del Sistema — Carga de Recuento de Inventario

<!-- ficha
version: 0.1
fecha: 15/10/2026
-->

## Cómo funciona

Se entra por `Transacciones > Inventario > Cargar recuento de inventario`. Contabilidad llena la cabecera del recuento (subsidiaria, ubicación, fecha, cuenta) y sube un archivo con la ubicación, el artículo y el UPC de cada producto. Con `Cargar`, el sistema revisa cada fila y muestra la lista de artículos o los errores. Con `Generar`, crea el Recuento de inventario, lo deja `Iniciado` y lo abre. Farmacia cuenta y lo completa; Contabilidad lo aprueba o lo rechaza.

| Estado | Qué significa | Qué se puede hacer |
|---|---|---|
| `Iniciado` | El recuento se creó con los artículos del archivo y está listo para contar | Ingresar las cantidades contadas y presionar `Completar recuento` (todos los roles) |
| `Aprobación completada/pendiente` | El conteo terminó y espera la revisión de Contabilidad | `Aprobar` o `Rechazar`: solo Supervisor Contable CASPM y Administrador |
| `Aprobado` | Contabilidad aceptó el conteo | Consultar |

## Actores

| ID | Actor | Qué hace |
|---|---|---|
| ACT-01 | Supervisor Contable CASPM | Carga el archivo, genera el recuento y lo aprueba o rechaza |
| ACT-02 | Auxiliar de Farmacia CASPM | Cuenta los artículos y completa el recuento |
| ACT-03 | Administrador | Configura las cuentas de ajuste; puede hacer también lo de Contabilidad |

## Glosario

| Palabra | Qué significa |
|---|---|
| Recuento de inventario | El registro de NetSuite donde se anota cuánto hay físicamente de cada artículo en una ubicación |
| CSV | Archivo de texto con columnas separadas por punto y coma o por coma; se puede guardar desde Excel |
| UPC | El código de barras del artículo |
| Cuenta de ajuste | La cuenta contable contra la que NetSuite registra las diferencias del recuento |
| SCM Mobile | La app móvil de NetSuite para el almacén, donde Farmacia cuenta el recuento |
| Recuento abierto | Un recuento de la misma ubicación que todavía no se aprobó; NetSuite no deja repetir sus artículos en otro |

## Cómo leer los diagramas

- La figura de persona es el rol y cada óvalo es algo que se hace en el sistema.
- La línea continua une al rol con lo que hace; la flecha punteada «include» marca un paso que siempre ocurre dentro de otro, y «extend», algo opcional.
- Debajo de cada diagrama, la tabla dice lo mismo con palabras: "Usa" es lo que el rol inicia, "Incluido en" es un paso que siempre ocurre dentro de ese caso, y "Extiende" es algo opcional.

## Procesos

### Proceso 1 — Carga y generación del recuento

Flujo: el Supervisor Contable llena la cabecera, elige la subsidiaria y el sistema le muestra solo sus ubicaciones y cuentas. Sube el archivo y presiona `Cargar`: el sistema revisa cada fila y muestra los artículos válidos o los errores. Sin errores, presiona `Generar`: el sistema crea el recuento, lo deja `Iniciado` y lo abre. Si NetSuite lo rechaza, se muestra una alerta y no se crea nada.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-01 | Cargar archivo del recuento | Usa: ACT-01, ACT-03 | Revisa el archivo y muestra la lista de artículos válidos; no crea nada todavía |
| CU-02 | Llenar cabecera del recuento | Incluido en: CU-01 | Subsidiaria, ubicación, fecha y cuenta obligatorias; departamento, clase y nota opcionales |
| CU-03 | Filtrar ubicaciones y cuentas por subsidiaria | Incluido en: CU-01 | Al elegir la subsidiaria, `Ubicacion` y `Cuenta` muestran solo las suyas |
| CU-04 | Revisar filas del archivo | Incluido en: CU-01 | Comprueba que el artículo exista, que el UPC sea el suyo y que la ubicación sea la elegida |
| CU-05 | Mostrar errores del archivo | Extiende: CU-01 | Si alguna fila falla, lista los errores por fila y no muestra `Generar` |
| CU-06 | Generar recuento | Usa: ACT-01, ACT-03 | Crea el recuento con la cabecera y los artículos listados; queda `Iniciado` y se abre |
| CU-07 | Bloquear doble clic en Generar | Incluido en: CU-06 | Deshabilita el botón y muestra el aviso `Generando recuento` |
| CU-08 | Iniciar el recuento | Incluido en: CU-06 | El sistema pasa el recuento a `Iniciado` sin que el usuario lo pida |
| CU-09 | Pedir cargar de nuevo si cambió la ubicación | Extiende: CU-06 | Si la ubicación cambió después de `Cargar`, no genera y pide volver a cargar |
| CU-10 | Mostrar alerta de NetSuite | Extiende: CU-06 | Si NetSuite rechaza el recuento (por ejemplo, un artículo en otro recuento abierto), muestra la alerta `No se pudo generar el recuento` con su mensaje; no se crea nada |

### Proceso 2 — Conteo y cierre del recuento

Flujo: Farmacia abre el recuento `Iniciado` (en NetSuite o en `SCM Mobile`), ingresa las cantidades contadas y presiona `Completar recuento`; el recuento pasa a `Aprobación completada/pendiente`. En ese estado el sistema oculta `Aprobar` y `Rechazar` a todos menos a Contabilidad y al Administrador. Contabilidad lo aprueba o lo rechaza.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-11 | Completar recuento | Usa: ACT-02, ACT-01 | Ingresa las cantidades contadas y completa; queda en `Aprobación completada/pendiente` |
| CU-18 | Contar desde SCM Mobile | Extiende: CU-11 | Farmacia elige el almacén y cuenta en `Tareas de recuento cíclico`; solo funciona si el empleado es de la subsidiaria del rol y la bodega usa gestión de almacenes |
| CU-12 | Abrir recuento pendiente de aprobación | Usa: ACT-02 | Farmacia ve o edita el recuento sin los botones `Aprobar` y `Rechazar` |
| CU-13 | Ocultar Aprobar y Rechazar | Incluido en: CU-12 | El sistema esconde los dos botones a todo rol que no sea Supervisor Contable o Administrador |
| CU-14 | Aprobar recuento | Usa: ACT-01, ACT-03 | Acepta el conteo; queda `Aprobado` |
| CU-15 | Rechazar recuento | Usa: ACT-01, ACT-03 | Devuelve el conteo sin aprobarlo |

### Proceso 3 — Configuración de cuentas de ajuste

Flujo: el Administrador registra en `AS Recuento Inventario Cuenta` qué cuentas se pueden usar en cada subsidiaria. Desde ese momento aparecen en el campo `Cuenta` de la pantalla de carga; al marcarlas como Inactivas dejan de aparecer.

| ID | Caso de uso | Relación | Qué hace |
|---|---|---|---|
| CU-16 | Configurar cuenta de ajuste | Usa: ACT-03 | Agrega una fila con `Subsidiaria` y `Cuenta Contable`; la cuenta queda disponible para esa subsidiaria |
| CU-17 | Desactivar cuenta de ajuste | Extiende: CU-16 | Al marcar la fila como Inactiva, la cuenta deja de aparecer en la pantalla |
