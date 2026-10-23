export interface AuthRateLimitRule {
  window: number;
  max: number;
}

export interface AuthRateLimitDecision {
  allowed: boolean;
  retryAfter: number | null;
}
