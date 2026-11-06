/**
 * Observability CLI.
 *
 *   node observability/src/cli.ts import <results.json> [--source local|ci] [--evidence <path>] [--runs-dir DIR]
 *   node observability/src/cli.ts report [--runs-dir DIR] [--out FILE]
 *   node observability/src/cli.ts inspect <results.json>
 *
 * Metadata is enriched only when verifiable: GITHUB_* env vars in CI,
 * `git` output locally, the installed @playwright/test version. Anything
 * not verifiably present stays null.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuns, saveRun } from './history.ts';
import { parsePlaywrightJsonReport, type ImportContext } from './parse.ts';
import { renderMarkdownReport } from './report.ts';
import type { RunSource } from './contract.ts';

const STARTER_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_RUNS_DIR = join(STARTER_ROOT, 'observability', 'runs');
const DEFAULT_REPORT_OUT = join(STARTER_ROOT, 'observability', 'report.md');

const USAGE = `Usage:
  observe import <results.json> [--source local|ci] [--evidence <path>] [--runs-dir DIR] [--run-id ID]
  observe report [--runs-dir DIR] [--out FILE]
  observe inspect <results.json>`;

function git(args: string[]): string | null {
  try {
    const out = execFileSync('git', args, { cwd: STARTER_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const v = out.trim();
    return v === '' ? null : v;
  } catch {
    return null;
  }
}

function playwrightVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(STARTER_ROOT, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

function isCiEnv(): boolean {
  return Boolean(process.env.GITHUB_ACTIONS && process.env.GITHUB_RUN_ID);
}

function buildContext(opts: {
  source: RunSource;
  evidenceHtml: string | null;
  artifactName: string | null;
  rawFileSha256: string;
  runIdOverride?: string;
}): ImportContext {
  const env = process.env;
  const workflowUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;

  return {
    source: opts.source,
    importedAt: new Date().toISOString(),
    rawFileSha256: opts.rawFileSha256,
    runIdOverride: opts.runIdOverride,
    // Enrich only from verifiable sources; never guess.
    commitSha: env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']),
    branch: env.GITHUB_REF_NAME ?? git(['rev-parse', '--abbrev-ref', 'HEAD']),
    workflow: {
      name: env.GITHUB_WORKFLOW ?? null,
      runId: env.GITHUB_RUN_ID ?? null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
      job: env.GITHUB_JOB ?? null,
      url: workflowUrl,
    },
    playwrightVersion: playwrightVersion(),
    evidence: { htmlReport: opts.evidenceHtml, artifactName: opts.artifactName },
  };
}

function writeFileAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data, 'utf8');
  renameSync(tmp, path);
}

function argValue(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function fail(msg: string, code = 1): never {
  console.error(`observe: ${msg}`);
  process.exit(code);
}

function cmdImport(args: string[]): void {
  const file = args[0];
  if (file === undefined || file.startsWith('--')) fail('import requires a results.json path', 2);
  if (!existsSync(file)) fail(`file not found: ${file}`);

  const sourceFlag = argValue(args, '--source');
  const source: RunSource = sourceFlag === 'ci' ? 'github-actions' : sourceFlag === 'local' ? 'local' : isCiEnv() ? 'github-actions' : 'local';
  const runsDir = argValue(args, '--runs-dir') ?? DEFAULT_RUNS_DIR;
  const runIdOverride = argValue(args, '--run-id') ?? undefined;

  const raw = readFileSync(file, 'utf8');
  const rawFileSha256 = createHash('sha256').update(raw, 'utf8').digest('hex');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`rejected: not valid JSON (${String(e)}). File is non-processable and was NOT imported.`);
  }

  const evidenceFlag = argValue(args, '--evidence');
  const defaultHtml = join(STARTER_ROOT, 'playwright-report', 'index.html');
  const evidenceHtml = evidenceFlag ?? (existsSync(defaultHtml) ? relative(STARTER_ROOT, defaultHtml) : null);

  const result = parsePlaywrightJsonReport(
    parsed,
    buildContext({ source, evidenceHtml, artifactName: null, rawFileSha256, runIdOverride }),
  );

  if (result.kind === 'rejected') {
    fail(`rejected: ${result.reason}. File is non-processable and was NOT imported.`);
  }

  for (const w of result.warnings) console.warn(`observe: warning: ${w}`);
  const saved = saveRun(runsDir, result.run);
  const s = result.run.summary;
  console.log(
    `${saved.status === 'duplicate' ? 'duplicate (idempotent no-op)' : 'imported'}: ${result.run.run.runId}`,
  );
  console.log(`  path: ${relative(STARTER_ROOT, saved.path)}`);
  console.log(
    `  tests: ${s.total} — passed ${s.passed}, failed ${s.failed}, flaky ${s.flaky}, skipped ${s.skipped}, unknown ${s.unknown}`,
  );
  console.log(`  completeness: ${result.run.run.completeness}${result.run.run.completenessReason !== null ? ` (${result.run.run.completenessReason})` : ''}`);
}

function cmdReport(args: string[]): void {
  const runsDir = argValue(args, '--runs-dir') ?? DEFAULT_RUNS_DIR;
  const outPath = argValue(args, '--out') ?? DEFAULT_REPORT_OUT;
  const { runs, nonProcessable } = loadRuns(runsDir);
  const md = renderMarkdownReport({ runs, nonProcessable, generatedAt: new Date().toISOString() });
  writeFileAtomic(outPath, md);
  console.log(`report written: ${outPath} (${runs.length} run(s), ${nonProcessable.length} non-processable)`);
}

function cmdInspect(args: string[]): void {
  const file = args[0];
  if (file === undefined || file.startsWith('--')) fail('inspect requires a results.json path', 2);
  if (!existsSync(file)) fail(`file not found: ${file}`);

  const raw = readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`not valid JSON: ${String(e)}`);
  }
  const rawFileSha256 = createHash('sha256').update(raw, 'utf8').digest('hex');
  const result = parsePlaywrightJsonReport(
    parsed,
    buildContext({
      source: isCiEnv() ? 'github-actions' : 'local',
      evidenceHtml: null,
      artifactName: null,
      rawFileSha256,
    }),
  );
  if (result.kind === 'rejected') {
    console.log(JSON.stringify({ kind: 'rejected', reason: result.reason }, null, 2));
    process.exit(1);
  }
  const { run } = result;
  console.log(
    JSON.stringify(
      {
        kind: 'ok',
        warnings: result.warnings,
        runId: run.run.runId,
        completeness: run.run.completeness,
        completenessReason: run.run.completenessReason,
        executedAt: run.run.executedAt,
        commitSha: run.run.commitSha,
        summary: run.summary,
        projects: run.suite.projectSet,
        specFiles: run.suite.specFiles,
      },
      null,
      2,
    ),
  );
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'import':
    cmdImport(rest);
    break;
  case 'report':
    cmdReport(rest);
    break;
  case 'inspect':
    cmdInspect(rest);
    break;
  default:
    console.error(USAGE);
    process.exit(command === undefined ? 2 : 2);
}
