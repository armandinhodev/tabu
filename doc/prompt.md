# Prompt maestro — Tabú

> **Qué es este archivo:** la especificación completa del juego, escrita para que un modelo de
> código (DeepSeek) pueda construir el proyecto de punta a punta.
> **Cómo usarlo:** entregale este archivo completo junto con `doc/directivas-diseno.md` y las
> imágenes de `doc/previews/`. No hace falta que le expliques nada más.
> **Estado del proyecto:** repositorio vacío salvo la carpeta `doc/`. Partís de cero.

---

## 0. Contrato de trabajo

- **No hagas preguntas.** Todas las decisiones están cerradas en este documento. Si algo no está
  especificado, elegí la alternativa más simple que cumpla estas reglas y anotá la decisión en el
  `README`, sección *Decisiones asumidas*.
- **Trabajá por fases y entregá código ejecutable al final de cada una** (no pseudocódigo, no
  `// TODO` en el camino crítico).
- **No inventes dependencias** ni uses librerías que no estén listadas en §3.
- **Escribí el código final**, no extractos: cada archivo con su contenido completo.
- Todo el **texto visible de la UI está en español rioplatense** (voseo): "Entrá", "Unirse",
  "Crear sala", "Comenzar partida", "Pasar turno".

### Fases de trabajo (respetá el orden)

1. **Fase 1 — Esqueleto + dominio.** Proyecto Next.js, tokens de diseño, capa `domain` completa con
   sus tests unitarios. Debe pasar `pnpm lint && pnpm typecheck && pnpm test`.
2. **Fase 2 — Persistencia.** Modelos Mongoose, repositorios, seed de mazos, conexión a Mongo.
3. **Fase 3 — Servidor de tiempo real.** `server.ts` con Socket.IO, contrato de eventos, máquina de
   estados de la partida, temporizadores, reconexión.
4. **Fase 4 — UI.** Las 10 pantallas de §12, componentes, sonido, estados de carga/error/vacío.
5. **Fase 5 — Endurecimiento.** Tests de integración del flujo de partida, a11y, `README`,
   `.env.example`, `docker-compose.yml`, script de seed.

---

## 1. Objetivo

Un juego digital de **Tabú** multijugador en tiempo real para grupos de amigos (2–8 personas por
equipo, 2–4 equipos). Cada jugador entra **poniendo un nombre, sin registro ni contraseña**, se
une a una sala con un código de 6 caracteres y juega desde **su propio dispositivo** (celular o
computadora). La conexión es por **WebSocket**; no hay pantalla compartida: cada quien ve la
interfaz en su dispositivo, y el servidor reparte el turno y las **acciones** según el rol de cada
jugador.

El juego usa **mazos precargados en MongoDB** (no hay carga de mazos por el usuario).

---

## 2. Decisiones cerradas

| Decisión | Valor |
|---|---|
| Identidad | Solo un nombre. Sin login, sin registro, sin contraseñas, sin email. |
| Dispositivo | Cada jugador en su propio dispositivo. Sin pantalla compartida. |
| Información visible | **Todos ven la palabra objetivo y la lista completa de palabras prohibidas**, igual que en el juego de mesa. No hay información secreta: lo que cambia por rol son las **acciones**. |
| Rol activo | El equipo al que le toca describe **y** adivina: puede *Adiviné*, *Aceptar* y *Reportar*. |
| Rol rival | El equipo que espera **vigila**: ve la misma lista y **marca** qué palabra prohibida se dijo. |
| Penalización | El equipo rival toca el chip de la palabra exacta que se dijo → **−1 al equipo que describe**, el turno **termina en el acto** y **la carta se anula** (se descarta del mazo). |
| Gestos y sonidos | Se reportan a mano: *Reportar gesto* / *Reportar sonido* → mismo castigo que la palabra prohibida. |
| Equipos | De 2 a 4 por partida. Multiequipos real: equipos nombrados, con colores propios. |
| Palabras prohibidas | Fijadas por la carta del mazo, no editables en partida. |
| Detección de infracciones | **Manual y por palabra**: se marca el chip concreto. Sin reconocimiento de voz. |
| Paleta | La de `doc/directivas-diseno.md`. **Prohibido violeta/lila/magenta/índigo.** |
| Tipografía | Sin sombra, sin 3D, sin degradado en texto. |
| Persistencia | MongoDB + Mongoose. |
| Transporte | Socket.IO sobre el mismo servidor HTTP que sirve Next.js. |
| Idioma de la UI | Español rioplatense (voseo). |
| Sonido | Efectos sintetizados con Web Audio API. Sin archivos de audio. |
| Gestor de paquetes | **pnpm** (v11). Fijalo en `package.json` con `"packageManager": "pnpm@11.1.2"` y usá Corepack. No uses npm ni bun. |

---

## 3. Stack

- **Next.js 15** con App Router + **TypeScript en modo `strict`** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Socket.IO 4.x** montado sobre un **custom server** (`server.ts`) que sirve Next y el tiempo real en el mismo puerto.
- **MongoDB 7** + **Mongoose 8**.
- **Tailwind CSS v4** con los tokens de `doc/directivas-diseno.md` declarados en `src/app/tokens.css` y mapeados con `@theme`.
- **Zod** para validar todo lo que entra del cliente (eventos de socket y variables de entorno).
- **lucide-react** para íconos SVG. **Nunca emoji como ícono.**
- **clsx** + **tailwind-merge** para clases condicionales, y **class-variance-authority** (`cva`) para declarar las variantes de los componentes.
- **Base UI** (`@base-ui/react@^1.9.0`) como capa de primitivas accesibles: es la que mantiene hoy el equipo de MUI con un equipo a tiempo completo, es la que **shadcn/ui usa por defecto en proyectos nuevos** y cubre el set completo de Radix más Combobox, Autocomplete y diálogos anidados. Los componentes viven **en el repo** en `src/ui/components/ui/`, siguiendo la convención de **shadcn/ui**: misma API y mismas convenciones de archivo, pero el código es propio y no agrega una dependencia runtime de un paquete de componentes. **No instales `shadcn` ni `@shadcn/ui` como paquete**: la única dependencia real es `@base-ui/react`; el registry de shadcn (`pnpm dlx shadcn@latest add <componente>`) es opcional y solo si hay red contra el registry (si lo usás, `components.json` va con `"style": "base-vega"`).
- **Ojo con la API de Base UI:** usa la prop **`render`** (no `asChild` como Radix) y `Button` lleva `nativeButton={false}` cuando el hijo no es un `<button>`. Escribí los componentes siguiendo la documentación de **Base UI**, no la de Radix, y no mezcles ambas convenciones.
- **sonner** para los toasts, y **react-hook-form** + **@hookform/resolvers/zod** para los formularios (nombre, mazo, código de sala).
- **Prohibido** sumar MUI, Ant Design, Chakra, Mantine, HeroUI/NextUI o Bootstrap: imponen tema y CSS propios en runtime, pelean con Tailwind v4 y con la paleta definida en `doc/directivas-diseno.md`.
- **Gestor de paquetes: pnpm.** `package.json` lleva `"packageManager": "pnpm@11.1.2"`, el proyecto se instala con `pnpm install` y se versiona `pnpm-lock.yaml` (nunca `node_modules`).
- **Vitest** + **@testing-library/react** + **jsdom** para tests; **@vitest/coverage-v8** para cobertura.
- **ESLint** (`next/core-web-vitals` + `typescript`) y **Prettier**.
- **Node.js 20+** (22 LTS recomendado). TypeScript estricto en todos los paquetes.

**Dependencias exactas — instalá solo esto, nada más:**

```jsonc
// package.json → dependencies
{
  "next": "^15",
  "react": "^19",
  "react-dom": "^19",
  "socket.io": "^4.8",
  "socket.io-client": "^4.8",
  "mongoose": "^8",
  "zod": "^4",
  "@base-ui/react": "^1.9",          // ← única librería de UI (primitivas accesibles)
  "class-variance-authority": "^0.7",
  "clsx": "^2",
  "tailwind-merge": "^3",
  "lucide-react": "^0.5",
  "sonner": "^2",                   // toasts
  "react-hook-form": "^7",          // formularios
  "@hookform/resolvers": "^5"       // integración react-hook-form + zod
}

// package.json → devDependencies
{
  "typescript": "^5",
  "@types/node": "^22",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "tailwindcss": "^4",
  "@tailwindcss/postcss": "^4",
  "eslint": "^9",
  "eslint-config-next": "^15",
  "prettier": "^3",
  "prettier-plugin-tailwindcss": "^0.6",
  "tsx": "^4",                      // para correr server.ts y el seed
  "vitest": "^3",
  "@vitest/coverage-v8": "^3",
  "@testing-library/react": "^16",
  "@testing-library/jest-dom": "^6",
  "@testing-library/user-event": "^14",
  "jsdom": "^26"
}
```

**No** agregues `shadcn`, `@shadcn/ui` ni `@radix-ui/*`: no son dependencias del proyecto. El CLI de
shadcn, si se usa, se invoca con `pnpm dlx` (herramienta de desarrollo, no dependencia). Y no agregues
ninguna librería de UI completa (MUI Core, Ant Design, Chakra, Mantine, HeroUI/NextUI, Bootstrap).

Scripts esperados en `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "next build",
    "start": "tsx server.ts",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "seed": "tsx infrastructure/seed/seed.ts"
  },
  "packageManager": "pnpm@11.1.2"
}
```

`server.ts` decide el modo con `next({ dev: process.env.NODE_ENV !== 'production' })` para que el
mismo archivo sirva en dev y en prod sin scripts duplicados. `tsx` es la dependencia de desarrollo
para ejecutar TypeScript en el servidor.

Arranque del proyecto: `pnpm create next-app@latest tabu --typescript --tailwind --app --src-dir --import-alias "@/*"`, y a partir de ahí **todo con pnpm**.

---

## 4. Arquitectura y clean code

### 4.1 Capas y dirección de dependencias

```
src/
  domain/          ← no importa NADA externo (ni React, ni Mongoose, ni Socket.IO, ni next)
  application/     ← importa domain + puertos (interfaces)
  infrastructure/  ← implementa los puertos: Mongo, Socket.IO, audio, config
  ui/              ← React/Next: importa application y domain (nunca infrastructure directo)
  app/             ← rutas de Next (App Router)
```

Regla dura: **las dependencias apuntan hacia adentro**. `domain` no conoce el mundo exterior.

```
domain
  entities/        Game.ts, Team.ts, Player.ts, Card.ts, Turn.ts, Violation.ts
  value-objects/   RoomCode.ts, PlayerId.ts, Score.ts, Duration.ts, TabooWords.ts
  policies/        TurnOrderPolicy.ts, ScoringPolicy.ts, PenaltyPolicy.ts, DeckShuffler.ts
  services/        GameClock.ts (interfaz), GameStateMachine.ts, CardDeck.ts
  events/          TurnStarted.ts, TurnEnded.ts, ScoreChanged.ts, PenaltyApplied.ts, RoundEnded.ts, GameFinished.ts
  errors/          DomainError.ts + errores específicos
application/
  use-cases/       CreateGame.ts, JoinGame.ts, ReconnectPlayer.ts, StartGame.ts, AssignTeam.ts,
                   AutoAssignTeams.ts, GuessWord.ts, ReportViolation.ts, SkipTurn.ts, EndGame.ts
  ports/           GameRepository.ts, DeckRepository.ts, Clock.ts, IdGenerator.ts, EventPublisher.ts
  dto/             tipos de entrada/salida de cada caso de uso
infrastructure/
  db/              mongoose/models, mongoose/schemas, repositories/MongoGameRepository.ts, MongoDeckRepository.ts
  socket/          server.ts, handlers/*.ts, events.ts (nombres de evento + payloads), middleware/*
  audio/           SoundProvider.tsx, sounds.ts (recetas Web Audio)
  config/          env.ts (Zod), logger.ts
  seed/            decks.ts (datos), seed.ts
ui/
  screens/         InicioScreen, CrearPartidaScreen, UnirseScreen, SalaEsperaScreen,
                   JuegoActivoScreen, JuegoDescriptorScreen, JuegoRivalScreen,
                   PenalizacionScreen, MarcadorScreen, ResultadoScreen
  components/      Button, Input, Chip, Card, TeamPanel, PlayerRow, ScoreBoard, TimerRing,
                   TabooWords, CodeBadge, Avatar, Toggle, SegmentedControl, Skeleton
  components/ui/   primitivas accesibles propias (convención shadcn/ui sobre Base UI):
                   Dialog, Tooltip, Popover, Select, Switch, Tabs, Separator, Toast
  hooks/           useSocket, useGameState, useCountdown, useSound, useMediaQuery
  lib/             cn(), format.ts (tiempo, puntos), socket.ts (cliente singleton)
```

**Regla de UI:** todo control con semántica de accesibilidad (modal, menú, tooltip, select, switch,
tabs) sale de `ui/components/ui/`, nunca de un `<div onClick>` improvisado. Los componentes de
juego (`TimerRing`, `TabooWords`, `ScoreBoard`, `TeamPanel`) son **propios y a medida**, construidos
con tokens; no se fuerzan primitivas genéricas a hacer de temporizador.

### 4.2 SOLID, en la práctica

- **S** (Single Responsibility): una clase, una razón para cambiar. La lógica de puntaje vive en `ScoringPolicy`, no en los handlers de socket.
- **O** (Open/Closed): agregar un motivo de penalización o un mazo nuevo **no** obliga a tocar código existente → usa `enum`/`union types` con `switch` exhaustivo (`never` en el default para que TS detecte casos faltantes).
- **L** (Liskov): los repositorios de prueba y de producción implementan el mismo puerto.
- **I** (Interface Segregation): interfaces chicas y específicas (`GameRepository`, `Clock`, `IdGenerator`), nunca un `IRepository` gigante.
- **D** (Dependency Inversion): el dominio define lo que necesita; la infraestructura lo implementa y se inyecta.

### 4.3 Reglas de calidad de código

- Prohibido `any`, `@ts-ignore`, `@ts-expect-error` sin justificación escrita.
- Prohibido `console.log` en código de aplicación: usá el `logger` de `infrastructure/config`.
- Todo input externo (evento de socket, query, body) se valida con Zod en la frontera.
- Errores de dominio tipados (`DomainError` + subclases). El handler de socket los traduce a `game:error` con un `code` estable.
- Nada de lógica de negocio en componentes de React: los componentes piden acciones a los casos de uso.
- Funciones de dominio puras y testeables: nada de `Date.now()` dentro del dominio — usá el puerto `Clock`.

---

## 5. Modelo de dominio

### 5.1 Entidades

```ts
Game {
  id: GameId; code: RoomCode; status: 'waiting' | 'playing' | 'finished';
  deck: DeckSnapshot;              // copia del mazo al iniciar: si el mazo cambia después, la partida no se altera
  settings: GameSettings;          // teamCount, turnSeconds, rounds, randomTeams, minPlayersPerTeam
  teams: Team[]; turnOrder: PlayerId[]; currentTurn: Turn | null;
  createdAt: Date; finishedAt: Date | null; winnerTeamId: TeamId | null;
}

Team { id: TeamId; name: string; color: TeamColor; players: Player[]; score: Score; turnCursor: number }

Player { id: PlayerId; name: string; teamId: TeamId | null; isHost: boolean; isReady: boolean; connected: boolean }

Card { id: CardId; word: string; taboo: TabooWords }   // TabooWords: 1..4 términos, normalizados (minúsculas, sin acentos)

Turn { id: TurnId; teamId: TeamId; descriptorId: PlayerId; card: Card; startedAt: Date; deadlineAt: Date; status: 'active' | 'ended' }

Violation {
  reason: 'TABOO_WORD' | 'GESTURE' | 'SOUND';
  tabooWord?: string;              // obligatorio y exacto cuando reason = 'TABOO_WORD'
  reportedBy: PlayerId;
  at: Date;
}
```

### 5.2 Value objects

- `RoomCode`: 6 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `I`, `O`, `0`, `1` para evitar confusiones), con `RoomCode.generate(rng)` y validación.
- `Score`: entero ≥ 0, con `plus(1)`, `minus(1)`, `compare`.
- `Duration`: segundos > 0.
- `TabooWords`: colección no vacía, ≤ 4, normalizada, sin duplicados. **Es parte del estado público de la partida**: la palabra y su lista se emiten a todos los jugadores.

### 5.3 Policies (puras, sin I/O)

- `TurnOrderPolicy`: el turno rota **por equipo** (los equipos se alternan) y **dentro del equipo el descriptor rota en FIFO**. Un jugador no vuelve a describir hasta que hayan descrito todos los de su equipo.
- `ScoringPolicy`: acierto `+1`; penalización `−1`; skip y timeout `0`.
- `PenaltyPolicy`: valida quién puede reportar y qué castigo corresponde.
  - Puede reportar el **equipo rival** (rol vigilante) y **el descriptor** (autorreporte).
  - El equipo que describe **no puede penalizarse a sí mismo** (salvo el descriptor).
  - Con `reason = 'TABOO_WORD'`, la palabra marcada debe coincidir (normalizada: minúsculas, sin acentos, sin espacios extra) con una de las palabras prohibidas de la carta. Si no coincide → `InvalidTabooWordError`, **sin penalización y sin cerrar el turno**.
  - Todo reporte válido termina el turno y **descarta la carta**.
- `DeckShuffler`: barajado con RNG inyectable (semilla determinista en tests).

### 5.4 Ciclo de vida de la carta

| Situación | Qué pasa con la carta |
|---|---|
| Se sortea | Sale del mazo (`draw()`). |
| Adivinada | Se consume; queda en el historial de la partida. |
| **Penalizada** (palabra prohibida, gesto o sonido) | **Se anula**: se descarta del mazo y **no vuelve a salir**. |
| Tiempo agotado | Vuelve al final del mazo (`returnToBottom()`). |
| Aceptada por el descriptor | Pasa al equipo contrario (`passToOtherTeam()`), sin puntos ni penalización. |

---

## 6. Reglas de juego

1. **Crear sala:** el host elige mazo (de los precargados), cantidad de equipos (2/3/4), tiempo por turno (30/45/60 s, default 45) y si los equipos se reparten al azar o por elección.
2. **Unirse:** con nombre + código de 6 caracteres. Si el nombre está repetido, se agrega un sufijo numérico (`Luz`, `Luz (2)`).
3. **Lobby:** los jugadores entran a un equipo o esperan el reparto automático. El host puede arrancar cuando cada equipo tenga el mínimo de jugadores (default 2; configurable a 1).
4. **Turno:** un jugador de un equipo describe la palabra; **todo su equipo adivina**. **Todos los dispositivos muestran la palabra objetivo y la lista completa de palabras prohibidas** (como en el juego de mesa). Lo que cambia por rol son las acciones disponibles:
   - **Equipo que describe (activo):** *¡Adiviné!*, *Pasar turno*, y el descriptor además *Aceptar y pasar carta* y *Reportar*.
   - **Equipo rival (vigilante):** los chips de palabras prohibidas son **reportables** (tap), más *Reportar gesto*, *Reportar sonido* y *Pasar turno*.
5. **Acierto:** cualquier miembro del equipo que describe dice la palabra en voz alta → toca *¡Adiviné!* → **+1** al equipo y termina el turno.
6. **Penalización por palabra prohibida:** un miembro del **equipo rival** toca el chip de la palabra que se dijo (el chip muestra la palabra exacta, p. ej. *fuego*) → **−1** al equipo que describe, el turno **termina en el acto** y **la carta se anula** (se descarta del mazo: no vuelve a salir). El servidor valida que la palabra marcada sea una de las prohibidas de esa carta; si no coincide, se rechaza con `game:error` (`INVALID_TABOO_WORD`) y no hay penalización ni cierre de turno.
7. **Gestos y sonidos:** el equipo rival (o el descriptor) puede reportarlos con *Reportar gesto* / *Reportar sonido* → **−1** al equipo que describe, el turno termina y la carta se anula, igual que en el caso anterior.
8. **Aceptado (skip):** el descriptor puede *Aceptar y pasar carta* (la descripción es demasiado ambigua) → la carta pasa al equipo contrario, sin puntos ni penalización.
9. **Tiempo agotado:** el turno termina, sin puntos ni penalización; la carta **vuelve al final del mazo**.
10. **Fin de partida:** cuando se completa el número de rondas configurado (default 1 = mazo entero) o se agota el mazo. Gana el equipo con más puntos. **Empate → se declara empate**, no se fuerza un ganador.
11. **Reconexión:** el `playerToken` (UUID) se guarda en `localStorage`. Si el jugador se desconecta, el servidor lo marca `connected: false` y su turno **pasa al siguiente descriptor del mismo equipo**, con un aviso de 5 segundos. Al reconectar recibe el estado completo.
12. **Sin trampas automáticas:** el servidor es la única autoridad sobre puntaje y tiempo. Los clientes **nunca** envían puntos ni tiempo: solo acciones.

---

## 7. Persistencia (MongoDB)

### 7.1 Colecciones

**`decks`**
```ts
{ _id, name: string, category: string, language: 'es', active: boolean,
  cards: Array<{ word: string, taboo: string[] }>, createdAt: Date }
```
Índice: `{ active: 1 }`.

**`games`**
```ts
{ _id, code: string /* 6 chars, UNIQUE */, status: 'waiting'|'playing'|'finished',
  deckId: ObjectId, deckSnapshot: { name: string, cards: Array<{ word, taboo }> },
  settings: { teamCount: number, turnSeconds: number, rounds: number, randomTeams: boolean, minPlayersPerTeam: number },
  teams: Array<{ id, name, color, score, players: Array<{ id, name, isHost, isReady, connected, lastSeenAt }> }>,
  turnOrder: string[],
  currentTurn: { id, teamId, descriptorId, word, taboo: string[], startedAt, deadlineAt } | null,
  discardedCardIds: string[],
  winnerTeamId: string | null, createdAt: Date, updatedAt: Date, finishedAt: Date | null }
```
Índices: `{ code: 1 }` **unique**, `{ status: 1, createdAt: -1 }`.
TTL opcional de 24 h sobre partidas terminadas (configurable por `GAME_TTL_HOURS`), para que la base no crezca sin control.

**Persistencia y memoria:** la partida **vive en memoria** en el servidor (fuente de verdad del tiempo real) y se **snapshot-ea en Mongo** en cada evento relevante (crear, unirse, empezar turno, terminar turno, cambio de puntaje, finalizar). En la práctica: no bloquees el turno esperando escrituras — escribí de forma asíncrona y tolerante a fallos (log, no crash).

### 7.2 Seed

`pnpm seed` inserta **3 mazos precargados** en español: *General* (120 cartas), *Cine y TV* (60) y *Deportes* (60). Palabras apropiadas para una fiesta: nada sexual explícito, nada político. Cada carta tiene entre 1 y 4 palabras prohibidas. El seed debe ser **idempotente** (upsert por `name`).

---

## 8. Contrato Socket.IO

Todos los payloads se validan con Zod en el servidor. Los nombres de evento están en
`infrastructure/socket/events.ts` como constantes tipadas.

### 8.1 Cliente → Servidor

| Evento | Payload | Ack | Quién puede |
|---|---|---|---|
| `game:create` | `{ playerName, deckId, options?: { teamCount, turnSeconds, randomTeams } }` | `{ gameId, code, playerToken, playerId }` | cualquiera |
| `game:join` | `{ code, playerName }` | `{ gameId, playerToken, playerId, playerName }` | cualquiera |
| `game:reconnect` | `{ gameId, playerToken }` | `{ state: GameState }` | el mismo jugador |
| `game:assignTeam` | `{ teamId }` | `void` | cualquiera en la sala |
| `game:autoTeams` | `void` | `void` | cualquiera en la sala |
| `game:ready` | `void` | `void` | cualquiera en la sala |
| `game:start` | `void` | `void` | solo el host |
| `game:leave` | `void` | `void` | cualquiera |
| `turn:guess` | `void` | `{ pointsAwarded: number, teamScore: number }` | equipo que describe |
| `turn:reportViolation` | `{ reason: 'TABOO_WORD'\|'GESTURE'\|'SOUND', tabooWord?: string }` | `{ pointsDelta: number, teamScore: number }` | equipo rival, o el descriptor (autorreporte) |
| `turn:skip` | `void` | `void` | solo el descriptor |

`reason = 'TABOO_WORD'` ⇒ `tabooWord` es **obligatorio** y debe coincidir con una de las palabras
prohibidas de la carta activa (comparación normalizada). Si no coincide ⇒ `game:error` con code
`INVALID_TABOO_WORD`, **sin** penalización y **sin** cerrar el turno.

### 8.2 Servidor → Cliente

| Evento | Payload |
|---|---|
| `game:state` | `{ status, code, settings, teams, me, turn?, round }` — `turn` incluye **siempre** `word` y `taboo[]` (información pública) |
| `game:playersUpdated` | `{ teams }` |
| `game:started` | `{ startedAt, settings }` |
| `game:finished` | `{ winnerTeamId \| null, standings: Array<{ teamId, name, score }>, mvp: { playerId, name, points } }` |
| `turn:started` | `{ turnId, teamId, descriptorId, word, taboo: string[], deadlineAt, turnSeconds }` |
| `turn:tick` | `{ remaining: number }` (1 por segundo) |
| `turn:ended` | `{ turnId, reason: 'CORRECT'\|'VIOLATION'\|'SKIPPED'\|'TIME', pointsDelta, teamId, cardDiscarded: boolean }` |
| `penalty:applied` | `{ reason, tabooWord?, teamId, pointsDelta, reportedBy, cardDiscarded: true }` |
| `score:updated` | `{ teams: Array<{ id, name, score, color }> }` |
| `round:ended` | `{ round, standings }` |
| `game:error` | `{ code: string, message: string }` |

### 8.3 Reglas de tiempo real

- El servidor es la autoridad: el temporizador se calcula con `deadlineAt` (timestamp absoluto), no con contadores de cliente. El cliente interpola solo para mostrar.
- El cliente conecta con `transports: ['websocket', 'polling']`, reintento con backoff y reconexión automática (`socket.io-client` con `reconnectionDelay` progresivo).
- Cada socket se asocia a `gameId` + `playerId` en el handshake; el servidor valida pertenencia antes de cada acción.
- Al reconectar, el cliente pide `game:reconnect` y reemplaza su estado local (no acumules eventos).
- **La palabra y las palabras prohibidas son públicas**: no hay redacción del estado. Lo que se valida por rol es **quién puede ejecutar cada acción** (marcar una palabra prohibida: equipo rival; adivinar: equipo que describe; aceptar: descriptor). Todas las validaciones viven en los casos de uso, no en los componentes.

---

## 9. Diseño visual

La fuente de verdad es `doc/directivas-diseno.md` (tokens, tipografía, componentes, motion, sonido,
accesibilidad). Las previews de referencia están en `doc/previews/` y describen cada pantalla:

| Pantalla | Preview |
|---|---|
| Inicio | `doc/previews/01-inicio.png` |
| Crear partida | `doc/previews/02-crear-partida.png` |
| Unirse con código | `doc/previews/03-unirse.png` |
| Sala de espera (móvil) | `doc/previews/04-lobby.png` |
| Sala de espera (desktop) | `doc/previews/11-desktop-lobby.png` |
| Juego — equipo que describe (móvil) | `doc/previews/05-juego-activo.png` |
| Juego — quien describe (móvil) | `doc/previews/06-juego-descriptor.png` |
| Juego — equipo rival, vigilante (móvil) | `doc/previews/07-juego-rival.png` |
| Juego — equipo que describe (desktop) | `doc/previews/12-desktop-juego-activo.png` |
| Juego — equipo rival (desktop) | `doc/previews/13-desktop-juego-rival.png` |
| Penalización | `doc/previews/08-penalizacion.png` |
| Marcador de ronda | `doc/previews/09-marcador.png` |
| Resultado final (móvil) | `doc/previews/10-resultado.png` |
| Resultado final (desktop) | `doc/previews/14-desktop-resultado.png` |

Reglas de implementación:

- **Mobile-first** (base 360–430px). La referencia primaria son las previews móviles; el layout de escritorio es la adaptación de tres columnas.
- Toda la UI en **español rioplatense**.
- Colores, espaciados y radios **solo desde tokens**. Cero valores literales en los componentes.
- **Prohibido violeta/lila/magenta/índigo** en cualquier estado, foco, glow o borde.
- **Prohibido** sombra, 3D, bisel o degradado sobre el texto.
- El rojo `--danger` se usa en las palabras prohibidas y en las penalizaciones (nunca en otro contexto).
- Íconos SVG (lucide-react), nunca emoji.
- Cada pantalla debe tener sus estados de **cargando** (skeleton), **vacío**, **error** y **reconectando**.
- Accesibilidad AA real: foco visible, área táctil ≥ 44px, `aria-live` en puntaje y cambio de turno, `role="alert"` en penalización, `prefers-reduced-motion` respetado.

---

## 10. Sonido

Implementá un `SoundProvider` con **Web Audio API sintetizada** (sin archivos de audio). Tabla de
evento → sonido en `doc/directivas-diseno.md` §8. Reglas: `AudioContext` creado suspendido y
reanudado con el primer gesto del usuario; botón de silencio siempre visible; volumen maestro 0.5;
estado persistido en `localStorage`; nunca dos sonidos superpuestos; el tick del timer solo en los
últimos 10 segundos.

---

## 11. Variables de entorno

`.env.example` con:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=tabu
PORT=3000
SOCKET_CORS_ORIGIN=http://localhost:3000
TURN_SECONDS_DEFAULT=45
MAX_TEAMS=4
MIN_PLAYERS_PER_TEAM=2
GAME_TTL_HOURS=24
```

Validá todo con Zod al arrancar: si falta una variable crítica, el server no levanta y lo dice claro.

---

## 12. Pantallas a construir

1. **Inicio** (`/`): logo, campo "¿Cómo te llamás?", botón Continuar, accesos a *Crear partida* y
   *Unirse con código*. El nombre se guarda en `localStorage` y se reutiliza.
2. **Crear partida** (`/crear`): nombre, mazo (chips), cantidad de equipos (segmented 2/3/4), tiempo
   por turno (chips 30/45/60), toggle de reparto aleatorio. Botón "Crear sala".
3. **Unirse** (`/unirse`): 6 cajas de código con foco automático en la primera, campo nombre,
   botón "Entrar a la sala".
4. **Sala de espera** (`/sala/[code]`): código grande con copiar, paneles de equipo con jugadores y
   estado "listo", opción de reparto automático, botón "Comenzar partida" (solo host).
5. **Juego — equipo que describe (activo)**: puntaje de ambos equipos, ronda, **palabra objetivo
   grande**, aviso ámbar "No digas estas palabras" + **chips de palabras prohibidas** (informativos,
   sin acción), temporizador circular, botón **"¡Adiviné!"** y "Pasar turno".
6. **Juego — quien describe**: banner ámbar "Sos quien describe", palabra objetivo, tira ámbar "Si
   decís una de estas, tu equipo pierde 1 punto", chips de palabras prohibidas, temporizador,
   **"Aceptar y pasar carta"** y "Reportar palabra prohibida".
7. **Juego — equipo rival (vigilante)**: banner verde azulado "Equipo rival · Vigilá", palabra
   objetivo, **los mismos chips de palabras prohibidas pero reportables** (táctiles, con badge de
   "!" en cada chip), temporizador, botones **"Reportar gesto"**, **"Reportar sonido"** y "Pasar
   turno". Al tocar un chip se reporta al instante (sin modal de confirmación: es un juego rápido y
   el servidor valida la palabra).
8. **Penalización**: cartel rojo con **la palabra marcada**, el equipo penalizado, el delta de
   puntos y la línea "La carta se anuló · pasa a la siguiente".
9. **Marcador de ronda**: puntajes comparados, próximo turno, mejor racha.
10. **Resultado final**: ganador (o empate), score final, ranking de jugadores, MVP, confeti sutil,
    botones "Volver a jugar" y "Salir a la sala".

En desktop, el layout es de tres columnas (equipos/marcador | palabra + palabras prohibidas | orden
de turno y acciones), según `11-desktop-lobby.png`, `12-desktop-juego-activo.png`,
`13-desktop-juego-rival.png` y `14-desktop-resultado.png`.

---

## 13. Calidad

- `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` deben pasar sin errores ni
  warnings.
- Tests del dominio (policies, value objects, máquina de estados) con **cobertura ≥ 80 % de
  branches** en `src/domain`.
- Tests de integración del flujo: crear → unirse → repartir → arrancar → turno con acierto →
  turno con penalización por palabra → turno con penalización por gesto → fin de partida.
- Test de **visibilidad pública**: el estado que recibe cualquier jugador contiene la palabra
  objetivo **y** la lista de palabras prohibidas (assert explícito).
- Test de **penalización por palabra**: marcar una palabra que **no** pertenece a la carta se
  rechaza sin puntaje y sin cerrar el turno; marcar una válida descuenta 1 punto, termina el turno
  y **descarta la carta** (no vuelve al mazo).
- Test de **autorización por rol**: el equipo rival puede marcar una palabra; un miembro del
  equipo que describe no puede penalizar a su propio equipo salvo el descriptor; solo el equipo
  que describe puede usar *Adiviné*.
- Test del temporizador con reloj falso (reloj inyectado).
- Test de reconexión: el jugador que vuelve recibe el estado correcto.
- Accesibilidad: roles, `aria-live`, foco visible, contraste AA.
- Los controles con semántica de accesibilidad salen de `src/ui/components/ui/` (Base UI): ningún
  componente reemplaza un botón, modal o select por un `<div onClick>`.
- `docker-compose.yml` con MongoDB 7 para desarrollo.
- `README.md` con: qué es, cómo levantar (local y docker), variables de entorno, cómo jugar, la
  arquitectura en un diagrama ASCII breve, el contrato de eventos Socket.IO y las decisiones
  asumidas.

---

## 14. Prohibiciones

- No login, registro, contraseñas, emails ni sesiones persistentes de usuario.
- No colores violeta, lila, morado, magenta o índigo en ningún contexto.
- No sombra, 3D, bisel, relieve ni degradado sobre texto.
- No ocultar las palabras prohibidas: son públicas. Lo que se valida es qué acción puede ejecutar cada rol.
- No decidir puntaje ni tiempo desde el cliente.
- No usar `npm` ni `bun`; todo con **pnpm** (v11) y Corepack.
- No sumar librerías de UI completas (MUI **Core** —distinto de Base UI—, Ant Design, Chakra, Mantine, HeroUI/NextUI, Bootstrap): el design system vive en `doc/directivas-diseno.md` y en `src/ui/components/ui/`.
- No usar emoji como iconografía.
- No detectar palabras prohibidas automáticamente (no hay STT).
- No dejar `TODO`, código muerto ni features a medias: si algo no entra en el alcance, sacalo
  limpio en vez de dejarlo a medias.
- No agregar analítica, tracking ni servicios externos.

---

## 15. Criterios de aceptación (Definition of Done)

- [ ] `pnpm install && pnpm seed && pnpm dev` levanta la app con Next + Socket.IO en el mismo puerto.
- [ ] Dos navegadores pueden crear/unirse una sala, verse los turnos en tiempo real y jugar un turno completo.
- [ ] **Todos los dispositivos muestran la palabra objetivo y la lista de palabras prohibidas.**
- [ ] Con el equipo rival, tocar el chip de la palabra que se dijo descuenta 1 punto al equipo que describe, **anula la carta** y pasa a la siguiente (verificable en DevTools).
- [ ] Tocar una palabra que no está en la carta no penaliza a nadie.
- [ ] Acierto suma 1, penalización resta 1, skip y timeout no modifican el puntaje.
- [ ] El temporizador lo cuenta el servidor y todos los clientes ven lo mismo.
- [ ] Al recargar la página, el jugador vuelve a su partida y a su turno.
- [ ] Los mazos salen de MongoDB y el seed crea 3 mazos jugables.
- [ ] Las 10 pantallas existen, tienen sus estados de carga/error/vacío y coinciden con las previews.
- [ ] No hay un solo color violeta en la UI, ni texto con sombra/3D.
- [ ] Hay sonido en las interacciones principales, con mute persistente.
- [ ] Lint, typecheck, tests y build pasan limpios.
- [ ] `README.md` permite a otra persona levantar y jugar sin preguntarte nada.
