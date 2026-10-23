import 'server-only';

import { Resend } from 'resend';
import { env } from '@/lib/env.server';
import { magicLinkEmailInputSchema } from '@/lib/validation/auth';
import type { MagicLinkEmailInput } from '@/lib/validation/auth';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

type MagicLinkEmailCopy = typeof en.auth.magicLinkEmail;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlSection(copy: MagicLinkEmailCopy, locale: 'en' | 'ar', url: string): string {
  return `<section lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<h1>${escapeHtml(copy.title)}</h1>
<p>${escapeHtml(copy.introduction)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(copy.action)}</a></p>
<p>${escapeHtml(copy.expiry)}</p>
<p>${escapeHtml(copy.ignore)}</p>
</section>`;
}

function textSection(copy: MagicLinkEmailCopy, url: string): string {
  return [copy.title, copy.introduction, `${copy.action}:\n${url}`, copy.expiry, copy.ignore].join(
    '\n\n',
  );
}

export async function sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<void> {
  const result = magicLinkEmailInputSchema
    .refine(
      ({ url }) => {
        try {
          return new URL(url).origin === new URL(env.BETTER_AUTH_URL).origin;
        } catch {
          return false;
        }
      },
      {
        path: ['url'],
        error: 'Must use the configured authentication origin',
      },
    )
    .safeParse(input);

  if (!result.success) {
    throw new Error('Invalid magic-link email input');
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM are required to send magic-link emails');
  }

  const english = en.auth.magicLinkEmail;
  const arabic = ar.auth.magicLinkEmail;
  const { to, url } = result.data;
  const html = `<!doctype html><html lang="en"><body>
${htmlSection(english, 'en', url)}
<hr>
${htmlSection(arabic, 'ar', url)}
</body></html>`;
  const text = `${textSection(english, url)}\n\n---\n\n${textSection(arabic, url)}`;

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const response = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: `${english.subject} · ${arabic.subject}`,
      html,
      text,
    });

    if (response.error || !response.data?.id) {
      throw new Error('Magic-link email delivery failed');
    }
  } catch {
    throw new Error('Magic-link email delivery failed');
  }
}
