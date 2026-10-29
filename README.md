# Tabú

Juego de Tabú multijugador en tiempo real. 2–4 equipos, cada jugador en su propio dispositivo, sin
registro: solo un nombre. La palabra objetivo y la lista de palabras prohibidas **no** se muestran a
todo el mundo: el descriptor y el equipo rival las ven, el resto de su equipo adivina.

- **Quien describe**: ve _Comenzar turno_ antes de que arranque el reloj. Durante el turno ve la
  palabra, los chips informativos y _Saltar esta carta_. No hay botón para saltar el turno.
- **Equipo que adivina**: ve la carta en blanco y escribe la respuesta en un **chat privado**; el
  servidor la verifica contra la carta activa y le confirma el acierto.
- **Equipos rivales**: ven la palabra y los chips **reportables** al toque durante el turno activo.

Al comenzar la partida se sortean el equipo inicial y su descriptor. Los equipos se alternan a
partir de ese equipo; dentro de cada equipo se sortea entre quienes todavía no describieron, sin
repetir hasta que pasen todos. Cada turno espera a que el descriptor pulse _Comenzar turno_: recién
entonces se revela la carta y comienza el reloj completo. Mientras se espera no se puede adivinar,
saltar ni reportar cartas. El reloj vuelve a esperar esa confirmación al cambiar de equipo.

Stack: Next.js 15 (App Router) + TypeScript estricto, Socket.IO 4.8 sobre un servidor HTTP propio,
MongoDB 7 + Mongoose 8, Tailwind v4 con tokens, Zod 4, Base UI y Vitest.

Durante el turno, el cronómetro aparece en el sidebar derecho, apilado arriba en móvil. El panel de
actividad combina respuestas privadas y avisos públicos: quienes adivinan pueden escribir; el
descriptor y los rivales solo ven notificaciones. Los avisos muestran la palabra saltada, quién
marcó una prohibida, la carta anulada y el equipo penalizado, con colores, etiquetas e íconos.
Las respuestas y su confirmación nunca se comparten. Los avisos se conservan al cambiar de carta
dentro del mismo turno y se reinician al seleccionar el turno siguiente, salir o cambiar de sala.

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

### Aplicación en Docker

La imagen compila Next.js y arranca el servidor propio de HTTP y Socket.IO como usuario sin
privilegios. Requiere `MONGODB_URI` al ejecutar; `.env`, credenciales y dependencias del equipo
local quedan fuera del contexto de construcción.

Con Docker Desktop y el MongoDB local del compose, usando `.env` basado en `.env.example`:

```bash
docker compose up -d mongo
docker build -t tabu:local .
docker run -d --rm --name tabu-app -p 3000:3000 --env-file .env -e MONGODB_URI=mongodb://host.docker.internal:27017 tabu:local
docker exec tabu-app node --import tsx src/infrastructure/seed/seed.ts
```

Abrir `http://localhost:3000`. `localhost` dentro del contenedor no apunta al host: para otro
despliegue, proporcionar la URI real de MongoDB y el origen público en `SOCKET_CORS_ORIGIN`.
En Linux sin Docker Desktop, agregar `--add-host host.docker.internal:host-gateway` al comando
`docker run` si MongoDB está en el host.

```bash
docker inspect --format '{{.State.Health.Status}}' tabu-app
docker logs -f tabu-app
docker stop tabu-app
```

La imagen incluye `tsx` y el árbol instalado del lockfile porque el servidor personalizado ejecuta
TypeScript en producción. No usa `next start` ni el servidor standalone, que omitirían Socket.IO.

### Panel de administración

El panel está en `/admin`. Los mazos creados desde allí se administran por separado de los tres
mazos originales; las partidas que ya comenzaron conservan sus cartas.

La pestaña **Crear mazo** contiene el formulario de generación; **Mazos** permite revisar las
cartas y pedir nuevas generaciones o reemplazos. El progreso en vivo se mantiene visible al
cambiar de pestaña, y el formulario conserva los datos todavía no enviados.

En **Mazos** también se edita el nombre y la temática del mazo (hasta 80 y 200 caracteres),
se archiva y se restaura. El archivado es recuperable: no borra nada, conserva las cartas,
los hallazgos de validación, el historial y el mismo identificador público, y el mazo deja de
aceptar generaciones, reemplazos o cambios de cartas hasta restaurarlo. El catálogo muestra
por defecto sólo los mazos activos; el filtro **Mostrar archivados** trae los archivados
para poder seleccionarlos y restaurarlos. Un mazo archivado también ofrece **Eliminar definitivamente**:
requiere una segunda confirmación y borra el mazo, sus cartas y su historial de generación;
no se puede deshacer. No se añade protección especial para partidas en curso. El servidor conserva
únicamente una marca pública vacía y anónima para impedir publicaciones atrasadas, no las cartas
ni el nombre original. Si la limpieza falla, reintentar la eliminación la completa.
Editar, archivar, restaurar y eliminar se rechazan mientras
el mazo tiene una generación o un reemplazo en curso. Cambiar la temática afecta sólo a las
generaciones futuras: las cartas guardadas no se regeneran.

Encolar una generación reserva el mazo antes de publicar el trabajo. Si el proceso se cae en
ese instante, la recuperación libera la reserva y descarta el trabajo pendiente: nunca queda
un trabajo a medio ejecutar ni un mazo bloqueado para siempre.

Configurar estas variables únicamente en el servidor, en `.env` o en el entorno del contenedor:

| Variable               | Uso                                                               |
| ---------------------- | ----------------------------------------------------------------- |
| `ADMIN_USERNAME`       | Usuario del administrador.                                        |
| `ADMIN_PASSWORD`       | Contraseña larga y exclusiva para este panel.                     |
| `ADMIN_SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres para firmar sesiones. |
| `DEEPSEEK_API_KEY`     | Clave de DeepSeek para generar cartas y reemplazos.               |

Sin las tres variables de acceso, la administración permanece deshabilitada; el juego sigue
funcionando. Las claves nunca se envían al navegador. En producción, servir el panel mediante
HTTPS para que el navegador envíe la cookie segura de sesión. Cambiar credenciales o secreto
invalida las sesiones anteriores.

La protección de origen compara `Origin` con el protocolo de la petición y su cabecera `Host`,
no con la dirección de escucha `HOST` (que puede ser `0.0.0.0`). El proxy debe conservar el
`Host` público y el protocolo original. No se confía en `X-Forwarded-Host`; no configurar un
proxy que reescriba esos valores sin una política explícita de confianza y verificación.

Desde el panel se indica nombre, temática y cantidad de cartas (1–1200 por trabajo). DeepSeek Flash
propone hasta 12 candidatas ordenadas por objetivo, en solicitudes de hasta 50 cartas. Por ejemplo,
800 cartas requieren 16 lotes completos; el último lote pide solo la cantidad que falta. El servidor
descarta frases y duplicados, verifica la ortografía sobre el texto original con `nspell` y conserva
las primeras seis prohibidas válidas. No usa Jev, puntuaciones mínimas ni cortes de confianza.

La opción **Permitir nombres propios y títulos** se configura al crear o editar cada mazo y está
desactivada por defecto. Al activarla, los próximos objetivos pueden ser nombres o títulos de
varias palabras, como `Juego de tronos`, con números y puntuación habitual de títulos. Las seis
prohibidas siguen siendo palabras individuales reconocidas por el diccionario y no pueden repetir
componentes del objetivo. Un nombre propio no se excluye solo por no figurar en el diccionario;
eso tampoco garantiza su ortografía ni su existencia. Revisar editorialmente los resultados.
Cambiar esta opción no modifica ni revalida cartas existentes y no afecta las partidas en curso.

Las cartas dudosas o incompletas quedan excluidas automáticamente. El administrador puede ver
las advertencias, habilitar explícitamente una carta con seis prohibidas o pedir un reemplazo
automático. La habilitación manual no elimina los hallazgos del diccionario. Una palabra desconocida
puede ser un regionalismo; el corrector no verifica significado ni garantiza calidad editorial.

Generar y reemplazar consume la API de DeepSeek. Los trabajos se guardan en MongoDB, tienen
límites de intentos y se procesan desde el servidor personalizado; no iniciar con `next start`.
El panel muestra progreso y errores, y conserva lo completado si una llamada falla. Los reemplazos
se solicitan por carta y no cambian las partidas en curso. Las pruebas automatizadas usan un
proveedor simulado, no llamadas pagas.

Los lotes incompletos o con objetivos repetidos se recuperan con reintentos acotados; nunca se
marca un trabajo como completado si faltan cartas. Los trabajos nuevos usan lotes de 50, mientras
que los ya guardados conservan su tamaño de lote y su presupuesto. Los hallazgos del diccionario
siguen excluyendo cartas dudosas: aumentar la cantidad no omite esa validación. Las llamadas
iniciales grandes tienen un límite de respuesta de hasta 20000 tokens y un timeout de 45 segundos;
los completados individuales conservan el presupuesto pequeño. El lease se renueva entre cartas.

El listado de cartas muestra 50 por página, con controles **Anterior/Siguiente** y contadores.
El filtro **Solo excluidas** se aplica antes de paginar; cambiar el mazo o el filtro vuelve a
la primera página. Las acciones de las cartas y el progreso en vivo siguen disponibles.

El progreso del administrador se entrega por Socket.IO en el mismo puerto del servidor,
en un canal privado autenticado con la cookie de sesión. No utiliza consultas periódicas
desde el navegador: al conectar o reconectar recupera el estado guardado del trabajo y
después recibe sus actualizaciones. Si la conexión se interrumpe, el trabajo continúa en
MongoDB y el panel vuelve a sincronizarse al recuperar la conexión. El proxy debe permitir
WebSocket; los sockets de las partidas permanecen separados del canal administrativo.

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

| Variable               | Default                 | Para qué                                            |
| ---------------------- | ----------------------- | --------------------------------------------------- |
| `MONGODB_URI`          | — (obligatoria)         | Conexión a Mongo                                    |
| `MONGODB_DB`           | `tabu`                  | Base de datos                                       |
| `PORT`                 | `3000`                  | Puerto HTTP y de Socket.IO (comparten)              |
| `HOST`                 | `0.0.0.0`               | Interfaz de escucha (la LAN necesita `0.0.0.0`)     |
| `SOCKET_CORS_ORIGIN`   | `http://localhost:3000` | Origen permitido por Socket.IO                      |
| `TURN_SECONDS_DEFAULT` | `60`                    | Duración cuando el host no elige (30, 60, 90 o 120) |
| `MAX_TEAMS`            | `4`                     | Tope de equipos                                     |
| `MIN_PLAYERS_PER_TEAM` | `2`                     | Mínimo por equipo para arrancar                     |
| `GAME_TTL_HOURS`       | `24`                    | TTL de las partidas terminadas                      |

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

| Evento                          | Payload                            | Ack                                             | Quién                                                            |
| ------------------------------- | ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `game:create`                   | `{ playerName, deckId, options? }` | `{ gameId, code, playerToken, playerId }`       | cualquiera                                                       |
| `game:join`                     | `{ code, playerName }`             | `{ gameId, playerToken, playerId, playerName }` | cualquiera                                                       |
| `game:reconnect`                | `{ gameId, playerToken }`          | `{ state }`                                     | el mismo jugador                                                 |
| `game:assignTeam`               | `{ teamId }`                       | —                                               | en la sala                                                       |
| `game:autoTeams` / `game:ready` | —                                  | —                                               | en la sala                                                       |
| `game:start`                    | —                                  | —                                               | solo el host                                                     |
| `game:leave`                    | —                                  | —                                               | cualquiera                                                       |
| `turn:guess`                    | `{ guess }`                        | `{ correct, pointsAwarded, teamScore }`         | equipo que adivina                                               |
| `turn:reportViolation`          | `{ reason, tabooWord? }`           | `{ pointsDelta, teamScore }`                    | solo rivales para palabras; rival o descriptor para gesto/sonido |
| `turn:skip`                     | —                                  | —                                               | solo el descriptor                                               |
| `turn:start`                    | —                                  | —                                               | solo el descriptor elegido, antes de iniciar el reloj            |

Servidor → cliente: `game:state` (por socket, con `me` y la palabra filtrada por rol), `game:playersUpdated`, `game:started`,
`turn:started`, `turn:tick`, `turn:ended`, `card:resolved`, `penalty:applied`, `score:updated`, `round:ended`,
`game:finished`, `game:error`.

La palabra objetivo y las prohibidas son visibles para quien describe y todos los equipos rivales,
pero no para los compañeros que adivinan. Solo los jugadores de otros equipos pueden marcar una
palabra prohibida: se descarta la carta activa y se resta un punto al equipo que describe.
Ni el descriptor ni sus compañeros pueden marcar esas palabras, incluso enviando el evento directamente.

`turn:guess` solo lo puede enviar un teammate del equipo que describe: el servidor compara la
respuesta con la carta activa, sin distinguir mayúsculas, y devuelve `correct`. Un acierto suma el
punto y cambia la carta, sin cambiar el descriptor, el equipo, el reloj ni los saltos usados;
una respuesta equivocada no cambia nada. Durante toda la ronda del reloj describe la misma persona
y adivina el resto de su equipo. Una penalización descarta la carta y resta un punto, pero tampoco
reinicia el reloj ni cambia al descriptor. Si no quedan cartas disponibles, se pasa al rival si
tiene cartas pendientes, o termina la partida. La palabra objetivo viaja solo en
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
- **Solo se saltan cartas, no turnos.** `turn:skip` entrega la carta al siguiente equipo rival sin
  reiniciar el reloj. El turno cambia por tiempo agotado o falta de cartas disponibles.
- **`turn:skip` es solo del descriptor**, aunque el preview muestre más botones: manda el contrato de
  socket, y el rival no tiene acción de pase (D48).
- **Jugadores sin equipo.** Se puede esperar el reparto en el lobby; para arrancar, o todos eligieron
  equipo o la sala usa reparto automático (D35, D49).
- **`GET /api/decks`.** El catálogo de mazos va por HTTP porque el contrato de socket no lo expone
  (D43).
- **Una ruta, pantallas por estado.** El cliente no navega entre rutas: cambia de pantalla según el
  estado de la partida, así el socket y el `playerToken` sobreviven (D44).
- **Mongo caído no bloquea.** El servidor arranca en modo memoria con un warning (D41).
- **Sonido sintetizado.** Web Audio sin archivos ni dependencias adicionales: timbres suaves con
  armónicos, transiciones progresivas, ruido filtrado y mezcla con compresión ligera y ambiente corto.
  Se mantienen el mute persistido, el desbloqueo con el primer gesto y los efectos de menos de 700 ms.
- **Cobertura.** `pnpm test:coverage` mide `src/domain`: 95,1 % statements / 95,97 % branches, por
  encima del umbral de 80 % (la nota vieja D28 quedó obsoleta). Los tests de componentes con React 19
  - Vitest **sí** corren (jsdom): la UI se cubre con Testing Library (D47 quedó obsoleto).
- **La palabra objetivo es del descriptor y del rival.** El equipo que adivina no la ve en ningún
  evento, ni al reconectar; escribe la respuesta y el servidor la verifica (S4).
- **Códigos de sala y nombres.** 6 caracteres sin `I`, `O`, `0` ni `1`; nombres repetidos se
  desambiguan con sufijo (`Luz`, `Luz (2)`).
- **Partida en memoria.** Un reinicio del servidor descarta las partidas en curso; recargar la página
  sí recupera el estado con el token (D9).
