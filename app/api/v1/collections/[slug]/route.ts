import { connection } from 'next/server';
import { decodeCollectionCursor } from '@/lib/utils/cursor';
import { AppError } from '@/server/errors';
import { publicData, publicSlugSchema, singleQueryValue } from '@/server/public-api';
import { handleRoute } from '@/server/route';

export const GET = handleRoute(
  async (request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> => {
    const cursor = singleQueryValue(new URL(request.url).searchParams, 'cursor');
    if (cursor !== undefined) decodeCollectionCursor(cursor);
    await connection();
    const slug = publicSlugSchema.parse((await context.params).slug);
    const { getCollection } = await import('@/server/queries/collections');
    const collection = await getCollection(slug, cursor);
    if (!collection) throw new AppError('NOT_FOUND', 'Collection not found');
    return publicData(collection);
  },
);
