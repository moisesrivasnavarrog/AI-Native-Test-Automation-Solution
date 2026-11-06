# Starter — Recovery Playwright Project (course evolution)

This directory began as a **ready-to-run Playwright + TypeScript
project** — the recovery path for Lab 0. It has since evolved through
course increments into the capstone reference solution: Page Object
Model + fixtures, a DummyJSON API suite, CI quality gates, and an
observability pipeline. The Lab-0 recovery instructions below still
apply.

> Capstone docs live in `../docs/`: test-strategy, architecture,
> traceability, risk-register, adr/, capstone-review, capstone-defense.

## When to use it

``` text
Lab 0 issue (npm init playwright fails, scaffold confusion,
broken config, browser install fails)
  ↓
Quick Fix → ../docs/troubleshooting.md
  ↓
Fixed in <5 min?
 ├── Yes → continue with your own project
 └── No  → use this starter project → continue the course
```

Use it when `npm init playwright` fails, the generated scaffold is
confusing or broken, or browser installation will not cooperate and
the fix is not quick. Resolve the underlying environment issue later
with your instructor or IT — do not let it consume the session.

## Run it

From the repository root:

``` bash
cd starter
npm ci
npx playwright install
npx playwright test
```

Expected result: the example tests in `tests/` run and pass, and a
summary like `6 passed` is printed. Other commands you saw in Lab 0
work the same way:

``` bash
npm test              # same as npx playwright test
npm run test:ui       # interactive UI Mode
npm run show-report   # open the HTML report
```

## Publish it to your own GitHub repository

The starter is committed inside the starter-kit repository. To see a
GitHub Actions run under **your** account, publish it to a repository
you own:

1. Create a new repository on GitHub (web UI). Do **not** initialize
   it with a README.
2. Point `origin` at your repository and push:

   ``` bash
   git remote set-url origin <your-repository-url>
   git branch -M main
   git push -u origin main
   ```

   If `git remote -v` shows no `origin`, use `git remote add origin
   <your-repository-url>` instead of `set-url`.

3. Open your repository → **Actions** → the **Playwright Tests**
   workflow runs automatically on the push. The HTML report is
   uploaded as a `playwright-report` artifact on each run.

If push authentication fails, see
[../docs/troubleshooting.md](../docs/troubleshooting.md).

## Honest limitations

Clone-and-continue removes the scaffolding step, **not** the
environment requirements. This path still needs:

- Node.js LTS and npm (`npm ci` installs dependencies).
- Network access to the npm registry and the Playwright
  browser-download hosts (`npx playwright install` downloads browser
  binaries).
- Access to `playwright.dev`, which the example tests visit.

If your blocker is a restricted or corporate network, the fix is a
different network (for example, home or a hotspot) or an IT
escalation — this project cannot download packages or browsers it
cannot reach. See
[../docs/troubleshooting.md](../docs/troubleshooting.md) for the exact
endpoints to send to your IT team.

## What this project is now

Beyond the Lab-0 scaffold it now includes (added across increments):

- `tests/pages/` — Page Objects; `tests/fixtures.ts` — authenticated
  fixtures; `tests/data/` — typed test data.
- `tests/api/` — DummyJSON contract suite; `tests/saucedemo.spec.ts` —
  SauceDemo UI scenarios; `tests/example.spec.ts` — scaffold smoke spec.
- `observability/` — normalized run history, metrics, and generated
  `report.md` (see `../docs/observability.md`; `observe:*` npm scripts).
- `tests/observability/` — unit tests for that pipeline (synthetic
  fixtures only, never real evidence).

Useful commands: `npm test`, `npm run typecheck`,
`npm run test:observability`, `npm run observe:report`.
