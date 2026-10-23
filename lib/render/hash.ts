import type { ThemeSpec } from './spec';

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('Canonical JSON requires finite numbers');
      }
      return JSON.stringify(value);
    case 'object': {
      if (ancestors.has(value)) {
        throw new TypeError('Canonical JSON cannot contain circular references');
      }

      if (
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      ) {
        throw new TypeError('Canonical JSON requires plain objects');
      }

      ancestors.add(value);

      try {
        if (Array.isArray(value)) {
          return `[${Array.from(value, (item: unknown) => serialize(item, ancestors)).join(',')}]`;
        }

        const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        );

        return `{${entries
          .map(([key, item]) => `${JSON.stringify(key)}:${serialize(item, ancestors)}`)
          .join(',')}}`;
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      throw new TypeError('Canonical JSON only supports JSON values');
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

export async function specHash(spec: ThemeSpec): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(spec));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
