import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const text = z.string().max(1000);
const resultSchema = z.object({
  status: z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']),
  duration: z.number().finite().nonnegative(),
});
const suiteSchema = z.object({
  title: text,
  file: text.optional(),
  specs: z
    .array(
      z.object({
        title: text,
        tests: z.array(
          z.object({
            projectName: text,
            status: z.enum(['expected', 'unexpected', 'flaky', 'skipped']),
            results: z.array(resultSchema),
          }),
        ),
      }),
    )
    .default([]),
});
interface SafeTest {
  file: string;
  title: string;
  project: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  durationMs: number;
}
export interface SafeE2eReport {
  tests: SafeTest[];
  totals: Record<SafeTest['status'], number>;
}
/** Whitelist rather than redact: browser auth, attachments, errors and config never enter output. */
export function sanitizeE2eReport(input: unknown): SafeE2eReport {
  const report = z.object({ suites: z.array(z.unknown()) }).parse(input);
  const tests: SafeTest[] = [];
  const visit = (raw: unknown, ancestors: readonly string[], depth: number): void => {
    if (depth > 20 || tests.length > 10_000) throw new Error('Report exceeds safe summary limits');
    const suite = suiteSchema.parse(raw),
      children = z.object({ suites: z.array(z.unknown()).default([]) }).parse(raw).suites;
    const names = [...ancestors, suite.title].filter(Boolean);
    for (const spec of suite.specs)
      for (const test of spec.tests)
        tests.push({
          file: (suite.file ?? '').replaceAll('\\', '/').split('/').at(-1) ?? '',
          title: [...names, spec.title].join(' › '),
          project: test.projectName,
          status: test.status,
          durationMs: test.results.reduce((sum, result) => sum + result.duration, 0),
        });
    for (const child of children) visit(child, names, depth + 1);
  };
  for (const suite of report.suites) visit(suite, [], 0);
  return {
    tests,
    totals: {
      expected: tests.filter((test) => test.status === 'expected').length,
      unexpected: tests.filter((test) => test.status === 'unexpected').length,
      flaky: tests.filter((test) => test.status === 'flaky').length,
      skipped: tests.filter((test) => test.status === 'skipped').length,
    },
  };
}
export function e2eSummaryHtml(report: SafeE2eReport): string {
  const escape = (value: string): string =>
    value.replace(
      /[&<>"']/gu,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] ?? character,
    );
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Vibeset E2E summary</title><style>body{font:1rem system-ui;margin:2rem;line-height:1.5}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.5rem;border:1px solid #ccc}caption{text-align:left;font-weight:bold;padding:.5rem}</style><h1>Vibeset E2E summary</h1><p>Passed as expected: ${report.totals.expected}. Unexpected: ${report.totals.unexpected}. Flaky: ${report.totals.flaky}. Skipped: ${report.totals.skipped}.</p><p>Attachments, browser sessions, traces and error details are excluded.</p><table><caption>Test results</caption><thead><tr><th scope="col">File</th><th scope="col">Test</th><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Duration (ms)</th></tr></thead><tbody>${report.tests.map((test) => `<tr><td>${escape(test.file)}</td><td>${escape(test.title)}</td><td>${escape(test.project)}</td><td>${test.status}</td><td>${test.durationMs}</td></tr>`).join('')}</tbody></table></html>`;
}
export async function writeE2eSummary(): Promise<void> {
  const data = await readFile(resolve('.tmp/e2e-report.json'));
  if (data.byteLength > 32 * 1024 * 1024) throw new Error('Report is too large');
  const report = sanitizeE2eReport(JSON.parse(data.toString('utf8')));
  await mkdir(resolve('.tmp/e2e-summary'), { recursive: true });
  await writeFile(resolve('.tmp/e2e-summary/summary.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve('.tmp/e2e-summary/index.html'), e2eSummaryHtml(report));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeE2eSummary().catch(() => {
    process.stderr.write(
      'Could not create the sanitized E2E summary. Raw reports were not uploaded.\n',
    );
    process.exitCode = 1;
  });
}
