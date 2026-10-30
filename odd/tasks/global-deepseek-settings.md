# Global DeepSeek settings
Objective: persistent administrator model selection. Branch: `feat/global-deepseek-settings`; delivery: ask-on-risk; forecast: approximately 450 authored lines.
Runner: `pnpm exec vitest run`, `pnpm typecheck`, scoped ESLint and Prettier. Prior uncommitted fixes must be preserved separately.

## Specs
- **S1:** User: "Necesitamos una tab en el panel donde se pueda configurar el modelo de deepseek (flash o pro) donde se vea su logo." Provide a settings tab, DeepSeek logo and Flash/Pro selection. Check UI interactions and mocked provider request model.
- **S2:** User: "Que el config sea global". Persist one server-wide selection. Check authenticated settings read/write, strict supported model validation and default Flash.
- **S3 — Implementation assumption:** Selection applies to newly enqueued generation/replacement jobs; previously queued/running jobs retain their selected model, including after restart. Legacy jobs retain Flash. No provider keys exposed, paid calls, automatic fallback or unrelated data edits. Verify job persistence and dispatch using fakes and isolated probes.

## Tasks
- [ ] T1 — S2-S3 — inline; no writer trigger; persistence/API/job snapshot implemented; Risk: items 1, 2, 3, 4; RED observed, focused GREEN; independent verification and commit pending.
- [ ] T2 — S1-S2 — inline; no independent writer unit; settings tab/local logo/docs implemented; RED observed, focused GREEN; full checks and commit pending.

## Log
- **L1:** User: "Necesitamos una tab en el panel donde se pueda configurar el modelo de deepseek (flash o pro) donde se vea su logo."
- **L2:** User: "Que el config sea global"
- **L3:** Read-only map completed. Official API documentation (https://api-docs.deepseek.com/api/create-chat-completion) confirms `deepseek-flash` and `deepseek-v4-pro`; do not invent `deepseek-pro`. Settings do not yet exist. Reuse adminResponse/auth, job admission/fencing, normalization and existing UI/API helpers. RDD is globally disabled; functional verification still required.
- **L4:** Prior work remains uncommitted in ten files: multiword proper-name candidates/prompts, Reemplazar con IA, modal archive/delete confirmations, README and tests. Prior suite: 682 passed/30 skipped. Dialog independent verification passed; prior multiword independent invocation returned no result. Preserve all prior edits; no remote operations authorized.
- **L5:** Observed RED: four model snapshot/dispatch/provider failures, two missing settings module suites, two UI tab/navigation failures. Implemented strict Flash/Pro settings endpoint through adminResponse, singleton adminSettings storage, enqueue-time persisted model and backward-compatible optional provider input. Observed GREEN: 169 tests across seven files; typecheck passed. Store test setup correction uses the existing Mongoose readyState setter convention.
- **L6:** Logo is a local SVG derived from https://api-docs.deepseek.com/img/logo-mark-light.svg; no runtime third-party image request. Full suite and build launched in isolated scratch via worker `ses_e75cc398fffeXOe4NylPhzLjJv`; checks pending. Direct-node ESLint failed to resolve the existing react-hooks plugin layout; retry with the documented NODE_PATH resolution, without installing dependencies.
