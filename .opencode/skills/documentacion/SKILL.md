---
name: documentacion
description: Actualiza y verifica la documentación si un cambio afecta el uso, la configuración, una API pública o la operación del proyecto.
---

# Documentación de cambios

1. **Detectá el impacto.** Compará el diff y los criterios de aceptación con lo que necesita saber un usuario, integrador u operador. No edites por rutina si el comportamiento visible no cambió.
2. **Actualizá la fuente que corresponde.** Seguí las convenciones del repo. Ajustá README o guías para uso e instalación, referencia y ejemplos para APIs públicas, y el runbook para pasos operativos. Si cambia configuración, mantené alineados nombres, valores por defecto y muestras como `.env.example`, sin poner secretos. Si se rompe compatibilidad, documentá cómo migrar; agregá una nota de release si el repo la mantiene.
3. **Verificá lo escrito.** Contrastá comandos, opciones, campos, defaults y ejemplos con el código final. Corré los checks de docs que el repo ya tenga y reportá lo que no pudiste ejecutar. No afirmes que un ejemplo funciona si no lo comprobaste.
4. **Cerrá con evidencia.** En `Documentación:`, listá las rutas actualizadas, indicá `No aplica` con motivo o explicá qué actualización quedó bloqueada. Incluí las docs en el mismo diff y PR que el cambio; la skill no autoriza publicar ni saltear aprobaciones.
