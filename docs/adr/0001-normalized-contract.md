# ADR-0001: Versioned normalized contract over raw Playwright JSON

- Status: accepted (Increment #08)
- Context: Playwright's JSON report shape is version-sensitive and mixes
  per-attempt detail with test-level verdicts. Metrics, history, and
  reporting built directly on it would silently inherit upstream schema
  changes and ambiguous semantics (e.g., retries inflating counts).
- Decision: translate each report once into our own versioned schema
  `ai-native-qa/observability` v1 (`contract.ts`). All downstream code
  consumes only the contract. `null` means "absent in source" and is
  never coerced; logical tests are counted once with attempts kept
  separately; raw error text is never persisted (sha256 fingerprints +
  `errorKind` only).
- Alternatives considered: (a) consume Playwright JSON directly —
  rejected, schema drift + no validation boundary; (b) a database —
  rejected, over-engineering for a file-based course project; (c) store
  raw errors — rejected, secrets can leak through messages.
- Consequences: schema-versioned forward compatibility via structural
  validation; renaming a test creates a new `testKey` (documented trend
  break); contract must be reviewed on Playwright major upgrades.
