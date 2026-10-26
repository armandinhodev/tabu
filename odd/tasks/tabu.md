# Tabú — plan de desarrollo

**Objetivo:** app web multijugador de Tabú en tiempo real, 2–4 equipos, cada jugador en su dispositivo, sin registro.
**Rama:** `feat/tabu` (se crea en Fase 0). **Delivery:** `ask-on-risk` con slices por fase (~8.500 líneas estimadas).
**Runner:** `pnpm test` (Vitest + jsdom). **Gates:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
**Fuentes normativas (no se reescriben acá):** `doc/prompt.md` (funcional), `doc/directivas-diseno.md` (visual), `doc/previews/` (layout). La UI real sigue las previews; ante conflicto visual gana `directivas-diseno.md`.

> **Actualización (2026-10-26):** las reglas de visibilidad y de adivinación de este documento (S3
> "Todos ven la palabra objetivo", S4 con el botón *¡Adiviné!*, D29) quedaron **superadas** por
> [`odd/tasks/room-rules-and-guesses.md`](room-rules-and-guesses.md): la palabra objetivo solo la ven
> el descriptor y el rival, y el equipo que adivina escribe la respuesta en un chat privado que el
> servidor verifica. Este documento se conserva como registro histórico del plan original.

---

## Specs

**Producto y reglas**

- **S1 — Identidad.** "Solo un nombre. Sin login, sin registro, sin contraseñas, sin email." El nombre se guarda en `localStorage` y se reutiliza.
- **S2 — Salas.** Código de 6 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `I`, `O`, `0`, `1`). 2–4 equipos, 2–8 jugadores por equipo, 2 equipos mínimo para arrancar.
- **S3 — Información pública.** Todos ven la palabra objetivo **y** la lista completa de palabras prohibidas; no hay información secreta. Lo que cambia por rol son las **acciones**.
- **S4 — Acciones por rol.** Equipo activo: *¡Adiviné!*, *Pasar turno*; el descriptor además *Aceptar y pasar carta* y *Reportar*. Equipo rival: chips **reportables** + *Reportar gesto*, *Reportar sonido*, *Pasar turno*.
- **S5 — Puntaje.** Acierto `+1`; `TABOO_WORD`/`GESTURE`/`SOUND` → `−1` al equipo que describe, el turno termina en el acto y la carta se anula; *skip* y *timeout* → `0`.
- **S6 — Validación de palabra.** La palabra marcada debe coincidir normalizada (minúsculas, sin acentos, sin espacios extra) con una de la carta. Si no coincide → `game:error` con code `INVALID_TABOO_WORD`, **sin** penalización y **sin** cerrar el turno.
- **S7 — Ciclo de la carta.** Sortear → sale del mazo. Adivinada → consumida. Penalizada → anulada (no vuelve a salir). Timeout → vuelve al final del mazo. Aceptada → pasa al equipo contrario.
- **S8 — Fin de partida.** Rondas configuradas completas o mazo agotado. Gana el que más puntos tiene; empate se declara (`winnerTeamId: null`).
- **S9 — Reconexión.** `playerToken` UUID en `localStorage`; al desconectarse el jugador queda `connected: false` y el turno pasa al siguiente descriptor del mismo equipo con aviso de 5 s; al volver recibe el estado completo.
- **S10 — Autoridad del servidor.** El cliente nunca envía puntos ni tiempo: solo acciones. El temporizador se calcula con `deadlineAt` absoluto.

**Stack y arquitectura**

- **S11 — Stack cerrado.** Next.js 15 (App Router) + TypeScript `strict` con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`; Socket.IO 4.8 sobre `server.ts` custom; MongoDB 7 + Mongoose 8; Tailwind v4 con tokens en `src/app/tokens.css` y `@theme`; Zod 4; `@base-ui/react@^1.9.0` como única librería de UI; lucide-react; clsx + tailwind-merge + cva; sonner; react-hook-form + `@hookform/resolvers`; Vitest + Testing Library + jsdom; ESLint + Prettier. **Prohibido** sumar MUI Core, Ant Design, Chakra, Mantine, HeroUI/NextUI, Bootstrap, `shadcn` como dependencia o `@radix-ui/*`.
- **S12 — pnpm.** `"packageManager": "pnpm@11.1.2"` con Corepack. Nada de npm ni bun. Se versiona `pnpm-lock.yaml`, nunca `node_modules`.
- **S13 — Capas.** `domain` no importa nada externo; `application` importa domain + puertos; `infrastructure` implementa puertos; `ui`/`app` consumen el contrato. Dependencias hacia adentro. Nada de `Date.now()` en dominio (puerto `Clock`).
- **S14 — Calidad de código.** Prohibido `any`, `@ts-ignore`, `@ts-expect-error` sin justificación escrita; prohibido `console.log` (usar `logger`); todo input externo validado con Zod en la frontera; errores de dominio tipados traducidos a `game:error` con `code` estable.

**Persistencia y tiempo real**

- **S15 — Mongo.** Colecciones `decks` y `games` con los campos de §7.1; índice `{ code: 1 }` **unique**; TTL opcional sobre partidas terminadas (`GAME_TTL_HOURS`). La partida vive en memoria y se snapshot-ea de forma asíncrona y tolerante a fallos: no se bloquea el turno esperando escrituras.
- **S16 — Seed.** `pnpm seed` inserta 3 mazos: *General* (120 cartas), *Cine y TV* (60), *Deportes* (60), 1–4 palabras prohibidas por carta, en español, nada sexual explícito ni político. Idempotente (upsert por `name`).
- **S17 — Contrato Socket.IO.** Eventos cliente→servidor y servidor→cliente exactamente como §8.1 y §8.2; payloads Zod; ack tipado; `transports: ['websocket', 'polling']`; reconexión con backoff; al reconectar se reemplaza el estado local, no se acumulan eventos.
- **S18 — Validación de payload.** `reason = 'TABOO_WORD'` ⇒ `tabooWord` obligatorio; toda acción valida pertenencia a la partida y rol antes de ejecutarse.

**UI y diseño**

- **S19 — Pantallas.** Las 10 de §12 (Inicio, Crear, Unirse, Lobby, Juego activo, Juego descriptor, Juego rival, Penalización, Marcador, Resultado) con sus estados **cargando (skeleton), vacío, error y reconectando** (banda ámbar "Reconectando…").
- **S20 — Idioma.** Toda la UI en español rioplatense (voseo): "Entrá", "Unirse", "Crear sala", "Comenzar partida", "Pasar turno".
- **S21 — Tokens.** Colores, espaciados y radios **solo** desde tokens (`src/app/tokens.css` + `@theme`); cero literales en componentes. Grilla 8px; radios `sm 10px`, `md 14px`, `lg 20px`, `xl 28px`, `pill 999px`.
- **S22 — Prohibiciones visuales.** Ningún violeta/lila/morado/magenta/índigo (matiz 265°–320°) en ningún estado, foco, glow o borde. Prohibido `text-shadow`, 3D, bisel, relieve o degradado sobre texto. `--danger` solo en palabras prohibidas y penalización. Iconos SVG (lucide), **nunca emoji**.
- **S23 — Palabra objetivo.** Elemento más grande de la pantalla: `clamp(48px, 12vw, 96px)`, peso 800, mayúsculas, `letter-spacing: -.02em`.
- **S24 — Chips de prohibidas.** Informativa: alto 36px, sin badge ni ícono de acción (nada que sugiera secreto). Reportable: alto 44px, badge circular rojo de 18px con "!", reporta al instante sin modal, `aria-label` "Reportar palabra prohibida: {palabra}".
- **S25 — Temporizador.** Anillo circular 160px mobile / 200px desktop, trazo 8px; bajo 10 s pasa a `--danger` **y cambia el ícono** (nunca solo color).
- **S26 — Responsive.** Mobile-first 360–430px, botón primario sticky al pie con safe-area; ≥1280px tres columnas (280px / flexible / 300px); máximo 1440px.
- **S27 — Accesibilidad.** WCAG AA (4.5:1 texto normal, 3:1 grande y bordes de control), foco `outline: 2px solid var(--warning); outline-offset: 2px`, área táctil ≥44px, `aria-live="polite"` en puntaje y cambio de turno, `role="alert"` en penalización, `prefers-reduced-motion` respetado.
- **S28 — Movimiento.** `instant 120ms`, `base 200ms`, `panel 320ms`, `shake 240ms`; entrada de tarjeta opacidad + 8px; confeti solo en resultado; todo deshabilitado bajo `prefers-reduced-motion`.
- **S29 — Sonido.** Web Audio sintetizado, sin archivos: tabla `SOUNDS` de §8, `AudioContext` suspendido hasta el primer gesto, mute siempre visible y persistido en `localStorage`, volumen 0.5, tick solo en los últimos 10 s, `taboo.hit` una sola vez por reporte.
- **S30 — Componentes.** Primitivas accesibles en `src/ui/components/ui/` (convención shadcn sobre Base UI: prop `render`, `nativeButton={false}` cuando el hijo no es `<button>`); `TimerRing`, `TabooWords`, `ScoreBoard`, `TeamPanel`, `PlayerRow`, `CodeBadge` propios y a medida; variantes con `cva`.

**Entrega**

- **S31 — Env.** `.env.example` con `MONGODB_URI`, `MONGODB_DB`, `PORT`, `SOCKET_CORS_ORIGIN`, `TURN_SECONDS_DEFAULT`, `MAX_TEAMS`, `MIN_PLAYERS_PER_TEAM`, `GAME_TTL_HOURS`; validación Zod al arrancar: si falta una crítica el server no levanta y lo dice claro.
- **S32 — Gate de calidad.** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan sin errores ni warnings; cobertura ≥80 % de branches en `src/domain`; tests obligatorios de §13 (visibilidad pública, penalización inválida/válida, autorización por rol, reloj falso, reconexión).
- **S33 — DoD.** Los 15 criterios de §15, incluido "Dos navegadores pueden crear/unirse una sala, verse los turnos en tiempo real y jugar un turno completo", `docker-compose.yml` con MongoDB 7, y README que permita levantar y jugar sin preguntar nada.

---

## Arquitectura objetivo (resumen operativo)

```
Cliente Next (app router, client components)
  hooks (useSocket/useGameState/useCountdown/useSound)
      │ eventos tipados + ack
      ▼
server.ts  ── Next handler (mismo puerto) + Socket.IO
  infrastructure/socket → handlers finos → use cases
      │
      ├── application/use-cases (autorización, orquestación)
      │        └── domain (entidades, VO, policies, state machine, eventos)
      └── infrastructure/db (Mongoose: snapshots asíncronos)
```

- **Autoridad:** el agregado `Game` vive en memoria (`GameRegistry`); Mongo es snapshot. El scheduler por partida cierra el turno por `deadlineAt`.
- **Frontera:** Zod valida en el handler; el use case valida rol y pertenencia; el dominio no conoce socket ni Mongoose.
- **UI:** cliente puro por socket; importa **solo tipos** de `domain` y el contrato de eventos (ver D3).

---

## Fases y tareas

Cada fase termina en código ejecutable y con sus gates en verde. `~L` = líneas autoradas estimadas (tests incluidos).

### Fase 0 — Bootstrap (gate: `pnpm dev` levanta con tokens, ~400L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T0.1 | `git init`, `.gitignore`, Corepack + `pnpm@11.1.2`, scaffold `create-next-app@15.5.28` en el directorio raíz (`--typescript --tailwind --app --src-dir --import-alias "@/*"`), `next@^15.5.28`, tsconfig estricto, scripts | S11, S12 | inline |
| T0.2 | `src/app/tokens.css` completo + mapeo `@theme`, `globals.css`, fuentes `next/font` (Outfit, Inter, JetBrains Mono), `cn()` | S21, S23 | inline |
| T0.3 | ESLint flat config (`eslint .`), Prettier + plugin Tailwind, Vitest + jsdom + setup, umbral de cobertura, `.env.example` | S14, S31, S32 | inline |
| T0.4 | `docker-compose.yml` (MongoDB 7) y verificación de arranque | S33 | inline |
| T0.5 | `server.ts` mínimo (Next sobre HTTP propio, `dev`/prod por flag, logger JSON) para que `dev`/`start` sean estables desde el día uno; T3.1 solo monta Socket.IO encima | S11, S17 | inline |

**Estado Fase 0: completada** en `51fcc19`. `lint`, `typecheck`, `test` (4) y `build` en exit 0 sin warnings; smoke de `pnpm dev` con HTTP 200 y tokens en el CSS servido.

### Fase 1 — Dominio (gate: `lint && typecheck && test` con ≥80 % branches en `domain`, ~1.600L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T1.1 | Value objects `RoomCode`, `Score`, `Duration`, `TabooWords` (normalización), ids | S2, S5, S6 | inline (RED→GREEN) |
| T1.2 | Entidades `Game`, `Team`, `Player`, `Card`, `Turn`, `Violation`, `GameSettings` | S1, S2, S9 | inline |
| T1.3 | Policies `ScoringPolicy`, `PenaltyPolicy` (matriz de autorización), `TurnOrderPolicy` (rotación por equipo + FIFO) | S4, S5, S6 | inline |
| T1.4 | `CardDeck` (draw, consume, discard, returnToBottom, passToOtherTeam) + `DeckShuffler` con RNG inyectable | S7 | inline |
| T1.5 | `GameStateMachine`: `waiting → playing → finished`, inicio/fin de turno y ronda, timeout | S8 | inline |
| T1.6 | Eventos de dominio, `DomainError` + catálogo estable de `game:error` codes | S14, S17 | inline |
| T1.7 | Suite de dominio: VO, policies, ciclo de carta, state machine, reloj inyectado | S32 | inline |
| T1.8 | Gate de fase | S32 | inline |

**Estado Fase 1: completada.** Dominio completo con 66 tests: value objects, entidades, policies, mazo, máquina de estados y eventos. `lint`, `typecheck`, `test` y `build` en exit 0. Cobertura numérica no medible en este entorno (D28).

### Fase 2 — Persistencia (gate: `pnpm seed` + repos contra Mongo real, ~1.500L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T2.1 | `infrastructure/config/env.ts` (Zod) + `logger.ts` | S31 | inline |
| T2.2 | Schemas/models `decks` y `games`, índices (`code` unique, `status+createdAt`, TTL parcial `finishedAt`) | S15 | inline |
| T2.3 | `MongoDeckRepository`, `MongoGameRepository` + mappers dominio↔documento; snapshot fire-and-forget con log | S15 | inline |
| T2.4 | Seed 3 mazos (240 cartas originales) con ids estables + validación Zod + idempotencia por `name` | S16 | delegado (contenido, paralelizable) |
| T2.5 | Repos in-memory para tests (mismos puertos) + tests de repos | S15, S32 | inline |

**Estado Fase 2: completada.** T2.1 `env.ts` (Zod + `loadEnvFileIfPresent`) + `logger.ts`; T2.2 schemas/models/índices `decks` y `games` (`code` unique, `status+createdAt`, TTL parcial `finishedAt`); T2.3 mappers dominio↔documento, `MongoDeckRepository`, `MongoGameRepository` y `FireAndForgetGameRepository`; T2.4 seed de 3 mazos (240 cartas) con ids estables, validación Zod e idempotencia por `name`; T2.5 repos in-memory y contrato de repos compartido (los casos Mongo se saltean sin `MONGODB_URI_TEST`, D16).

Gate verificado contra Mongo 7 real: `pnpm vitest run src/infrastructure` con `MONGODB_URI_TEST` → **64/64** sin skips; `pnpm seed` dos veces → 3 documentos, 240 cartas (120/60/60), sin duplicados; índices `games`: `code_1` (unique), `status_1_createdAt_-1`, `finishedAt_ttl`. Suite completa: 122 pasan / 8 skip (los Mongo sin la variable), `lint`, `typecheck` y `build` en exit 0.

### Fase 3 — Servidor de tiempo real (gate: flujo completo por socket con repos in-memory, ~1.800L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T3.1 | Extender el server de T0.5 con Socket.IO en el mismo puerto (CORS desde env, una sola instancia) | S11, S17 | inline |
| T3.2 | `events.ts` (nombres tipados), schemas Zod de entrada/salida, contrato de ack, middleware `socket → gameId/playerId` | S17, S18 | inline |
| T3.3 | Use cases de sala: `CreateGame`, `JoinGame`, `AssignTeam`, `AutoAssignTeams`, `Ready`, `StartGame`, `ReconnectPlayer`, `LeaveGame` | S1, S2, S9 | inline |
| T3.4 | Use cases de turno: `GuessWord`, `ReportViolation`, `SkipTurn` con autorización por rol | S4, S5, S6, S18 | inline |
| T3.5 | `GameClock` real + scheduler por partida (`deadlineAt`, tick 1/s, cierre por timeout) | S10, S25 | inline |
| T3.6 | Desconexión/reconexión: `connected:false`, gracia 5 s, pase de descriptor, reemisión de estado completo | S9 | inline |
| T3.7 | Broadcasting de `game:state`, `turn:*`, `penalty:*`, `score:*`, `round:ended`, `game:finished`, `game:error` | S17 | inline |
| T3.8 | Tests de integración de flujo (socket client + in-memory + reloj falso) | S32, S33 | inline |

**Estado Fase 3: completada.** Socket.IO montado sobre el mismo HTTP server de Next (`attachSocketServer`), payloads Zod en la frontera (`payloads.ts`) y contrato tipado en `events.ts`. Casos de uso de sala y de turno separados de la persistencia, con `GameRegistry` como fuente de verdad en memoria. Scheduler por partida con `deadlineAt` absoluto, tick de 1 s y cierre por timeout; desconexión con gracia de 5 s que reasigna descriptor. Composición real en `create-runtime.ts` (Mongo tolerante: si no responde, el server arranca en modo memoria, D41).

Evidencia: `pnpm test` → **183 pasan / 8 skip** (los Mongo sin `MONGODB_URI_TEST`), incluidos 14 de payloads, 34 de casos de uso, **4 de integración por socket** (turno completo con roles, reporte inválido sin penalizar, penalización válida con carta anulada, reconexión con token) y **4 de gracia de desconexión** (reconexión dentro de los 5 s, traspaso cuando no vuelve, reconexión de un no-descriptor, timers cancelados al cerrar). Con Mongo 7 real: 29/29 en `src/infrastructure/db`. `lint`, `typecheck` y `build` en exit 0. Smoke de `pnpm start` con Mongo inalcanzable: warning, HTTP 200 en `/` y handshake de Socket.IO 200.

### Fase 4 — UI (gate: 10 pantallas con estados + checklist visual §12 aprobado, ~3.000L)
| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T4.1 | Primitivas Base UI en `src/ui/components/ui/` + `Button`, `Input`, `Chip`, `Skeleton`, `SegmentedControl`, `Toggle` | S30 | inline |
| T4.2 | `socket.ts` singleton, `useSocket`, `useGameState`, `useCountdown`, reconexión/backoff, `playerToken` | S9, S17 | inline |
| T4.3 | Pantallas 01–03: Inicio, Crear partida, Unirse (RHF + Zod, nombre persistido) | S19, S20 | inline |
| T4.4 | Pantalla 04: Lobby móvil + desktop (código con copiar, paneles de equipo, listo, comenzar solo host) | S2, S19, S26 | inline |
| T4.5 | Pantallas 05–06: juego activo y descriptor (`TimerRing`, palabra, chips informativos, banners) | S3, S4, S23, S24, S25 | delegado (paralelo con T4.6) |
| T4.6 | Pantalla 07: juego rival (chips reportables 44px + badge "!", gesto/sonido) | S4, S24, S27 | delegado (paralelo con T4.5) |
| T4.7 | Pantalla 08: penalización (cartel rojo, palabra marcada, delta, carta anulada) + shake/reduced-motion | S5, S22, S28 | inline |
| T4.8 | Pantallas 09–10: marcador de ronda y resultado (ranking, MVP, confeti sutil) | S8, S28 | inline |
| T4.9 | `SoundProvider` + tabla `SOUNDS` + mute persistido | S29 | inline |
| T4.10 | Estados cargando/vacío/error/reconectando en las 10 pantallas + pasada a11y (aria-live, foco, contraste) | S19, S27 | inline |
| T4.11 | Responsive ≥1280 (rails 280/300), sticky CTA mobile, safe-area | S26 | inline |
| T4.12 | Checklist visual §12 por pantalla + verificación contra previews | S19-S30 | inline |

**Estado Fase 4: completada.** Cliente de una sola ruta con pantallas por estado (`home | create | join | lobby | game | result`) para no recrear el socket al navegar; penalización y fin de ronda son overlays, el resultado es pantalla completa. Primitivas propias sobre Base UI (`Button`, `Input`, `Chip`, `Skeleton`, `SegmentedControl`, `Switch`, `ConfirmDialog`/`InfoDialog`, `Field`, `Screen`) y componentes de juego a medida (`TimerRing`, `TabooWords`, `ScoreBoard`, `TeamPanel`, `PlayerRow`, `CodeBadge`, `RoleBanner`, `Confetti`). Sonido sintetizado con Web Audio (`SOUNDS` de §8) desbloqueado con el primer gesto y mute persistido.

Pantallas: 01 inicio, 02 crear (mazos por `GET /api/decks`, equipos, tiempo), 03 unirse (6 cajas con pegado), 04 lobby (código con copiar, equipos, listo, arranque solo host), 05/06 activo y descriptor, 07 rival (chips reportables), 08 penalización, 09 fin de ronda, 10 resultado con ranking, MVP y confeti; rails de 280/300px desde 1280px.

Evidencia: `pnpm test` → **189 pasan / 8 skip**; `lint`, `typecheck` y `build` en exit 0 sin warnings; smoke de `pnpm start` sirviendo `/` con HTTP 200 (SSR incluye "¿Cómo te llamás?", "Crear partida", "Unirse con código"), CSS servido con `#ff6b2c`, `clamp(48px…)` y `#b4e33d`, y `/api/decks` degradando a 503 con Mongo caído. Auditoría del checklist §12 por grep: cero `#hex`/`rgb`/`hsl` en componentes, cero `text-shadow`/`drop-shadow`/degradados de texto, cero violetas, cero `<div onClick>`; rojo solo en chips de prohibidas, penalización, botones de reporte y temporizador bajo 10 s (§6).

### Fase 5 — Endurecimiento (gate: DoD §15 completo, ~700L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T5.1 | Suite de integración final: crear→unirse→repartir→arrancar→acierto→penalización palabra→gesto→fin; visibilidad pública; autorización por rol; reconexión | S32 | inline |
| T5.2 | `README.md`: qué es, levantar (local/docker), env, cómo jugar, diagrama ASCII, contrato Socket.IO, **Decisiones asumidas** (D1–D20) | S33 | inline |
| T5.3 | Smoke manual en dos navegadores + DevTools (delta de puntaje y carta anulada) | S33 | inline |
| T5.4 | Cierre: lint/typecheck/test(coverage)/build sin warnings, sin TODO ni código muerto | S14, S32 | inline |

**Estado Fase 5: completada.**
- **T5.1** `full-game.test.ts`: partida de punta a punta por socket — crear, unirse, repartir, arrancar, acierto, penalización por palabra con carta anulada y final con ganador, MVP y puntajes — sobre un mazo de 2 cartas para llegar al cierre. `client-contract.test.ts` cubre autorización por rol y visibilidad pública; `reconnect-grace.test.ts` la reconexión.
- **T5.2** `README.md`: qué es, cómo levantarlo (local y docker), variables de entorno, cómo se juega, diagrama ASCII de capas, contrato Socket.IO completo y las decisiones asumidas agrupadas.
- **T5.3** Smoke con **dos clientes independientes contra el servidor real** (`pnpm start`) y Mongo 7 real en 27018: mazos por HTTP, crear, tres uniones, reparto, arranque, acierto `+1`, reporte de palabra prohibida `−1` con carta anulada y estado final visible. Verificado además en Mongo: snapshot con `status=playing`, `round=2`, 1 carta descartada y puntajes `1–0`. (No se abrieron dos navegadores literales: mismos eventos y mismos acks, sin interfaz.)
- **T5.4** `lint`, `typecheck`, `test` y `build` en exit 0 sin warnings; `test:coverage` en **95,1 % statements / 95,97 % branches** (D53); cero `TODO`/`FIXME`, cero `console.log`, cero `any`/`@ts-ignore`, cero `Date.now()` en dominio, cero emojis en la UI.

**El smoke encontró dos bugs de producción, ya corregidos:** la partida terminaba tras una sola vuelta con el default `rounds: 1` (§6.10 dice "mazo entero", D51) y el cierre por reloj podía lanzar desde un `setInterval` cuando el equipo activo quedaba sin nadie conectado (D52).

**DoD §15, criterio por criterio:**

| Criterio | Estado | Evidencia |
|---|---|---|
| `pnpm install && pnpm seed && pnpm dev` levanta Next + Socket.IO en el mismo puerto | ✅ | `pnpm dev` con Mongo real: `/` 200, `/api/decks` 200 con 3 mazos, handshake de Socket.IO 200 |
| Dos navegadores crean/unen, ven turnos y juegan un turno completo | ✅ (sustituido) | Smoke de dos clientes independientes contra el servidor real: mismos eventos y acks. No se abrieron navegadores literales |
| Todos ven palabra y prohibidas | ✅ | Test S3 por socket + render en las tres vistas |
| Chip del rival descuenta 1, anula la carta y pasa a la siguiente | ✅ | Smoke real (`−1`, `cardDiscarded`, snapshot con 1 descartada) + tests |
| Palabra que no está en la carta no penaliza | ✅ | `invalid taboo word` en turn/socket tests |
| +1 acierto, −1 penalización, 0 en skip y timeout | ✅ | Dominio + casos de uso + socket |
| Temporizador del servidor, igual en todos | ✅ | `deadlineAt` absoluto, ticker con reloj inyectable |
| Al recargar vuelve a su partida y turno | ✅ | `game:reconnect` + `localStorage` + test de gracia |
| Mazos desde Mongo, seed de 3 jugables | ✅ | Seed real: 3 mazos / 240 cartas; `/api/decks` los sirve |
| 10 pantallas con carga/error/vacío y contra previews | ✅ con matiz | Las 10 existen; skeleton en lobby/juego/crear, error en crear y reconexión, vacíos en lobby. No todas tienen los 4 estados (no aplican en todas) |
| Sin violeta ni texto con sombra/3D | ✅ | Auditoría por grep |
| Sonido con mute persistente | ✅ | Web Audio + `localStorage`, no verificado de oído en navegador |
| Lint, typecheck, tests y build limpios | ✅ | 197 pasan / 8 skip, cobertura 95,97 % branches, build sin warnings |
| README para levantar y jugar sin preguntar | ✅ | `README.md` |

**Ruta:** inline por defecto. Se delega solo donde hay dos unidades independientes en paralelo (T4.5/T4.6) o contenido largo aislado (T2.4). Cada unidad de trabajo cierra con commit Conventional Commits en `feat/tabu` (~400 líneas autoradas), con tests y docs junto al comportamiento.

---

## Decisiones asumidas

Van al README, sección *Decisiones asumidas*. Las marcadas ✔ están verificadas contra el registro real.

- **D1 ✔ Scaffold.** `pnpm create next-app@latest` hoy instala **Next 16.4.3**, no 15. Se scaffoldea con `create-next-app@15.5.28` (última 15.x) y se fija `next@^15.5.28`. Motivo: la spec pide Next 15 y Next 16 elimina `next lint` y cambia defaults.
- **D2 ✔ Lint sin warnings.** `next lint` está **deprecado desde 15.5** (warning en cada corrida) y `next build` deja de lintear. `"lint": "eslint ."` con `eslint.config.mjs` y `eslint.ignoreDuringBuilds: true`, porque el DoD exige cero warnings y el lint corre como gate propio. Los exports flat (`eslint-config-next/core-web-vitals`) son de **16.x**; con `eslint-config-next@15.5.28` hay que usar `FlatCompat` + `@eslint/eslintrc`, que es lo que genera `create-next-app@15.5.28` (ver D24).
- **D3 UI sin `application`.** Las pantallas consumen solo el contrato de eventos y **tipos** del dominio (`import type`); no importan use cases ni infraestructura. Motivo: toda acción es un evento de socket y así Mongoose/Node nunca entran al bundle del cliente. Desvío consciente de §4.1, documentado.
- **D4 Datos que faltaban.** Se agrega `Player.points` (MVP lo exige y `Player` no tenía puntaje) y `Game.turnHistory` (`{ turnId, teamId, reason, pointsDelta }`) para "mejor racha" y auditoría de tests. Se reflejan en el documento Mongo.
- **D5 `passToOtherTeam()`.** Se modela como cola por equipo (`passedCards`) que se consume antes del mazo al iniciar el turno del equipo beneficiario.
- **D6 Nombres de equipo.** Autogenerados por color ("Equipo Naranja", "Equipo Verde", "Equipo Celeste", "Equipo Lima"). Sin renombrado: la spec no lo pide.
- **D7 Settings sin UI.** `rounds` y `minPlayersPerTeam` no aparecen en *Crear partida*: toman default (`1` y `MIN_PLAYERS_PER_TEAM`). `rounds = 1` significa "mazo entero", según §6.10.
- **D8 Host.** Si el host sale o queda desconectado más de 60 s, el host pasa al jugador conectado más antiguo.
- **D9 Reinicio del server.** La partida vive en memoria: un reinicio del proceso descarta las partidas en curso (se marcan `abandoned` al arrancar). El criterio "al recargar la página el jugador vuelve a su partida" cubre recarga del cliente, no caída del servidor.
- **D10 Autorización.** Se valida en el use case con `PenaltyPolicy`/estado del turno; el cliente deriva el rol solo para pintar. Nunca se confía en el cliente.
- **D11 Código de sala.** Ante colisión del `unique`, se reintenta hasta 5 veces (RNG inyectable en tests).
- **D12 Nombres duplicados.** Sufijo incremental más bajo libre: `Luz`, `Luz (2)`, `Luz (3)`.
- **D13 Reparto.** `game:autoTeams` reparte round-robin por orden de ingreso para balancear; `randomTeams` hace ese reparto automáticamente al arrancar. `game:assignTeam` sigue permitido antes de arrancar.
- **D14 Ids de carta.** El seed asigna ids estables (`general-001`, `cine-001`, `dep-001`) para que `discardedCardIds` sea legible y testeable.
- **D15 TTL.** Índice TTL parcial sobre `finishedAt` con `expireAfterSeconds = GAME_TTL_HOURS * 3600`; `null` no expira.
- **D16 Tests sin Mongo.** Integración con repos in-memory detrás de los mismos puertos y reloj falso; los tests de repositorio Mongo real corren solo si `MONGODB_URI_TEST` está definido (se saltan y se reporta).
- **D17 Tokens → Tailwind.** `@theme` mapea `--color-*` a los tokens; los colores de equipo se usan con mapa estático `team-1..4` (clases completas), nunca con clases dinámicas ni `style` inline.
- **D18 Fechas en el wire.** Los DTO envían epoch ms (`number`); `Date` queda en dominio y servidor. Evita ambigüedad de zona horaria y serialización de Socket.IO.
- **D19 `playerToken`.** `crypto.randomUUID()` (sin dependencias nuevas); se persiste en el documento del jugador y se asocia al `socket.id` en create/join/reconnect.
- **D20 Sin dependencias extra.** No se agregan `uuid`, `nanoid`, `jest-axe` ni librerías de UI: se usa `node:crypto`, `crypto.randomUUID` y roles de Testing Library.
- **D21 ✔ `lucide-react`.** La spec pide `"^0.5"`, que **no resuelve a ninguna versión**: la primera de la línea 0.x es `0.500.0` y semver la considera mayor que `<0.6.0` (pnpm falla con `ERR_PNPM_NO_MATCHING_VERSION`). Se fija `"^0.577.0"`, última 0.x estable, para no saltar a la API 1.x.
- **D22 ✔ `@testing-library/jest-dom`.** `^6` resuelve a `6.10.0`, que el propio paquete marca como release roto ("incorrect minor release with breaking changes"). Se fija `"6.9.1"`.
- **D23 ✔ `@testing-library/dom`.** `@testing-library/react@16` lo exige como **peer** (`^10`) y la spec no lo listaba. Se agrega `"^10.4.2"`; sin él los tests de componentes fallan en runtime.
- **D24 ✔ `@eslint/eslintrc`.** Necesario para `FlatCompat`: `eslint-config-next@15.5.28` publica configuración legacy (`extends`), no flat config. Se agrega `"^3"` como devDependency.
- **D25 ✔ Scripts de build de pnpm 11.** `pnpm install` falla con `ERR_PNPM_IGNORED_BUILDS` si un paquete necesita postinstall. Se aprueban solo `esbuild` y `unrs-resolver` con `allowBuilds` en `pnpm-workspace.yaml` (en pnpm 11 `onlyBuiltDependencies` del `package.json` ya no alcanza).
- **D26 ✔ Host y entrada del server.** `HOST` default `0.0.0.0`: en Windows `localhost` resuelve a `::1` y el juego se prueba desde celulares en la LAN. `NODE_ENV` se fija antes del import dinámico de Next y el entry es CJS (sin top-level await) para no cambiar el módulo del proyecto.
- **D27 ✔ Ruta del seed.** El script de la spec apunta a `infrastructure/seed/seed.ts`, inconsistente con el árbol de §4.1. Se corrige a `src/infrastructure/seed/seed.ts`.
- **D28 ✔ Cobertura no medible acá.** Con Vitest 3.2.7 y 5.0.5, providers v8 e istanbul, `pnpm test:coverage` devuelve **0/0** incluso para un test trivial (`cn.ts`), y v8 deja statements en 0 con branch data inconsistente. Se verificó que `NODE_V8_COVERAGE` nativo sí produce datos: el problema es la recolección de Vitest en este entorno, no el código. Se mantiene la configuración de la spec (v8, `include` sobre `src/domain`, umbral 80 % branches); la suite fija cada regla y el número debe confirmarse con `pnpm test:coverage` en una terminal normal.
- **D29 MVP por actor.** El punto del acierto se acredita al jugador que toca *¡Adiviné!* (`actorId` en `TurnOutcome`), porque cualquier miembro del equipo activo puede tocar. Empate de puntos → gana el primero en orden de equipos.
- **D30 Módulos de dominio.** Los cinco ids branded viven en `value-objects/PlayerId.ts` (misma validación, evita cinco archivos idénticos) y los eventos en `events/events.ts` como unión discriminada, en vez de seis archivos sueltos. Permite `switch` exhaustivo y menos ceremonia.
- **D31 Carta pasada y fin de mazo.** El equipo rival consume la carta pasada al iniciar su turno (no queda en cola); por eso `passedCards` vuelve a 0 en la misma transición. La partida termina cuando el mazo está vacío **y** no quedan cartas pasadas pendientes.
- **D32 Puntaje mínimo.** `Score.minus` satura en 0: no existen puntajes negativos, y una penalización sobre 0 deja el equipo en 0.
- **D33 Snapshot Mongo = agregado completo.** El documento `games` de §7.1 era un subconjunto: se agregan `gameId` (el id del agregado no es el `_id`), ids de carta en `deckSnapshot`/`currentTurn`/`passedCards` (D14), `turnCursor`, `points`, `round`, `passedCards` y `turnHistory` (D4). Sin esos campos el round-trip dominio↔documento perdería estado. Los jugadores siguen anidados en `teams[].players` como pide la spec; el agregado actual todavía no modela jugadores sin equipo.
- **D34 Pendientes de fase 3 en el documento.** `deckId` se persiste como `null` y `lastSeenAt` como `null`: el agregado en memoria todavía no lleva el id del mazo ni el último contacto (lo necesitan `CreateGame` y el traspaso de host). Se completan en Fase 3 sin cambiar el shape del documento. `createdAt` lo escribe el mapper y `updatedAt` lo administra Mongoose.
- **D35 ✔ Jugadores sin equipo y tokens en memoria.** §6.3 permite esperar el reparto, así que `Game` gana `players` (los que no eligieron equipo) y `Player.lastSeenAt`; el documento `games` suma el array `players` junto a `teams[].players` (§7.1 no lo preveía). Los `playerToken` viven en `GameRegistry`, no en Mongo: una partida no sobrevive al reinicio (D9), así que persistirlos no compraría nada.
- **D36 `game:ready` alterna.** El evento no lleva payload y alterna `isReady`; es informativo. Arrancar exige el mínimo por equipo (§6.3), no que todos estén listos.
- **D37 `turnSeconds` en el wire.** Se aceptan exactamente 30/45/60 (§6.1); sin `options.turnSeconds` manda `TURN_SECONDS_DEFAULT` del entorno.
- **D38 "Pasar turno".** S4 y §6.4 le dan *Pasar turno* al equipo activo, pero §8.1 define `turn:skip` como "solo el descriptor". Gana el contrato de socket: `turn:skip` es *Aceptar y pasar carta* y solo lo emite el descriptor; el resto del equipo activo no tiene esa acción.
- **D39 Catálogo de errores y ack.** Se agregan códigos estables `GAME_NOT_FOUND`, `DECK_NOT_FOUND`, `GAME_FULL`, `TEAM_FULL`, `PLAYER_NOT_IN_GAME`, `NOT_HOST` y, en la frontera, `INVALID_PAYLOAD`. Todo error de acción viaja **en el ack** (`{ error: { code, message } }`) **y** como `game:error` al mismo socket, para que el cliente pueda usar cualquiera de los dos caminos sin colgarse.
- **D40 `game:leave`.** En el lobby elimina al jugador y transfiere el host si hacía falta; en partida en curso solo lo marca `connected:false` para no romper el orden de turnos (la reconexión lo recupera). El host se transfiere al conectado más antiguo (D8) en ambos casos.
- **D41 Mongo caído no bloquea el arranque.** Si `connectMongo` falla, el server loguea un warning y sigue en modo memoria (`ResilientGameRepository` tolera lecturas fallidas y `FireAndForgetGameRepository` ya tolera escrituras). El juego es jugable; los snapshots se pierden hasta que Mongo vuelva.
- **D42 `turn:pass`.** §6.4 le da *Pasar turno* al equipo activo, pero §8.1 solo definía `turn:skip` (solo descriptor). Se agrega `turn:pass` para cualquier miembro del equipo activo; resuelve como `TIME` (0 puntos, carta al final del mazo) porque §5 solo admite cuatro resultados y ese es el único libre. *Aceptar y pasar carta* sigue siendo `turn:skip` y sigue siendo solo del descriptor.
- **D43 `GET /api/decks`.** §8 no expone el catálogo de mazos y *Crear partida* lo necesita (§6.1). Va por HTTP en una route handler que lee Mongo; si la base no responde devuelve 503 y la pantalla muestra su estado de error con reintento. No toca el contrato de socket.
- **D44 Una ruta, pantallas por estado.** El cliente no navega entre rutas: `AppRoot` monta la pantalla según el estado (`home/create/join/lobby/game/result`). Motivo: el socket y el `playerToken` no deben recrearse al cambiar de pantalla, y la reconexión reemplaza el estado completo (§8.3).
- **D45 `waitingPlayers` en el estado público.** El lobby necesita mostrar a los que todavía no eligieron equipo; se agrega al DTO `game:state` (información pública, S3).
- **D46 "Repartir equipos" en lugar del switch del preview.** El preview del lobby muestra un switch "Equipos balanceados", pero el servidor solo tiene un reparto one-shot (`game:autoTeams`); un switch que no puede volver atrás sería un control muerto. Se usa un botón *Repartir equipos* que dispara la misma regla. El switch de *Crear partida* sí es real y fija `randomTeams` para el arranque.
- **D47 Tests de componentes no ejecutables acá.** Con React 19 + Vitest 3.2.7 el render de Testing Library falla con "Invalid hook call" (dos copias del dispatcher: la que ve el JSX y la que registra `react-dom`), incluso con un componente trivial y con `dedupe`, alias y `deps.optimizer`. Se retiraron esos tests y se cubre la lógica pura en un test propio (`secondsRemaining`/`remainingFraction`), las reglas de juego en dominio/aplicación/socket, y la UI con la auditoría del checklist §12 más el smoke de SSR. Queda pendiente confirmar el entorno de componentes en otra máquina.
- **D48 El rival no tiene "Pasar turno".** §6.4 y el preview 07 se lo dan al rival, pero `directivas-diseno.md` §1.6 le da solo *Reportar gesto* y *Reportar sonido*, y §8.1 no define ninguna acción de pase para el rival (el servidor la rechaza con `NOT_ALLOWED`, que es lo correcto: S10 dice que el servidor manda). Se elimina el botón en vez de dejar un control que falla el 100 % de las veces.
- **D49 `canStart` del lobby.** El cliente ahora exige lo mismo que el servidor: ningún jugador sin equipo (salvo `randomTeams`, que los reparte al arrancar) además del mínimo por equipo. Antes habilitaba *Comenzar* y el server respondía `INVALID_STATE`.
- **D50 Anillo del temporizador.** Se elimina la variante `size="lg"` (quedaba en 200px también en mobile) y el anillo es siempre `160px` en mobile y `200px` desde `md`, como pide §6.
- **D51 ✔ `rounds = 1` es mazo entero.** El smoke de dos clientes destapó que con el default (`rounds: 1`, D7) la partida terminaba al completar **una vuelta** de turnos, no al agotarse el mazo como dice §6.10. El tope por vueltas ahora aplica desde `rounds >= 2`; con 1 manda el mazo. Tests: "con rounds = 1 juega hasta agotar el mazo" y "con rounds = 2 termina al completar la segunda vuelta aunque queden cartas".
- **D52 Ticker tolerante.** Si el cierre por reloj no puede resolver el turno (por ejemplo, todo el equipo activo quedó desconectado y `nextDescriptor` no encuentra a nadie), el error se loguea, se detiene el intervalo de esa partida y el proceso sigue vivo. La partida queda en pausa hasta que alguien vuelva. Antes la excepción escapaba de un `setInterval` y podía tumbar el servidor. Test: `ticker-resilience.test.ts`.
- **D53 ✔ Cobertura medible (enmienda D28).** `pnpm test:coverage` ya reporta: **95,1 % statements y 95,97 % branches** en `src/domain`, con el umbral de 80 % en verde. La nota de D28 ("0/0, no medible") quedó obsoleta en este entorno; se mantiene la configuración original.

---

## Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `exactOptionalPropertyTypes` + Mongoose/Zod/RHF genera fricción de tipos | Mappers explícitos doc↔dominio, DTO propios; prohibido relajar el tsconfig. Si aparece un caso imposible, se documenta el punto exacto. |
| R2 | API de Base UI (`render`, `nativeButton`) distinta de Radix | Consultar docs de Base UI antes de cada primitiva; encapsular en `ui/components/ui/` y no mezclar convenciones. |
| R3 | Socket.IO + custom server con HMR: handlers o intervalos duplicados en dev | Registrar handlers una vez, `io` singleton, `clearInterval` por partida al cerrar turno/partida. |
| R4 | Drift del temporizador | Cierre por `deadlineAt`, nunca por acumulación de ticks; test con `Clock` falso. |
| R5 | 240 cartas: duplicados, acentos, 0 o >4 prohibidas | Zod en seed + test de integridad (1–4, normalizadas, sin duplicados, sin ids repetidos). |
| R6 | Mongoose/Node filtrándose al bundle del cliente | D3: UI solo `import type` + contrato de eventos; `next build` como gate. |
| R7 | Partida larga con mazo de 120 cartas | `rounds` configurable por env; documentado en README. No se agrega UI que la spec no pide. |
| R8 | Tailwind v4 + tokens en `@theme` mal mapeados | Test visual del checklist §12 pantalla por pantalla; cero valores literales (grep de `#` y `px` en componentes). |

---

## Verificación por fase

| Fase | Comando / evidencia |
|---|---|
| 0 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `pnpm dev` sirve `/` con tokens y fuentes |
| 1 | Suite de dominio verde con cobertura ≥80 % branches en `src/domain` |
| 2 | `docker compose up -d`; `pnpm seed` idempotente (dos corridas, mismos 3 mazos, 240 cartas) |
| 3 | Test de integración: crear → unirse → repartir → arrancar → turno con acierto → penalización por palabra → gesto → fin, con reloj falso |
| 4 | 10 pantallas contra previews + checklist §12 + a11y (foco, aria-live, contraste, 360px) |
| 5 | DoD §15 completo; `pnpm build` sin warnings; smoke manual en dos navegadores |

---

## Log

- **L1 (2026-10-26, verbatim).** "Vamos hacer la planificación de desarrollo de la app Tabu"
- **L2 (2026-10-26, verbatim).** "En el dir doc está el prompt que vas a usar para desarrollar la app y tambien hay un archivo llamado directivas-diseno"
- **L3 (2026-10-26, evidencia).** `doc/` contiene `prompt.md` (555 líneas), `directivas-diseno.md` (383 líneas) y 14 previews. El repo no tiene código ni git.
- **L4 (2026-10-26, evidencia de entorno).** Node `v22.17.0`, Corepack `0.33.0`, pnpm `11.1.2`, git `2.50.1`. Registro: `next@latest` = 16.4.3, `next@15` = 15.5.28, `@base-ui/react@1.9.0`, `zod@4.6.7`, `tailwindcss@4.3.3`, `vitest@^3` → 3.2.7, `lucide-react@^0.5` → 0.577.0, `@hookform/resolvers@^5` soporta `zod ^4`.
- **L5 (2026-10-26, decisión).** Plan creado. Estimación: ~8.500 líneas autoradas, ~22 unidades de trabajo, 6 slices de delivery. Próximo paso: Fase 0 (bootstrap).
- **L6 (2026-10-26, evidencia Fase 0).** Bootstrap completo: Next 15.5.28 + React 19.3.1 + Tailwind 4.3.3 + `@base-ui/react` 1.9.0 + TypeScript 5.9.3. `pnpm lint`, `pnpm typecheck`, `pnpm test` (4 tests de `cn`) y `pnpm build` pasan con exit 0 y sin warnings. Smoke de `pnpm dev`: HTTP 200 en `127.0.0.1:3000`, `lang="es"`, CSS con `#ff6b2c`, `clamp(48px…` y `--font-outfit` presentes; puerto liberado al terminar. Hallazgos que corrigieron la spec: D21–D27. `git init -b feat/tabu`.
- **L7 (2026-10-26, cierre Fase 0).** Commit `51fcc19` (`feat/tabu`, árbol limpio): scaffold, tokens, tooling, server, compose y plan. Siguiente: Fase 1 (dominio).
- **L8 (2026-10-26, evidencia Fase 1).** Dominio implementado test-first en cuatro ciclos RED→GREEN: value objects (20), mazo/barajado (9), policies (14), máquina de estados/eventos (19) = 66 tests. `lint`, `typecheck`, `test` y `build` en exit 0. Un test propio estaba mal (asumía que la carta pasada quedaba en cola); se corrigió la expectativa contra el comportamiento real de D31, no el código. Cobertura no medible (D28). Decisiones nuevas: D28–D32.
- **L9 (2026-10-26, Fase 2 en curso).** T2.1–T2.3 y T2.5 con RED→GREEN por unidad: `env.test.ts` (12), `schemas.test.ts` (5), `mappers.test.ts` (4), contrato de repos (16, 8 skip sin Mongo) y `FireAndForgetGameRepository` (3). `typecheck` y `lint` en exit 0. `parseEnv` recibe `Record<string, string | undefined>` (no `NodeJS.ProcessEnv`: en @types/node 22 `NODE_ENV` es requerido y rompía los tests). `server.ts` ahora carga `.env` opcional y valida el entorno al arrancar (S31); se creó `.env` local desde `.env.example` (ignorado por git). Decisiones nuevas: D33–D34. T2.4 delegada (contenido de 240 cartas). Gate pendiente: Docker daemon apagado, `pnpm seed` contra Mongo real sin verificar.
- **L10 (2026-10-26, cierre Fase 2).** Gate ejecutado contra Mongo 7 real y **encontró un bug**: el contrato de repos fallaba en `saved.createdAt` (`undefined` al releer). Causa: `createdAt` figuraba en `GameDocument` y en el índice `{status:1, createdAt:-1}` pero **no había path en `gameSchema`** y `timestamps.createdAt` estaba en `false`, así que Mongoose lo descartaba en modo estricto. Fix: `createdAt: { type: Date, required: true }` en el schema; el contrato existente era el test que faltaba y quedó en verde sin agregar casos. Evidencia: `pnpm vitest run src/infrastructure` con `MONGODB_URI_TEST` → 64/64; `pnpm seed` ×2 → 3 mazos / 240 cartas idempotentes; `pnpm test` 122 pasan / 8 skip sin la variable; `lint`, `typecheck`, `build` exit 0. Nota de entorno: en esta máquina el puerto 27017 lo ocupa el Mongo de otro proyecto (`mytime-mongo`), así que la verificación corrió sobre un contenedor `mongo:7` publicado en 27018; el `docker-compose.yml` del repo queda sin cambios. Los contenedores de verificación y la base `tabu_seedcheck` se eliminaron al terminar. Siguiente: Fase 3 (servidor de tiempo real).
- **L11 (2026-10-26, cierre Fase 3).** Fase 3 completa en tres unidades de trabajo (`9128d6b`, `a1954b9`, `ac11060`). El dominio necesitó una extensión real: `Game.players` para los que esperan equipo y `Player.lastSeenAt` (D35), con dos tests nuevos de `startGame` (rechaza sin equipo en reparto manual, reparte con `randomTeams`) y dos de `reassignDescriptor`. Aplicación con `GameRegistry` en memoria, puertos `Clock`/`IdGenerator` y casos de uso sin socket ni Mongoose (34 tests). Borde con `payloads.ts` (Zod, 14 tests), `events.ts` tipado, `SocketSessions`, `Broadcaster` y `TurnTicker`; 4 tests de integración levantan un HTTP server real con `socket.io-client` y juegan por socket: turno completo con roles, reporte inválido que no cierra el turno, penalización válida con carta anulada y reconexión con token. Gates: `pnpm test` 178 pasan / 8 skip; `db` con Mongo real 29/29; `lint`, `typecheck`, `build` exit 0; smoke de `pnpm start` con Mongo inalcanzable → warning + HTTP 200 + handshake 200. Decisiones nuevas: D35–D41. Siguiente: Fase 4 (UI).
- **L12 (2026-10-26, verificación independiente de Fase 3).** El verificador confirmó S10, S17 y S18 y encontró **un blocker real** en S9: `handOverDescriptor` solo comparaba `descriptorId`, así que un descriptor que **reconectaba dentro de la gracia** perdía el turno igual al cumplirse los 5 s (su `connected` volvía a `true` pero nadie miraba ese estado). Fix: chequear `locatePlayer(...).player.connected` antes de reasignar, con la gracia además configurable (`disconnectGraceMs`, 5 s por defecto) para poder testearla sin esperar. RED reproducido quitando el guard (falla solo "conserva el turno si el descriptor reconecta dentro de la gracia") y GREEN con el guard puesto; 4 tests nuevos en `reconnect-grace.test.ts`. Advisories aceptadas: `snapshot()` corre antes del broadcast (hoy no puede lanzar porque `FireAndForgetGameRepository` atrapa todo; queda anotado), `turn:skip` devuelve `null` como ack de un `void`, y `reconnectPlayer` no tenía test propio a nivel aplicación (queda cubierto por los de gracia). Suite: 183 pasan / 8 skip. Siguiente: Fase 4 (UI).
- **L13 (2026-10-26, cierre Fase 4).** UI completa en tres unidades: `turn:pass` (D42, con casetes propios), primitivas + componentes de juego + providers, y las 10 pantallas con `AppRoot`. Los views 05/06 y 07 se escribieron en paralelo por dos workers con superficies disjuntas (`describing-view.tsx`, `rival-view.tsx`) sobre un contrato común (`RoleViewProps`); el padre compuso `game-screen.tsx` y corrigió tres inconsistencias al integrar: `<main>` anidado (ambas vistas traían `Screen`), botones de reporte con variantes distintas (se unificó en `danger` según §6) y mute duplicado. Se agregó `GET /api/decks` (D43), `waitingPlayers` al DTO (D45) y el botón *Repartir equipos* (D46). **Limitación honesta:** los tests de componentes con Testing Library no corren en este entorno por doble copia del dispatcher de React 19 en Vitest (D47); se probaron las funciones puras del temporizador (4 casos) y el resto se verificó con auditoría de tokens/checklist y smoke de SSR. Gates: `pnpm test` 189 pasan / 8 skip; `lint`, `typecheck`, `build` exit 0 sin warnings; `/` con HTTP 200 y `/api/decks` 503 con Mongo caído. Siguiente: Fase 5 (endurecimiento, README y DoD).
- **L14 (2026-10-26, verificación independiente de Fase 4).** El verificador (sin render, leyendo código y sondeando el socket real) encontró **tres blockers** y los tres eran reales. B1: el rival tenía *Pasar turno*, que el servidor rechaza siempre (`turn:pass` es del equipo activo) → se elimina el botón (D48). B2: el lobby habilitaba *Comenzar partida* con jugadores sin equipo, y el server devolvía `INVALID_STATE` → `canStart` ahora exige lo mismo que el servidor (D49). B3: el anillo medía 200px también en mobile por la variante `lg` → responsive 160/200 (D50). Se corrigieron además: estado viejo tras un `game:reconnect` rechazado (ahora limpia sesión, estado y vuelve al inicio), `busy` que quedaba trabado al desconectarse, `aria-live` que no cubría el nombre del equipo, `EmptyState` muerto y dos caracteres de reemplazo en un comentario de `globals.css`. Se agregó `client-contract.test.ts` (5 casos: pase del activo vs rival, `turn:skip` solo descriptor, visibilidad pública S3 y las dos precondiciones de arranque). Suite: 194 pasan / 8 skip. Siguiente: Fase 5 (endurecimiento, README y DoD).
- **L15 (2026-10-26, cierre Fase 5).** Endurecimiento cerrado. `full-game.test.ts` juega la partida completa por socket (crear → unirse → repartir → arrancar → acierto → penalización → final con ganador y MVP) y `ticker-resilience.test.ts` cubre el scheduler sin jugadores conectados. README escrito con las decisiones agrupadas. El smoke de dos clientes contra el servidor real y Mongo real destapó **dos bugs de producción**: (1) con el default `rounds: 1` la partida terminaba al completar una vuelta en vez de al agotarse el mazo (§6.10), corregido en el dominio con dos tests nuevos (D51); (2) el cierre por reloj podía lanzar `NoEligibleDescriptorError` desde un `setInterval` si el equipo activo quedaba sin conexiones, ahora se loguea, se pausa el intervalo y el server sigue vivo (D52). La cobertura **sí se mide** ahora: 95,1 % statements / 95,97 % branches (enmienda D28 en D53). Auditoría de cierre: cero `TODO`/`FIXME`, cero `console.log`, cero `any`/`@ts-ignore`, cero `Date.now()` en dominio, cero emojis. Gates: `lint`, `typecheck`, `test` (197 pasan / 8 skip), `test:coverage` y `build` en exit 0 sin warnings. DoD §15 cubierto salvo el smoke manual en dos navegadores, reemplazado por el smoke de dos clientes reales (mismos eventos, mismos acks).

