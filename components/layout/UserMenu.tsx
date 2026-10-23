'use client';

import { Avatar, Icon, IconButton, Menu, Portal, Text } from '@chakra-ui/react';
import {
  HeartIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UserCircleIcon,
} from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { z } from 'zod';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { toaster } from '@/components/ui/toaster';

const avatarUrlSchema = z.url({ protocol: /^https?$/ });

export function UserMenu({
  name,
  image,
  role,
  isCreator,
  compact = false,
}: {
  name: string;
  image?: string | null;
  role?: string | null;
  isCreator: boolean;
  compact?: boolean;
}): ReactElement {
  const t = useTranslations('auth');
  const nav = useTranslations('nav');
  const errors = useTranslations('errors');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const displayName = name.trim() || t('member');
  const avatar = avatarUrlSchema.safeParse(image);

  async function signOut(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error || !result.data?.success) {
        toaster.create({
          type: 'error',
          title: t('signOutFailed'),
          description: errors('INTERNAL'),
        });
        return;
      }
      router.refresh();
    } catch {
      toaster.create({
        type: 'error',
        title: t('signOutFailed'),
        description: errors(navigator.onLine ? 'NETWORK' : 'OFFLINE'),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Menu.Root positioning={{ placement: 'bottom-end' }}>
      <Menu.Trigger asChild>
        <IconButton
          variant="ghost"
          rounded="button"
          minH="11"
          minW="11"
          aria-label={t('accountMenu', { name: displayName })}
          disabled={pending}
        >
          <Avatar.Root size={compact ? 'xs' : 'sm'} colorPalette="brand">
            <Avatar.Fallback name={displayName} />
            {avatar.success && <Avatar.Image src={avatar.data} alt="" />}
          </Avatar.Root>
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="56" maxW="xs" rounded="input" shadow="float">
            <Text px="3" py="2" textStyle="caption" color="fg.muted" lineClamp="1">
              {displayName}
            </Text>
            <Menu.Item asChild value="saved" minH="11">
              <Link href="/saved">
                <Icon asChild boxSize="5">
                  <HeartIcon aria-hidden />
                </Icon>
                {nav('saved')}
              </Link>
            </Menu.Item>
            <Menu.Item asChild value="account" minH="11">
              <Link href="/account">
                <Icon asChild boxSize="5">
                  <UserCircleIcon aria-hidden />
                </Icon>
                {nav('account')}
              </Link>
            </Menu.Item>
            {isCreator && (
              <Menu.Item asChild value="creator" minH="11">
                <Link href="/creator">
                  <Icon asChild boxSize="5">
                    <PaintBrushIcon aria-hidden />
                  </Icon>
                  {t('creatorStudio')}
                </Link>
              </Menu.Item>
            )}
            {role === 'admin' && (
              <Menu.Item asChild value="admin" minH="11">
                <Link href="/admin">
                  <Icon asChild boxSize="5">
                    <ShieldCheckIcon aria-hidden />
                  </Icon>
                  {t('administration')}
                </Link>
              </Menu.Item>
            )}
            <Menu.Separator />
            <Menu.Item
              value="sign-out"
              minH="11"
              disabled={pending}
              onSelect={() => void signOut()}
            >
              <Icon asChild boxSize="5">
                <SignOutIcon aria-hidden />
              </Icon>
              {pending ? t('signingOut') : t('signOut')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
