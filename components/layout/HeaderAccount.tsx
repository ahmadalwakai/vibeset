import { Button, Icon } from '@chakra-ui/react';
import { UserCircleIcon } from '@phosphor-icons/react/ssr';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';
import { Link } from '@/i18n/navigation';
import { getCreatorProfile, getSession } from '@/server/guards';
import { UserMenu } from './UserMenu';

export async function HeaderAccount({
  compact = false,
}: { compact?: boolean } = {}): Promise<ReactElement> {
  const [session, common] = await Promise.all([getSession(), getTranslations('common')]);
  if (!session || session.user.banned)
    return (
      <Button
        asChild
        variant="outline"
        colorPalette="brand"
        size={compact ? 'lg' : 'sm'}
        minH="11"
        minW="11"
        px="3"
        rounded="button"
        aria-label={common('signIn')}
      >
        <Link href="/sign-in">
          {compact ? (
            <Icon asChild boxSize="5">
              <UserCircleIcon aria-hidden />
            </Icon>
          ) : (
            common('signIn')
          )}
        </Link>
      </Button>
    );

  const profile = session.user.role === 'admin' ? null : await getCreatorProfile(session.user.id);
  return (
    <UserMenu
      name={session.user.name}
      image={session.user.image}
      role={session.user.role}
      isCreator={session.user.role === 'admin' || profile?.status === 'approved'}
      compact={compact}
    />
  );
}
