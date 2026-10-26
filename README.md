# Tabú

Juego de Tabú multijugador en tiempo real. 2–4 equipos, cada jugador en su propio dispositivo, sin
registro: solo un nombre. La palabra objetivo y la lista de palabras prohibidas **no** se muestran a
todo el mundo: el descriptor y el equipo rival las ven, el resto de su equipo adivina.

- **Equipo que describe**: el descriptor ve la palabra y los chips en modo informativo, y además
  *Pasar turno*, *Aceptar y pasar carta* y *Reportar gesto* / *Reportar sonido*.
- **Equipo que adivina**: ve la carta en blanco y escribe la respuesta en un **chat privado**; el
  servidor la verifica contra la carta activa y le confirma el acierto.
- **Equipo rival**: ve la palabra y los chips, pero **reportables** al toque; reporta gesto y sonido.

Stack: Next.js 15 (App Router) + TypeScript estricto, Socket.IO 4.8 sobre un servidor HTTP propio,
MongoDB 7 + Mongoose 8, Tailwind v4 con tokens, Zod 4, Base UI y Vitest.

## Levantarlo

Requisitos: Node 22, pnpm 11 (Corepack) y Docker (o un MongoDB 7 accesible).

```bash
corepack enable
pnpm install
docker compose up -d          # MongoDB 7 en localhost:27017
cp .env.example .env          # ajustá si usás otro puerto/host
pnpm seed                     # 3 mazos: General (120), Cine y TV (60), Deportes (60)
pnpm dev                      # http://localhost:3000
```

Para producción:

```bash
pnpm build
pnpm start
```

### Si ves una pantalla en blanco con `invariant expected layout router to be mounted`

Es un `.next` mezclado: `next build` y `next dev` escriben en la misma carpeta y el segundo arranque
hereda manifests del primero. Se arregla limpiando:

```bash
pnpm clean      # borra .next
pnpm dev        # o pnpm build && pnpm start
```

Regla práctica: **no alternes `dev` y `build` sobre el mismo `.next` sin limpiar**, y si cambiaste de
modo, recargá el navegador con caché deshabilitada (Ctrl+Shift+R).

Jugar: abrí la app en el teléfono o el navegador, poné tu nombre, **Crear partida** (elegís mazo,
equipos, tiempo por turno de 30/60/90/120 s y cuántas palabras prohibidas tiene cada carta, de 1 a 6)
y compartí el código de 6 caracteres. Los demás entran con **Unirse con código**. Cuando cada equipo
tenga el mínimo de jugadores, el host toca **Comenzar partida**.

### Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `MONGODB_URI` | — (obligatoria) | Conexión a Mongo |
| `MONGODB_DB` | `tabu` | Base de datos |
| `PORT` | `3000` | Puerto HTTP y de Socket.IO (comparten) |
| `HOST` | `0.0.0.0` | Interfaz de escucha (la LAN necesita `0.0.0.0`) |
| `SOCKET_CORS_ORIGIN` | `http://localhost:3000` | Origen permitido por Socket.IO |
| `TURN_SECONDS_DEFAULT` | `60` | Duración cuando el host no elige (30, 60, 90 o 120) |
| `MAX_TEAMS` | `4` | Tope de equipos |
| `MIN_PLAYERS_PER_TEAM` | `2` | Mínimo por equipo para arrancar |
| `GAME_TTL_HOURS` | `24` | TTL de las partidas terminadas |

Si falta `MONGODB_URI` el servidor no arranca y dice cuál falta. Si Mongo no responde al arrancar,
el servidor igual levanta en modo memoria (las partidas se juegan, los snapshots se pierden).

## Cómo está armado

```
Cliente Next (client components)
  GameProvider (socket único, estado completo, reconexión)
      │ eventos tipados + ack
      ▼
server.ts ── Next handler + Socket.IO en el mismo puerto
  infrastructure/socket → handlers finos (Zod → caso de uso → broadcast)
      │
      ├── application/use-cases (autorización por rol, orquestación)
      │        └── domain (entidades, value objects, policies, state machine)
      └── infrastructure/db (Mongoose: snapshots asíncronos)
```

- El agregado `Game` vive **en memoria** (`GameRegistry`): es la fuente de verdad del tiempo real.
  Mongo guarda snapshots de forma asíncrona y tolerante a fallos; el turno nunca espera a la base.
- El dominio no conoce sockets, Mongoose ni `Date.now()`: el tiempo entra por un puerto `Clock`.
- Un intervalo por partida emite `turn:tick` y cierra por `deadlineAt` absoluto, no por acumulación.
- Al reconectar, el cliente reemplaza su estado con `game:reconnect`; nunca acumula eventos.

## Contrato Socket.IO

Cliente → servidor:

| Evento | Payload | Ack | Quién |
|---|---|---|---|
| `game:create` | `{ playerName, deckId, options? }` | `{ gameId, code, playerToken, playerId }` | cualquiera |
| `game:join` | `{ code, playerName }` | `{ gameId, playerToken, playerId, playerName }` | cualquiera |
| `game:reconnect` | `{ gameId, playerToken }` | `{ state }` | el mismo jugador |
| `game:assignTeam` | `{ teamId }` | — | en la sala |
| `game:autoTeams` / `game:ready` | — | — | en la sala |
| `game:start` | — | — | solo el host |
| `game:leave` | — | — | cualquiera |
| `turn:guess` | `{ guess }` | `{ correct, pointsAwarded, teamScore }` | equipo que adivina |
| `turn:reportViolation` | `{ reason, tabooWord? }` | `{ pointsDelta, teamScore }` | rival o descriptor |
| `turn:skip` | — | — | solo el descriptor |
| `turn:pass` | — | — | equipo que describe |

Servidor → cliente: `game:state` (por socket, con `me` y la palabra filtrada por rol), `game:playersUpdated`, `game:started`,
`turn:started`, `turn:tick`, `turn:ended`, `penalty:applied`, `score:updated`, `round:ended`,
`game:finished`, `game:error`.

`turn:guess` solo lo puede enviar un teammate del equipo que describe: el servidor compara la
respuesta con la carta activa, sin distinguir mayúsculas, y devuelve `correct`. Un acierto suma el
punto y cierra el turno; una respuesta equivocada no cambia nada. La palabra objetivo viaja solo en
el `game:state` de quien tiene rol `DESCRIBER` o `RIVAL`.

Todo error de acción viaja en el ack (`{ error: { code, message } }`) **y** como `game:error` al
mismo socket. Los códigos son estables (`INVALID_TABOO_WORD`, `NOT_ALLOWED`, `INVALID_STATE`,
`GAME_NOT_FOUND`, `TEAM_FULL`, …).

## Calidad

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Sin errores ni warnings. La suite cubre dominio, casos de uso, repositorios (contra Mongo real si
`MONGODB_URI_TEST` está definido y se saltean si no), el servidor de socket, la partida completa por
socket, el contrato que consume la UI y los componentes con Testing Library. Cobertura de
`src/domain` con `pnpm test:coverage`: **95,1 % statements y 95,97 % branches** (umbral 80 %).

## Decisiones asumidas

El detalle completo y con contexto está en [`odd/tasks/tabu.md`](odd/tasks/tabu.md) (D1–D50). Las
que más afectan el uso:

- **Next 15, no 16.** El scaffold usa `create-next-app@15.5.28` porque la spec pide 15 y 16 elimina
  `next lint` (D1). Lint corre como gate propio (`eslint .`), sin warnings (D2).
- **UI sin `application`.** Las pantallas importan solo tipos y el contrato de eventos: así Mongoose
  y Node nunca entran al bundle del cliente (D3).
- **El servidor es la autoridad.** El cliente nunca manda puntos ni tiempo; solo acciones. El
  temporizador se calcula con `deadlineAt` absoluto (S10).
- **`turn:pass` además de `turn:skip`.** *Pasar turno* (equipo activo) devuelve la carta al mazo sin
  puntos; *Aceptar y pasar carta* (solo descriptor) se la entrega al rival (D42, D38).
- **`turn:skip` es solo del descriptor**, aunque el preview muestre más botones: manda el contrato de
  socket, y el rival no tiene acción de pase (D48).
- **Jugadores sin equipo.** Se puede esperar el reparto en el lobby; para arrancar, o todos eligieron
  equipo o la sala usa reparto automático (D35, D49).
- **`GET /api/decks`.** El catálogo de mazos va por HTTP porque el contrato de socket no lo expone
  (D43).
- **Una ruta, pantallas por estado.** El cliente no navega entre rutas: cambia de pantalla según el
  estado de la partida, así el socket y el `playerToken` sobreviven (D44).
- **Mongo caído no bloquea.** El servidor arranca en modo memoria con un warning (D41).
- **Sonido sintetizado.** Web Audio, sin archivos, mute persistido y desbloqueo con el primer gesto
  (§8).
- **Cobertura.** `pnpm test:coverage` mide `src/domain`: 95,1 % statements / 95,97 % branches, por
  encima del umbral de 80 % (la nota vieja D28 quedó obsoleta). Los tests de componentes con React 19
  + Vitest **sí** corren (jsdom): la UI se cubre con Testing Library (D47 quedó obsoleto).
- **La palabra objetivo es del descriptor y del rival.** El equipo que adivina no la ve en ningún
  evento, ni al reconectar; escribe la respuesta y el servidor la verifica (S4).
- **Códigos de sala y nombres.** 6 caracteres sin `I`, `O`, `0` ni `1`; nombres repetidos se
  desambiguan con sufijo (`Luz`, `Luz (2)`).
- **Partida en memoria.** Un reinicio del servidor descarta las partidas en curso; recargar la página
  sí recupera el estado con el token (D9).
