import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from '../../../lib/utils/json-ld';

describe('structured data serialization', () => {
  it('prevents script breakout and round trips localized text', () => {
    const value = { name: '</script><script>alert(1)</script> ليل\u2028هادئ\u2029' };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('\u2028');
    expect(serialized).not.toContain('\u2029');
    expect(JSON.parse(serialized)).toEqual(value);
  });
  it('rejects values that cannot be embedded as JSON', () => {
    expect(() => serializeJsonLd(undefined)).toThrow(TypeError);
    expect(() => serializeJsonLd(BigInt(1))).toThrow(TypeError);
  });
});
