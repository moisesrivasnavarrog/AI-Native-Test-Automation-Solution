import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadRuns, saveRun } from '../../observability/src/history.ts';
import { syntheticRun } from './fixtures.ts';

test.describe('observability history', () => {
  test('saves a run and reloads it losslessly', async ({}, testInfo) => {
    const dir = testInfo.outputPath('runs');
    const run = syntheticRun({
      specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 42 }] }] }],
    });
    const saved = saveRun(dir, run);
    expect(saved.status).toBe('written');

    const { runs, nonProcessable } = loadRuns(dir);
    expect(nonProcessable).toHaveLength(0);
    expect(runs).toHaveLength(1);
    expect(runs[0].run.runId).toBe(run.run.runId);
    expect(runs[0].summary.total).toBe(1);
  });

  test('re-importing the same runId is an idempotent no-op', async ({}, testInfo) => {
    const dir = testInfo.outputPath('runs');
    const run = syntheticRun({
      specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }],
    });
    expect(saveRun(dir, run).status).toBe('written');
    expect(saveRun(dir, run).status).toBe('duplicate');
    expect(loadRuns(dir).runs).toHaveLength(1);
  });

  test('distinct runs accumulate', async ({}, testInfo) => {
    const dir = testInfo.outputPath('runs');
    const mk = () =>
      syntheticRun({
        specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }],
      });
    // Distinct source-file hashes → distinct runIds.
    saveRun(dir, mk());
    saveRun(
      dir,
      syntheticRun(
        { specs: [{ title: 'u', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 2 }] }] }] },
        { rawFileSha256: 'b'.repeat(64) },
      ),
    );
    expect(loadRuns(dir).runs).toHaveLength(2);
  });

  test('corrupt files are reported non-processable, not fatal', async ({}, testInfo) => {
    const dir = testInfo.outputPath('runs');
    const good = syntheticRun({
      specs: [{ title: 't', tests: [{ status: 'expected', results: [{ status: 'passed', duration: 1 }] }] }],
    });
    saveRun(dir, good);
    writeFileSync(join(dir, 'broken.json'), '{invalid json', 'utf8');
    writeFileSync(join(dir, 'wrong-shape.json'), JSON.stringify({ schemaVersion: '1.0.0' }), 'utf8');

    const { runs, nonProcessable } = loadRuns(dir);
    expect(runs).toHaveLength(1);
    expect(nonProcessable).toHaveLength(2);
    expect(nonProcessable.map((n) => n.file).sort()).toEqual(['broken.json', 'wrong-shape.json']);
  });
});
