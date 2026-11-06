# Architecture — Capstone

## Layers

``` text
                 ┌──────────────────────────────────────────┐
                 │        GitHub Actions: Playwright Tests   │
                 │  typecheck → api → obs-unit → ui  (gates) │
                 └───────────────┬──────────────────────────┘
                                 │ playwright JSON reporter
                                 ▼
                 ┌──────────────────────────────────────────┐
                 │  observability/last-run/*.json (transient)│
                 └───────────────┬──────────────────────────┘
                                 │ observe:import (cli.ts)
                                 ▼
        parse.ts ──► contract.ts ──► history.ts ──► metrics.ts ──► report.ts
        (real PW     (schema v1,    (runs/, dedup  (pure: rates,  (markdown
         shape)       validate)      by runId)      cohorts)       report.md)

   tests/                       starter/tests/…
   ├── pages/*.page.ts          Page Objects (login, inventory,
   │                             product-details, cart)
   ├── fixtures.ts              authenticatedPage + POM fixtures
   ├── data/*.ts                typed test data (users, products)
   ├── api/products.api.ts      DummyJSON client (request context)
   ├── saucedemo.spec.ts        UI scenarios
   ├── example.spec.ts          scaffold smoke spec
   └── observability/*.spec.ts  28 unit tests, synthetic fixtures only
```

## Responsibilities

| Module | Responsibility | Must not do |
| ------ | -------------- | ----------- |
| `pages/` | Locators + page actions | Assertions live in specs, not POMs |
| `fixtures.ts` | Compose authenticated state + POMs | Business logic |
| `api/` | Typed request wrappers | UI concerns |
| `parse.ts` | Translate real Playwright JSON → contract (pure) | Filesystem/env access; fabricate missing data |
| `contract.ts` | Versioned schema + structural validation | Mutate input |
| `metrics.ts` | Pure metric formulas | Divide by zero; infer missing values; compare incompatible populations |
| `history.ts` | Durable per-run files, dedup | Double-count a re-imported run |
| `report.ts` | Render history honestly | Smooth over missing/partial data |
| `cli.ts` | Env/git provenance + IO orchestration | Guess unverifiable metadata |

## Key decisions

See `docs/adr/`:

- ADR-0001: versioned normalized contract instead of consuming the
  Playwright JSON schema directly.
- ADR-0002: per-step `--run-id` when importing multi-step CI evidence
  (the `gha:{runId}:{attempt}:{job}` identity is per *job* — it collides
  across steps).

## Dependencies

Runtime: Node ≥ 22.18 (native TS strip for `observability/src/cli.ts`),
`@playwright/test` 1.64.1 (only npm dependency). External services:
saucedemo.com, dummyjson.com, playwright.dev, npm registry, Playwright
browser hosts.
