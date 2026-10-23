import { after } from 'next/server';
import { z } from 'zod';
import { invalidate } from '@/server/cache';
import { requireAdmin } from '@/server/guards';
import { AppError } from '@/server/errors';
import { readJsonBody } from '@/server/request-body';
import { handleRoute } from '@/server/route';

export const maxDuration = 60;
const inputSchema = z.strictObject({ force: z.boolean().default(false) });

export const POST = handleRoute(
  async (request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> => {
    const session = await requireAdmin();
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new AppError('FORBIDDEN', 'Invalid request origin');
    const themeId = z
      .uuid()
      .length(36)
      .parse((await context.params).id)
      .toLowerCase();
    const input = inputSchema.parse(await readJsonBody(request, 4096, true));
    const { publishTheme, cleanupOldVersions } = await import('@/server/services/theme-publish');
    const result = await publishTheme({
      themeId,
      force: input.force,
      actor: { kind: 'user', userId: session.user.id, role: 'admin', isCreator: false },
    });
    try {
      invalidate(result.tags, 'revalidate');
    } catch {
      console.error({ scope: 'publish.invalidate', themeId, code: 'INTERNAL' });
    }
    const cleanup = result.cleanup;
    if (cleanup) {
      try {
        after(async () => {
          try {
            await cleanupOldVersions(cleanup.themeId, cleanup.keepFromVersion);
          } catch {
            console.error({ scope: 'publish.cleanup', themeId, code: 'INTERNAL' });
          }
        });
      } catch {
        console.error({ scope: 'publish.cleanup.schedule', themeId, code: 'INTERNAL' });
      }
    }
    return Response.json(
      { data: result.data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  },
);
