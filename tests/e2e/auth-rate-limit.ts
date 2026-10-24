/** Honour the server's delay; refuse waits over one minute instead of retrying early. */
export function retryAfterMilliseconds(value: string | undefined, now: number): number | null {
  if (!value) return null;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)
      ? Math.ceil((Date.parse(value) - now) / 1000)
      : NaN;
  if (!Number.isFinite(seconds) || seconds > 60 || seconds < 0) return null;
  return Math.max(1, seconds) * 1000 + 100;
}
