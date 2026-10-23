import { pathToFileURL } from 'node:url';

async function main(): Promise<void> {
  let close: (() => Promise<void>) | undefined;
  try {
    const { env } = await import('../lib/env.server');
    if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production')
      throw new Error('Development only');
    const [
      { db },
      { themes },
      { pool },
      { eq },
      { specHash },
      { playgroundStateSchema, renderSampleSpec },
    ] = await Promise.all([
      import('../db/index'),
      import('../db/schema'),
      import('../db/pool'),
      import('drizzle-orm'),
      import('../lib/render/hash'),
      import('../content/render-sample'),
    ]);
    close = () => pool.end();
    const spec = renderSampleSpec(playgroundStateSchema.parse({}));
    const slug = 'dev-lavender-sample';
    await db
      .insert(themes)
      .values({
        slug,
        source: 'generated',
        status: 'approved',
        nameEn: 'Lavender daydream',
        nameAr: 'حلم لافندر',
        spec,
        specHash: await specHash(spec),
      })
      .onConflictDoNothing({ target: themes.slug });
    const [theme] = await db
      .select({ id: themes.id, slug: themes.slug, status: themes.status })
      .from(themes)
      .where(eq(themes.slug, slug));
    if (!theme) throw new Error('Sample unavailable');
    process.stdout.write(`${JSON.stringify(theme)}\n`);
  } catch {
    process.stderr.write(
      'Could not create the development sample. Check the development database configuration. Production is refused.\n',
    );
    process.exitCode = 1;
  } finally {
    if (close)
      await close().catch(() => {
        process.exitCode = 1;
      });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
