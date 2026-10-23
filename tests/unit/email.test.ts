import type { CreateEmailOptions, CreateEmailResponse } from 'resend';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { magicLinkEmailInputSchema } from '@/lib/validation/auth';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

const { sendMock, resendMock, envMock } = vi.hoisted(() => {
  const sendMock = vi.fn<(options: CreateEmailOptions) => Promise<CreateEmailResponse>>();
  const resendMock = vi.fn(
    class ResendMock {
      emails = { send: sendMock };
    },
  );

  return {
    sendMock,
    resendMock,
    envMock: {
      RESEND_API_KEY: 're_test_key' as string | undefined,
      EMAIL_FROM: 'Vibeset <hello@vibeset.app>' as string | undefined,
      BETTER_AUTH_URL: 'https://vibeset.app',
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('resend', () => ({ Resend: resendMock }));
vi.mock('@/lib/env.server', () => ({ env: envMock }));

import { sendMagicLinkEmail } from '@/server/email';

const clientsCreatedAtImport = resendMock.mock.calls.length;
const validInput = {
  to: 'person@example.com',
  url: 'https://vibeset.app/api/auth/magic-link/verify?token=secret-token&callbackURL=%2F',
};

beforeEach(() => {
  vi.clearAllMocks();
  envMock.RESEND_API_KEY = 're_test_key';
  envMock.EMAIL_FROM = 'Vibeset <hello@vibeset.app>';
  envMock.BETTER_AUTH_URL = 'https://vibeset.app';
  sendMock.mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null });
});

describe('magic-link email', () => {
  it('does not instantiate Resend during module import', () => {
    expect(clientsCreatedAtImport).toBe(0);
  });

  it('sends English followed by RTL Arabic, including a plain-text alternative and expiry', async () => {
    await sendMagicLinkEmail(validInput);

    expect(resendMock).toHaveBeenCalledExactlyOnceWith('re_test_key');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const email = sendMock.mock.calls[0]?.[0];

    expect(email).toMatchObject({
      to: validInput.to,
      from: envMock.EMAIL_FROM,
      subject: `${en.auth.magicLinkEmail.subject} · ${ar.auth.magicLinkEmail.subject}`,
    });
    expect(email?.html).toContain('<section lang="en" dir="ltr">');
    expect(email?.html).toContain('<section lang="ar" dir="rtl">');
    expect(email?.html?.indexOf(en.auth.magicLinkEmail.title)).toBeLessThan(
      email?.html?.indexOf(ar.auth.magicLinkEmail.title) ?? -1,
    );
    expect(email?.text?.indexOf(en.auth.magicLinkEmail.title)).toBeLessThan(
      email?.text?.indexOf(ar.auth.magicLinkEmail.title) ?? -1,
    );
    for (const copy of [en.auth.magicLinkEmail, ar.auth.magicLinkEmail]) {
      expect(email?.html).toContain(copy.expiry);
      expect(email?.text).toContain(copy.expiry);
      expect(email?.text).toContain(copy.ignore);
    }
    expect(email?.text).toContain(validInput.url);
    expect(email?.html).not.toMatch(/<img\b|<script\b|<iframe\b/i);
  });

  it('escapes HTML attribute metacharacters while preserving the plain-text verification link', async () => {
    const url =
      'https://vibeset.app/api/auth/magic-link/verify?token=\'"><svg/onload=alert(1)>&callbackURL=%2F';
    await sendMagicLinkEmail({ ...validInput, url });
    const email = sendMock.mock.calls[0]?.[0];

    expect(email?.html).toContain(
      'token=&#39;&quot;&gt;&lt;svg/onload=alert(1)&gt;&amp;callbackURL=',
    );
    expect(email?.html).not.toContain('<svg');
    expect(email?.html).not.toContain('token=\'">');
    expect(email?.text).toContain(url);
  });

  it.each(['RESEND_API_KEY', 'EMAIL_FROM'] as const)(
    'fails clearly without %s and never starts delivery',
    async (key) => {
      envMock[key] = undefined;
      await expect(sendMagicLinkEmail(validInput)).rejects.toThrow(/RESEND_API_KEY and EMAIL_FROM/);
      expect(resendMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://attacker.example/api/auth/magic-link/verify?token=secret-token',
    'http://vibeset.app/api/auth/magic-link/verify?token=secret-token',
    'https://vibeset.app.attacker.example/api/auth/magic-link/verify?token=secret-token',
    'https://attacker@vibeset.app/api/auth/magic-link/verify?token=secret-token',
    'https://vibeset.app/api/auth/magic-link/verify/extra?token=secret-token',
    'https://vibeset.app/api/auth/sign-in?token=secret-token',
    'https://vibeset.app/api/auth/magic-link/verify?token=secret-token#fragment',
    'https://vibeset.app/api/auth/magic-link/verify',
    'https://vibeset.app/api/auth/magic-link/verify?token=',
    'https://vibeset.app/api/auth/magic-link/verify?token=a&token=b',
    'javascript:alert(1)',
    'not-a-url',
    'https://vibeset.app/api/auth/magic-link/verify?token=secret\ntoken',
  ])('rejects an untrusted or malformed verification URL without sending: %s', async (url) => {
    await expect(sendMagicLinkEmail({ ...validInput, url })).rejects.toThrow(
      'Invalid magic-link email input',
    );
    expect(resendMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each(['not-an-email', 'person@example.com\r\nBcc:attacker@example.com', ''])(
    'rejects malformed recipient %s',
    async (to) => {
      await expect(sendMagicLinkEmail({ ...validInput, to })).rejects.toThrow(
        'Invalid magic-link email input',
      );
      expect(sendMock).not.toHaveBeenCalled();
    },
  );

  it('accepts the configured local development origin', async () => {
    envMock.BETTER_AUTH_URL = 'http://localhost:3000';
    const url = 'http://localhost:3000/api/auth/magic-link/verify?token=local-token';
    await expect(sendMagicLinkEmail({ ...validInput, url })).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('treats Resend error responses as failures and does not expose provider details', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: `Rejected ${validInput.url} with ${envMock.RESEND_API_KEY}`,
        statusCode: 422,
      },
      headers: null,
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(sendMagicLinkEmail(validInput)).rejects.toThrow(
        /^Magic-link email delivery failed$/,
      );
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('sanitizes transport exceptions rather than leaking secret URLs', async () => {
    sendMock.mockRejectedValue(new Error(`Network failed while sending ${validInput.url}`));
    await expect(sendMagicLinkEmail(validInput)).rejects.toThrow(
      /^Magic-link email delivery failed$/,
    );
  });

  it('keeps the email dictionaries aligned and input boundaries strict', () => {
    expect(Object.keys(ar.auth.magicLinkEmail).sort()).toEqual(
      Object.keys(en.auth.magicLinkEmail).sort(),
    );
    expect(magicLinkEmailInputSchema.safeParse({ ...validInput, html: '<script>' }).success).toBe(
      false,
    );
  });
});
