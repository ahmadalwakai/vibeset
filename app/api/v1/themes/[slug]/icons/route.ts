import { connection } from 'next/server';
import { AppError } from '@/server/errors';
import { publicData, publicSlugSchema } from '@/server/public-api';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(
  async (_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    await connection();
    const slug = publicSlugSchema.parse((await context.params).slug);
    const { getNativeIconPack } = await import('@/server/queries/native-icon-packs');
    const pack = await getNativeIconPack(slug);
    if (!pack)
      throw new AppError('NOT_FOUND', 'A prepared icon pack is unavailable for this theme');
    return publicData(pack);
  },
);
