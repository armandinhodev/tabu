# Workflow de OpenCode en Tabú

Abrí una sesión nueva desde `E:/Projects/tabu`. `AGENTS.md` define las reglas del proyecto; `.opencode/` contiene los agentes `revisor` y `review-ui`, los comandos `/odd`, `/sdd`, `/tdd` y cuatro skills de procedimiento.

## Uso

- Pedidos en lenguaje natural: el agente anuncia lectura, ODD, TDD o SDD antes de editar.
- `/odd <tarea>` prepara el plan; el usuario pasa a Build para implementar.
- `/tdd <comportamiento>` exige fallo reproducible antes de corregir.
- `/sdd <cambio de alto impacto>` propone una especificación y espera aprobación antes de tocar código, pruebas o configuración.
- Cambios relevantes: Build entrega el diff exacto y resultados al `revisor`. Cambios de interfaz: también delega a `review-ui`, con app local iniciada, criterios y datos de prueba. Sin navegador disponible se informa UI no verificada.

## Verificación y cierre

Usar los scripts de package.json: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; cobertura y formato según el alcance. No ejecutar build contra el .next de un servidor activo. Las pruebas Mongo omitidas no cuentan como aprobadas.

Cierre mínimo: alcance, checks con pasó/falló/no ejecutado y motivo, hallazgos pendientes, `Documentación:` y estado UI cuando corresponda. Guardar handoff de tareas pausadas en `odd/tasks/`.

La configuración no instala CI ni cambia protecciones de main, proveedores, credenciales o MCP globales. Las instrucciones no son un sandbox ni sustituyen controles de CI. No hacer commit/push/deploy sin autorización.

## Piloto pendiente

La detección de archivos no demuestra comportamiento del modelo. Antes de considerar validado el circuito completo, probar un bug con TDD y revisión, un cambio de UI con delegación desde Build y un pedido SDD que se detenga antes de editar. Ejecutar esos pilotos sobre tareas acordadas, sin inventar un cambio funcional solo para ejercitar el flujo.
