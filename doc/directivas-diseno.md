# Directivas de diseño — Tabú

> Documento normativo para la construcción de la app. Las previews de referencia están en
> `doc/previews/` y la especificación funcional completa en `doc/prompt.md`.
> Si una regla de acá contradice a un DEFAULT del framework, **gana este documento**.

---

## 1. Principios

1. **Moderno y limpio.** Producto, no juego de feria. Mucho aire, una sola idea por pantalla,
   jerarquía visual fuerte, cero decoración que no aporte información.
2. **Mobile-first.** El juego se juega en el teléfono propio de cada jugador. El diseño mobile es
   la referencia; el escritorio es una adaptación, no al revés.
3. **Paleta sin violeta.** Está prohibido cualquier violeta, lila, morado, magenta o índigo.
   Ver §3.
4. **Tipografía plana.** Prohibido el efecto 3D, bisel, relieve, contorno o sombra sobre el texto.
   El contraste se logra con **color plano**, no con efectos. Ver §4.
5. **Un acento, un uso.** El naranja es la acción primaria (continuar, comenzar, adiviné). El rojo
   es exclusivamente **palabra prohibida y penalización**. El verde azulado es equipo/acierto. Si
   todo es naranja, nada es naranja.
6. **Todos ven lo mismo; cambia la acción.** La palabra objetivo **y** la lista completa de
   palabras prohibidas están a la vista de todos los jugadores (como en el juego de mesa). No hay
   información secreta. Lo que diferencia a cada rol son los **controles disponibles**:
   - **Equipo que describe** (activo): ve la lista en modo informativo y tiene *¡Adiviné!*,
     *Pasar turno*; el descriptor además *Aceptar y pasar carta* y *Reportar*.
   - **Equipo rival** (vigilante): ve **los mismos chips, pero reportables** (táctiles), más
     *Reportar gesto* y *Reportar sonido*.
7. **Nada de hacia atrás sin preguntar.** Toda acción destructiva (salir de la partida, reiniciar)
   pide confirmación.

---

## 2. Tokens base

Todos los colores, espaciados, radios y tiempos se declaran como **CSS custom properties** en
`src/app/tokens.css` y se consumen desde Tailwind vía `@theme`. Ningún componente escribe un color,
un espaciado o un radio literal.

```css
:root {
  /* Superficies */
  --bg-canvas:      #0E1116;
  --bg-surface:     #161B22;
  --bg-surface-2:   #1F2630;
  --bg-surface-3:   #29313C;
  --bg-raised:      #2F3947;   /* control elevado sobre panel de contenido */
  --bg-raised-hover:#374253;
  --border-subtle:  #2A323D;
  --border-strong:  #3A4452;
  --border-control: #78869A;   /* borde de control — 3.16:1 sobre --bg-raised */

  /* Texto */
  --text-primary:   #F2F5F8;
  --text-secondary: #9AA7B4;
  --text-tertiary:  #6B7684;

  /* Marca / acción */
  --accent:         #FF6B2C;   /* naranja — acción primaria */
  --accent-hover:   #FF854E;
  --accent-press:   #E2561B;
  --accent-soft:    #2A1A12;   /* fondo tintado */
  --on-accent:      #17110C;   /* texto sobre naranja (contraste ~8:1) */

  /* Semánticos */
  --success:        #18B98C;   /* verde azulado — acierto, listo, equipo verde, banner rival */
  --success-soft:   #10241F;
  --warning:        #FFC043;   /* ámbar — tiempo, avisos, banner del descriptor */
  --warning-soft:   #2A2113;
  --danger:         #FF3B47;   /* rojo — palabras prohibidas y penalización */
  --danger-soft:    #2B1216;
  --gold:           #E9B949;   /* oro — puntos, trofeo, MVP */

  /* Códigos de equipo (máx. 4) */
  --team-1: #FF6B2C;  /* Naranja */
  --team-2: #18B98C;  /* Verde   */
  --team-3: #3B9EFF;  /* Celeste */
  --team-4: #B4E33D;  /* Lima    */
}
```

### 2.1 Colores prohibidos

No usar en ningún estado, gradiente, borde, glow, foco o icono:
`#8B5CF6` `#7C3AED` `#A855F7` `#C084FC` `#D946EF` `#E879F9` `#6366F1` `#4F46E5`
— es decir, **ningún tono con matiz entre 265° y 320°**. Tampoco "rosa" como color de marca
(el rosa en tono vino/violeta arrastra al violeta); si hace falta un color cálido extra, usar
terracota `#C05B3C` o coral `#E2725B`.

### 2.2 Reglas de contraste

| Elemento | Mínimo |
|---|---|
| Texto normal sobre su fondo | 4.5:1 |
| Texto grande (≥ 24px, o ≥ 18.66px bold) | 3:1 |
| Bordes de controles interactivos | 3:1 contra el fondo |
| Texto sobre `--accent` | usar `--on-accent` (oscuro), nunca blanco puro |

---

## 3. Roles de color

| Rol | Color | Uso |
|---|---|---|
| Acción primaria | `--accent` | botón Continuar / Crear sala / Comenzar / **Adiviné** |
| Equipo | `--team-1..4` | chips de puntaje, nombre de equipo, acentos de tarjeta |
| Acierto | `--success` | estado "listo", banner del equipo rival |
| Urgencia | `--warning` | temporizador, avisos ("no digas estas palabras", "sos quien describe") |
| Prohibido / penalización | `--danger` | **chips de palabras prohibidas** y cartel de penalización |
| Puntos / premio | `--gold` | puntajes en ranking, trofeo, MVP |

Regla dura: **el rojo `--danger` solo aparece en palabras prohibidas y penalizaciones.** Si algo
es rojo en cualquier otro contexto, está mal.

---

## 4. Tipografía

Familias (Google Fonts, `next/font` con `display: swap`):

- **Display / títulos:** `Outfit` — 600, 700, 800.
- **UI / cuerpo:** `Inter` — 400, 500, 600.
- **Códigos y cifras:** `JetBrains Mono` — 500, 700. Se usa para el código de sala, el temporizador
  y los puntajes (cifras tabulares: `font-variant-numeric: tabular-nums`).

Escala (todos los valores en `rem`, baseline 4px):

| Token | Tamaño / interlineado | Peso | Uso |
|---|---|---|---|
| `display` | 40 / 44 | 800 | títulos de resultado |
| `h1` | 32 / 38 | 700 | títulos de pantalla |
| `h2` | 24 / 30 | 700 | títulos de sección |
| `h3` | 17 / 24 | 600 | títulos de tarjeta |
| `body` | 16 / 24 | 400 | texto general |
| `body-sm` | 14 / 20 | 400 | texto secundario |
| `caption` | 12 / 16 | 500 | etiquetas de sección, **MAYÚSCULAS + `letter-spacing: .08em`** |
| `micro` | 11 / 14 | 500 | textos auxiliares |

Reglas:

- **Nunca** `text-shadow`, `drop-shadow`, `filter: drop-shadow` sobre texto, ni sombras 3D.
- **Nunca** texto con degradado, contorno o relieve.
- El texto sobre fondo de color va en **color plano** con el token `on-*` correspondiente.
- La palabra objetivo es el elemento más grande de la pantalla: `clamp(48px, 12vw, 96px)`, peso 800,
  en mayúsculas, `letter-spacing: -.02em`.
- Etiquetas de sección en `caption` en mayúsculas; títulos en sentence case.

---

## 5. Espaciado, grilla, radios y elevación

- **Grilla base de 8px.** Escala: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Padding de pantalla: **20px** en mobile, **32px** en ≥768px.
- Radios: `sm 10px` (chips), `md 14px` (inputs y botones), `lg 20px` (tarjetas), `xl 28px` (modal),
  `pill 999px` (chips y avatares).
- Bordes: `1px solid var(--border-subtle)`; `2px solid var(--accent)` solo en estado seleccionado.
- Elevación (solo superficies, nunca texto):
  - `0 1px 2px rgba(0,0,0,.40)` — tarjetas pegadas.
  - `0 12px 32px rgba(0,0,0,.45)` — tarjetas flotantes, modales, menús.

---

## 6. Componentes clave

**Botón primario** — alto 52px, radio 14px, fondo `--accent`, texto `--on-accent`, peso 600,
transición 120ms. `:hover` `--accent-hover`, `:active` escala a 0.98. Full-width en mobile.
Área táctil ≥ 44×44px siempre.

**Botón de penalización / reporte** — fondo `--danger`, texto blanco bold 16px. Se usa para
*Reportar gesto* / *Reportar sonido* y para el cartel de palabra prohibida.

**Botón secundario (ghost)** — fondo transparente, borde `--border-subtle`, texto `--text-primary`.

**Botón de control sobre panel (elevado)** — fondo `--bg-raised`, borde `--border-control`,
texto `--text-primary`. Es el patrón para acciones que van dentro o al lado de un panel de
contenido (los botones de la sala de espera, junto a los paneles de equipos).

Se separa 1.48:1 de `--bg-surface`, la superficie de los paneles de equipo: sin este salto el
control se funde con el panel y se lee como contenido. El borde cumple los 3:1 que exige §9
para bordes de control; los bordes oscuros del sistema no llegan a ese ratio sobre una
superficie elevada.

El color va **solo en el ícono**, nunca en la superficie: `--accent` coincide con `--team-1` y
`--success` con `--team-2`, así que un fondo de color en un control de acción se lee como
pertenencia a un equipo. `:hover` sube a `--bg-raised-hover` con sombra `--elevation-float`.

**Chip de equipo / puntaje** — alto 40px, radio 12px, fondo del color de equipo al 18% + borde del
color de equipo, cifra en el color del equipo (tabular, 800).

**Tarjeta de palabra** — radio 24px, fondo `--bg-surface-2`, borde `--border-subtle`, min-height 38vh
en mobile; el padding interior nunca menos de 24px.

**Temporizador** — anillo circular: 160px en mobile, 200px en desktop, trazo 8px, pista
`--bg-surface-3`, relleno `--warning`; **bajo 10 segundos** pasa a `--danger` **y cambia el ícono**
(average con reloj), porque el color solo no puede ser la única señal.

**Código de sala** — `JetBrains Mono`, 700, `letter-spacing: .2em`, uppercase, 24px, en una cápsula
con borde; con botón de copiar a la derecha.

### 6.1 Chips de palabras prohibidas — dos variantes

La lista de prohibidas se ve **siempre**; cambia el comportamiento según el rol del jugador.

**Variante informativa** (equipo que describe y descriptor)
- Alto 36px, radio pill, fondo `--danger-soft`, borde 1px `--danger`, texto `--text-primary`, 14px.
- **No** tiene ícono de acción ni badge. Un ícono de ojo tachado o un candado sugiere que hay algo
  oculto, y en esta versión no hay secreto: no debe quedar ninguna señal de "esto no lo ves vos".
- Encabezado de la lista: ámbar, con triángulo de advertencia — "No digas estas palabras" (equipo
  que describe) o "Si decís una de estas, tu equipo pierde 1 punto" (descriptor).

**Variante reportable** (equipo rival / vigilante)
- Alto **44px** (área táctil), radio pill, mismo fondo y borde, más un **badge circular rojo de 18px
  con "!"** al borde derecho de cada chip.
- `:hover` → fondo `--danger` al 26%; `:active` → fondo `--danger` al 40% y escala 0.97.
- El badge debe ser claramente visible en reposo (no solo en hover): la función es que el jugador
  entienda que puede tocar la palabra.
- Tocar el chip reporta **al instante**, sin modal de confirmación (es un juego rápido y el servidor
  valida que la palabra sea una de la carta). Cada chip debe tener `aria-label` del tipo
  "Reportar palabra prohibida: fuego".

**Tira de aviso del descriptor** — banda ámbar sobre la lista, con ícono de triángulo, 14px,
texto "Si decís una de estas, tu equipo pierde 1 punto".

**Chip de palabra reportada** — tras el reporte, el chip queda con fondo `--danger` sólido y texto
blanco; el cartel de penalización (§6.3) muestra esa misma palabra en un chip rojo con ícono de
bandera.

**Avatar** — círculo 32px (fila) / 40px (encabezado) con inicial y color del equipo al 20%.

**Toast / alerta** — aparece abajo, radio 16px, fondo `--bg-surface-3`, borde del color semántico,
auto-dismiss 3.5s, con región `aria-live="polite"`.

### 6.2 Banners de rol

- **Descriptor:** banda ámbar de 56px, fondo `--warning-soft`, texto `--warning`, con ícono de
  megáfono: "Sos quien describe".
- **Equipo rival:** banda verde azulada de 56px, fondo `--success-soft`, texto `--success`, con
  ícono de ojo: "Equipo rival · Vigilá".

### 6.3 Cartel de penalización

Tarjeta centrada con borde `--danger`, fondo `--bg-surface-2`:
círculo rojo de 64px con "X", titular "PALABRA PROHIBIDA" en `--danger`, chip con la **palabra
exacta marcada** (ícono de bandera), línea "El equipo {equipo} pierde 1 punto", fila con borde
atenuado "La carta se anuló · pasa a la siguiente", y fila de puntajes con el delta en rojo
(`NARANJA 12 → NARANJA 11`). Cierra con botón ghost "Continuar".

---

## 7. Movimiento

| Token | Duración | Curva | Uso |
|---|---|---|---|
| `instant` | 120ms | `ease-out` | hover, press, feedback de botón |
| `base` | 200ms | `cubic-bezier(.2,.8,.2,1)` | cambios de estado, opacidad |
| `panel` | 320ms | `cubic-bezier(.2,.8,.2,1)` | entrada de tarjetas y modales |
| `shake` | 240ms | `linear` | penalización (3 oscilaciones de ±4px) |

Entrada de tarjeta: opacidad 0→1 + desplazamiento 8px hacia arriba. El confeti del resultado son
puntos planos de 4-6px en `--accent`, `--success`, `--gold`, con caída y desvanecimiento de 1.2s.
**Todo el movimiento debe deshabilitarse bajo `prefers-reduced-motion: reduce`** (se conserva solo
el cambio de opacidad; sin shake, sin confeti).

---

## 8. Sonido

Implementado con **Web Audio API sintetizado** (sin archivos de audio, sin licencias, sin peso en el
bundle). Un único `SoundProvider` + una tabla declarativa `SOUNDS`. El `AudioContext` se crea
suspendido y se reanuda con el **primer gesto del usuario** (requisito de iOS/Safari). Botón de
silencio **siempre visible**, estado persistido en `localStorage`. Volumen maestro 0.5.

| Evento | Descripción | Duración |
|---|---|---|
| `ui.click` | click corto, seno 1200Hz | 40ms |
| `player.join` | dos notas ascendentes C5→E5 | 140ms |
| `game.start` | arpegio de 4 notas | 420ms |
| `turn.start` | blip + tick | 180ms |
| `turn.tick` | tick por segundo en los últimos 10s | 30ms |
| `correct.guess` | arpegio ascendente + "ding" de puntaje | 320ms |
| `taboo.hit` | buzzer serrucha 220→110Hz + ráfaga de ruido | 400ms |
| `turn.skip` | dos notas descendentes suaves | 200ms |
| `score.change` | dos notas tipo moneda | 160ms |
| `round.end` | fanfarria corta de 3 notas | 500ms |
| `game.over` | fanfarria de 4 notas | 700ms |
| `error` | dos tonos cortos graves | 120ms |
| `reconnect` | dos notas medias | 180ms |

Reglas: nunca un sonido supera 700ms; nunca dos sonidos de UI se superponen; el tick del timer solo
en los últimos 10 segundos; el sonido `taboo.hit` suena **una sola vez** aunque se reporte la
palabra desde varios dispositivos a la vez (el servidor es quien dispara el evento de sonido, no el
cliente); si el jugador está en una pantalla de resultado, el sonido de fondo se silencia.

---

## 9. Accesibilidad

- Objetivo **WCAG AA**: 4.5:1 en texto normal, 3:1 en texto grande y bordes de control.
- Foco visible: `outline: 2px solid var(--warning); outline-offset: 2px` — nunca `outline: none` sin
  reemplazo. En los chips reportables el foco debe ser **más visible** que en los informativos.
- Área táctil mínima 44×44px (los chips reportables miden 44px de alto por eso); separación mínima
  8px entre controles.
- **Nunca comunicar información solo por color**: la penalización lleva ícono + texto + color; el
  timer bajo de tiempo cambia color **e** ícono; el chip reportable lleva el badge "!" además del
  borde rojo.
- `aria-live="polite"` para eventos de puntaje y cambio de turno; `role="alert"` para penalizaciones.
- `prefers-reduced-motion` respetado (§7).
- Contraste de texto sobre los colores de equipo: texto oscuro sobre `--accent` y `--success`.
- Los íconos son SVG inline (o `lucide-react`), **nunca emoji**.

---

## 10. Responsive

| Breakpoint | Layout |
|---|---|
| `< 480px` (base) | una columna, padding 20px, tarjetas apiladas, botón sticky al pie |
| `480–767px` | una columna con más aire, word-size mayor |
| `768–1279px` | dos columnas: contenido + panel lateral de puntaje/turno |
| `≥ 1280px` | tres columnas: rail izquierdo 280px (equipos/marcador), centro flexible (palabra + palabras prohibidas), rail derecho 300px (orden de turno / acciones) |

Máximo de contenido: 1440px. Respeta `env(safe-area-inset-*)` en iOS. El botón de acción principal
en mobile queda **sticky al fondo**, con `padding-bottom` de safe area.

---

## 11. Inventario de pantallas

Cada pantalla tiene su preview en `doc/previews/`. La UI real debe seguirlas de cerca.

> **Precedencia:** las previews son referencias de **layout, jerarquía y contenido**. Cuando un detalle
> visual de una preview contradiga a este documento (por ejemplo, el chip de puntaje, que en la
> preview aparece relleno y aquí va al 18 % con borde), **manda este documento**, porque acá están
> fijados los contrastes y los tokens que hay que respetar.

| # | Pantalla | Preview móvil | Preview desktop | Regla clave |
|---|---|---|---|---|
| 01 | Inicio / nombre | `01-inicio.png` | — | campo de nombre + crear/unirse |
| 02 | Crear partida | `02-crear-partida.png` | — | mazo, equipos, tiempo por turno |
| 03 | Unirse con código | `03-unirse.png` | — | 6 cajas de código, foco en la primera |
| 04 | Sala de espera | `04-lobby.png` | `11-desktop-lobby.png` | código grande + equipos + comenzar |
| 05 | Juego — equipo que describe | `05-juego-activo.png` | `12-desktop-juego-activo.png` | palabra + chips informativos + *Adiviné* |
| 06 | Juego — quien describe | `06-juego-descriptor.png` | — | banner ámbar + tira de aviso + *Aceptar* / *Reportar* |
| 07 | Juego — equipo rival | `07-juego-rival.png` | `13-desktop-juego-rival.png` | banner teal + **chips reportables** + *Reportar gesto* / *sonido* |
| 08 | Penalización | `08-penalizacion.png` | — | rojo, palabra marcada, −1 punto, carta anulada |
| 09 | Marcador de ronda | `09-marcador.png` | — | puntajes + próximo turno |
| 10 | Resultado final | `10-resultado.png` | `14-desktop-resultado.png` | trofeo, ranking, MVP |

Estados obligatorios en **todas** las pantallas: cargando (skeleton plano, sin spinnercentric),
vacío, error, y **reconectando** (banda superior ámbar: "Reconectando…" con reintento automático).

---

## 12. Checklist visual antes de dar por terminada una pantalla

- [ ] ¿Usa solo tokens? (cero colores/espaciados literales)
- [ ] ¿Hay algún violeta/lila/magenta? (no debe haber)
- [ ] ¿El texto tiene sombra, 3D o degradado? (no debe tener)
- [ ] ¿El rojo aparece solo en palabras prohibidas y penalizaciones?
- [ ] ¿El contraste es AA?
- [ ] ¿Hay foco visible en todos los controles?
- [ ] ¿El chip reportable tiene badge "!" visible en reposo y área táctil de 44px?
- [ ] ¿El chip informativo NO insinúa información oculta (sin candado ni ojo tachado)?
- [ ] ¿Se ve bien a 360px de ancho?
- [ ] ¿El botón primario es alcanzable con el pulgar (sticky al pie)?
- [ ] ¿El ícono es SVG, no emoji?
- [ ] ¿Usé la primitiva de `src/ui/components/ui/` en vez de un `<div onClick>`?
- [ ] ¿Los componentes de juego son propios y no una primitiva genérica forzada?
- [ ] ¿Respeta `prefers-reduced-motion`?

---

## 13. Biblioteca de componentes

**Primitivas:** Base UI (`@base-ui/react`) + componentes propios en `src/ui/components/ui/`,
siguiendo la convención de **shadcn/ui** (misma API y mismas convenciones de archivo, pero **el
código vive en tu repo**: no es una dependencia runtime de un paquete de componentes).

Base UI es la capa de primitivas que mantiene hoy el equipo de MUI, es la que **shadcn/ui usa por
defecto en proyectos nuevos** y cubre el set completo de Radix (más Combobox, Autocomplete y
diálogos anidados). Ojo con su API: usa la prop **`render`** en lugar de `asChild`, y `Button`
lleva `nativeButton={false}` cuando el hijo no es un `<button>`.

Reglas:

- Antes de escribir un componente desde cero, buscá si ya existe en `src/ui/components/ui/`.
- Los componentes con semántica de accesibilidad (Dialog, Tooltip, Popover, Select, Switch, Tabs,
  Toast, Separator) salen de las primitivas: **nunca reimplementes** focus trap, roles ARIA ni
  manejo de teclado.
- **Los componentes del juego son propios y a medida**: `TimerRing`, `TabooWords`, `ScoreBoard`,
  `TeamPanel`, `PlayerRow`, `CodeBadge`. No fuerces una primitiva genérica a hacer de temporizador.
- Toda primitiva consume **solo tokens** (§2). Si una primitiva trae estilos propios (radio,
  sombra, color), los sobreescribís con los tokens del proyecto, nunca al revés.
- Las variantes se declaran con **class-variance-authority** (`cva`); nada de `style={{}}` inline
  salvo valores realmente dinámicos.
- Los toasts usan **sonner**, en tema oscuro y con los colores de los tokens.
- **Prohibido** sumar MUI Core, Ant Design, Chakra, Mantine, HeroUI/NextUI o Bootstrap: traen tema y CSS
  propios en runtime, pelean con Tailwind v4 y con la paleta de §3. (MUI Core es otra cosa: Base UI
  es la versión headless y sin estilos de ese mismo equipo.)
