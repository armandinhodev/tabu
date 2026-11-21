---
name: flujo-sdd
description: Especifica un cambio de alto impacto antes de implementar.
---

# Flujo SDD

1. Definí alcance, no objetivos, contratos y comportamiento esperado con ejemplos comprobables.
2. Identificá consumidores afectados, casos límite y riesgos. Incluí compatibilidad, estrategia de despliegue o migración y reversión cuando apliquen. Marcá explícitamente las decisiones pendientes.
3. Entregá la propuesta en el chat y esperá aprobación explícita antes de editar. Si cambia el alcance aprobado, volvé a pedir aprobación.
4. En Build, implementá en etapas contra los criterios aprobados, verificá el diff final y solicitá revisión independiente. Nunca ejecutes un despliegue ni una migración real como parte de este flujo sin autorización explícita.
