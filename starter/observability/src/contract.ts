/**
 * Normalized observability contract — "ai-native-qa/observability" v1.
 *
 * This is our own versioned schema, NOT Playwright's native JSON report
 * format. parse.ts translates the real Playwright output into this shape;
 * everything downstream (metrics, history, report) consumes only this
 * contract.
 *
 * Semantics:
 * - `null` means "not present in the source". It is never replaced by 0,
 *   "" or "passed". Missing data stays missing.
 * - A logical test is counted once regardless of retries; its attempt
 *   history lives in `attempts[]`. Outcome and attempts are separate.
 * - `completeness` describes the execution, never the verdict:
 *   complete | partial | unknown (reason required for non-complete).
 */

export const SCHEMA_VERSION = '1.0.0' as const;

export type RunSource = 'local' | 'github-actions';
export type Completeness = 'complete' | 'partial' | 'unknown';
export type TestOutcome = 'passed' | 'failed' | 'flaky' | 'skipped' | 'unknown';
export type ErrorKind = 'timeout' | 'assertion' | 'other';
export type ExpectedStatus = 'passed' | 'failed' | 'skipped';

export interface RunWorkflow {
  name: string | null;
  runId: string | null;
  runAttempt: string | null;
  job: string | null;
  /** Only populated from real GITHUB_* env vars — never fabricated. */
  url: string | null;
}

export interface NormalizedAttempt {
  /** Playwright retry index (0 = first attempt). */
  retry: number;
  /** Raw attempt status from the source, or 'unknown' when absent. */
  status: string;
  durationMs: number;
  startTime: string | null;
  /** sha256 of the normalized error message — never the message itself. */
  errorFingerprint: string | null;
  errorKind: ErrorKind | null;
}

export interface NormalizedTest {
  /**
   * Stable logical identity: sha256(projectName|file|suitePath|title).
   * Renaming a title, file or describe block creates a NEW testKey —
   * documented limitation: renames break per-test trend continuity.
   */
  testKey: string;
  title: string;
  suitePath: string[];
  file: string;
  project: string;
  expectedStatus: ExpectedStatus;
  /** Final logical outcome — one per test, derived from attempt history. */
  outcome: TestOutcome;
  /** Sum of attempt durations (ms). Not runner wall-clock time. */
  durationMs: number;
  attempts: NormalizedAttempt[];
}

export interface NormalizedRun {
  schemaVersion: typeof SCHEMA_VERSION;
  run: {
    /** gha:{runId}:{attempt}:{job} in CI, or sha256:{fileHash} otherwise. */
    runId: string;
    source: RunSource;
    /** When the importer ran (clock of the importing machine). */
    importedAt: string;
    /** stats.startTime from the source report. */
    executedAt: string | null;
    commitSha: string | null;
    branch: string | null;
    workflow: RunWorkflow;
    playwrightVersion: string | null;
    completeness: Completeness;
    completenessReason: string | null;
    /** Which normalized field came from where — per-field provenance. */
    provenance: Record<string, string>;
  };
  suite: {
    /** Sorted distinct Playwright project names seen in this run. */
    projectSet: string[];
    specFileCount: number;
    specFiles: string[];
  };
  /** Counts over logical tests — recomputed, not copied from stats. */
  summary: {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    unknown: number;
    /** Runner-reported wall duration from stats.duration (null if absent). */
    durationMs: number | null;
  };
  tests: NormalizedTest[];
  evidence: {
    htmlReport: string | null;
    artifactName: string | null;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const OUTCOMES: readonly string[] = ['passed', 'failed', 'flaky', 'skipped', 'unknown'];
const COMPLETENESS: readonly string[] = ['complete', 'partial', 'unknown'];
const EXPECTED: readonly string[] = ['passed', 'failed', 'skipped'];
const SOURCES: readonly string[] = ['local', 'github-actions'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isStrOrNull(v: unknown): boolean {
  return v === null || isStr(v);
}
function oneOf(v: unknown, allowed: readonly string[]): boolean {
  return isStr(v) && allowed.includes(v);
}

/**
 * Structural validator for NormalizedRun. Unknown extra fields are
 * tolerated (forward compatibility); required fields must exist with the
 * right type. Returns the run typed as NormalizedRun only when ok.
 */
export function validateNormalizedRun(value: unknown): {
  ok: boolean;
  issues: ValidationIssue[];
  run: NormalizedRun | null;
} {
  const issues: ValidationIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });

  if (!isObj(value)) {
    return { ok: false, issues: [{ path: '$', message: 'not an object' }], run: null };
  }
  const v = value as Record<string, unknown>;

  if (v.schemaVersion !== SCHEMA_VERSION) {
    bad('schemaVersion', `expected "${SCHEMA_VERSION}", got ${JSON.stringify(v.schemaVersion)}`);
  }

  const run = v.run;
  if (!isObj(run)) {
    bad('run', 'missing or not an object');
  } else {
    if (!isStr(run.runId) || run.runId.length === 0) bad('run.runId', 'missing');
    if (!oneOf(run.source, SOURCES)) bad('run.source', `expected one of ${SOURCES.join('|')}`);
    if (!isStr(run.importedAt)) bad('run.importedAt', 'missing');
    if (!isStrOrNull(run.executedAt)) bad('run.executedAt', 'must be string|null');
    if (!isStrOrNull(run.commitSha)) bad('run.commitSha', 'must be string|null');
    if (!isStrOrNull(run.branch)) bad('run.branch', 'must be string|null');
    if (!isStrOrNull(run.playwrightVersion)) bad('run.playwrightVersion', 'must be string|null');
    if (!oneOf(run.completeness, COMPLETENESS)) {
      bad('run.completeness', `expected one of ${COMPLETENESS.join('|')}`);
    }
    if (run.completeness !== 'complete' && !isStr(run.completenessReason)) {
      bad('run.completenessReason', 'required when completeness is not "complete"');
    }
    if (!isObj(run.workflow)) {
      bad('run.workflow', 'missing or not an object');
    } else {
      for (const f of ['name', 'runId', 'runAttempt', 'job', 'url'] as const) {
        if (!isStrOrNull(run.workflow[f])) bad(`run.workflow.${f}`, 'must be string|null');
      }
    }
    if (!isObj(run.provenance)) bad('run.provenance', 'missing or not an object');
  }

  const suite = v.suite;
  if (!isObj(suite)) {
    bad('suite', 'missing or not an object');
  } else {
    if (!Array.isArray(suite.projectSet) || !suite.projectSet.every(isStr)) {
      bad('suite.projectSet', 'must be string[]');
    }
    if (!isNum(suite.specFileCount)) bad('suite.specFileCount', 'must be number');
    if (!Array.isArray(suite.specFiles) || !suite.specFiles.every(isStr)) {
      bad('suite.specFiles', 'must be string[]');
    }
  }

  const summary = v.summary;
  if (!isObj(summary)) {
    bad('summary', 'missing or not an object');
  } else {
    for (const f of ['total', 'passed', 'failed', 'flaky', 'skipped', 'unknown'] as const) {
      if (!isNum(summary[f])) bad(`summary.${f}`, 'must be number');
    }
    if (!(summary.durationMs === null || isNum(summary.durationMs))) {
      bad('summary.durationMs', 'must be number|null');
    }
  }

  if (!Array.isArray(v.tests)) {
    bad('tests', 'missing or not an array');
  } else {
    v.tests.forEach((t, i) => {
      const p = `tests[${i}]`;
      if (!isObj(t)) {
        bad(p, 'not an object');
        return;
      }
      if (!isStr(t.testKey) || t.testKey.length === 0) bad(`${p}.testKey`, 'missing');
      if (!isStr(t.title)) bad(`${p}.title`, 'missing');
      if (!Array.isArray(t.suitePath) || !t.suitePath.every(isStr)) {
        bad(`${p}.suitePath`, 'must be string[]');
      }
      if (!isStr(t.file)) bad(`${p}.file`, 'missing');
      if (!isStr(t.project)) bad(`${p}.project`, 'missing');
      if (!oneOf(t.expectedStatus, EXPECTED)) bad(`${p}.expectedStatus`, `expected one of ${EXPECTED.join('|')}`);
      if (!oneOf(t.outcome, OUTCOMES)) bad(`${p}.outcome`, `expected one of ${OUTCOMES.join('|')}`);
      if (!isNum(t.durationMs) || t.durationMs < 0) bad(`${p}.durationMs`, 'must be number >= 0');
      if (!Array.isArray(t.attempts)) {
        bad(`${p}.attempts`, 'missing or not an array');
      } else {
        t.attempts.forEach((a, j) => {
          const ap = `${p}.attempts[${j}]`;
          if (!isObj(a)) {
            bad(ap, 'not an object');
            return;
          }
          if (!isNum(a.retry) || a.retry < 0) bad(`${ap}.retry`, 'must be number >= 0');
          if (!isStr(a.status)) bad(`${ap}.status`, 'missing');
          if (!isNum(a.durationMs) || a.durationMs < 0) bad(`${ap}.durationMs`, 'must be number >= 0');
          if (!isStrOrNull(a.startTime)) bad(`${ap}.startTime`, 'must be string|null');
          if (!isStrOrNull(a.errorFingerprint)) bad(`${ap}.errorFingerprint`, 'must be string|null');
          if (!(a.errorKind === null || isStr(a.errorKind))) bad(`${ap}.errorKind`, 'must be string|null');
        });
      }
    });
  }

  const ev = v.evidence;
  if (!isObj(ev)) {
    bad('evidence', 'missing or not an object');
  } else {
    if (!isStrOrNull(ev.htmlReport)) bad('evidence.htmlReport', 'must be string|null');
    if (!isStrOrNull(ev.artifactName)) bad('evidence.artifactName', 'must be string|null');
  }

  return { ok: issues.length === 0, issues, run: issues.length === 0 ? (v as unknown as NormalizedRun) : null };
}
