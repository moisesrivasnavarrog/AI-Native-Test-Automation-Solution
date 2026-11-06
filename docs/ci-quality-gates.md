# CI Quality Gates — Playwright Tests workflow

The `Playwright Tests` workflow (`.github/workflows/playwright.yml`)
validates the `starter/` project on every pull request, on pushes to
`main`, and on manual dispatch.

## What the check runs

The single `test` job applies four gates in order. Each gate must
exit `0` — a failure stops the job and fails the check. No gate uses
`continue-on-error`, `|| true`, or any other construct that would
turn a failure into a pass.

| Gate | Command | What it validates |
| ---- | ------- | ----------------- |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | `starter/tsconfig.json` strict mode over all `*.ts` |
| API tests | `npx playwright test tests/api --project=chromium` | DummyJSON suite in `tests/api/` (request context only — no browser exercised, so one project suffices) |
| Observability unit tests | `npx playwright test tests/observability --project=chromium` | Pure-logic tests for the observability pipeline (`starter/observability/`) — parser, metrics, history, report |
| UI tests | `npx playwright test tests/saucedemo.spec.ts tests/example.spec.ts` | SauceDemo suite + scaffold example across chromium, firefox, webkit |

Reproduce locally:

``` bash
cd starter
npm ci
npm run typecheck
npx playwright test tests/api --project=chromium
npx playwright test tests/observability --project=chromium
npx playwright test tests/saucedemo.spec.ts tests/example.spec.ts
```

## Artifacts

| Artifact | When | Contents | Retention |
| -------- | ---- | -------- | --------- |
| `playwright-report` | Always (unless cancelled) | Playwright HTML report | 30 days |
| `observability-results` | Always (unless cancelled) | Per-gate Playwright JSON reports (`api-results.json`, `unit-results.json`, `ui-results.json`) for the observability pipeline | 30 days |
| `test-results` | On failure only | Traces and screenshots (`trace: on-first-retry` output) | 7 days |

Each test step sets `PW_OBSERVABILITY_JSON` so the JSON reporter writes
a distinct file per gate instead of overwriting a shared one. See
`docs/observability.md` for how these files are normalized and reported.

## Security posture

- `permissions: contents: read` — the `GITHUB_TOKEN` is read-only.
- `pull_request` (never `pull_request_target`): fork PRs run
  untrusted code without access to secrets or a write token.
- No secrets are used or logged. The SauceDemo credentials in
  `tests/data/users.ts` are the site's public demo login.
- `concurrency` cancels superseded runs on the same ref.

## Marking the check as required (manual step)

The workflow only *produces* the check. Blocking merges on it is a
repository setting — configure it manually:

1. Repository → **Settings** → **Branches** → **Add branch ruleset**
   (or classic *branch protection rule*) for `main`.
2. Enable **Require status checks to pass before merging**.
3. Search for and select the check named **`test`** (the job name
   inside the *Playwright Tests* workflow — it appears after the
   workflow has run at least once on a PR).
4. Save. Optionally also enable *Require branches to be up to date*.

Equivalent CLI (requires admin rights on the repo):

``` bash
gh api repos/{owner}/{repo}/rulesets \
  --method POST \
  --input ruleset.json   # ruleset requiring check "test"
```

Do not mark required checks on a repository you do not administer;
the list above is documentation, not an automated change.

## External dependencies

These gates call real public services — treat related failures as
real, and re-run after confirming the service recovered:

- `https://www.saucedemo.com/` — UI suite login/cart flows
- `https://dummyjson.com/` — API suite
- `https://playwright.dev/` — scaffold example spec
- npm registry + Playwright browser-download hosts — `npm ci` and
  `npx playwright install --with-deps`
