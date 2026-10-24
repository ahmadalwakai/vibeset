import type { CreatorContext, CreatorStatus } from '@/lib/creator';

type ApplicationSnapshot = Pick<CreatorContext, 'userId' | 'status' | 'updatedAt'>;

export function applicationVersion(profile: ApplicationSnapshot | null): string {
  return profile ? `${profile.userId}:${profile.status}:${profile.updatedAt}` : 'new';
}

/** Optimistic pending applies only until a new server snapshot arrives. */
export function applicationStatus(
  profile: ApplicationSnapshot | null,
  submittedVersion: string | null,
): CreatorStatus | undefined {
  return submittedVersion === applicationVersion(profile) ? 'pending' : profile?.status;
}
