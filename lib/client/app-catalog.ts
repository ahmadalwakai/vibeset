import type { AppDTO } from '../dto';
import type { ErrorMessageCode } from '../result';
import { appCatalogSchema } from '../validation/icon-export';
import { apiErrorSchema } from '../validation/themes';

let pending: Promise<readonly AppDTO[]> | undefined;

export class AppCatalogError extends Error {
  constructor(public readonly code: ErrorMessageCode) {
    super('App catalogue could not be loaded');
    this.name = 'AppCatalogError';
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

/** One shared fetch; each caller can abandon its wait without cancelling another. */
export function loadAppCatalog(signal?: AbortSignal): Promise<readonly AppDTO[]> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  if (!pending) {
    const request = (async (): Promise<readonly AppDTO[]> => {
      let response: Response;
      try {
        response = await fetch('/api/v1/apps', {
          credentials: 'omit',
          headers: { accept: 'application/json' },
        });
      } catch {
        throw new AppCatalogError('NETWORK');
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AppCatalogError('INTERNAL');
      }
      if (!response.ok) {
        const error = apiErrorSchema.safeParse(body);
        throw new AppCatalogError(error.success ? error.data.error.code : 'INTERNAL');
      }
      const value =
        typeof body === 'object' && body !== null && 'data' in body ? body.data : undefined;
      const parsed = appCatalogSchema.safeParse(value);
      if (!parsed.success) throw new AppCatalogError('INTERNAL');
      return Object.freeze(
        parsed.data.map((app) => {
          const aliases = [...app.aliases];
          Object.freeze(aliases);
          return Object.freeze({ ...app, aliases });
        }),
      );
    })();
    pending = request;
    void request.catch(() => {
      if (pending === request) pending = undefined;
    });
  }
  const request = pending;
  if (!signal) return request;
  return new Promise((resolve, reject) => {
    const aborted = (): void => reject(abortReason(signal));
    signal.addEventListener('abort', aborted, { once: true });
    void request.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
