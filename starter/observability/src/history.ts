/**
 * History store: one normalized JSON file per run under
 * observability/runs/. Idempotent — re-importing the same run produces
 * the same runId and is reported as a duplicate, never overwritten
 * silently or double-counted.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateNormalizedRun, type NormalizedRun, type ValidationIssue } from './contract.ts';

export interface LoadResult {
  runs: NormalizedRun[];
  /** Files present in the runs dir that failed validation. */
  nonProcessable: { file: string; issues: ValidationIssue[] }[];
}

export function loadRuns(dir: string): LoadResult {
  const runs: NormalizedRun[] = [];
  const nonProcessable: LoadResult['nonProcessable'] = [];
  if (!existsSync(dir)) return { runs, nonProcessable };

  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const path = join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      nonProcessable.push({ file: name, issues: [{ path: '$', message: `invalid JSON: ${String(e)}` }] });
      continue;
    }
    const v = validateNormalizedRun(parsed);
    if (v.ok && v.run !== null) runs.push(v.run);
    else nonProcessable.push({ file: name, issues: v.issues });
  }
  return { runs, nonProcessable };
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function runFileName(run: NormalizedRun): string {
  const when = sanitize(run.run.executedAt ?? run.run.importedAt);
  return `${when}-${sanitize(run.run.runId)}.json`;
}

function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data, 'utf8');
  renameSync(tmp, path);
}

/**
 * Persists a normalized run. If a file for the same runId already
 * exists, the import is a no-op reported as 'duplicate' — same evidence
 * re-imported must never create a second logical run.
 */
export function saveRun(dir: string, run: NormalizedRun): { status: 'written' | 'duplicate'; path: string } {
  mkdirSync(dir, { recursive: true });
  const existing = loadRuns(dir);
  const dupe = existing.runs.find((r) => r.run.runId === run.run.runId);
  if (dupe !== undefined) {
    return { status: 'duplicate', path: join(dir, runFileName(dupe)) };
  }
  const path = join(dir, runFileName(run));
  writeFileAtomic(path, JSON.stringify(run, null, 2) + '\n');
  return { status: 'written', path };
}
