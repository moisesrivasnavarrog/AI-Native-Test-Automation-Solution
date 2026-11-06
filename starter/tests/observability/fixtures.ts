/**
 * SYNTHETIC TEST FIXTURES — logic tests only.
 *
 * These builders fabricate Playwright-JSON-report-shaped objects to
 * exercise the parser/metrics. They are NOT real execution evidence and
 * must never be imported into observability/runs/ or shown as real data.
 */

import { parsePlaywrightJsonReport, type ImportContext } from '../../observability/src/parse.ts';
import type { NormalizedRun } from '../../observability/src/contract.ts';

interface FixtureAttempt {
  status?: string;
  duration?: number;
  retry?: number;
  startTime?: string;
  errorMessage?: string;
}

interface FixtureTest {
  projectName?: string;
  expectedStatus?: string;
  status?: string;
  results?: FixtureAttempt[];
}

interface FixtureSpec {
  title: string;
  file?: string;
  ok?: boolean;
  tests: FixtureTest[];
}

export function syntheticCtx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    source: 'local',
    importedAt: '2026-01-01T00:00:00.000Z',
    rawFileSha256: 'a'.repeat(64),
    commitSha: 'deadbeef'.repeat(5),
    branch: 'main',
    workflow: { name: null, runId: null, runAttempt: null, job: null, url: null },
    playwrightVersion: '1.64.1',
    evidence: { htmlReport: null, artifactName: null },
    ...overrides,
  };
}

/** Parse a synthetic report straight into a NormalizedRun (asserts ok). */
export function syntheticRun(
  opts: Parameters<typeof syntheticReport>[0],
  ctx: Partial<ImportContext> = {},
): NormalizedRun {
  const r = parsePlaywrightJsonReport(syntheticReport(opts), syntheticCtx(ctx));
  if (r.kind !== 'ok') throw new Error(`syntheticRun failed: ${r.kind === 'rejected' ? r.reason : ''}`);
  return r.run;
}

let clock = 0;
function ts(offsetSec = 0): string {
  return new Date(1_700_000_000_000 + clock * 1000 + offsetSec * 1000).toISOString();
}

export function syntheticReport(opts: {
  specs: FixtureSpec[];
  suiteTitle?: string;
  stats?: Record<string, unknown> | null;
}): Record<string, unknown> {
  clock += 1;
  const expected = opts.specs.flatMap((s) => s.tests).filter((t) => t.status === 'expected').length;
  const unexpected = opts.specs.flatMap((s) => s.tests).filter((t) => t.status === 'unexpected').length;
  const flaky = opts.specs.flatMap((s) => s.tests).filter((t) => t.status === 'flaky').length;
  const skipped = opts.specs.flatMap((s) => s.tests).filter((t) => t.status === 'skipped').length;

  return {
    config: {},
    stats:
      opts.stats === null
        ? undefined
        : (opts.stats ?? {
            startTime: ts(),
            duration: 5000,
            expected,
            unexpected,
            flaky,
            skipped,
          }),
    errors: [],
    suites: [
      {
        title: opts.suiteTitle ?? 'suite',
        file: 'tests/x.spec.ts',
        specs: opts.specs.map((s) => ({
          title: s.title,
          file: s.file ?? 'tests/x.spec.ts',
          ok: s.ok ?? true,
          id: 'spec-id',
          tests: s.tests.map((t) => ({
            timeout: 30000,
            annotations: [],
            expectedStatus: t.expectedStatus ?? 'passed',
            projectName: t.projectName ?? 'chromium',
            projectId: t.projectName ?? 'chromium',
            status: t.status,
            results: (t.results ?? []).map((r, i) => ({
              workerIndex: 0,
              status: r.status,
              duration: r.duration ?? 100,
              retry: r.retry ?? i,
              startTime: r.startTime ?? ts(i),
              error: r.errorMessage !== undefined ? { message: r.errorMessage } : undefined,
              errors: r.errorMessage !== undefined ? [{ message: r.errorMessage }] : [],
              stdout: [],
              stderr: [],
              attachments: [],
            })),
          })),
        })),
      },
    ],
  };
}
