# Enterprise Capstone — Final Engineering Review

## 1. Executive summary

- **Real state:** starter-kit repo evolved through Increments #01–#08,
  all committed on `main`. Increment #08 (observability) was committed as
  `a1e52f9` during this review and validated by real CI run 42308478134.
- **Critical risks addressed:** uncommitted work (now committed); no
  required check (now required); no fail-propagation evidence (now proven
  by red run 42308709001); missing capstone docs (now written).
- **Approved scope:** commit/push #08, capstone docs, README refresh,
  controlled gate-failure demo, CI-artifact→observability import, branch
  protection via API, commit evidence. All executed.

## 2. Implemented changes

| Change | Files | Reason | Approval | Result |
| ------ | ----- | ------ | -------- | ------ |
| Commit Increment #08 | workflow, observability/src, tests/observability, configs, docs/observability.md | P0-1 uncommitted work, unvalidated CI | user approval 2026-11-06 | `a1e52f9` pushed; run 42308478134 green |
| Fail-propagation demo | temp branch `capstone/gate-fail-demo`, PR #1 | P1-2 AC-06 evidence | same | run 42308709001 red at obs-unit gate; PR closed, branch deleted |
| Branch protection | repo setting | P0-2 required check | same | `test` required on `main` |
| CI artifact import | observability/runs/ (3 gha JSON) | P1-3 exercise loop | same | 3 real gha runs imported; report regenerated |
| Capstone docs | docs/{test-strategy,architecture,traceability,risk-register,capstone-review,capstone-defense}.md, adr/0001,0002 | P1-1 AC-01/02 | same | written |
| README/doc refresh | starter/README.md, docs/observability.md, docs/ci-quality-gates.md | P2-3 stale docs | same | updated |
| Provenance fix | re-imported 3 run files | agent-detected bug: first import recorded demo-branch sha `ca10cc2`; corrected to `a1e52f9` | — | verified in report |

## 3. Validations executed

| Validation | Command/run | Result | Evidence | Limitations |
| ---------- | ----------- | ------ | -------- | ----------- |
| Typecheck | `npm run typecheck` | pass | terminal (tsc --noEmit) | — |
| Observability unit tests | `npx playwright test tests/observability --project=chromium` | 28 passed | terminal output | synthetic fixtures (labeled) |
| Full CI green | run 42308478134 on `a1e52f9` | success, 4 gates | Actions UI + `gh run view` | — |
| Gate fails red | run 42308709001 (PR #1) | failure at Observability unit tests; UI skipped | Actions UI + `gh run view` | single demonstration |
| Artifact upload | `observability-results` on run 42308478134 | present, 8,848 bytes | `gh api …/artifacts` | 30-day retention |
| CI→import loop | `observe:import` ×3 from downloaded artifact | imported, complete, gha provenance | `observability/runs/`, `report.md` | manual step; per-step `--run-id` required (ADR-0002) |
| Required check | `gh api …/branches/main/protection` | `test` required | API response | `enforce_admins:false` |
| UI/API suites locally | prior local runs (today) | 12 UI + 1 API passed | `observability/runs/` local files | not re-run this session |

Not run: full local UI/API re-execution this session (CI run on the
current commit covers it); negative UI tests (out of approved scope).

## 4. Acceptance matrix

| AC | Status | Evidence | Gap |
| -- | ------ | -------- | --- |
| AC-01 | Meets | `docs/test-strategy.md`, `docs/risk-register.md` | — |
| AC-02 | Meets | `docs/architecture.md`, ADR-0001/0002 | — |
| AC-03 | Partial | 2 real UI scenarios validated (local + CI) | happy-path only, documented |
| AC-04 | Partial | 1 contract test, CI-validated | single endpoint, documented |
| AC-05 | Meets | runs 42284169838 + 42308478134 linked to commits | — |
| AC-06 | Meets | green run + red run 42308709001 + required check `test` | admin bypass possible (enforce_admins false) |
| AC-07 | Meets | normalized runs, fingerprints, artifact links, `report.md` | import is manual |
| AC-08 | Meets | formulas+denominators documented; 28 unit tests; insufficient-data honest | — |
| AC-09 | Meets | phased audit → approval → implementation; AI-detected bug disclosed and fixed | — |
| AC-10 | Not verified | student defense pending | — |

## 5. Preliminary rubric

| Dimension | Max | Evidence | Evaluation |
| --------- | --- | -------- | ---------- |
| Architecture & decisions | 20 | layers doc + 2 ADRs + working separation | evaluable; likely strong |
| UI/API automation | 25 | real validated suites, thin breadth | evaluable; coverage limits lower |
| CI/CD & Quality Gates | 20 | green+red runs, required check, honest config | evaluable; strong |
| Observability & evidence | 15 | contract, history, real gha+local runs, honest report | evaluable; strong |
| AI-assisted engineering | 10 | phased gate-respecting process | evaluable |
| Technical defense | 10 | — | **pending** — student performs it |

## 6. Residual risks and limitations

See `docs/risk-register.md`. Headlines: R-04 happy-path-only UI coverage;
R-05 public-service dependency; R-07 manual observability import;
trend history still short (5 runs — report honestly says so where
insufficient).

## 7. Architecture and ADRs

`docs/architecture.md`; `docs/adr/0001-normalized-contract.md`,
`docs/adr/0002-ci-step-run-identity.md`.

## 8. Prioritized recommendations

1. (P1) Grow UI coverage per risk register when scope allows.
2. (P2) Automate the artifact→import loop or add a CI step that exports
   normalized runs.
3. (P2) Contract v2 with step identity if per-step provenance must live
   in-schema.
4. (P3) Locator consistency pass (`data-test` over CSS classes).
5. (P3) Decide whether `example.spec.ts` stays in the UI gate.

## 9. Technical defense preparation

`docs/capstone-defense.md` — flow, 12 panel questions with evaluation
criteria, do/don't. The student must answer in their own words.

## 10. Actions requiring new approval

- Adding negative-path UI tests (new scope).
- Automating imports inside CI (new workflow behavior).
- Any contract v2 schema change.
- Any further repo-settings change.

---

## Appendix — Release review (didactic exercise, FICTITIOUS figures)

> The following numbers are a teaching case supplied by the course
> prompt. They are **not** this repository's real metrics and must not
> be mixed with them.

Fictitious case: 291/300 passed (97%); 9 failures (2 auth, 3 external
dependency, 4 unknown); 14 flaky; mandatory Quality Gate failed;
critical-requirement coverage unconfirmed.

A solid student recommendation should cover: do **not** release as-is —
the mandatory gate failed and coverage is unconfirmed; missing evidence
(cause of the 4 unknowns, auth-failure triage, flaky list, coverage map);
mitigations (fix/quarantine-by-evidence, confirm gate, re-run, verify
external deps); risk-acceptance must be owned by a named human, not the
report; conditions to reconsider = gate green + auth failures explained +
coverage confirmed, with flaky list tracked.
