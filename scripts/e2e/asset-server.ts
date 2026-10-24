import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { originSchema, e2eDirectory, assertOwnedE2ePath } from './environment';

/** Serves only actual generated files in this run's fixture directory. */
export async function startE2eAssetServer(runId: string, origin: string): Promise<Server> {
  const url = new URL(originSchema.parse(origin));
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Loopback assets only');
  const root = path.join(e2eDirectory(runId), 'assets');
  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('x-content-type-options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', url).pathname);
      const relative = pathname.replace(/^\/+/, '');
      if (!/^themes\/[a-f0-9-]{36}\/v1\/[a-f0-9-]{36}\/[a-z-]+\.(?:jpg|webp)$/.test(relative))
        throw new Error();
      const file = assertOwnedE2ePath(path.resolve(root, relative), runId);
      if (!path.relative(root, file) || path.relative(root, file).startsWith('..'))
        throw new Error();
      const info = await stat(file);
      if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new Error();
      const body = request.method === 'HEAD' ? undefined : await readFile(file);
      if (body && body.byteLength !== info.size) throw new Error();
      response.writeHead(200, {
        'content-type': file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
        'content-length': info.size,
        'cache-control': 'public, max-age=3600',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(url.port || '80'), url.hostname === '[::1]' ? '::1' : url.hostname, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}
