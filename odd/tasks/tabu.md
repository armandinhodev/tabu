# Tabú — plan de desarrollo

**Objetivo:** app web multijugador de Tabú en tiempo real, 2–4 equipos, cada jugador en su dispositivo, sin registro.
**Rama:** `feat/tabu` (se crea en Fase 0). **Delivery:** `ask-on-risk` con slices por fase (~8.500 líneas estimadas).
**Runner:** `pnpm test` (Vitest + jsdom). **Gates:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
**Fuentes normativas (no se reescriben acá):** `doc/prompt.md` (funcional), `doc/directivas-diseno.md` (visual), `doc/previews/` (layout). La UI real sigue las previews; ante conflicto visual gana `directivas-diseno.md`.

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

### Fase 2 — Persistencia (gate: `pnpm seed` + repos contra Mongo real, ~1.500L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T2.1 | `infrastructure/config/env.ts` (Zod) + `logger.ts` | S31 | inline |
| T2.2 | Schemas/models `decks` y `games`, índices (`code` unique, `status+createdAt`, TTL parcial `finishedAt`) | S15 | inline |
| T2.3 | `MongoDeckRepository`, `MongoGameRepository` + mappers dominio↔documento; snapshot fire-and-forget con log | S15 | inline |
| T2.4 | Seed 3 mazos (240 cartas originales) con ids estables + validación Zod + idempotencia por `name` | S16 | delegado (contenido, paralelizable) |
| T2.5 | Repos in-memory para tests (mismos puertos) + tests de repos | S15, S32 | inline |

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
| T4.12 | Checklist visual §12 por pantalla + verificación contra previews | S19–S30 | inline |

### Fase 5 — Endurecimiento (gate: DoD §15 completo, ~700L)

| ID | Tarea | Specs | Ruta |
|---|---|---|---|
| T5.1 | Suite de integración final: crear→unirse→repartir→arrancar→acierto→penalización palabra→gesto→fin; visibilidad pública; autorización por rol; reconexión | S32 | inline |
| T5.2 | `README.md`: qué es, levantar (local/docker), env, cómo jugar, diagrama ASCII, contrato Socket.IO, **Decisiones asumidas** (D1–D20) | S33 | inline |
| T5.3 | Smoke manual en dos navegadores + DevTools (delta de puntaje y carta anulada) | S33 | inline |
| T5.4 | Cierre: lint/typecheck/test(coverage)/build sin warnings, sin TODO ni código muerto | S14, S32 | inline |

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
