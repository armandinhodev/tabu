# Landing redesign: copy, metadata, jerarquía y una animación que cuenta el juego

**Objetivo:** que la landing sea la mejor carta de presentación del juego: se entienda en cinco
segundos, se pueda compartir con una vista previa, y se mueva sólo donde tiene sentido.
**Rama:** `main`. **Delivery:** cambios locales; commit y publicación solo por solicitud. **Runner:** `pnpm exec vitest run`,
`pnpm typecheck`, `pnpm lint`, `pnpm build`, Prettier.

---

## Specs

### S1 — Primitivas y tipografía

User: "mejorá la landing". La landing copia a mano las clases de dos variantes del sistema
(`PRIMARY_CTA`, `SECONDARY_CTA`) y escribe tamaños literales fuera de la escala (`md:text-[3.25rem]`,
`text-[2rem]`).

- Los CTA salen de `buttonVariants` (`src/ui/components/ui/button.tsx`), no de strings duplicados.
- Ningún tamaño literal: sólo tokens de la escala tipográfica (§4).
- El titular se adapta al ancho disponible sin desbordar en móvil; S8 aporta la nueva composición.

### S2 — Metadata y vista previa al compartir

User: "mejorá la landing". `layout.tsx` sólo declara `title` y `description`; no hay `openGraph`
ni `twitter`, y las dos rutas comparten el mismo título.

- `metadataBase`, `openGraph` y `twitter` con título, descripción e imagen.
- La imagen es una captura real del juego (las previews del repo), copiada a `public/`.
- Cada ruta declara su propio título y descripción.

### S3 — Jerarquía visual y color

User: "mejorá la landing".

- S8 actualiza la dirección visual: naranja para la marca, las acciones principales y los números
  ilustrativos; amarillo para reloj, puntos y detalles decorativos. Los CTA secundarios no compiten
  con el primario. El juego conserva sus estilos originales.
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
- S9 actualiza la simulación: una ronda de 15 s con cambios de carta cada 4 s, sin reiniciar el
  reloj por cada carta. El anillo entra en urgente bajo los 10 s; el tiempo se explica en los textos,
  sin leyenda debajo del cronómetro (S10).
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

### S8 — Referencia visual y entradas directas

User: "Mejorar la ladingpage bsándote en esa imagen" (imagen adjunta, 2026-11-09).

- Adaptar la referencia: fondo oscuro, titular "Decí todo. Menos la palabra prohibida.", naranja y
  amarillo, carta clara apilada, tres pasos ilustrados y cierre "Tu próxima juntada empieza acá.".
- Mantener los componentes reales del preview, la mejora progresiva, el foco del ancla y las reglas.
- "Crear sala" abre el paso de nombre existente; "Unirme con código" abre el formulario de ingreso.
  La entrada se consume una vez y no interfiere con volver al inicio ni con una sesión reconectada.
- Diseño responsive, sin cambiar la apariencia del juego ni agregar dependencias.

### S9 — Ejemplos aleatorios y tiempo por ronda

User: "En la landing se muestra una carta, podríamos hacer que se muestre una carta al azar de un total de 10 configuradas en un json? Así cada vez que reingresen en la página principal verán ejemplso diferentes de cartas"

User: "Además en el juego el tiempo es por ronda no por carta, eso puede confundir en la ladingpage"

- Diez ejemplos en JSON con palabra, prohibidas y pista; selección aleatoria al montar el preview.
- Mantener el HTML inicial determinista y completo; evitar repetir el último ejemplo visible en
  la misma pestaña si el almacenamiento está disponible, sin depender de él para funcionar.
- Varias cartas comparten el reloj de la ronda; los textos aclaran "por ronda", sin caption (S10).
- Mantener la preferencia de movimiento reducido y no cambiar la lógica del juego.

### S10 — Cronómetro sin leyenda y pistas completas

User: "Pusiste la leyenda \"por ronda\" debajo del cronometro, quitá esa leyenda. Por otra parte en la burbuja de descripción en algunas cartas parte de la descripción se ve tapada fijate"

User: "Por ejemplo \"Eso que da calor\", \"calor queda tapado\"" (captura adjunta).

- Retirar únicamente la leyenda debajo del cronómetro; mantener el reloj y su comportamiento.
- Mantener completa y legible cada pista, sin que la cola decorativa la tape.

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
- **T9** → S1, S3, S5-S8 — inline, completada; composición de referencia y entradas directas.
  Ruta: una sola unidad de presentación, sin motivo para delegar escritura; exploración acotada
  delegada para mapear las restricciones del ingreso y el preview. RED: 6 tests fallan antes del cambio.
  Commit solicitado: `feat(landing): redesign homepage from visual reference` (2026-11-09).
  GREEN: 1027 tests pasan / 45 omitidos; tipos y lint sin errores. Build limpio del candidato y
  del baseline completados en copias aisladas; HTML inicial con carta, CTAs y metadata presentes.
  Revisión visual final: capturas CDP reales de 320, 390 y 1440 px; sin desbordamiento del documento,
  navegación dentro del ancho disponible, reloj sin tapar la palabra y chips claros legibles.

- **T10** → S5, S7, S9 — inline, completada; JSON de ejemplos, inicio aleatorio, pista sincronizada y
  reloj independiente por ronda. RED: 7 tests fallan antes de implementar; GREEN focalizado: 26 pasan.
  Commit solicitado: `feat(landing): randomize examples and fix preview hints`. Risk: none (preview y textos de la landing).
  Verificación final: 1034 tests pasan / 45 omitidos; tipos y lint sin errores; build limpio y revisión
  móvil mediante CDP completados sin cambios en el juego.

- **T11** → S9-S10 — inline, completada; retirar caption y pintar la cola detrás del texto.
  Reproducción visual previa en 3 anchos; RED: 3 tests fallan. GREEN: 28 focalizados y 1036 de suite
  pasan / 45 omitidos; tipos y lint sin errores. Recheck CDP: 10 pistas × 3 viewports sin texto tapado.
  Commit solicitado: `feat(landing): randomize examples and fix preview hints`. Risk: none (CSS y presentación de la landing).

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
- **L7 (2026-11-09).** User: "Mejorar la ladingpage bsándote en esa imagen". La referencia adjunta
  define la composición y reemplaza el tratamiento neutro anterior de los números de los pasos.
- **L8 (2026-11-09).** Se conserva el preview real de 15 s dentro de una carta clara con tarjetas
  decorativas apiladas. CSS Module local y tokens de papel/titular nuevos, sin cambiar los tokens
  existentes del juego. Las entradas `accion=crear|unirse` se consumen en HomeScreen mediante el
  navegador, sin modificar el provider ni convertir `/jugar` en ruta dinámica. Se reutilizan la
  validación de nombre, `goTo` y las reglas existentes; los demás parámetros y el hash se conservan.
- **L9 (2026-11-09).** Verificación: RED 6 tests antes del cambio, GREEN 1027 pass / 45 skip;
  `tsc` 0, `eslint` 0 (el warning preexistente de `act` continúa). Prettier aplicado al código/CSS
  modificado y `git diff --check` limpio. El build dentro del workspace compiló y verificó tipos,
  pero falló en la generación con `no direct app page entry found for /_not-found`. La comparación
  aislada del baseline `a7efdb4` y del candidato dio exit 0 en ambos builds, sin modificar fuentes,
  configuración, procesos ni la caché del workspace. `/jugar` sigue estático; el HTML inicial de `/`
  contiene el nuevo titular, `fuego`, `llama`, `chimenea`, los dos enlaces de entrada y metadata OG.
  La revisión visual se completó después mediante Chromium instalado, CDP y perfiles temporales
  vacíos; no se agregó ningún runner ni dependencia al proyecto.
- **L10 (2026-11-09).** Las primeras capturas detectaron el tamaño responsive heredado del reloj y
  los chips oscuros del juego sobre el papel claro. La corrección quedó limitada al CSS Module de
  la ilustración; TimerRing y TabooWords no se modificaron. Se compactó el encabezado por debajo
  de 375 px para mantener "Jugar" dentro del viewport. Recheck: 20 tests focalizados pasan y el build
  final limpio da exit 0. Las capturas CDP finales muestran `scrollWidth === clientWidth` en 320,
  360, 390 y 1440 px; el botón del encabezado conserva el margen de 20 px en móvil. El reloj no
  tapa FUEGO y los chips claros tienen contraste medido 13,72:1. Las capturas móviles por CLI no
   servían como prueba de viewport: Edge impone un ancho mínimo de ventana; se usó emulación CDP.
- **L11 (2026-11-09).** User: "Comitealo y pushealo a main". Se autoriza publicar el rediseño
  verificado en `origin/main` mediante la autenticación SSH ya autorizada para este repositorio.
- **L12 (2026-11-09).** User: "En la landing se muestra una carta, podríamos hacer que se muestre una carta al azar de un total de 10 configuradas en un json? Así cada vez que reingresen en la página principal verán ejemplso diferentes de cartas"
- **L13 (2026-11-09).** User: "Además en el juego el tiempo es por ronda no por carta, eso puede confundir en la ladingpage"
- **L14 (2026-11-09).** `example-cards.json` contiene diez ejemplos con cuatro prohibidas y una
  pista coherente. La selección aleatoria ocurre después de hidratar; `sessionStorage` recuerda
  la última carta visible para evitar la repetición inmediata, pero no es requisito para funcionar.
  El hook conserva el comportamiento anterior por defecto y permite cambiar la carta cada 4 s
  dentro de una ronda de 15 s, manteniendo el mismo deadline hasta que termina la ronda. Los textos
  y el reloj dicen "por ronda". RED: 7 tests fallan; GREEN: 1034 pass / 45 skip, `tsc` y `eslint` 0
  (el warning preexistente continúa). Build limpio aislado exit 0; HTML inicial determinista con
  carta completa y etiqueta. CDP móvil confirma pista sincronizada, texto visible, rotaciones de
  aproximadamente 4 s, reloj descendente sin reinicios por carta y selección distinta al recargar.
- **L15 (2026-11-09).** User: "Pusiste la leyenda \"por ronda\" debajo del cronometro, quitá esa leyenda. Por otra parte en la burbuja de descripción en algunas cartas parte de la descripción se ve tapada fijate". User: "Por ejemplo \"Eso que da calor\", \"calor queda tapado\"".
- **L16 (2026-11-09).** Reproducción CDP previa: la cola `.speech::after`, posicionada con z-index
  automático, se pintaba sobre el texto inline y borraba 9–12 % de la última palabra en las pistas
  reportadas. El temporizador no era la causa. Se asignó `z-index: -1` a la cola dentro del stacking
  context de la burbuja y se eliminó el caption y su CSS sin cambiar geometría ni tiempos.
  Recheck: 10 pistas × 3 viewports (1440/390/320), 102 cajas de palabras y 0 píxeles de texto
  cubiertos; se conserva la cola y el reloj, sin leyenda. Tests: 1036 pass / 45 skip; tipos y lint 0.
- **L17 (2026-11-09).** User: "Comitealo y pushealo a main". Se autoriza publicar los ejemplos
  aleatorios, el reloj por ronda y las correcciones visuales verificadas en `origin/main`.
