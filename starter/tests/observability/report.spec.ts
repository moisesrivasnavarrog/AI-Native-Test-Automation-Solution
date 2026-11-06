import { expect, test } from '@playwright/test';
import { renderMarkdownReport } from '../../observability/src/report.ts';
import { syntheticRun } from './fixtures.ts';

const NOW = '2026-11-06T20:00:00.000Z';

test.describe('observability report', () => {
  test('empty history renders Insufficient data, not zeros', () => {
    const md = renderMarkdownReport({ runs: [], nonProcessable: [], generatedAt: NOW });
    expect(md).toContain('Insufficient data');
    expect(md).not.toContain('| 0 | 0 | 0 |');
  });

  test('a single real run shows metrics but no fabricated trend', () => {
    const run = syntheticRun({
      specs: [
        { title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 100 }] }] },
        { title: 'u', tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 50, errorMessage: 'expect a toBe b' }] }] },
      ],
    });
    const md = renderMarkdownReport({ runs: [run], nonProcessable: [], generatedAt: NOW });
    expect(md).toContain('Insufficient data');
    expect(md).toContain(run.run.runId);
    expect(md).toContain('50.0%'); // 1 passed / 2 executed
    expect(md).not.toContain('| Delta |');
  });

  test('non-comparable history states the exclusion explicitly', () => {
    const a = syntheticRun({
      specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }],
    });
    const b = syntheticRun({
      specs: [{ title: 't', file: 'a.spec.ts', tests: [{ projectName: 'firefox', status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }],
    });
    const md = renderMarkdownReport({ runs: [a, b], nonProcessable: [], generatedAt: NOW });
    expect(md).toContain('excluded from trends');
    expect(md).toContain('Insufficient data');
  });

  test('sensitive strings in source errors never reach the report', () => {
    const secret = 'Bearer SECRET-TOKEN-12345';
    const run = syntheticRun({
      specs: [
        {
          title: 'leaky',
          tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 1, errorMessage: `boom ${secret}` }] }],
        },
      ],
    });
    const md = renderMarkdownReport({ runs: [run], nonProcessable: [], generatedAt: NOW });
    expect(md).not.toContain(secret);
  });

  test('partial runs and non-processable files are surfaced in Data quality', () => {
    const run = syntheticRun({
      stats: { startTime: '2026-01-01T00:00:00Z', duration: 1, expected: 9, unexpected: 0, flaky: 0, skipped: 0 },
      specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }],
    });
    const md = renderMarkdownReport({
      runs: [run],
      nonProcessable: [{ file: 'junk.json', issues: [{ path: '$', message: 'invalid JSON' }] }],
      generatedAt: NOW,
    });
    expect(md).toContain('partial');
    expect(md).toContain('junk.json');
  });
});
