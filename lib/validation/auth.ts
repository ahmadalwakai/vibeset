import { z } from 'zod';

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
