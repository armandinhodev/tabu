# Admin progress feedback
Objective: show the generation progress from the moment a deck is created, and give every database load a spinner.
Branch: `feat/admin-progress-feedback`; delivery: ask-on-risk.
Runner: `pnpm exec vitest run`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, Prettier.

## Specs
- **S1:** User: "El componente de progreso que se muestre al crear el mazo no solo al comenzar el proceso". Clicking **Crear y generar** renders the progress panel immediately, before the deck and the job exist: requested amount known, zero processed, an indeterminate indicator and a status that says the job is being queued. When the job arrives the panel switches to the real progress without unmounting.
- **S2:** User: "y también agregar spiners para las cargas de la base de datos". Every load that waits on the server shows a spinner with an accessible label: session check, deck catalog, deck detail and the model settings read. Nothing is shown as empty content while a load is in flight.
- **S3 — assumption:** The spinner is one shared presentational component with `role="status"` and an accessible name, so it never steals focus, is announced once and stops animating under `prefers-reduced-motion`. No new network request, no polling, no timer; the existing HTTP + socket flow is unchanged.

## Tasks
- [x] T1 — S1 — inline; creation progress.
- [x] T2 — S2-S3 — inline; shared spinner plus every load.
- [x] T3 — S1-S3 — inline; suites and full checks; Risk: none.

## Log
- **L1:** User: "El componente de progreso que se muestre al crear el mazo no solo al comenzar el proceso y también agregar spiners para las cargas de la base de datos."
- **L2:** Requested while the objective-first delivery was still open; recorded there as L5 and implemented here, in its own branch, so the two features do not share commits.
- **L3:** Current behaviour: the progress panel rendered only when `job` was set, which happens after the generate POST returns, so the whole deck-creation and job-admission window showed nothing; the catalog load had no loading state at all.
- **L4:** Observed RED first: `Unable to find role="region" and name "Progreso de generación"` and `Unable to find role="status" and name "Cargando mazos…"`.
- **L5:** Implemented `Spinner` (`role="status"`, accessible name, stops under `prefers-reduced-motion`) and used it for the session check, the deck catalog, the deck detail and the model settings read. The progress panel now renders when a creation starts, with the requested amount, an indeterminate bar and "Encolando la generación…", and switches to the real job without unmounting.
- **L6:** Observed GREEN: 38 dashboard tests, full suite 708 passed / 30 skipped, `pnpm typecheck` 0, `pnpm lint` 0, Prettier clean, `pnpm build` 0.
- **L7:** User report after delivery: "En la tab de Mazos cuando presiono en un Mazo, este no muestra nada a menos que presione el boton actualizar". Reproduced with a test before touching code: pressing the catalogue button of the deck that is ALREADY selected calls `setDeck(null)` while `selectedId` does not change, so the detail effect never re-runs and the panel stays empty until "Actualizar" bumps `refresh`. Independent of the spinner work. Fixed by re-reading the same deck instead of clearing it; new tests cover both the same-deck press and selecting another deck from the catalogue. `Risk: none`. Full suite after the fix: 710 passed / 30 skipped.
