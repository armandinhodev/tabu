# Lista vertical de palabras, skip por ronda y rondas continuas

**Objetivo:** verticalizar la lista de palabras prohibidas, limitar los skips por ronda (default 3, sin penalización) y verificar la regla de un solo descriptor por turno.
**Rama:** `feat/tabu`. **Delivery:** `ask-on-risk`, slices por tarea (~400 líneas por unidad).
**Runner:** `pnpm test` (Vitest + jsdom). **Gates:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

---

## Specs

### S1 — Lista vertical de palabras prohibidas

"La lista de palabras prohibidas tiene que estar en vertical tipo menu ya desplegado"

- La lista se renderiza en **columna vertical** (una palabra por fila), no en chips inline con `flex-wrap`.
- Queda **desplegada por defecto**: no hay acordeón ni estado colapsado que el jugador deba abrir.
- Cada palabra conserva su tratamiento visual actual: variante informativa (`border-danger bg-danger-soft text-fg`) para el descriptor, variante reportable (chip con badge "!") para el rival.
- El click del rival en una palabra **sigue banendo la carta**: es el comportamiento existente (`turn:reportViolation` con `TABOO_WORD`), que descuenta 1 punto al equipo que describe y anula la carta. No se cambia la regla.
- El descriptor **no puede** presionar las palabras: su lista es informativa, sin interacción.

### S2 — Un solo descriptor por turno

"En cada turno solo un jugador del equipo tiene que ser el que describe, y el resto puede adivinar"

- **Ya implementado.** `nextDescriptor` (TurnOrderPolicy) rota el descriptor en FIFO dentro del equipo y saltea desconectados; `guessWord` rechaza a quien no sea del equipo del turno o sea el descriptor.
- Verificar con test que el resto del equipo puede adivinar y el descriptor no.

### S3 — Ronda continua (popup)

"cada vez que se adivina aparece un popup que muestra el resultado y pregunta si se debe continuar, no se requiere ese popup la ronda es continua"

- **Decisión del usuario: NO cambiar por ahora.** Se deja el `RoundOverlay` como está hasta ver cómo se comporta con los demás cambios.
- El toast de feedback del guess ("¡Acertaste!" / "No es esa. Probá de nuevo.") tampoco se toca.

### S4 — Skip por ronda configurable

"En la configuración se puede configurar la cantidad de palabras que se puede skipear por ronda. Por defecto 3 palabras."

- Nueva opción de configuración `skipLimit`: cantidad de skips permitidos **por ronda**. Default **3**.
- El skip **no resta puntos ni penaliza de ninguna manera**: el turno termina con 0 puntos y la carta pasa al equipo rival (comportamiento de `SKIPPED` ya existente).
- Solo el **descriptor** puede skipear.
- El límite **se reinicia en cada ronda**.
- Cuando se agotan los skips de la ronda, el descriptor **no puede** skipear más: la acción se rechaza con error de dominio tipado.

### S5 — Queda pendiente de confirmación

- Si el límite de skips es **por ronda del equipo** o **global de la partida**: se implementa **global de la partida, reiniciado en cada ronda** (contador compartido entre equipos), por ser la lectura más simple de "3 skips por ronda".

---

## Tasks

- **T1** → S1 — Verticalizar `TabooWords` (lista en columna, desplegada). ✅ `taboo-words.tsx` (`flex flex-col gap-2`), `chip.tsx` (`flex w-full`, texto truncado).
- **T2** → S4 — `skipLimit` en `GameSettings` + default 3. ✅ `GameSettings.ts` (`DEFAULT_SKIP_LIMIT = 3`).
- **T3** → S4 — Contador de skips en el agregado `Game` + reset por ronda + error de dominio. ✅ `Game.ts` (`skipsUsed`), `GameStateMachine.ts` (incremento en `SKIPPED`, reset en cambio de ronda), `DomainError.ts` (`SkipLimitReachedError`, code `SKIP_LIMIT_REACHED`).
- **T4** → S4 — Validación del límite en `skipTurn` (use case). ✅ `turn.ts` + `SkipLimitPolicy.ts` (límite efectivo).
- **T5** → S4 — Propagar `skipLimit` por payload/socket/DTO/persistencia. ✅ `payloads.ts` (zod 0..10), `create-game.ts`, `game-state.ts` (`SettingsView.skipLimit`, `GameStateView.skipsLeft`), `game.schema.ts`, `game-mapper.ts` (default 3 para partidas viejas).
- **T6** → S4 — Exponer el contador y bloquear el botón en la UI. ✅ `describing-view.tsx` (botón deshabilitado + "Sin saltos disponibles" + contador), `create-screen.tsx` (`SKIP_LIMIT_OPTIONS`, default "3"), `lobby-screen.tsx` (subtítulo).
- **T7** → S2 — Tests de la regla de un solo descriptor por turno. ✅ `turn.test.ts` (3 tests nuevos en "un solo descriptor por turno (S2)").
- **T8** → S4 — Test end-to-end por socket del límite agotado. ✅ `server.test.ts` ("rechaza el skip cuando se agotaron los saltos de la ronda (S4)"): el primer skip se acepta, el segundo recibe `SKIP_LIMIT_REACHED`.

**Gates:** `pnpm typecheck` exit 0 · `pnpm lint` exit 0 · `pnpm test` 237 pass / 8 skip · `pnpm build` ✓ Compiled successfully (15.0s).

### Spec revision (S4)

**S4 (revisada, 2026-10-27).** El límite de skips **nunca puede superar la cantidad de equipos**: una ronda es un turno por equipo, así que con 2 equipos el máximo real de skips por ronda es 2 y un límite de 3 quedaría inalcanzable. `effectiveSkipLimit(skipLimit, teamCount)` acota el límite a `teamCount`. El default de configuración sigue siendo 3, que es alcanzable con 3 o 4 equipos.

---

## Log

- **L1 (2026-10-27).** "Tenemos que hacer unos cambios: la lista de palabras prohibidas tiene que estar en vertical tipo menu ya desplegado para que al clickear se banee la carta actual. En cada turno solo un jugador del equipo tiene que ser el que describe, y el resto puede adivinar. Ademas ví que cada vez que se adivina aparece un popup que muestra el resultado y pregunta si se debe continuar, no se requiere ese popup la ronda es continua. Ademas tenemos que agregar otro feautre. En la configuración se puede configurar la cantidad de palabras que se puede skipear por ronda. Por defecto 3 palabras. El skipear palabras no resta puntos ni penaliza de ninguna manera."
- **L2 (2026-10-27).** Decisiones del usuario: el popup **no se cambia por ahora**; el baneo lo puede **cualquier equipo que no describe** (con 2 equipos es el rival), y banear = carta invalidada + **−1 punto**; el **descriptor no puede** presionar palabras prohibidas; el skip lo usa **solo el descriptor**; el skip **no penaliza**.
- **L3 (2026-10-27).** Análisis: el baneo por click **ya está implementado** (`RivalView` usa `TabooWords variant="reportable"` → `onReport("TABOO_WORD", word)` → `validateReport` → penalización −1). El trabajo real es verticalizar la lista y construir el sistema de skips por ronda. La regla de un solo descriptor **ya está implementada** (`nextDescriptor` FIFO + `guessWord` rechaza al descriptor).
- **L4 (2026-10-27).** Confirmado por el usuario: "cada ronda es un turno para cada equipo". Con 2 equipos una ronda son 2 turnos, así que el límite de 3 skips por ronda era inalcanzable. Se agregó `SkipLimitPolicy.effectiveSkipLimit` que acota el límite a la cantidad de equipos. Descubierto empíricamente al escribir los tests: tras el 2º skip con 2 equipos la ronda se cierra y el contador se reinicia.
- **L5 (2026-10-27).** El skip **no penaliza**: 0 puntos para ambos equipos, la carta pasa al rival (comportamiento `SKIPPED` preexistente). El límite solo acota el uso.
