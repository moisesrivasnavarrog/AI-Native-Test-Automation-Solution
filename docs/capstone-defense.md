# Capstone Technical Defense — Preparation Guide

Target: 10–15 minutes. This is a preparation guide, not a script to read —
the student must answer in their own words. Nothing here is a fictitious
answer attributed to the student.

## Suggested flow

1. **Business problem & risks** (~2 min): SauceDemo UI + DummyJSON API as
   independent practice systems; the risk is shipping a regression —
   BR-01…BR-06 in `docs/test-strategy.md`.
2. **Strategy & prioritization** (~2 min): narrow-but-real coverage;
   happy paths deliberately; gates honest before comprehensive.
3. **Architecture & ADRs** (~2 min): layers in `docs/architecture.md`;
   ADR-0001 (normalized contract), ADR-0002 (per-step run identity —
   a real bug found during the first CI import).
4. **Demo** (~4 min): Actions tab → run 42308478134 (4 green gates,
   artifacts) → run 42308709001 (red gate on the demo PR) →
   `starter/observability/report.md` (5 real runs, mixed local/gha).
5. **Observability & traceability** (~2 min): contract v1, `testKey`,
   attempts vs outcome, comparability cohorts, "insufficient data" policy.
6. **Results, limitations, residual risks** (~2 min): AC matrix in
   `docs/capstone-review.md`; risk register.
7. **Proposed evolution** (~1 min): contract v2 with step field, broader
   UI coverage, negative paths.

## Panel questions + what a solid answer covers

1. **Why this architecture?** — separation: POM/fixtures (UI) vs request
   client (API) vs pure observability pipeline; each layer has one job
   and a documented "must not do".
2. **What did you decide NOT to automate and why?** — negative login,
   checkout, ReqRes, GraphQL; deliberate scope + public-site limits,
   recorded in the risk register rather than claimed as done.
3. **How do you verify CI reports a real failure?** — PR #1 / run
   42308709001: intentional failure went red at the exact gate, then the
   branch was deleted; the check is required on `main`.
4. **How do you distinguish product vs automation vs infrastructure
   defects?** — errorKind classification (timeout/assertion/other),
   fingerprints for cross-run comparison, service-dependency list;
   correlation ≠ cause rule in metrics.
5. **What evidence backs the metrics?** — every metric in
   `observability.md` has formula + denominator + source + limitations;
   denominators shown in the report ("denominator: 12 executed tests").
6. **What if the public practice service is unavailable?** — treat the
   red as real, verify service recovery, re-run; the gate failing on an
   external outage is honest behavior, not a bug.
7. **What did the AI agent contribute vs what you reviewed?** — agent did
   audit → proposal → gated implementation; human approved scope; the
   agent itself caught and corrected a provenance bug (wrong commitSha)
   before committing.
8. **Trade-off to reduce feedback time?** — e.g., chromium-only smoke on
   PRs vs full matrix; retries already CI-only; accept narrower browser
   matrix per run.
9. **Open risks?** — R-04 (happy-path-only coverage), R-05 (external
   services), R-07 (manual import step).
10. **How to scale without over-engineering?** — more specs behind the
    same gates; contract v2 only when a real need (step identity)
    appears; no database until file history demonstrably hurts.
11. **Why is `flaky` not counted as passed?** — a retry-green suite at
    "100%" hides instability; denominators exclude skipped/unknown so
    rates reflect executed tests honestly.
12. **How is a re-imported run not double-counted?** — runId dedup in
    `history.ts` (`duplicate` no-op); verified by unit test.

## Do / don't

- Do show real artifacts; know every number's denominator.
- Don't claim "fully validated", "enterprise-ready", or coverage that
  does not exist. Say "not verified" where it applies — it is credible.
