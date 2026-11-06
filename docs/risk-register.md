# Risk Register — Capstone

| ID | Risk | Severity | Mitigation in place | Residual |
| -- | ---- | -------- | ------------------- | -------- |
| R-01 | SauceDemo is a shared public demo site — inventory/users can be reset or unstable | Medium | Minimal assertions on stable surface; external-dependency note in `ci-quality-gates.md`; re-run policy documented | Medium — outage still fails the gate (correct behavior) |
| R-02 | DummyJSON is simulated — writes/persistence cannot be asserted | Low | GET-only contract test; strategy documents non-persistence | Low |
| R-03 | playwright.dev dependency via scaffold `example.spec.ts` | Low | Kept deliberately as config smoke test; documented | Low — removable if it flakes |
| R-04 | UI coverage is happy-path only (no negative login, remove, checkout) | Medium | Declared in test-strategy, not hidden; prioritized if scope expands | Medium — accepted, documented |
| R-05 | Public services down → false red checks | Medium | Treat service failures as real signal; verify service recovery before re-run; distinguish infra vs product defects in report notes | Medium |
| R-06 | Renaming tests/files breaks `testKey` trend continuity | Low | Documented in `observability.md` and ADR-0001 | Low — accepted limitation |
| R-07 | Observability import is manual — history can lag CI | Medium | Documented procedure; `runs/` now committed for durability | Medium |
| R-08 | Per-step CI files share job-level identity | Resolved | ADR-0002: `--run-id` per-step suffix; first real import verified | Low |
| R-09 | Error messages could carry secrets into history | Low | Only sha256 fingerprints + `errorKind` persisted; unit tests prove non-leakage | Low |
| R-10 | Single CI job = one feedback point; no staging/prod distinction | Low | Course-scope acceptable; sequential gate order gives fast typecheck signal first | Low |

## Security posture

- `permissions: contents: read`; `pull_request` (never
  `pull_request_target`); no secrets used or logged; SauceDemo
  credentials are the site's public demo login; no artifacts contain
  credentials.
- `main` requires the `test` check (set 2026-11-06 via GitHub API;
  `enforce_admins: false` — admin can still bypass; noted honestly).
