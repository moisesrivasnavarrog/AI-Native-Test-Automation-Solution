# Traceability — Capstone

Requirement → implementation → real execution evidence. All run IDs are
GitHub Actions runs on `moisesrivasnavarrog/AI-Native-Test-Automation-Solution`.

## Runs referenced

| Run | Trigger | Commit | Result | Link |
| --- | ------- | ------ | ------ | ---- |
| 42308478134 | push | `a1e52f9` | success — 4 gates green | https://github.com/moisesrivasnavarrog/AI-Native-Test-Automation-Solution/actions/runs/42308478134 |
| 42308709001 | PR #1 (demo branch) | `ca10cc2` | failure — red at Observability unit tests gate | https://github.com/moisesrivasnavarrog/AI-Native-Test-Automation-Solution/actions/runs/42308709001 |
| 42284169838 | push | `bc42a43` | success — 3-gate version | https://github.com/moisesrivasnavarrog/AI-Native-Test-Automation-Solution/actions/runs/42284169838 |

Normalized history: `starter/observability/runs/` (5 runs: 2 local +
3 github-actions) → `starter/observability/report.md`.

## Matrix

| Req | Tests | Implementation | Evidence | Status | Gap |
| --- | ----- | -------------- | -------- | ------ | --- |
| BR-01 | `saucedemo.spec.ts` "standard user can log in…" | `pages/login.page.ts`, `fixtures.ts` | run 42308478134 (UI gate, 12 passed); local run `sha256:87a2d95c…` | Implemented+validated | happy path only |
| BR-02 | same spec, title+count assertions | `pages/inventory.page.ts` | same runs | Implemented+validated | title+count only |
| BR-03 | "…add Sauce Labs Backpack to the cart" | `pages/product-details.page.ts`, `pages/cart.page.ts` | same runs | Implemented+validated | no remove/checkout |
| BR-04 | `api/products.spec.ts` GET product | `api/products.api.ts` | run 42308478134 (API gate, 1 passed) | Implemented+validated | single endpoint |
| BR-05 | whole suite via `test` check | `.github/workflows/playwright.yml` | green run 42308478134; **red run 42308709001** (PR #1 demo); required check `test` on `main` | Implemented+validated | — |
| BR-06 | `tests/observability/*` (28 unit tests) | `observability/src/*`, `runs/`, `report.md` | 3 imported gha runs from artifact `observability-results` of run 42308478134 | Implemented+validated | import is manual |

## Evidence of fail propagation (AC-06)

PR #1 added `tests/observability/gate-demo.spec.ts` with an intentional
failure on branch `capstone/gate-fail-demo`. Run **42308709001**:
Typecheck ✓ → npm ci ✓ → API tests ✓ → **Observability unit tests ✗** →
UI tests skipped. The PR was closed unmerged and the branch deleted
after capture — the run remains in Actions history.
