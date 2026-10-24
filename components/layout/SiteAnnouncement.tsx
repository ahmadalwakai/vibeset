import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import type { PublicSettingsDTO } from '@/lib/dto';
import { AnnouncementBanner } from './AnnouncementBanner';

export async function SiteAnnouncement(): Promise<ReactElement | null> {
  await connection();
  let announcement: PublicSettingsDTO['announcement'] = null;
  try {
    const { getPublicSettings } = await import('@/server/queries/settings');
    announcement = (await getPublicSettings()).announcement;
  } catch (error) {
    unstable_rethrow(error);
    console.error({ scope: 'site.announcement', err: error });
  }
  return announcement ? (
    <AnnouncementBanner key={announcement.id} announcement={announcement} />
  ) : null;
}
