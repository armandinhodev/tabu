# Tabú

[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![DeepSeek Flash](https://img.shields.io/badge/DeepSeek_Flash-4D6BFE)](https://api-docs.deepseek.com/)

Juego de Tabú multijugador en tiempo real. 2–4 equipos, cada jugador en su propio dispositivo, sin
registro: solo un nombre. La palabra objetivo y la lista de palabras prohibidas **no** se muestran a
todo el mundo: el descriptor y el equipo rival las ven, el resto de su equipo adivina.

- **Quien describe**: ve _Comenzar turno_ antes de que arranque el reloj. Durante el turno ve la
  palabra, los chips informativos y _Saltar esta carta_, a la derecha de la palabra objetivo.
  En móvil, el botón muestra el ícono de salto. No hay botón para saltar el turno.
- **Equipo que adivina**: ve la carta en blanco y escribe la respuesta en un **chat privado**; el
  servidor la verifica contra la carta activa y le confirma el acierto.
- **Equipos rivales**: ven la palabra y los chips **reportables** al toque durante el turno activo.

Al comenzar la partida se sortean el equipo inicial y su descriptor. Los equipos se alternan a
partir de ese equipo; dentro de cada equipo se sortea entre quienes todavía no describieron, sin
repetir hasta que pasen todos. Cada turno espera a que el descriptor pulse _Comenzar turno_: recién
entonces se revela la carta y comienza el reloj completo. Mientras se espera no se puede adivinar,
saltar ni reportar cartas. El reloj vuelve a esperar esa confirmación al cambiar de equipo.

Stack: Next.js 15 (App Router) + TypeScript estricto, Socket.IO 4.8 sobre un servidor HTTP propio,
MongoDB 7 + Mongoose 8, Tailwind v4 con tokens, Zod 4, Base UI, Motion y Vitest.

Durante el turno, el cronómetro aparece en el sidebar derecho. En móvil, el resumen y el reloj
comparten una fila compacta sobre la carta; en escritorio, los paneles laterales dejan más espacio
al contenido central. El panel de
puntajes enfrenta los nombres y resultados de dos equipos; con tres o cuatro, muestra una fila de
bloques con el nombre arriba y el puntaje debajo. El equipo activo se destaca con su color.
El panel de
actividad combina respuestas privadas y avisos públicos: quienes adivinan pueden escribir; el
campo de respuesta aparece antes del historial para no quedar desplazado por los avisos. El
descriptor y los rivales solo ven notificaciones. Los avisos muestran la palabra saltada, quién
marcó una prohibida, la carta anulada y el equipo penalizado, con colores, etiquetas e íconos.
El panel no repite los avisos de inicio o fin del turno: esa información se consulta en el sidebar.
La lista de jugadores muestra nombres y distintivos de rol, sin avatares con iniciales.
Las respuestas y su confirmación nunca se comparten. Los avisos se conservan al cambiar de carta
dentro del mismo turno y se reinician al seleccionar el turno siguiente, salir o cambiar de sala.

Una respuesta con **un solo error de tipeo** cuenta como acierto, siempre que el objetivo tenga
al menos cinco letras. Se toleran una letra cambiada, faltante, sobrante o dos letras contiguas
intercambiadas. Una respuesta que es una palabra real del diccionario español se exige exacta,
para que `santo` no valga por `canto`; la comprobación corre en el servidor y la palabra objetivo
nunca se envía a quien adivina. Por eso un error que forma otra palabra válida, como `fugo`, se
rechaza: la corrección automática nunca inventa el acierto.

## Levantarlo

Requisitos: Node 22, pnpm 11 (Corepack) y Docker (o un MongoDB 7 accesible).

```bash
corepack enable
pnpm install
docker compose up -d          # MongoDB 7 en localhost:27017
cp .env.example .env          # ajustá si usás otro puerto/host
pnpm seed                     # 3 mazos: General (120), Cine y TV (60), Deportes (60)
pnpm dev                      # http://localhost:3000 (landing) y /jugar (sala)
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

Abrir `http://localhost:3000` para la landing y `http://localhost:3000/jugar` para crear o unirse a
una sala. `localhost` dentro del contenedor no apunta al host: para otro
despliegue, proporcionar la URI real de MongoDB y el origen público en `SOCKET_CORS_ORIGIN`.
En Linux sin Docker Desktop, agregar `--add-host host.docker.internal:host-gateway` al comando
`docker run` si MongoDB está en el host.

```bash
docker inspect --format '{{.State.Health.Status}}' tabu-app
docker logs -f tabu-app
docker stop tabu-app
```

La imagen incluye `tsx` y el árbol instalado del lockfile porque el servidor personalizado ejecuta
TypeScript en producción. También copia `public/` para servir los assets estáticos del panel
(por ejemplo, el logo de DeepSeek). No usa `next start` ni el servidor standalone, que omitirían
Socket.IO.

### Panel de administración

El panel está en `/admin`. Los mazos creados desde allí se administran por separado de los tres
mazos originales; las partidas que ya comenzaron conservan sus cartas.

La pestaña **Crear mazo** contiene el formulario de generación; **Mazos** permite revisar las
cartas y pedir nuevas generaciones o reemplazos. El progreso en vivo se mantiene visible al
cambiar de pestaña, y el formulario conserva los datos todavía no enviados.
Al crear, generar más cartas o reemplazar una carta, el progreso muestra de inmediato
**Preparando solicitud a DeepSeek…**, seguido del estado de cola o de espera de las primeras
cartas. Al completar el trabajo, la barra desaparece y queda una confirmación breve;
si falla, el error permanece visible. El resumen de un trabajo finalizado se descarta al cambiar
de pestaña y no reaparece al volver; un trabajo en curso mantiene su progreso visible.

En **Mazos**, el catálogo identifica el mazo seleccionado con texto e icono. Cada mazo abre
**Cartas** por defecto; allí se revisan las cartas y **Generar más cartas** despliega la cantidad
a generar. La subpestaña **Ajustes** reúne los datos del mazo y las acciones de archivado o eliminación,
separadas del formulario. Cambiar de subpestaña conserva los cambios sin guardar, los filtros,
la página y la cantidad a generar, y no interrumpe el progreso de un trabajo activo.
**Buscar cartas** se combina con **Solo excluidas** y filtra en vivo por objetivo o palabra prohibida sin distinguir
mayúsculas ni tildes, sin nuevas peticiones al servidor. La búsqueda se aplica antes de paginar,
vuelve a la primera página y se limpia al seleccionar otro mazo. **Limpiar búsqueda** restaura el
listado conservando el filtro de excluidas. Cuando no hay coincidencias se muestra una indicación.
El filtro **Solo excluidas**
ofrece volver a todas las cartas cuando no hay coincidencias; los controles de paginación
aparecen al final de la lista y mantienen las 20 cartas por página.

En **Configuración**, el logo de DeepSeek acompaña la selección global **Flash / Pro**.
**Guardar configuración** persiste el modelo en MongoDB para todos los administradores y mazos,
incluso después de reiniciar el servidor. Flash (`deepseek-flash`) es el valor predeterminado;
Pro usa `deepseek-v4-pro`. La selección se copia al encolar cada generación o reemplazo: cambiarla
no modifica los trabajos ya encolados o en curso. Los trabajos antiguos sin modelo usan Flash.
No hay cambio automático entre modelos; la clave de API sigue configurada sólo en el servidor.

En **Mazos** también se edita el nombre y la temática del mazo (hasta 80 y 200 caracteres),
además de las reglas para palabras prohibidas (hasta 500 caracteres). La temática y las reglas
se editan en campos multilínea; vaciar las reglas y guardar las elimina para futuras generaciones.
También se archiva y se restaura. Archivar y eliminar abren un diálogo con el nombre del mazo y
las consecuencias; cancelar o pulsar Escape lo cierra sin realizar cambios.
Las confirmaciones del admin destacan el nombre de la carta o del mazo y explican si la acción
es recuperable. Los botones usan etiquetas directas: **Archivar mazo**, **Eliminar mazo** y
**Eliminar carta**. El contenido largo se desplaza sin ocultar los botones. El foco inicial está en cancelar;
también se puede cerrar con el botón **Cerrar confirmación**, sin ejecutar la acción.
El archivado es recuperable: no borra nada, conserva las cartas,
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

Desde el panel se indica nombre, temática y cantidad de cartas (1–600 por trabajo).
**Temática e indicaciones** y **Reglas para buscar palabras prohibidas** son campos multilínea.
Las reglas son opcionales (hasta 500 caracteres), se configuran al crear o editar el mazo y se conservan
para las próximas generaciones, los reemplazos y las peticiones para completar cartas.
Se envían solo al pedir palabras prohibidas, no al seleccionar objetivos, y no reemplazan las
validaciones del servidor. Los mazos sin reglas mantienen su comportamiento anterior.
La generación
tiene dos fases: primero el modelo propone los objetivos del trabajo en una sola llamada, el
servidor descarta los repetidos o mal formados, y después pide las prohibidas de esos objetivos en
lotes de hasta 50. Así no se gasta una llamada en las prohibidas de un objetivo que iba a
descartarse. Por ejemplo, 200 cartas requieren una llamada de objetivos y cuatro lotes de
prohibidas; el último pide solo la cantidad que falta. El servidor
descarta frases y duplicados, verifica la ortografía sobre el texto original con `nspell` y conserva
las primeras seis prohibidas válidas. No usa Jev, puntuaciones mínimas ni cortes de confianza.
Las propuestas se validan antes de seleccionar esas seis, respetando su orden de ranking.
Las cartas nuevas o editadas conservan solo las candidatas seleccionadas, no las descartadas;
el panel no muestra el antiguo desplegable de candidatas. No se migran cartas ya guardadas.
Si el tema no alcanza para la cantidad pedida, el trabajo termina explícitamente e informa cuántas
cartas se generaron en vez de completarse a medias.

La opción **Permitir nombres propios y títulos** se configura al crear o editar cada mazo y está
desactivada por defecto. Al crear el mazo, **¿Qué permite esta opción?** despliega una explicación
con ejemplos y las diferencias de validación. Al activarla, los próximos objetivos pueden ser nombres o títulos de
varias palabras, como `Juego de tronos`, con números y puntuación habitual de títulos. Las seis
prohibidas también pueden ser nombres propios o títulos de varias palabras, como `Ned Stark`,
y no pueden repetir el objetivo ni sus componentes individuales.
Con esta opción activada, las prohibidas no se consultan en el diccionario: pueden ser nombres
propios y se conservan las primeras seis válidas por estructura, orden y ausencia de duplicados.
Con la opción desactivada se mantiene la validación del diccionario. Un nombre propio no se excluye solo por no figurar en el diccionario;
eso tampoco garantiza su ortografía ni su existencia. Revisar editorialmente los resultados.
Cambiar esta opción no modifica ni revalida cartas existentes y no afecta las partidas en curso.

Las cartas dudosas o incompletas quedan excluidas automáticamente. El administrador puede ver
las advertencias, habilitar explícitamente una carta con seis prohibidas o pedir un reemplazo
automático. La habilitación manual no elimina los hallazgos del diccionario. Una palabra desconocida
puede ser un regionalismo; el corrector no verifica significado ni garantiza calidad editorial.

**Editar carta** permite corregir el objetivo y entre una y seis prohibidas sin llamar a DeepSeek.
**Cancelar edición** no guarda nada. El guardado vuelve a aplicar las validaciones del mazo;
si la carta es dudosa o incompleta queda excluida. Editar no habilita una carta que ya estaba
excluida: se usa la acción de habilitación existente, que requiere seis prohibidas.
No se admiten objetivos duplicados ni objetivos ya usados por otras versiones de cartas;
se conservan los identificadores, el origen y el historial de palabras usadas para evitar que
una generación posterior vuelva a proponerlos. El archivado y los trabajos activos bloquean
la edición. Una revisión atómica impide pisar cambios concurrentes; si el mazo cambió, hay que
revisar la versión actual antes de reintentar. Las partidas existentes mantienen su copia.
El endpoint administrativo `PUT /api/admin/decks/:deckId/cards/:cardId` recibe `{word, taboo}`;
cada término admite hasta 200 caracteres. El `PATCH {excluded}` existente no cambia.

**Eliminar carta** solicita confirmación con el nombre de la carta antes del borrado definitivo.
El reemplazo por IA reintenta objetivos vacíos o repetidos dentro del presupuesto del trabajo
(hasta tres intentos). Si no obtiene un objetivo nuevo, la carta y su historial se conservan.
Cancelar o pulsar Escape no elimina nada. Se bloquea durante generaciones o reemplazos y en
mazos archivados. Solo se quita la carta seleccionada; se conservan el mazo, las demás cartas y
el historial de objetivos usados para evitar que futuras generaciones repitan el objetivo eliminado.
El catálogo y la paginación se actualizan al terminar; un mazo sin cartas deja de estar disponible
para nuevas partidas. Las partidas existentes mantienen su copia. La API usa
`DELETE /api/admin/decks/:deckId/cards/:cardId`, sin cambiar los métodos de edición o exclusión.

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

El listado de cartas muestra 20 por página, con controles **Anterior/Siguiente** y contadores.
El filtro **Solo excluidas** se aplica antes de paginar; cambiar el mazo o el filtro vuelve a
la primera página. Las acciones de las cartas y el progreso en vivo siguen disponibles.

El progreso del administrador se entrega por Socket.IO en el mismo puerto del servidor,
en un canal privado autenticado con la cookie de sesión. No utiliza consultas periódicas
desde el navegador: al conectar o reconectar recupera el estado guardado del trabajo y
después recibe sus actualizaciones. Si la conexión se interrumpe, el trabajo continúa en
MongoDB y el panel vuelve a sincronizarse al recuperar la conexión. El proxy debe permitir
WebSocket; los sockets de las partidas permanecen separados del canal administrativo.

#### Composición del panel

El tablero coordina y las piezas presentan. `src/ui/admin/admin-dashboard.tsx` conserva la sesión,
el socket de progreso, el trabajo en curso y los borradores de los formularios;
`src/ui/admin/dashboard/` contiene las piezas, cada una con una responsabilidad.

| Archivo                             | Responsabilidad                                         |
| ----------------------------------- | ------------------------------------------------------- |
| `dashboard/types.ts`                | Pestañas, tipos de vista y contratos compartidos.       |
| `dashboard/api-client.ts`           | Cliente HTTP del panel y error tipado de respuesta.     |
| `dashboard/generation-request.ts`   | Cantidad válida y peticiones de generación y reemplazo. |
| `dashboard/create-deck-form.tsx`    | Formulario de creación de un mazo.                      |
| `dashboard/generation-feedback.tsx` | Progreso en vivo y resultado final del trabajo.         |
| `dashboard/deck-catalog.tsx`        | Catálogo de mazos administrados.                        |
| `dashboard/deck-workspace.tsx`      | Encabezado y subpestañas del mazo abierto.              |
| `dashboard/generate-cards-form.tsx` | Panel desplegable para pedir más cartas.                |
| `dashboard/card-list.tsx`           | Búsqueda, filtro y paginación del listado de cartas.    |
| `dashboard/managed-card.tsx`        | Carta con sus acciones de edición, exclusión y borrado. |

`CardEditor`, `CardDeletion`, `DeckManagement` y `ModelSettings` se reutilizan tal cual: las piezas
nuevas no duplican su comportamiento ni cambian la interfaz que ve el administrador.

### Si ves una pantalla en blanco con `invariant expected layout router to be mounted`

Es un `.next` mezclado: `next build` y `next dev` escriben en la misma carpeta y el segundo arranque
hereda manifests del primero. Se arregla limpiando:

```bash
pnpm clean      # borra .next
pnpm dev        # o pnpm build && pnpm start
```

Regla práctica: **no alternes `dev` y `build` sobre el mismo `.next` sin limpiar**, y si cambiaste de
modo, recargá el navegador con caché deshabilitada (Ctrl+Shift+R).

Jugar: abrí `/jugar` en el teléfono o el navegador, poné tu nombre, **Crear partida** (elegís mazo,
equipos, tiempo por turno de 30/60/90/120 s y cuántas palabras prohibidas tiene cada carta, de 1 a 6)
y compartí el código de 6 caracteres. Los demás entran con **Unirse con código**. Cuando cada equipo
tenga el mínimo de jugadores, el host toca **Comenzar partida**. El encabezado de esa pantalla
incluye **Inicio** para volver a la landing; las reglas se explican allí, no en un diálogo aparte.

La pantalla separa la selección del mazo de las reglas y muestra un resumen antes de **Crear sala**.
Los saltos se configuran de 0 a 5 por turno: saltar no resta puntos y 0 desactiva los saltos.

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

Al terminar la partida, `game:finished` incluye la tabla de equipos, el MVP y un `ranking` con
**todos los jugadores** ordenados por palabras adivinadas durante la partida, con su equipo. Los
empates se ordenan por nombre para que todos vean la misma lista. La pantalla final muestra ese
ranking global por encima del botón de salida.

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
  estado de la partida, así el socket y el `playerToken` sobreviven (D44). La única excepción es la
  landing pública: `/` explica el juego y su botón **Jugar** lleva a `/jugar`, donde vive el cliente
  con esa navegación interna.
- **Vista previa animada con Motion.** La carta de la landing rota entre tres ejemplos y su reloj
  corre, con la barra de tiempo sincronizada; con `prefers-reduced-motion` la carta y el reloj quedan
  quietos. El temporizador vive en un hook aparte (`use-turn-preview`) para probarlo sin animaciones.
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
