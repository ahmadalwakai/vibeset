import { describe, expect, it } from 'vitest';
import { validatePreviewBootstrap } from '../e2e/network';

describe('preview bypass redirect containment', () => {
  it('allows only successful exact-origin bootstrap responses', () => {
    expect(() => validatePreviewBootstrap(200, null, 'https://preview.example')).not.toThrow();
    expect(() =>
      validatePreviewBootstrap(307, '/sign-in', 'https://preview.example'),
    ).not.toThrow();
    for (const destination of [
      'https://cdn.example/a',
      '//evil.example',
      'https://preview.example.evil.test/a',
      'http://preview.example/a',
    ])
      expect(() => validatePreviewBootstrap(307, destination, 'https://preview.example')).toThrow();
    for (const status of [401, 403, 500])
      expect(() => validatePreviewBootstrap(status, null, 'https://preview.example')).toThrow();
  });
});
