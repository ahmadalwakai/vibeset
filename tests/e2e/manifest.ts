import { z } from 'zod';

export const E2E_PROJECT_NAMES = ['iphone', 'android', 'desktop'] as const;
export const E2E_ROLES = ['user', 'creator', 'admin', 'deleteUser'] as const;
export type E2eProjectName = (typeof E2E_PROJECT_NAMES)[number];
export type E2eRole = (typeof E2E_ROLES)[number];
const uuid = z.uuid().length(36);
const slug = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !/\s/.test(value));
const origin = z.url({ protocol: /^https?$/ }).refine((value) => {
  const parsed = new URL(value);
  return (
    !parsed.username &&
    !parsed.password &&
    parsed.pathname === '/' &&
    !parsed.search &&
    !parsed.hash
  );
});
const account = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  email: z.email().max(254),
  password: z.string().min(32).max(128),
});
const accounts = z.strictObject({
  user: account,
  creator: account,
  admin: account,
  deleteUser: account,
});
export const e2eManifestSchema = z
  .strictObject({
    v: z.literal(1),
    runId: uuid,
    mode: z.enum(['local', 'remote']),
    baseURL: origin,
    assetOrigin: origin,
    fixturePrefix: z.string(),
    databaseFingerprint: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime(),
    projects: z.strictObject({
      iphone: z.strictObject({ accounts }),
      android: z.strictObject({ accounts }),
      desktop: z.strictObject({ accounts }),
    }),
    themes: z
      .array(z.strictObject({ id: uuid, slug, nameEn: z.string().min(1).max(60) }))
      .min(25)
      .max(100),
    aestheticSlug: slug,
    aestheticNameEn: z.string().min(1).max(80),
    searchTerm: z.string().min(2).max(64),
    editorialCollection: z.strictObject({ id: uuid, slug }).nullable(),
    generationRunId: uuid.nullable(),
    publishEnabled: z.boolean(),
  })
  .superRefine((value, context) => {
    const emails = new Set<string>(),
      ids = new Set<string>();
    if (value.fixturePrefix !== `e2e-${value.runId}`)
      context.addIssue({ code: 'custom', message: 'Run prefix mismatch' });
    if (
      value.aestheticSlug !== value.fixturePrefix ||
      value.themes.some((theme) => !theme.slug.startsWith(`${value.fixturePrefix}-`)) ||
      (value.editorialCollection &&
        value.editorialCollection.slug !== `${value.fixturePrefix}-collection`)
    )
      context.addIssue({
        code: 'custom',
        message: 'Fixture slugs must belong to the recorded run',
      });
    for (const project of Object.values(value.projects))
      for (const role of E2E_ROLES) {
        const entry = project.accounts[role];
        if (
          !entry.email.startsWith('e2e-') ||
          !entry.email.endsWith('@example.invalid') ||
          !entry.email.includes(value.runId) ||
          emails.has(entry.email) ||
          ids.has(entry.id)
        )
          context.addIssue({
            code: 'custom',
            message: 'Disposable accounts must be unique and belong to this run',
          });
        emails.add(entry.email);
        ids.add(entry.id);
      }
    if (
      new Set(value.themes.map((theme) => theme.id)).size !== value.themes.length ||
      new Set(value.themes.map((theme) => theme.slug)).size !== value.themes.length
    )
      context.addIssue({ code: 'custom', message: 'Fixture themes must be unique' });
    const hostname = new URL(value.baseURL).hostname;
    if (value.mode === 'local' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname))
      context.addIssue({
        code: 'custom',
        message: 'Local browser tests require a loopback origin',
      });
    if (value.mode === 'remote' && new URL(value.baseURL).protocol !== 'https:')
      context.addIssue({ code: 'custom', message: 'Remote browser tests require HTTPS' });
  });
export type E2eManifest = z.infer<typeof e2eManifestSchema>;
export type E2eAccount = z.infer<typeof account>;
