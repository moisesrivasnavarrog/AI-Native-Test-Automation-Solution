import { expect, test } from '@playwright/test';
import { computeRunMetrics, computeTestFlakiness, computeTrends, runsComparable } from '../../observability/src/metrics.ts';
import { syntheticRun } from './fixtures.ts';

test.describe('observability metrics', () => {
  test('pass rate uses executed tests as denominator; skipped excluded', () => {
    // 2 passed, 1 failed, 1 flaky, 1 skipped → executed = 4, passRate = 2/4
    const run = syntheticRun({
      specs: [
        { title: 'p1', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 10 }] }] },
        { title: 'p2', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 10 }] }] },
        { title: 'f1', tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 10 }] }] },
        {
          title: 'fl1',
          tests: [
            {
              status: 'flaky',
              results: [
                { status: 'failed', duration: 10, retry: 0 },
                { status: 'passed', duration: 10, retry: 1 },
              ],
            },
          ],
        },
        { title: 's1', tests: [{ status: 'skipped', results: [{ status: 'skipped', duration: 0 }] }] },
      ],
    });
    const m = computeRunMetrics(run);
    expect(m.executed).toBe(4);
    expect(m.passRate).toBeCloseTo(2 / 4, 10);
    expect(m.flakyRate).toBeCloseTo(1 / 4, 10);
    expect(m.skippedShare).toBeCloseTo(1 / 5, 10);
  });

  test('returns null rates when denominators are zero — never divides by zero', () => {
    const run = syntheticRun({
      specs: [{ title: 'only skip', tests: [{ status: 'skipped', results: [{ status: 'skipped', duration: 0 }] }] }],
    });
    const m = computeRunMetrics(run);
    expect(m.executed).toBe(0);
    expect(m.passRate).toBeNull();
    expect(m.flakyRate).toBeNull();
  });

  test('percentiles require at least 5 executed tests', () => {
    const few = syntheticRun({
      specs: [
        { title: 'a', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 10 }] }] },
        { title: 'b', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 20 }] }] },
      ],
    });
    expect(computeRunMetrics(few).p50Ms).toBeNull();
    expect(computeRunMetrics(few).p95Ms).toBeNull();

    const many = syntheticRun({
      specs: [10, 20, 30, 40, 100].map((d, i) => ({
        title: `t${i}`,
        tests: [{ status: 'expected', results: [{ status: 'passed', duration: d }] }],
      })),
    });
    const mm = computeRunMetrics(many);
    expect(mm.p50Ms).toBe(30);
    expect(mm.p95Ms).toBe(100);
  });

  test('comparability requires same projects AND spec files', () => {
    const a = syntheticRun({ specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });
    const b = syntheticRun({ specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });
    const c = syntheticRun({ specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'firefox', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });
    const d = syntheticRun({ specs: [{ title: 't', file: 'other.spec.ts', tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });

    expect(runsComparable(a, b).comparable).toBe(true);
    expect(runsComparable(a, c).comparable).toBe(false);
    expect(runsComparable(a, c).reason).toContain('project');
    expect(runsComparable(a, d).comparable).toBe(false);
    expect(runsComparable(a, d).reason).toContain('spec files');
  });

  test('single-run history yields insufficientData — no fabricated trend', () => {
    const run = syntheticRun({ specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });
    const t = computeTrends([run]);
    expect(t.insufficientData).toBe(true);
    expect(t.delta).toBeNull();
  });

  test('two comparable runs produce a computed delta', () => {
    const r1 = syntheticRun({
      specs: [
        { title: 't', file: 'a.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 100 }] }] },
        { title: 'u', file: 'a.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 100 }] }] },
      ],
    });
    const r2 = syntheticRun({
      specs: [
        { title: 't', file: 'a.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 200 }] }] },
        { title: 'u', file: 'a.spec.ts', tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 200 }] }] },
      ],
    });
    const trends = computeTrends([r1, r2]);
    expect(trends.insufficientData).toBe(false);
    expect(trends.cohortSize).toBe(2);
    expect(trends.delta?.passRateDelta).toBeCloseTo(0.5 - 1, 10);
    expect(trends.delta?.testDurationDeltaMs).toBe(200);
  });

  test('non-comparable runs are excluded from the cohort with a note', () => {
    const a = syntheticRun({ specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });
    const b = syntheticRun({ specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'firefox', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }] });
    const t = computeTrends([a, b]);
    expect(t.insufficientData).toBe(true);
    expect(t.notes.some((n) => n.includes('excluded'))).toBe(true);
  });

  test('per-test flakiness aggregates across comparable runs only', () => {
    const mk = (status: string) =>
      syntheticRun({
        specs: [
          {
            title: 'flaky one',
            file: 'a.spec.ts',
            tests: [
              {
                projectName: 'chromium',
                status,
                results:
                  status === 'flaky'
                    ? [
                        { status: 'failed', duration: 1, retry: 0 },
                        { status: 'passed', duration: 1, retry: 1 },
                      ]
                    : [{ status: 'passed', duration: 1 }],
              },
            ],
          },
        ],
      });
    const flaky = computeTestFlakiness([mk('flaky'), mk('expected'), mk('flaky')]);
    const row = flaky.find((f) => f.title === 'flaky one');
    expect(row?.appearances).toBe(3);
    expect(row?.flakyCount).toBe(2);
    expect(row?.flakyRate).toBeCloseTo(2 / 3, 10);
    expect(row?.lowSample).toBe(true);
  });
});
