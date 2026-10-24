import { describe, expect, it } from 'vitest';
import {
  assertTrustedAncestry,
  previewCandidate,
  verifyDeployment,
} from '../../../scripts/ci/verify-preview';
import { e2eSummaryHtml, sanitizeE2eReport } from '../../../scripts/ci/sanitize-e2e-report';

const sha = 'a'.repeat(40);
const event = {
  deployment_status: { state: 'success', target_url: 'https://vibeset-preview.vercel.app' },
  deployment: { sha, environment: 'Preview', production_environment: false },
  repository: { id: 123, full_name: 'owner/vibeset' },
};
const env = {
  GITHUB_REPOSITORY: 'owner/vibeset',
  E2E_PREVIEW_HOSTNAME: 'vibeset-preview.vercel.app',
  E2E_TRUSTED_BRANCHES: '["preview-ci"]',
  VERCEL_PROJECT_ID: 'prj_expected',
};
const deployment = {
  readyState: 'READY',
  target: null,
  projectId: 'prj_expected',
  url: 'vibeset-preview.vercel.app',
  gitSource: { type: 'github', sha, ref: 'preview-ci', repoId: 123 },
};
describe('preview CI identity verification', () => {
  it('accepts a configured preview only after authoritative project/repository/SHA verification', () => {
    expect(verifyDeployment(previewCandidate(event, env), deployment)).toBe('preview-ci');
    expect(() => assertTrustedAncestry({ status: 'ahead' })).not.toThrow();
    expect(() => assertTrustedAncestry({ status: 'identical' })).not.toThrow();
  });
  it.each([
    { deployment: { ...event.deployment, environment: 'Production' } },
    { deployment: { ...event.deployment, production_environment: true } },
    { deployment: { ...event.deployment, sha: 'a'.repeat(39) + '\n' } },
    { repository: { id: 456, full_name: 'fork/vibeset' } },
    { deployment_status: { state: 'failure', target_url: event.deployment_status.target_url } },
    {
      deployment_status: {
        state: 'success',
        target_url: 'https://vibeset-preview.vercel.app.attacker.example',
      },
    },
    {
      deployment_status: {
        state: 'success',
        target_url: 'https://user:pass@vibeset-preview.vercel.app',
      },
    },
  ])('refuses unsafe webhook targets before secret-bearing repository checkout', (patch) => {
    expect(() => previewCandidate({ ...event, ...patch }, env)).toThrow();
  });
  it.each([
    { target: 'production' },
    { projectId: 'prj_wrong' },
    { readyState: 'BUILDING' },
    { gitSource: { ...deployment.gitSource, sha: 'b'.repeat(40) } },
    { gitSource: { ...deployment.gitSource, repoId: 456 } },
    { gitSource: { ...deployment.gitSource, ref: 'unreviewed-pr' } },
  ])('requires exact authoritative deployment identity', (patch) => {
    expect(() =>
      verifyDeployment(previewCandidate(event, env), { ...deployment, ...patch }),
    ).toThrow();
  });
  it('refuses commits outside the current trusted branch history', () => {
    expect(() => assertTrustedAncestry({ status: 'diverged' })).toThrow();
    expect(() => assertTrustedAncestry({ status: 'behind' })).toThrow();
  });
});
describe('sanitized E2E report artifact', () => {
  it('keeps results while removing authentication state, errors, attachments and console payloads', () => {
    const report = sanitizeE2eReport({
      config: { password: 'secret-password' },
      suites: [
        {
          title: 'roles',
          file: '/private/path/visitor.spec.ts',
          specs: [
            {
              title: '<script>alert(1)</script>',
              tests: [
                {
                  projectName: 'desktop',
                  status: 'unexpected',
                  results: [
                    {
                      status: 'failed',
                      duration: 12,
                      error: { message: 'secret-password' },
                      attachments: [{ path: '.auth/admin.json' }],
                      stdout: ['Bearer secret-token'],
                    },
                  ],
                },
              ],
            },
          ],
          suites: [],
        },
      ],
    });
    expect(report.totals).toEqual({ expected: 0, unexpected: 1, flaky: 0, skipped: 0 });
    expect(report.tests[0]).toMatchObject({ file: 'visitor.spec.ts', durationMs: 12 });
    for (const secret of ['secret-password', 'secret-token', '.auth/admin.json', '/private/path'])
      expect(JSON.stringify(report)).not.toContain(secret);
    expect(e2eSummaryHtml(report)).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(e2eSummaryHtml(report)).not.toContain('<script>');
  });
  it('refuses malformed results rather than uploading the raw report on failure', () => {
    expect(() =>
      sanitizeE2eReport({
        suites: [
          {
            title: 'test',
            specs: [
              { title: 'case', tests: [{ projectName: 'desktop', status: 'passed', results: [] }] },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
