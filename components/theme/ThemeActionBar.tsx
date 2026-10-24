'use client';

import { Box, Button, Flex, Icon, IconButton, Menu, Portal, Spinner, Text } from '@chakra-ui/react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree';
import { MagicWandIcon } from '@phosphor-icons/react/dist/csr/MagicWand';
import { ShareNetworkIcon } from '@phosphor-icons/react/dist/csr/ShareNetwork';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toaster } from '@/components/ui/toaster';
import { Link } from '@/i18n/navigation';
import { shareUrl } from '@/lib/client/share';
import type { ThemeDetailDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';

function PreparingSheet(): ReactElement {
  const t = useTranslations('theme.download');
  return (
    <Flex align="center" justify="center" gap="3" p="4" role="status" aria-live="polite">
      <Spinner size="sm" color="brand.fg" />
      <Text textStyle="body.sm" color="fg.muted">
        {t('preparing')}
      </Text>
    </Flex>
  );
}

const WallpaperDownloadSheet = dynamic(
  () => import('./WallpaperDownloadSheet').then((module) => module.WallpaperDownloadSheet),
  { loading: PreparingSheet },
);

export interface ThemeActionBarProps {
  theme: ThemeDetailDTO;
  iconsAction?: ReactNode;
  favoriteAction?: ReactNode;
  reportAction?: ReactNode;
}

export function ThemeActionBar({
  theme,
  iconsAction,
  favoriteAction,
  reportAction,
}: ThemeActionBarProps): ReactElement {
  const t = useTranslations('theme.actions');
  const locale = useLocale();
  const [opened, setOpened] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function share(): Promise<void> {
    if (sharing) return;
    setSharing(true);
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      const result = await shareUrl({ title: localized(theme, locale), url: url.href });
      if (result === 'cancelled') return;
      toaster.create({
        type: result === 'activation-required' ? 'info' : 'success',
        title: t(
          result === 'activation-required'
            ? 'activationRequired'
            : result === 'copied'
              ? 'copied'
              : 'shared',
        ),
      });
    } catch {
      toaster.create({ type: 'error', title: t('shareFailed') });
    } finally {
      setSharing(false);
    }
  }

  const secondaryActions = (
    <>
      <Button asChild variant="outline" rounded="button" size="lg" minW="11" px="3">
        <Link href={{ pathname: '/studio', query: { from: theme.slug } }} aria-label={t('remix')}>
          <Icon asChild boxSize="5">
            <MagicWandIcon aria-hidden />
          </Icon>
          <Text as="span" display={{ base: iconsAction ? 'inline' : 'none', sm: 'inline' }}>
            {t('remix')}
          </Text>
        </Link>
      </Button>
      {favoriteAction}
      <Menu.Root positioning={{ placement: 'top-end' }}>
        <Menu.Trigger asChild>
          <IconButton
            variant="ghost"
            rounded="button"
            size="lg"
            aria-label={t('more')}
            loading={sharing}
          >
            <Icon asChild boxSize="6">
              <DotsThreeIcon aria-hidden weight="bold" />
            </Icon>
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content rounded="input" shadow="float" minW="48">
              <Menu.Item value="share" minH="11" disabled={sharing} onSelect={() => void share()}>
                <Icon asChild boxSize="5">
                  <ShareNetworkIcon aria-hidden />
                </Icon>
                {t('share')}
              </Menu.Item>
              {reportAction}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </>
  );

  return (
    <>
      <Box
        role="group"
        aria-label={t('label')}
        position={{ base: 'fixed', md: 'static' }}
        insetInline={{ base: '0', md: 'auto' }}
        bottom={{ base: 'calc({sizes.16} + env(safe-area-inset-bottom))', md: 'auto' }}
        zIndex="sticky"
        bg={{ base: 'chrome.bg', md: 'transparent' }}
        backdropFilter={{ base: 'saturate(180%) blur(16px)', md: 'none' }}
        borderTopWidth={{ base: 'hairline', md: '0' }}
        borderColor="border"
        p={{ base: '3', md: '0' }}
        css={{
          '@media (prefers-reduced-transparency: reduce)': {
            bg: 'bg.panel',
            backdropFilter: 'none',
          },
        }}
      >
        <Flex align="center" gap="2" wrap={iconsAction ? 'nowrap' : 'wrap'}>
          <Button
            colorPalette="brand"
            rounded="button"
            size="lg"
            flex="1"
            minW="32"
            onClick={() => {
              setOpened(true);
              setSheetOpen(true);
            }}
          >
            <Icon asChild boxSize="5">
              <DownloadSimpleIcon aria-hidden />
            </Icon>
            {t('download')}
          </Button>
          {iconsAction}
          {!iconsAction ? secondaryActions : null}
        </Flex>
        {iconsAction ? (
          <Flex align="center" justify="end" gap="2" mt="2">
            {secondaryActions}
          </Flex>
        ) : null}
        {opened ? (
          <WallpaperDownloadSheet theme={theme} open={sheetOpen} onOpenChange={setSheetOpen} />
        ) : null}
      </Box>
    </>
  );
}
