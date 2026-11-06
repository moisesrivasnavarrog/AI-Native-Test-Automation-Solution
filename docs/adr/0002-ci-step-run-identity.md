# ADR-0002: Per-step run identity for CI observability imports

- Status: accepted (Capstone hardening, 2026-11-06)
- Context: the workflow produces three Playwright JSON files per run —
  `api-results.json`, `unit-results.json`, `ui-results.json` — all inside
  the single job `test`. The default CI run identity
  `gha:{GITHUB_RUN_ID}:{GITHUB_RUN_ATTEMPT}:{GITHUB_JOB}` is therefore
  **identical for all three files**; naive imports deduplicate them into
  one run and silently lose two gates' evidence (observed during the
  first real artifact import).
- Decision: when importing per-step CI artifacts, pass an explicit
  `--run-id` with a step suffix —
  `gha:{runId}:{attempt}:{job}:{step}` — e.g.
  `gha:42308478134:1:test:ui`. The contract is unchanged; `--run-id` is
  the existing escape hatch.
- Alternatives considered: (a) extend `RunWorkflow` with a `step` field —
  rejected for now, a contract change needs a schema version bump and is
  not justified while a documented escape hatch exists; (b) one merged
  results file — rejected, it would erase gate boundaries.
- Consequences: documented import procedure in
  `docs/observability.md`; the importer must pass `--run-id` (a
  documented manual step, not automatic); if step-level identity is ever
  needed inside the schema itself, revisit as contract v2.
