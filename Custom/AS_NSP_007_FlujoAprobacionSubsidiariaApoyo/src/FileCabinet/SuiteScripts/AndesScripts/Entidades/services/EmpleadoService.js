/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Servicio de lógica de negocio para el record Empleado.
 * Orquesta los cambios sobre el nivel de aprobación asignado.
 */
define([
    '../../CustomRecord/repositories/ASNivelesAprobacionOCRepository',
    'N/log'
], (ASNivelesAprobacionOCRepository, log) => {

    /**
     * Actualiza el registro customrecord_as_niveles_aprobacion en función del
     * cambio de nivel de aprobación de un empleado.
     *
     * Casos:
     *   - vacío  → valor : agrega empleado en el nuevo nivel
     *   - valor  → vacío : remueve empleado del nivel anterior
     *   - valor1 → valor2: remueve del nivel anterior, agrega en el nuevo
     *
     * @param {number|string} empleadoId   - Internal ID del empleado
     * @param {number|string|null} nivelAnterior - Valor previo del campo (null o '' si estaba vacío)
     * @param {number|string|null} nivelNuevo    - Valor nuevo del campo (null o '' si quedó vacío)
     */
    const actualizarNivelAprobacion = (empleadoId, nivelAnterior, nivelNuevo) => {
        const anteriorValido = nivelAnterior != null && nivelAnterior != '';
        const nuevoValido = nivelNuevo != null && nivelNuevo != '';

        log.error({
            title: 'EmpleadoService.actualizarNivelAprobacion',
            details: `empleadoId=${empleadoId} | nivelAnterior=${nivelAnterior} | nivelNuevo=${nivelNuevo}`
        });

        if (!anteriorValido && nuevoValido) {
            // Caso 1: campo vacío → valor seleccionado
            ASNivelesAprobacionOCRepository.addAprobador(nivelNuevo, empleadoId);

        } else if (anteriorValido && !nuevoValido) {
            // Caso 2: valor seleccionado → campo vacío
            ASNivelesAprobacionOCRepository.removeAprobador(nivelAnterior, empleadoId);

        } else if (anteriorValido && nuevoValido && nivelAnterior != nivelNuevo) {
            // Caso 3: cambio de un nivel a otro
            ASNivelesAprobacionOCRepository.removeAprobador(nivelAnterior, empleadoId);
            ASNivelesAprobacionOCRepository.addAprobador(nivelNuevo, empleadoId);
        }
    };

    return { actualizarNivelAprobacion };
});
