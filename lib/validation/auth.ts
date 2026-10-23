import { z } from 'zod';

export const emailSignInSchema = z.strictObject({ email: z.string().trim().pipe(z.email()) });

export const nextPathSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      if (
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value !== value.trim() ||
        /[\\\u0000-\u0020\u007f]/.test(value)
      )
        return false;

      try {
        const parsed = new URL(value, 'https://vibeset.invalid');
        if (parsed.origin !== 'https://vibeset.invalid' || parsed.pathname.startsWith('//'))
          return false;

        let pathname = parsed.pathname;
        for (let count = 0; count < 6; count += 1) {
          const decoded = decodeURIComponent(pathname);
        if (/^\/(?:(?:en|ar)\/)?\/|[\\\u0000-\u0020\u007f]/.test(decoded)) return false;
          if (decoded === pathname) {
            return !/^\/(?:(?:en|ar)\/)?sign-in(?:\/|$)/.test(decoded);
          }
          pathname = decoded;
        }
        return false;
      } catch {
        return false;
      }
    },
    { error: 'Must be a safe relative return path' },
  );

export const magicLinkEmailInputSchema = z.strictObject({
  to: z.email(),
  url: z
    .string()
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
      error: 'Must not contain control characters',
    })
    .pipe(z.url({ protocol: /^https?$/ }))
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          const tokens = url.searchParams.getAll('token');

          return (
            url.username === '' &&
            url.password === '' &&
            url.hash === '' &&
            url.pathname === '/api/auth/magic-link/verify' &&
            tokens.length === 1 &&
            (tokens[0]?.trim().length ?? 0) > 0
          );
        } catch {
          return false;
        }
      },
      { error: 'Must be a magic-link verification URL with one token' },
    ),
});

export type MagicLinkEmailInput = z.infer<typeof magicLinkEmailInputSchema>;
