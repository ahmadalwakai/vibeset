'use client';

import { Box, Button, CloseButton, Flex, Icon, Input, Stack, Text } from '@chakra-ui/react';
import { BrowserIcon } from '@phosphor-icons/react/dist/csr/Browser';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { DotsThreeOutlineIcon } from '@phosphor-icons/react/dist/csr/DotsThreeOutline';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { z } from 'zod';
import { toaster } from '@/components/ui/toaster';
import { usePlatform } from '@/hooks/usePlatform';
import { copyUrl } from '@/lib/client/share';

const DISMISS_KEY = 'vibeset:in-app-banner-dismissed';
const DISMISS_EVENT = 'vibeset:in-app-banner-dismiss';
const dismissedSchema = z.literal('1');
let dismissedInMemory = false;

function subscribe(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener(DISMISS_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(DISMISS_EVENT, listener);
  };
}

function readDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return dismissedSchema.safeParse(window.sessionStorage.getItem(DISMISS_KEY)).success;
  } catch {
    return false;
  }
}

function serverSnapshot(): boolean {
  return false;
}

export function InAppBrowserBanner(): ReactElement | null {
  const t = useTranslations('theme.inAppBrowser');
  const platform = usePlatform();
  const storedDismissed = useSyncExternalStore(subscribe, readDismissed, serverSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [copying, setCopying] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  function dismiss(): void {
    dismissedInMemory = true;
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Client memory preserves dismissal across route remounts when storage is denied.
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  async function copy(): Promise<void> {
    if (copying) return;
    setCopying(true);
    const url = window.location.href;
    try {
      await copyUrl(url);
      setManualUrl(null);
      toaster.create({ type: 'success', title: t('copied') });
    } catch {
      setManualUrl(url);
    } finally {
      setCopying(false);
    }
  }

  if (!platform?.inAppBrowser || storedDismissed || dismissed) return null;

  return (
    <Box
      as="aside"
      aria-label={t('title')}
      position="sticky"
      top="16"
      zIndex="docked"
      bg="brand.subtle"
      borderWidth="hairline"
      borderColor="brand.emphasized"
      rounded="card"
      p={{ base: '4', md: '5' }}
    >
      <Flex align="start" gap="3">
        <Icon asChild boxSize="6" color="brand.fg" flexShrink="0" mt="1">
          <BrowserIcon aria-hidden />
        </Icon>
        <Stack gap="3" flex="1" minW="0">
          <Stack gap="1">
            <Text textStyle="heading.sm" color="brand.fg">
              {t('title')}
            </Text>
            <Text textStyle="body.sm" color="fg.muted">
              {t('description')}
            </Text>
          </Stack>
          <Flex align="start" gap="2">
            <Icon asChild boxSize="5" color="brand.fg" flexShrink="0" mt="0.5">
              <DotsThreeOutlineIcon aria-hidden weight="fill" />
            </Icon>
            <Text textStyle="body.sm" color="fg.muted">
              {t(platform.platform === 'ios' ? 'iosInstruction' : 'otherInstruction')}
            </Text>
          </Flex>
          <Button
            alignSelf="start"
            colorPalette="brand"
            rounded="button"
            minH="11"
            loading={copying}
            onClick={() => void copy()}
          >
            <Icon asChild boxSize="5">
              <CopyIcon aria-hidden />
            </Icon>
            {t('copyLink')}
          </Button>
          {manualUrl ? (
            <Stack gap="2" role="status">
              <Text textStyle="body.sm" color="fg.muted">
                {t('copyFailed')}
              </Text>
              <Input
                value={manualUrl}
                readOnly
                aria-label={t('copyLink')}
                dir="ltr"
                minH="11"
                onFocus={(event) => event.currentTarget.select()}
              />
            </Stack>
          ) : null}
        </Stack>
        <CloseButton
          rounded="button"
          minW="11"
          minH="11"
          aria-label={t('dismiss')}
          onClick={dismiss}
        />
      </Flex>
    </Box>
  );
}
