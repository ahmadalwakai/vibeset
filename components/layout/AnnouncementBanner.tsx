'use client';

import { Box, Container, Flex, Icon, IconButton, Link as ChakraLink, Text } from '@chakra-ui/react';
import { XIcon } from '@phosphor-icons/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import type { PublicSettingsDTO } from '@/lib/dto';
import { localized } from '@/lib/utils/localized';

const storageKey = 'vibeset:announcement-dismissals';
const eventName = 'vibeset:announcement-dismissed';
const dismissalsSchema = z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(50);

function dismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw || raw.length > 4096) return [];
    const value: unknown = JSON.parse(raw);
    const parsed = dismissalsSchema.safeParse(value);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(eventName, listener);
  };
}

const serverSnapshot = (): boolean => false;

export function AnnouncementBanner({
  announcement,
}: {
  announcement: NonNullable<PublicSettingsDTO['announcement']>;
}): ReactElement | null {
  const locale = useLocale();
  const t = useTranslations('home.announcement');
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const snapshot = useCallback(() => dismissedIds().includes(announcement.id), [announcement.id]);
  const dismissed = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (hiddenId === announcement.id || dismissed) return null;
  const text = localized({ nameEn: announcement.textEn, nameAr: announcement.textAr }, locale);
  const tone =
    announcement.tone === 'warning'
      ? 'yellow'
      : announcement.tone === 'celebrate'
        ? 'peach'
        : 'brand';

  function dismiss(): void {
    setHiddenId(announcement.id);
    try {
      const value = dismissalsSchema.parse(
        [...dismissedIds().filter((id) => id !== announcement.id), announcement.id].slice(-50),
      );
      localStorage.setItem(storageKey, JSON.stringify(value));
      window.dispatchEvent(new Event(eventName));
    } catch {
      // Dismissal still works in this tab when browser storage is unavailable.
    }
  }

  return (
    <Box
      bg={`${tone}.subtle`}
      color={`${tone}.fg`}
      borderBottomWidth="hairline"
      borderColor="border"
      role="status"
    >
      <Container maxW="container.xl" px={{ base: '4', md: '6', lg: '8' }}>
        <Flex align="center" gap="3" justify="space-between" py="1">
          {announcement.href ? (
            <ChakraLink
              asChild
              minH="11"
              display="flex"
              alignItems="center"
              textStyle="body.sm"
              fontWeight="medium"
            >
              {announcement.href.startsWith('/') ? (
                <Link href={announcement.href}>{text}</Link>
              ) : (
                <a href={announcement.href} rel="noopener">
                  {text}
                </a>
              )}
            </ChakraLink>
          ) : (
            <Text py="2" textStyle="body.sm" fontWeight="medium">
              {text}
            </Text>
          )}
          <IconButton
            aria-label={t('dismiss')}
            onClick={dismiss}
            variant="ghost"
            size="lg"
            rounded="button"
            flexShrink="0"
          >
            <Icon>
              <XIcon aria-hidden />
            </Icon>
          </IconButton>
        </Flex>
      </Container>
    </Box>
  );
}
