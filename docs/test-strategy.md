# Test Strategy — Capstone

## Scope

Two independent practice systems, never integrated with each other:

- **SauceDemo** (`https://www.saucedemo.com/`) — UI flows: login and cart.
- **DummyJSON** (`https://dummyjson.com/`) — REST contract checks.
- `tests/example.spec.ts` (playwright.dev) is a scaffold smoke spec kept
  intentionally: it proves the runner/config independently of the business
  systems. It adds one external dependency and is flagged in the risk
  register.

Out of scope: GraphQL (not required), ReqRes (not used), persistence
assertions on DummyJSON (it is a simulated API — writes are not durable),
load/performance testing, visual regression.

## Requirements and business risks

| ID | Business risk | Coverage | Priority |
| -- | ------------- | -------- | -------- |
| BR-01 | User cannot authenticate → every flow blocked | `saucedemo.spec.ts` login test via `authenticatedPage` fixture | Critical |
| BR-02 | Catalog shows wrong/inconsistent data | Products page title + 6-item count assertion | High |
| BR-03 | Cart operations broken → cannot purchase | Add-to-cart happy path (details → badge → cart contents) | Critical |
| BR-04 | API contract drift breaks consumers | `products.spec.ts` GET `/products/{id}` (status, id, title, price) | High |
| BR-05 | Regression merged before detection | `Playwright Tests` check, required on `main` | Critical |
| BR-06 | Results not investigable historically | Observability pipeline (normalized runs + report) | High |

## Deliberate coverage limits (and why)

- **Happy-path only for UI.** No negative-login or cart-remove/checkout
  tests. Rationale: practice-system scope; a failing negative test against
  a shared public demo site provides weak signal. Recorded as residual
  risk R-04, not hidden.
- **One API contract.** A single well-typed GET demonstrates the client +
  assertion pattern without pretending coverage we do not have.
- **Retries:** `retries: 2` on CI only, 0 locally — documented; flaky is
  surfaced by the observability pipeline rather than masked by retry
  counting (flaky ≠ passed in metrics).

## Priorities

1. Gates must be honest (no `continue-on-error`, no `|| true`).
2. Evidence must be traceable (normalized run → CI run → artifact).
3. Coverage is deliberately narrow but real over broad but unverified.

See `docs/risk-register.md` for severity/mitigation/residual risk and
`docs/traceability.md` for requirement → test → run evidence links.
