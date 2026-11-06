# Observability & Feedback — Increment #08

A minimal observability layer that turns real Playwright JSON results
into normalized data, reproducible metrics, a durable run history, and
a static Markdown report — with an explicit feedback loop.

> A metric is only acceptable if its origin, formula, denominator,
> limitations, and relationship to the original evidence can be
> explained. Missing data is reported as **"Insufficient data"** or
> `null` — never fabricated.

## Requirements

- Node.js **>= 22.18** (the CLI runs TypeScript directly via Node's
  native type stripping; `node:lts/*` in CI satisfies this).
- No npm dependencies beyond the existing `@playwright/test`.

## Data flow

``` text
playwright.config.ts  JSON reporter ──► observability/last-run/*.json
        (PW_OBSERVABILITY_JSON per CI step)
                                          │
                                          ▼
                    observe import  ──► parse.ts   (validate real PW format)
                                          │
                                          ▼
                                   contract.ts   (schemaVersion "1.0.0",
                                                  structural validation)
                                          │
                                          ▼
                                   normalize     (testKey, outcome,
                                                  attempts, completeness,
                                                  provenance)
                                          │
                                          ▼
                    observability/runs/<run>.json  (history.ts: dedup by
                                                  runId, idempotent)
                                          │
                                          ▼
                                   metrics.ts    (pure functions)
                                          │
                                          ▼
                    observe report ──► observability/report.md
                                          │
                                          ▼
                              feedback loop (see below)
```

## Usage

``` bash
cd starter

# 1. Run tests — results.json is produced automatically.
npx playwright test

# 2. Import the structured results into history.
npm run observe:import -- observability/last-run/results.json

# 3. Regenerate the report from all of history.
npm run observe:report

# Dry-run a file without writing anything:
npm run observe:inspect -- observability/last-run/results.json
```

`observe import` options: `--source local|ci` (default: auto-detect
`GITHUB_*`), `--evidence <path>` (link an HTML report), `--runs-dir`,
`--run-id`. `observe report` options: `--runs-dir`, `--out`.

Importing CI evidence: download the `observability-results` artifact
from a GitHub Actions run, unzip it, and `observe import` each
`*-results.json`. Nothing is fetched or pushed automatically.

> **Per-step run identity (required for CI imports):** the workflow runs
> three test steps inside one job, so the default
> `gha:{runId}:{attempt}:{job}` identity is identical for all three files
> — importing without an override deduplicates them into a single run
> and loses two gates. Always pass a step suffix:
>
> ``` bash
> npm run observe:import -- api-results.json  --source ci \
>   --run-id "gha:<RUN_ID>:<ATTEMPT>:test:api"
> npm run observe:import -- unit-results.json --source ci \
>   --run-id "gha:<RUN_ID>:<ATTEMPT>:test:unit"
> npm run observe:import -- ui-results.json   --source ci \
>   --run-id "gha:<RUN_ID>:<ATTEMPT>:test:ui"
> ```
>
> When importing outside CI, set the real `GITHUB_*` values of the run
> (`GITHUB_WORKFLOW/RUN_ID/RUN_ATTEMPT/JOB/SHA/REF_NAME/SERVER_URL/
> REPOSITORY`) so workflow provenance and the run URL are recorded
> truthfully. See `docs/adr/0002-ci-step-run-identity.md`.

## Contract — `ai-native-qa/observability` v1

Defined and validated in `starter/observability/src/contract.ts`
(`schemaVersion: "1.0.0"`). This is our own schema — distinct from the
Playwright JSON report format it is derived from.

- **Run identity**: `runId` = `gha:{runId}:{attempt}:{job}` when
  `GITHUB_RUN_ID/RUN_ATTEMPT/JOB` are all present, else
  `sha256:{sourceFileHash}` (idempotent: re-importing the same file is a
  no-op). `source`, `executedAt` (from `stats.startTime`), `commitSha`,
  `branch`, `workflow` — each `null` when not verifiably available.
- **Test identity**: `testKey = sha256(projectName|file|suitePath|title)`.
  Renaming a title, spec file, or `describe` block creates a *new*
  testKey — per-test trend continuity is lost across renames (known
  limitation; two tests with identical `project+file+suite+title` would
  collide and is documented as unsupported).
- **Outcome vs attempts**: a logical test is counted once. `outcome`
  maps from the reporter's test status (`expected`→passed,
  `unexpected`→failed, `flaky`→flaky, `skipped`→skipped); per-attempt
  detail lives in `attempts[]` (`retry`, `status`, `durationMs`,
  `errorFingerprint`, `errorKind`). A test failing then passing on
  retry is `flaky` — never two tests.
- **`expectedStatus`** is preserved, so `test.fail()` semantics are
  visible (an expected failure counts as `passed`, matching
  Playwright's `ok`).
- **Completeness**: `complete` (stats reconcile, no anomalies) ·
  `partial` (interrupted/missing attempts or stats mismatch, reason
  recorded) · `unknown` (`stats` absent — consistency unverifiable).
- **Errors**: only `errorFingerprint` (sha256 of a normalized message)
  and `errorKind` (`timeout|assertion|other`) are persisted. Raw
  messages, stdout, and stderr are never stored — they could carry
  sensitive data.
- **`null` policy**: `null` means "absent in source". It is never
  replaced by `0`, `""`, or `passed`.
- **Evidence**: real local paths / artifact names / workflow URLs only.
  No invented links.

## Metrics dictionary

| Metric | Formula | Denominator | Source | Limitations |
| ------ | ------- | ----------- | ------ | ----------- |
| passed / failed / flaky / skipped / unknown | count of logical tests by `outcome` | — | normalized `tests[]` | retries never inflate counts |
| pass rate | `passed / (passed+failed+flaky)` | executed logical tests; skipped & unknown excluded from both sides | normalized | `flaky` is not "passed" — a retry-green suite shows <100%; 100% ≠ absence of risk |
| skipped share | `skipped / total` | all logical tests | normalized | — |
| flaky rate | `flaky / executed` | executed logical tests | attempts[] | `null` when no attempt data; sample size always shown |
| run duration | `stats.duration` | — | reporter | wall-clock of the test run, **not** push-to-feedback time |
| test duration | `Σ tests[].durationMs` (Σ attempts) | — | normalized | excludes runner/hook overhead |
| p50 / p95 | nearest-rank percentile of executed-test durations | — | normalized | shown only with ≥5 executed tests |
| trends (Δ) | latest − previous **comparable** run | — | history | requires ≥2 runs with identical project set **and** spec files; else **Insufficient data** |
| per-test flakiness | `flakyCount / appearances` | executed appearances in the comparable cohort | history | `lowSample` flag below 5 appearances |

Rules enforced in `metrics.ts`: never divide by zero (→ `null`), never
substitute missing values with zero, never compare incompatible
populations silently, never infer cause from correlation.

## Files

| Path | Purpose |
| ---- | ------- |
| `observability/src/*.ts` | contract, parser, metrics, history, report, CLI |
| `observability/last-run/` | transient reporter output (gitignored) |
| `observability/runs/` | normalized history — one JSON per run (~3–8 KB) |
| `observability/report.md` | generated report (regenerate; do not edit) |
| `tests/observability/` | unit tests + SYNTHETIC fixtures (never real evidence) |

## Retention & cleanup

- `observability/last-run/`: overwritten every test run — safe to
  delete anytime.
- `observability/runs/`: bounded by design but grows one file per
  import. To prune, simply delete old files and regenerate the report.
  If it ever grows large, archive older runs outside the repo before
  deleting.
- The `observability-results` CI artifact retains JSON results for 30
  days — temporary evidence, **not** a durable store. Durable history
  is `observability/runs/` (commit it if you want history in git; the
  files are small).

## The feedback loop

Observability exists to drive action — not dashboards. The loop is
deliberately gated by human approval, same as this increment:

``` text
1. SIGNAL    — the report shows something worth attention
               (e.g. flaky rate > 0, duration climbing, failures).
2. EVIDENCE  — trace the signal to its source: the normalized run,
               the original results.json, the CI artifact/HTML report.
               Never act on a metric you cannot trace.
3. HYPOTHESIS— write down what you think is happening and why.
               Correlation is not cause.
4. ACTION    — propose a change (test fix, retry policy, quarantine,
               config change) with expected effect on which metric.
5. APPROVAL  — a human reviews hypothesis + action before any change.
6. VALIDATION— re-run, re-import, compare the SAME metric later.
               Only then is the hypothesis confirmed or rejected.
```

## Limitations (be honest about them)

- History is local unless `observability/runs/` is committed; CI runs
  do not write back into the repo automatically.
- Per-CI-step results reflect that step's test selection — the API
  gate (chromium only) and UI gate (3 projects) are **not comparable**
  populations; the report refuses to trend them together.
- Rename of a title/file/describe = new `testKey` → trend break.
- JSON reporter schema is Playwright-version-sensitive; the parser
  validates the real shape and reports anomalies rather than guessing.
- The report is static Markdown by design — no database, no service.
