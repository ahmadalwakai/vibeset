import { connection } from 'next/server';
import { AppError } from '@/server/errors';
import { publicData, publicSlugSchema } from '@/server/public-api';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(
  async (_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    await connection();
    const slug = publicSlugSchema.parse((await context.params).slug);
    const { getThemeDetail } = await import('@/server/queries/themes');
    const theme = await getThemeDetail(slug);
    if (!theme) throw new AppError('NOT_FOUND', 'Theme not found');
    return publicData(theme);
  },
);
