import type { auth } from '../server/auth';
import type { creatorProfiles } from '../db/schema/moderation';

export type AuthSession = typeof auth.$Infer.Session;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type CreatorSession = AuthSession & { creator: CreatorProfile | null };
export type ActionAuth = 'public' | 'user' | 'creator' | 'admin';

export interface ActionContext<Level extends ActionAuth = ActionAuth> {
  session: Level extends 'public' ? AuthSession['session'] | null : AuthSession['session'];
  user: Level extends 'public' ? AuthSession['user'] | null : AuthSession['user'];
  creator: CreatorProfile | null;
  ipHash: string;
}

// HTTP access to plugin administration is replaced by Vibeset's guarded, audited services.
export const disabledAuthPaths = [
  '/admin/set-role',
  '/admin/get-user',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/list-users',
  '/admin/list-user-sessions',
  '/admin/unban-user',
  '/admin/ban-user',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/remove-user',
  '/admin/set-user-password',
  '/admin/has-permission',
];

export interface AuthRateLimitRule {
  window: number;
  max: number;
}

export interface AuthRateLimitDecision {
  allowed: boolean;
  retryAfter: number | null;
}
