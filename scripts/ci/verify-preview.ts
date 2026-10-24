import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

type Environment = Readonly<Record<string, string | undefined>>;
const shaSchema = z
  .string()
  .length(40)
  .regex(/^[a-f0-9]{40}$/u);
const branchSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\p{Cc}\p{Cf}\s]/u.test(value));
const repositorySchema = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u);
const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/u);
const originSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  const url = new URL(value);
  return (
    !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && !url.port
  );
});
const eventSchema = z.object({
  deployment_status: z.object({ state: z.literal('success'), target_url: originSchema }),
  deployment: z.object({
    sha: shaSchema,
    environment: z.string().regex(/^preview$/iu),
    production_environment: z.literal(false),
  }),
  repository: z.object({ id: z.number().int().positive(), full_name: repositorySchema }),
});
export interface VerifiedPreview {
  sha: string;
  baseUrl: string;
  repository: string;
  repositoryId: number;
  trustedBranches: string[];
  projectId: string;
  teamId?: string;
}
export function previewCandidate(input: unknown, env: Environment): VerifiedPreview {
  const event = eventSchema.parse(input),
    repository = repositorySchema.parse(env.GITHUB_REPOSITORY),
    allowedHost = hostnameSchema.parse(env.E2E_PREVIEW_HOSTNAME),
    trustedBranches = z
      .array(branchSchema)
      .min(1)
      .max(20)
      .parse(JSON.parse(env.E2E_TRUSTED_BRANCHES ?? '["main"]')),
    target = new URL(event.deployment_status.target_url);
  if (event.repository.full_name !== repository || target.hostname !== allowedHost)
    throw new Error('Preview must belong to this repository and the explicitly allowed hostname');
  return {
    sha: event.deployment.sha,
    baseUrl: target.origin,
    repository,
    repositoryId: event.repository.id,
    trustedBranches,
    projectId: branchSchema
      .pipe(z.string().regex(/^prj_[a-zA-Z0-9]+$/u))
      .parse(env.VERCEL_PROJECT_ID),
    ...(env.VERCEL_ORG_ID
      ? {
          teamId: branchSchema
            .pipe(z.string().regex(/^team_[a-zA-Z0-9]+$/u))
            .parse(env.VERCEL_ORG_ID),
        }
      : {}),
  };
}
export function verifyDeployment(candidate: VerifiedPreview, input: unknown): string {
  const deployment = z
    .object({
      readyState: z.literal('READY'),
      target: z.null(),
      projectId: z.literal(candidate.projectId),
      url: z.literal(new URL(candidate.baseUrl).hostname),
      gitSource: z.object({
        type: z.literal('github'),
        sha: z.literal(candidate.sha),
        ref: branchSchema,
        repoId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/u)]),
      }),
    })
    .parse(input);
  const branch = deployment.gitSource.ref.replace(/^refs\/heads\//u, '');
  if (
    String(deployment.gitSource.repoId) !== String(candidate.repositoryId) ||
    !candidate.trustedBranches.includes(branch)
  )
    throw new Error(
      'Preview deployment must come from an explicitly trusted same-repository branch',
    );
  return branch;
}
export function assertTrustedAncestry(input: unknown): void {
  z.object({ status: z.enum(['ahead', 'identical']) }).parse(input);
}
async function request(url: URL, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Preview identity verification was unavailable');
  return response.json();
}
export async function verifyPreview(env: Environment): Promise<void> {
  const input: unknown = JSON.parse(
    await readFile(z.string().min(1).parse(env.GITHUB_EVENT_PATH), 'utf8'),
  );
  const candidate = previewCandidate(input, env);
  const url = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(new URL(candidate.baseUrl).hostname)}`,
  );
  url.searchParams.set('withGitRepoInfo', 'true');
  if (candidate.teamId) url.searchParams.set('teamId', candidate.teamId);
  const branch = verifyDeployment(
    candidate,
    await request(url, z.string().min(1).parse(env.VERCEL_TOKEN)),
  );
  // Membership in a trusted branch prevents a fork commit disguised as a deployment of "main".
  const comparison = new URL(
    `https://api.github.com/repos/${candidate.repository}/compare/${candidate.sha}...${encodeURIComponent(`refs/heads/${branch}`)}`,
  );
  assertTrustedAncestry(await request(comparison, z.string().min(1).parse(env.GITHUB_TOKEN)));
  await appendFile(
    z.string().min(1).parse(env.GITHUB_OUTPUT),
    `sha=${candidate.sha}\nbase_url=${candidate.baseUrl}\n`,
  );
  process.stdout.write(
    'Verified preview project, hostname, commit, repository and trusted branch ancestry.\n',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyPreview(process.env).catch(() => {
    process.stderr.write(
      'Preview verification failed. Check the deployment-specific hostname, project, reviewed branch and credentials; no secrets are logged.\n',
    );
    process.exitCode = 1;
  });
}
