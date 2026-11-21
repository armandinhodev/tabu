---
name: flujo-tdd
description: Comprueba un comportamiento con una prueba que falle primero.
---

# Flujo TDD

1. Elegí un caso observable que capture el comportamiento esperado, no la implementación interna.
2. Escribí y corré la prueba de regresión antes de tocar código de producción. Confirmá que falla por el motivo esperado; un error de setup no cuenta. Si no podés obtener ese fallo, reportalo y no edites código de producción como si estuviera verificado.
3. Implementá el cambio mínimo, corré la misma prueba y luego los checks pertinentes del repo. Refactorizá solo después del verde y repetí los checks si cambiás algo.
4. Informá el escenario, los comandos ejecutados, el resultado inicial y final, y qué no pudiste verificar.
