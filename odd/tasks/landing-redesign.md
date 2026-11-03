# Landing redesign: copy, metadata, jerarquía y una animación que cuenta el juego

**Objetivo:** que la landing sea la mejor carta de presentación del juego: se entienda en cinco
segundos, se pueda compartir con una vista previa, y se mueva sólo donde tiene sentido.
**Rama:** `main`. **Delivery:** un commit por tarea. **Runner:** `pnpm exec vitest run`,
`pnpm typecheck`, `pnpm lint`, `pnpm build`, Prettier.

---

## Specs

### S1 — Primitivas y tipografía

User: "mejorá la landing". La landing copia a mano las clases de dos variantes del sistema
(`PRIMARY_CTA`, `SECONDARY_CTA`) y escribe tamaños literales fuera de la escala (`md:text-[3.25rem]`,
`text-[2rem]`).

- Los CTA salen de `buttonVariants` (`src/ui/components/ui/button.tsx`), no de strings duplicados.
- Ningún tamaño literal: sólo tokens de la escala tipográfica (§4).
- El titular se acorta para que entre en dos líneas en móvil.

### S2 — Metadata y vista previa al compartir

User: "mejorá la landing". `layout.tsx` sólo declara `title` y `description`; no hay `openGraph`
ni `twitter`, y las dos rutas comparten el mismo título.

- `metadataBase`, `openGraph` y `twitter` con título, descripción e imagen.
- La imagen es una captura real del juego (las previews del repo), copiada a `public/`.
- Cada ruta declara su propio título y descripción.

### S3 — Jerarquía visual y color

User: "mejorá la landing".

- §1.5 "un acento, un uso": el naranja queda para el logo y el CTA; los números de paso y las
  viñetas pasan a neutros.
- La sección que anuncia "configuración" pero lista hechos baja de jerarquía y se renombra.
- El ancla "Cómo se juega" mueve el foco y deja margen al desplazarse (§9).

### S4 — El botón flotante y el pie

User: "mejorá la landing". El botón flotante de las reglas de la casa compite con el CTA final.

- Las reglas de la casa salen del flotante de la landing y viven en el encabezado y en el pie.
- La página cierra con un pie mínimo.

### S5 — El preview ES el juego

User: "sobre la animación no podemos hacer algo mejor también?".

- El preview usa los componentes reales del juego: `TabooWords` (chips en columna) y `TimerRing`
  (anillo con estado urgente).
- Un turno comprimido de 15 s: el anillo corre, entra en urgente bajo los 10 s (la regla real) y
  **la carta cambia cuando el turno se acaba**, como en la partida.
- Sin `blur` sobre el texto (§1.4, tipografía plana) y sin dos motions verticales a la vez.
- Con `prefers-reduced-motion` la carta y el reloj quedan quietos.

### S6 — El movimiento ocurre donde mira el usuario

User: "sobre la animación no podemos hacer algo mejor también?".

- Cada sección se revela cuando **entra en el viewport**, no cuando carga la página.
- Sin hidratar la landing: un `IntersectionObserver` propio en JS plano, con mejora progresiva
  (sin JS, el contenido se ve).
- La animación ambiental se detiene cuando el bloque no está a la vista o la pestaña se oculta.

### S7 — La primera pantalla no espera al JavaScript

User: "mejorá la landing".

- La carta inicial se sirve en el HTML (LCP), y la animación la mejora después de hidratar.

## Tasks

- **T1** → S1 — inline; `buttonVariants` en los CTA y escala tipográfica por token. Risk: none.
  Commit: `feat(landing)`. Nota: `buttonVariants` quedó en `button-variants.ts` **sin** `"use client"`
  porque la landing es un Server Component y no puede invocar una función de cliente (el build lo
  detectó: "Attempted to call buttonVariants() from the server").
- **T2** → S2 — inline; metadata de compartir e imagen. Risk: none. Commit: `feat(landing)`.
  La imagen es un recorte 1200×630 de `doc/previews/12-desktop-juego-activo.png` (69 KB): una captura
  real del juego. `PUBLIC_SITE_URL` define la URL pública.
- **T3** → S3 — inline; color, jerarquía de secciones y foco del ancla. Risk: none. Commit:
  `feat(landing)`.
- **T4** → S4 — inline; el flotante sale de la landing y llega un pie. Risk: none. Commit:
  `feat(landing)`. `HouseRulesButton` gana la variante `text`.
- **T5** → S5 — inline; el preview usa el juego real y el turno comprimido. Risk: none. Commit:
  `feat(landing)`. `TimerRing` acepta un deadline ausente: el anillo en reposo, sin reloj.
- **T6** → S6 — inline; reveal por scroll y detención fuera de pantalla. Risk: none. Commit:
  `feat(landing)`.
- **T7** → S7 — inline; la carta inicial en el HTML. Risk: none. Commit: `feat(landing)`.
- **T8** → S1-S7 — inline; tests, gates y documentación. Risk: none.

## Log

- **L1 (2026-11-02).** User: "qué cambios sugerías para la landing page?" y "Y sobre la animación no
  podemos hacer algo mejor también?"; después: "implementá todos los puntos incluido el que te dije
  de mejor la animación".
- **L2 (2026-11-02).** La landing actual: cinco secciones con animación de carga, un bloque
  flotante infinito, chips en fila (el juego los muestra en columna desde S1 de "rules-and-skips"),
  un reloj de 30 s con cartas que rotan cada 3,4 s, `blur` sobre la palabra y dos CTA copiados a
  mano de las variantes del sistema.
- **L3 (2026-11-02).** El preview pasa a usar `TabooWords` y `TimerRing` reales; el turno
  comprimido son 15 s para que el estado urgente (bajo 10 s) se vea antes de que cambie la carta.
- **L4 (2026-11-02).** El reveal se hace con un `IntersectionObserver` propio en JS plano (la
  landing sigue sin hidratarse) y con `@media (scripting: enabled)` para que el contenido se vea
  igual sin JavaScript: la mejora es progresiva y la página nunca queda en blanco.
- **L5 (2026-11-02).** El `blur` sobre la palabra se elimina (§1.4: tipografía plana) y la carta
  entra sólo con opacidad: la flotación del contenedor queda como única motion vertical.
- **L6 (2026-11-02).** Evidencia: `pnpm exec vitest run` → 971 pass / 42 skip; `tsc` 0; `eslint` 0
  (1 warning preexistente); `prettier` limpio en los archivos tocados; `pnpm build` ✓. El HTML
  prerenderizado de `/` ya trae la palabra, las prohibidas en columna y el anillo ("Quedan 15
  segundos") y la metadata de `og:image`.

