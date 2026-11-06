/**
 * Pure metrics engine for NormalizedRun data.
 *
 * Rules enforced here:
 * - Never divide by zero: a metric with denominator 0 returns null.
 * - Never substitute missing values with zero.
 * - Never compare incompatible populations: runsComparable() gates all
 *   run-over-run metrics.
 * - Flaky tests are counted in `executed` but NOT in the pass numerator —
 *   a suite that only goes green on retry does not show a clean 100%.
 *
 * No time, network, or filesystem access — deterministic given the same
 * inputs.
 */

import type { NormalizedRun } from './contract.ts';

export interface RunMetrics {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  unknown: number;
  /** Executed logical tests: passed + failed + flaky (denominator for rates). */
  executed: number;
  /** passed / executed — null when executed === 0. */
  passRate: number | null;
  /** flaky / executed — null when executed === 0 or no attempt data. */
  flakyRate: number | null;
  /** skipped / total — null when total === 0. */
  skippedShare: number | null;
  /** Runner-reported wall duration (stats.duration). */
  runDurationMs: number | null;
  /** Sum of logical test durations — excludes runner overhead. */
  testDurationMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

function percentile(sorted: number[], p: number): number {
  // Nearest-rank method on a pre-sorted array; caller guarantees non-empty.
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

export function computeRunMetrics(run: NormalizedRun): RunMetrics {
  const { total, passed, failed, flaky, skipped, unknown, durationMs } = run.summary;
  const executed = passed + failed + flaky;

  const executedDurations = run.tests
    .filter((t) => t.outcome === 'passed' || t.outcome === 'failed' || t.outcome === 'flaky')
    .map((t) => t.durationMs)
    .sort((a, b) => a - b);

  const hasAttemptData = run.tests.some((t) => t.attempts.length > 0);

  return {
    total,
    passed,
    failed,
    flaky,
    skipped,
    unknown,
    executed,
    passRate: executed === 0 ? null : passed / executed,
    flakyRate: executed === 0 || !hasAttemptData ? null : flaky / executed,
    skippedShare: total === 0 ? null : skipped / total,
    runDurationMs: durationMs,
    testDurationMs: run.tests.reduce((s, t) => s + t.durationMs, 0),
    // Percentiles need a minimum sample to mean anything.
    p50Ms: executedDurations.length >= 5 ? percentile(executedDurations, 50) : null,
    p95Ms: executedDurations.length >= 5 ? percentile(executedDurations, 95) : null,
  };
}

export interface Comparability {
  comparable: boolean;
  reason: string | null;
}

/**
 * Two runs are comparable only when they exercised the same population:
 * same Playwright project set AND same spec files. Otherwise deltas would
 * mix incompatible populations.
 */
export function runsComparable(a: NormalizedRun, b: NormalizedRun): Comparability {
  const sameProjects = a.suite.projectSet.join(',') === b.suite.projectSet.join(',');
  const sameFiles = a.suite.specFiles.join(',') === b.suite.specFiles.join(',');
  if (!sameProjects && !sameFiles) {
    return { comparable: false, reason: 'different project set AND different spec files' };
  }
  if (!sameProjects) {
    return {
      comparable: false,
      reason: `different project set (${a.suite.projectSet.join(',')} vs ${b.suite.projectSet.join(',')})`,
    };
  }
  if (!sameFiles) {
    return { comparable: false, reason: 'different spec files' };
  }
  return { comparable: true, reason: null };
}

export interface TrendDelta {
  previousRunId: string;
  latestRunId: string;
  passRateDelta: number | null;
  runDurationDeltaMs: number | null;
  testDurationDeltaMs: number | null;
}

export interface HistoryTrends {
  /** Runs in the latest run's comparability cohort, oldest → newest. */
  cohortSize: number;
  insufficientData: boolean;
  /** Set only when cohortSize >= 2. */
  delta: TrendDelta | null;
  notes: string[];
}

/**
 * Trends are computed only inside the comparability cohort of the most
 * recent run. Fewer than two comparable runs → insufficientData, and the
 * report must say so rather than fabricate a trend.
 */
export function computeTrends(runs: NormalizedRun[]): HistoryTrends {
  const notes: string[] = [];
  if (runs.length === 0) {
    return { cohortSize: 0, insufficientData: true, delta: null, notes: ['no runs in history'] };
  }

  const sorted = [...runs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const latest = sorted[sorted.length - 1];
  const cohort = sorted.filter((r) => runsComparable(r, latest).comparable);
  const excluded = sorted.length - cohort.length;
  if (excluded > 0) {
    notes.push(`${excluded} run(s) excluded from trends: not comparable with the latest run`);
  }

  if (cohort.length < 2) {
    return {
      cohortSize: cohort.length,
      insufficientData: true,
      delta: null,
      notes: [...notes, 'fewer than 2 comparable runs — trends not computed'],
    };
  }

  const previous = cohort[cohort.length - 2];
  const pm = computeRunMetrics(previous);
  const lm = computeRunMetrics(latest);

  return {
    cohortSize: cohort.length,
    insufficientData: false,
    delta: {
      previousRunId: previous.run.runId,
      latestRunId: latest.run.runId,
      passRateDelta: pm.passRate !== null && lm.passRate !== null ? lm.passRate - pm.passRate : null,
      runDurationDeltaMs:
        pm.runDurationMs !== null && lm.runDurationMs !== null ? lm.runDurationMs - pm.runDurationMs : null,
      testDurationDeltaMs: lm.testDurationMs - pm.testDurationMs,
    },
    notes,
  };
}

export interface TestFlakiness {
  testKey: string;
  title: string;
  project: string;
  /** Comparable-run appearances in which the test executed. */
  appearances: number;
  flakyCount: number;
  failedCount: number;
  /** flakyCount / appearances — null when appearances === 0. */
  flakyRate: number | null;
  lowSample: boolean;
}

/**
 * Per-test flakiness across the comparability cohort of the latest run.
 * Rates carry an explicit sample size; below 5 appearances they are
 * labelled low-sample rather than hidden.
 */
export function computeTestFlakiness(runs: NormalizedRun[]): TestFlakiness[] {
  if (runs.length === 0) return [];
  const sorted = [...runs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const latest = sorted[sorted.length - 1];
  const cohort = sorted.filter((r) => runsComparable(r, latest).comparable);

  const acc = new Map<string, { title: string; project: string; appearances: number; flaky: number; failed: number }>();
  for (const run of cohort) {
    for (const t of run.tests) {
      if (t.outcome === 'skipped' || t.outcome === 'unknown') continue;
      const e = acc.get(t.testKey) ?? { title: t.title, project: t.project, appearances: 0, flaky: 0, failed: 0 };
      e.appearances += 1;
      if (t.outcome === 'flaky') e.flaky += 1;
      if (t.outcome === 'failed') e.failed += 1;
      acc.set(t.testKey, e);
    }
  }

  return [...acc.entries()]
    .map(([testKey, e]) => ({
      testKey,
      title: e.title,
      project: e.project,
      appearances: e.appearances,
      flakyCount: e.flaky,
      failedCount: e.failed,
      flakyRate: e.appearances === 0 ? null : e.flaky / e.appearances,
      lowSample: e.appearances < 5,
    }))
    .sort((a, b) => (b.flakyRate ?? 0) - (a.flakyRate ?? 0));
}

function sortKey(run: NormalizedRun): string {
  // executedAt preferred; importedAt as fallback so history still sorts.
  return run.run.executedAt ?? run.run.importedAt;
}
