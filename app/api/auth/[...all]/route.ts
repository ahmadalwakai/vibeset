import { toNextJsHandler } from 'better-auth/next-js';

// Initialize validated server configuration when an auth request is served.
// The public shell can still be prerendered without database/provider credentials.
export const { GET, POST } = toNextJsHandler(async (request: Request): Promise<Response> => {
  const { auth } = await import('@/server/auth');
  return auth.handler(request);
});
