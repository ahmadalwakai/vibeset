export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'UPLOAD_INVALID'
  | 'RENDER_FAILED'
  | 'FEATURE_DISABLED'
  | 'INTERNAL';

export type ErrorMessageCode = ErrorCode | 'NETWORK' | 'OFFLINE';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };
    };

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INVALID_STATE: 409,
  UPLOAD_INVALID: 400,
  RENDER_FAILED: 500,
  FEATURE_DISABLED: 403,
  INTERNAL: 500,
};
