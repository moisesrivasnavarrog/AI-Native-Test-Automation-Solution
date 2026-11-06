/**
 * Parser: real Playwright JSON reporter output (v1.64) → NormalizedRun.
 *
 * Validates the *actual* observed shape — it does not trust the file to
 * match the normalized contract. Anything unprocessable is rejected or
 * flagged; nothing is silently coerced to "passed".
 *
 * Pure module: no filesystem, no clock, no env access. The caller
 * (cli.ts) supplies ImportContext with verified metadata.
 */

import { createHash } from 'node:crypto';
import {
  SCHEMA_VERSION,
  type ErrorKind,
  type ExpectedStatus,
  type NormalizedAttempt,
  type NormalizedRun,
  type NormalizedTest,
  type RunSource,
  type TestOutcome,
} from './contract.ts';

export interface ImportContext {
  source: RunSource;
  /** ISO timestamp supplied by the caller (import time). */
  importedAt: string;
  /** Caller-computed sha256 of the raw source file bytes. */
  rawFileSha256: string;
  runIdOverride?: string;
  commitSha: string | null;
  branch: string | null;
  workflow: {
    name: string | null;
    runId: string | null;
    runAttempt: string | null;
    job: string | null;
    url: string | null;
  };
  playwrightVersion: string | null;
  evidence: { htmlReport: string | null; artifactName: string | null };
}

export type ParseResult =
  | { kind: 'ok'; run: NormalizedRun; warnings: string[] }
  | { kind: 'rejected'; reason: string; issues: string[] };

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** testKey: sha256(project|file|suitePath|title), first 16 hex chars. */
export function computeTestKey(project: string, file: string, suitePath: string[], title: string): string {
  return sha256Hex([project, file, suitePath.join(' > '), title].join('|')).slice(0, 16);
}

/**
 * Stable fingerprint of an error for cross-run comparison without
 * persisting message text. Normalizes digits and whitespace so e.g.
 * differing timeouts/ports still produce the same fingerprint.
 */
export function errorFingerprint(message: string): string {
  const normalized = message
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return sha256Hex(normalized).slice(0, 16);
}

export function classifyError(message: string): ErrorKind {
  const m = message.toLowerCase();
  if (m.includes('timed out') || m.includes('timeout')) return 'timeout';
  if (m.includes('expect') || m.includes('assert') || m.includes('tobe') || m.includes('tohave') || m.includes('toequal')) {
    return 'assertion';
  }
  return 'other';
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const EXPECTED_SET = new Set(['passed', 'failed', 'skipped']);

function mapOutcome(testStatus: unknown): TestOutcome {
  switch (testStatus) {
    case 'expected':
      return 'passed';
    case 'unexpected':
      return 'failed';
    case 'flaky':
      return 'flaky';
    case 'skipped':
      return 'skipped';
    default:
      return 'unknown';
  }
}

interface FlatSpec {
  file: string;
  suitePath: string[];
  title: string;
  ok: boolean | null;
  tests: Record<string, unknown>[];
}

/** Walk the recursive suite tree, collecting specs with their describe-path. */
function flattenSuites(suites: unknown[], fileHint: string | null, pathPrefix: string[], out: FlatSpec[]): void {
  for (const s of suites) {
    if (!isObj(s)) continue;
    const title = asStr(s.title);
    const file = asStr(s.file) ?? fileHint ?? 'unknown';
    const path = title ? [...pathPrefix, title] : pathPrefix;
    if (Array.isArray(s.specs)) {
      for (const spec of s.specs) {
        if (!isObj(spec)) continue;
        out.push({
          file: asStr(spec.file) ?? file,
          suitePath: path,
          title: asStr(spec.title) ?? '(untitled)',
          ok: typeof spec.ok === 'boolean' ? spec.ok : null,
          tests: Array.isArray(spec.tests) ? spec.tests.filter(isObj) : [],
        });
      }
    }
    if (Array.isArray(s.suites)) {
      flattenSuites(s.suites, file, path, out);
    }
  }
}

function extractError(result: Record<string, unknown>): string | null {
  const err = result.error;
  if (isObj(err) && typeof err.message === 'string') return err.message;
  if (Array.isArray(result.errors)) {
    for (const e of result.errors) {
      if (isObj(e) && typeof e.message === 'string') return e.message;
    }
  }
  return null;
}

/**
 * Parse a Playwright JSON report (already JSON.parsed by the caller).
 * Returns 'rejected' only when the file is not a usable report at all;
 * partial-but-real data is kept and flagged via completeness.
 */
export function parsePlaywrightJsonReport(raw: unknown, ctx: ImportContext): ParseResult {
  if (!isObj(raw)) {
    return { kind: 'rejected', reason: 'top level is not an object', issues: [] };
  }
  const issues: string[] = [];
  const warnings: string[] = [];

  const suites = raw.suites;
  if (!Array.isArray(suites)) {
    return {
      kind: 'rejected',
      reason: 'not a Playwright JSON report: "suites" array missing',
      issues: [],
    };
  }

  const stats = isObj(raw.stats) ? raw.stats : null;
  const executedAt = stats ? asStr(stats.startTime) : null;
  const statsDuration = stats ? asNum(stats.duration) : null;
  const statsCounts = stats
    ? (['expected', 'unexpected', 'flaky', 'skipped'] as const).map((k) => asNum(stats[k]))
    : null;

  const specs: FlatSpec[] = [];
  flattenSuites(suites, null, [], specs);

  const tests: NormalizedTest[] = [];
  const completenessReasons: string[] = [];

  for (const spec of specs) {
    for (const t of spec.tests) {
      const projectName = asStr(t.projectName) ?? 'unknown';
      const expectedRaw = asStr(t.expectedStatus);
      const expectedStatus: ExpectedStatus = expectedRaw !== null && EXPECTED_SET.has(expectedRaw)
        ? (expectedRaw as ExpectedStatus)
        : 'passed';
      if (expectedRaw !== null && !EXPECTED_SET.has(expectedRaw)) {
        warnings.push(`unexpected expectedStatus "${expectedRaw}" on "${spec.title}" — treated as "passed"`);
      }

      const rawResults = Array.isArray(t.results) ? t.results.filter(isObj) : [];
      const attempts: NormalizedAttempt[] = rawResults.map((r) => {
        const msg = extractError(r);
        return {
          retry: asNum(r.retry) ?? 0,
          status: asStr(r.status) ?? 'unknown',
          durationMs: asNum(r.duration) ?? 0,
          startTime: asStr(r.startTime),
          errorFingerprint: msg !== null ? errorFingerprint(msg) : null,
          errorKind: msg !== null ? classifyError(msg) : null,
        };
      });

      let outcome = mapOutcome(t.status);
      if (outcome === 'unknown' && attempts.length > 0) {
        // Schema anomaly: test-level status absent. Derive conservatively
        // from the last attempt — never assume a pass.
        const last = attempts[attempts.length - 1].status;
        if (last === 'passed') outcome = 'passed';
        else if (last === 'skipped') outcome = 'skipped';
        else if (last === 'failed' || last === 'timedOut') outcome = 'failed';
      }

      if (attempts.length === 0) {
        completenessReasons.push(`test "${spec.title}" (${projectName}) has no attempt records`);
      }
      for (const a of attempts) {
        if (a.status === 'interrupted' || a.status === 'unknown') {
          completenessReasons.push(
            `test "${spec.title}" (${projectName}) has ${a.status} attempt #${a.retry}`,
          );
        }
      }

      tests.push({
        testKey: computeTestKey(projectName, spec.file, spec.suitePath, spec.title),
        title: spec.title,
        suitePath: spec.suitePath,
        file: spec.file,
        project: projectName,
        expectedStatus,
        outcome,
        durationMs: attempts.reduce((sum, a) => sum + a.durationMs, 0),
        attempts,
      });
    }
  }

  // Completeness: 'complete' only when stats exist AND reconcile.
  let completeness: NormalizedRun['run']['completeness'];
  let completenessReason: string | null = null;
  if (stats === null) {
    completeness = 'unknown';
    completenessReason = '"stats" block missing — cannot verify execution consistency';
  } else {
    const statsTotal = statsCounts !== null && statsCounts.every((n) => n !== null)
      ? (statsCounts as number[]).reduce((a, b) => a + b, 0)
      : null;
    if (statsTotal !== null && statsTotal !== tests.length) {
      completenessReasons.push(
        `stats counts (${statsTotal}) do not match extracted logical tests (${tests.length})`,
      );
    }
    completeness = completenessReasons.length === 0 ? 'complete' : 'partial';
    completenessReason = completenessReasons.length === 0 ? null : completenessReasons.join('; ');
  }

  const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0, unknown: 0 };
  for (const t of tests) counts[t.outcome] += 1;

  const projectSet = [...new Set(tests.map((t) => t.project))].sort();
  const specFiles = [...new Set(tests.map((t) => t.file))].sort();

  const ghaTriple =
    ctx.source === 'github-actions' && ctx.workflow.runId && ctx.workflow.runAttempt && ctx.workflow.job
      ? `gha:${ctx.workflow.runId}:${ctx.workflow.runAttempt}:${ctx.workflow.job}`
      : null;
  if (ctx.source === 'github-actions' && ghaTriple === null && ctx.runIdOverride === undefined) {
    warnings.push('source=github-actions but GITHUB_RUN_ID/RUN_ATTEMPT/JOB incomplete — runId falls back to content hash');
  }
  const runId = ctx.runIdOverride ?? ghaTriple ?? `sha256:${ctx.rawFileSha256.slice(0, 16)}`;

  const run: NormalizedRun = {
    schemaVersion: SCHEMA_VERSION,
    run: {
      runId,
      source: ctx.source,
      importedAt: ctx.importedAt,
      executedAt,
      commitSha: ctx.commitSha,
      branch: ctx.branch,
      workflow: { ...ctx.workflow },
      playwrightVersion: ctx.playwrightVersion,
      completeness,
      completenessReason,
      provenance: {
        'run.executedAt': 'stats.startTime',
        'summary.durationMs': 'stats.duration',
        'tests[].testKey': 'sha256(projectName|spec.file|suitePath|spec.title)',
        'tests[].outcome': 'tests[].status (expected→passed, unexpected→failed)',
        'tests[].expectedStatus': 'tests[].expectedStatus',
        'tests[].durationMs': 'sum(tests[].results[].duration)',
        'tests[].attempts[]': 'tests[].results[] {status,duration,retry,startTime,error}',
        'run.commitSha': 'env GITHUB_SHA or `git rev-parse HEAD`',
        'run.branch': 'env GITHUB_REF_NAME or `git rev-parse --abbrev-ref HEAD`',
        'run.workflow': 'env GITHUB_WORKFLOW/GITHUB_RUN_ID/GITHUB_RUN_ATTEMPT/GITHUB_JOB',
        'run.playwrightVersion': 'node_modules/@playwright/test/package.json',
      },
    },
    suite: { projectSet, specFileCount: specFiles.length, specFiles },
    summary: {
      total: tests.length,
      ...counts,
      durationMs: statsDuration,
    },
    tests,
    evidence: { ...ctx.evidence },
  };

  return { kind: 'ok', run, warnings };
}
