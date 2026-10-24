import type { BrowserContext } from '@playwright/test';

export function validatePreviewBootstrap(
  status: number,
  location: string | null,
  baseURL: string,
): void {
  if (status < 200 || status >= 400) throw new Error('Preview protection bootstrap failed');
  if (location && new URL(location, baseURL).origin !== new URL(baseURL).origin)
    throw new Error('Preview protection attempted an external redirect');
}

/** Called only by untraced global setup; browsers never carry the bypass header. */
export async function preparePreviewAccess(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const url = new URL(baseURL);
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return;
  if (url.protocol !== 'https:') throw new Error('Preview protection requires HTTPS');
  const response = await context.request
    .get(new URL('/sign-in', url).href, {
      headers: {
        'x-vercel-protection-bypass': secret,
        'x-vercel-set-bypass-cookie': 'true',
      },
      maxRedirects: 0,
      timeout: 15_000,
    })
    .catch(() => {
      throw new Error('Preview protection bootstrap request failed');
    });
  try {
    validatePreviewBootstrap(response.status(), response.headers().location ?? null, baseURL);
    const cookie = (await context.cookies(baseURL)).find((value) => value.name === '_vercel_jwt');
    if (!cookie || !cookie.httpOnly || !cookie.secure)
      throw new Error('Preview protection did not set a secure HttpOnly bypass cookie');
    // Convert the received credential to this exact host, even if the response used Domain.
    await context.clearCookies({ name: '_vercel_jwt' });
    await context.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        url: `${url.origin}/`,
        httpOnly: true,
        secure: true,
        sameSite: cookie.sameSite,
        ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
      },
    ]);
  } catch {
    // Playwright request errors may contain header call logs. Keep them out of reports.
    throw new Error('Preview protection cookie setup failed');
  } finally {
    await response.dispose().catch(() => undefined);
  }
}
