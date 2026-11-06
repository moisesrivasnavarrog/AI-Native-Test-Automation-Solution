import { expect, test } from '@playwright/test';
import { parsePlaywrightJsonReport } from '../../observability/src/parse.ts';
import { syntheticCtx, syntheticReport, syntheticRun } from './fixtures.ts';

test.describe('observability parser', () => {
  test('parses a valid report with passed and failed tests', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'login works',
          tests: [{ status: 'expected', results: [{ status: 'passed', duration: 120 }] }],
        },
        {
          title: 'checkout fails',
          tests: [
            {
              status: 'unexpected',
              results: [{ status: 'failed', duration: 300, errorMessage: 'expect(page).toHaveText' }],
            },
          ],
        },
      ],
    });

    expect(run.summary.total).toBe(2);
    expect(run.summary.passed).toBe(1);
    expect(run.summary.failed).toBe(1);
    expect(run.run.completeness).toBe('complete');
    expect(run.tests.find((t) => t.title === 'checkout fails')?.outcome).toBe('failed');
  });

  test('keeps skipped separate from executed outcomes', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'skipped test',
          tests: [{ status: 'skipped', expectedStatus: 'skipped', results: [{ status: 'skipped', duration: 0 }] }],
        },
        {
          title: 'real test',
          tests: [{ status: 'expected', results: [{ status: 'passed', duration: 50 }] }],
        },
      ],
    });

    expect(run.summary.skipped).toBe(1);
    expect(run.summary.total).toBe(2);
    expect(run.tests.find((t) => t.title === 'skipped test')?.outcome).toBe('skipped');
  });

  test('counts a fail-then-retry-pass once as flaky, never as two tests', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'flaky cart',
          tests: [
            {
              status: 'flaky',
              results: [
                { status: 'failed', duration: 200, retry: 0, errorMessage: 'Timed out 5000ms waiting for locator' },
                { status: 'passed', duration: 180, retry: 1 },
              ],
            },
          ],
        },
      ],
    });

    expect(run.summary.total).toBe(1);
    expect(run.summary.flaky).toBe(1);
    expect(run.summary.passed).toBe(0);
    const t = run.tests[0];
    expect(t.outcome).toBe('flaky');
    expect(t.attempts).toHaveLength(2);
    expect(t.attempts[0].status).toBe('failed');
    expect(t.attempts[1].status).toBe('passed');
    expect(t.durationMs).toBe(380);
  });

  test('rejects non-report input instead of coercing it', () => {
    const r1 = parsePlaywrightJsonReport('not an object', syntheticCtx());
    expect(r1.kind).toBe('rejected');

    const r2 = parsePlaywrightJsonReport({ hello: 'world' }, syntheticCtx());
    expect(r2.kind).toBe('rejected');
    if (r2.kind === 'rejected') expect(r2.reason).toContain('suites');
  });

  test('marks completeness unknown when stats block is missing', () => {
    const run = syntheticRun(
      { stats: null, specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 10 }] }] }] },
    );
    expect(run.run.completeness).toBe('unknown');
    expect(run.run.completenessReason).toContain('stats');
  });

  test('marks run partial when stats disagree with extracted tests', () => {
    const run = syntheticRun({
      stats: { startTime: '2026-01-01T00:00:00Z', duration: 100, expected: 5, unexpected: 0, flaky: 0, skipped: 0 },
      specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 10 }] }] }],
    });
    expect(run.run.completeness).toBe('partial');
    expect(run.run.completenessReason).toContain('stats');
  });

  test('flags interrupted attempts as partial with a reason', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'cancelled test',
          tests: [{ status: 'unexpected', results: [{ status: 'interrupted', duration: 5, retry: 0 }] }],
        },
      ],
    });
    expect(run.run.completeness).toBe('partial');
    expect(run.run.completenessReason).toContain('interrupted');
  });

  test('distinguishes identical titles across Playwright projects', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'same title',
          tests: [
            { projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 10 }] },
            { projectName: 'firefox', status: 'expected', results: [{ status: 'passed', duration: 10 }] },
            { projectName: 'webkit', status: 'expected', results: [{ status: 'passed', duration: 10 }] },
          ],
        },
      ],
    });
    const keys = new Set(run.tests.map((t) => t.testKey));
    expect(keys.size).toBe(3);
    expect(run.suite.projectSet).toEqual(['chromium', 'firefox', 'webkit']);
  });

  test('persists error fingerprints and kinds — never raw messages', () => {
    const secret = 'Bearer SECRET-TOKEN-12345';
    const run = syntheticRun({
      specs: [
        {
          title: 'leaky failure',
          tests: [
            {
              status: 'unexpected',
              results: [{ status: 'failed', duration: 100, errorMessage: `expect failed ${secret}` }],
            },
          ],
        },
      ],
    });
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain(secret);
    expect(run.tests[0].attempts[0].errorFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(run.tests[0].attempts[0].errorKind).toBe('assertion');
  });

  test('classifies timeout errors distinctly from assertions', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'slow',
          tests: [
            {
              status: 'unexpected',
              results: [{ status: 'timedOut', duration: 30000, errorMessage: 'Test timed out after 30000ms' }],
            },
          ],
        },
      ],
    });
    expect(run.tests[0].attempts[0].errorKind).toBe('timeout');
  });

  test('honors expectedStatus for test.fail (expected failure → passed)', () => {
    const run = syntheticRun({
      specs: [
        {
          title: 'known bug',
          tests: [
            {
              status: 'expected',
              expectedStatus: 'failed',
              results: [{ status: 'failed', duration: 10, errorMessage: 'expect x toBe y' }],
            },
          ],
        },
      ],
    });
    expect(run.tests[0].expectedStatus).toBe('failed');
    expect(run.tests[0].outcome).toBe('passed');
    expect(run.summary.passed).toBe(1);
  });
});
