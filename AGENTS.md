# Flujo de desarrollo

## Elegir la metodología

Para cada tarea nueva, elegí la primera regla aplicable y anunciá `Flujo: <nombre> — <motivo>` antes de editar. Si cambia el alcance, reclasificá.

1. **Consulta o análisis:** respondé sin modificar archivos.
2. **Alto impacto → SDD:** contratos públicos, compatibilidad, migraciones o datos persistentes, permisos sensibles o cambios difíciles de revertir. Cargá `flujo-sdd`. Prepará la especificación y esperá aprobación humana explícita antes de editar código, pruebas o configuración. Si hay dudas razonables sobre el impacto, no edites hasta aclararlas.
3. **Bug reproducible o comportamiento acotado → TDD:** cargá `flujo-tdd` y verificá una prueba que falle por la razón esperada antes de corregir o implementar.
4. **Otro cambio → ODD ligero:** cargá `flujo-odd`; explorá, fijá criterios y avanzá en partes verificables.

Los comandos explícitos eligen el flujo, pero no anulan el requisito de aprobación para alto impacto. TDD también puede usarse dentro de ODD y después de aprobar una especificación SDD. Al invocar `revisor` o `review-ui`, aplicá su contrato de revisión sin reclasificar ni implementar el ticket. Si una skill no está disponible, informalo y aplicá estas reglas sin bajar los controles.

## Reglas comunes

- Preservá cambios existentes y limitá el diff al pedido. Explorá con Plan o Explore cuando haga falta; Build implementa.
- Usá los checks documentados por el repo; no inventes comandos. Reportá cada check como pasó, falló o no se ejecutó, con el motivo si falta evidencia.
- Antes de cerrar cualquier cambio, evaluá su impacto en la documentación. Si cambia el uso, la configuración, un contrato público o la operación del proyecto, cargá `documentacion` y actualizá las guías, referencias o ejemplos afectados en el mismo cambio. Si la skill no está disponible, aplicá igual esta regla. Respetá la aprobación previa de SDD.
- En el cierre, incluí `Documentación:` con las rutas actualizadas o `No aplica` y un motivo concreto. Si una actualización necesaria queda bloqueada, indicá qué falta; no la marques como completa.
- Para cambios relevantes, delegá el diff final a `revisor` con criterios, resultados y el estado de la documentación. Esperá su informe y, si hay correcciones, repetí checks y revisión sobre el diff nuevo.
- No hagas commit, push, merge, deploy ni operaciones destructivas sin autorización. La aprobación del plan no autoriza esas acciones. Un dictamen del agente no sustituye CI ni aprobación humana.

## Revisión de interfaz web

- Si el cambio afecta una pantalla o interacción, Build delega a `review-ui` después de implementar. Pasale la URL local de la app en ejecución, el alcance, los criterios y los datos de prueba pertinentes. Esperá el informe y repetí la revisión afectada después de corregir hallazgos. `revisor` sigue revisando el diff por separado.
- En el cierre, indicá `UI: Verificada` con evidencia y alcance, `UI: Con hallazgos` o `UI: No verificada` con el motivo. Si falta Playwright MCP o la app no está disponible, no des por aprobada la interfaz. En cambios sin impacto en UI no invoques al subagente.

## Tabú: contexto y restricciones

- Stack: Next.js 15, React 19, TypeScript estricto, Socket.IO y MongoDB. Usá pnpm (packageManager en package.json), no generes otro lockfile.
- Respetá las capas: domain no depende de infraestructura ni del reloj real; UI no importa application ni módulos de Node/Mongoose. El servidor es autoridad de puntaje, tiempo y permisos.
- No filtres la palabra objetivo a quienes adivinan, tampoco al reconectar. Cambios a eventos Socket.IO, autorización, persistencia o reglas públicas requieren SDD.
- Consultá README.md para operación y contratos, REGLAS.md para reglas de la mesa y odd/tasks/ para decisiones y tareas existentes. Preservá ese historial; no lo reemplaces por memoria del agente.
- No leas ni expongas .env ni credenciales. No ejecutes seed, generaciones pagas, migraciones, borrados o acciones sobre Mongo real sin permiso específico. Las pruebas del proveedor usan mocks.

## Comandos y gates del proyecto

- Instalación: pnpm install --frozen-lockfile (solo si hace falta; no cambiar dependencias por esta adopción).
- Checks: pnpm lint, pnpm typecheck, pnpm test y pnpm build. Para cambios de código, ejecutá los cuatro antes del cierre; reportá errores y warnings, no los ocultes.
- Cobertura del dominio: pnpm test:coverage (umbral configurado en vitest.config.ts). Formato: pnpm format:check; evitá pnpm format sobre todo el repo para no introducir cambios ajenos.
- Las pruebas de Mongo requieren MONGODB_URI_TEST y pueden omitirse sin ella: informar los skips; no apuntarlas a producción ni usar .env como sustituto.
- Desarrollo: pnpm dev usa server.ts; no usar next dev/next start como reemplazo, porque se perdería el servidor propio de Socket.IO.
- No ejecutar build mientras dev/start usa el mismo .next. Detener solo procesos propios y con autorización cuando corresponda; preferir un checkout aislado para verificar build. pnpm clean borra .next: no ejecutarlo por rutina ni con un servidor activo.
- Esta adopción no instala CI ni modifica protección remota. Los comandos locales no equivalen a gates obligatorios del proveedor Git.

## Rama y continuidad

- Antes de editar: git status --short --branch y git branch --show-current. Para cambios sustantivos, trabajar en una rama corta de tarea, no directamente en main. Preservar cambios ajenos; detenerse ante conflictos o rama inesperada.
- main es la base prevista de integración; verificar la base remota antes de publicar. Una rama local no obliga a abrir un PR. Commit, push, merge y deploy requieren autorización separada.
- Al pausar una tarea, crear o actualizar su ficha en odd/tasks/ con objetivo, criterios, rama/commit observado, archivos relevantes, checks y resultados, pendientes y siguiente acción. No guardar secretos ni transcripciones. No modificar fichas de otras tareas.
