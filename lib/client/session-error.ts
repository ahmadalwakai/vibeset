export function sessionErrorCode(error: unknown): 'RATE_LIMITED' | 'NETWORK' {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 429
    ? 'RATE_LIMITED'
    : 'NETWORK';
}
