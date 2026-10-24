'use client';

import { Box, Icon, IconButton } from '@chakra-ui/react';
import { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { toaster } from '@/components/ui/toaster';
import { springs } from '@/design/motion';
import { MAX_LOCAL_FAVORITES } from '@/lib/favorites';
import { useFavorites } from './FavoritesProvider';

let localToastShown = false;

export function FavoriteButton({
  themeId,
  name,
  size = 'md',
}: {
  themeId: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}): ReactElement {
  const t = useTranslations('theme.favorites');
  const common = useTranslations('common');
  const favorites = useFavorites();
  const reduced = useReducedMotion();
  const [burst, setBurst] = useState(0);
  const busy = useRef(false);
  const pressed = favorites.isFavorite(themeId);
  const pending = favorites.isPending(themeId);
  const label = t(pressed ? 'remove' : 'save');
  const retry = favorites.status === 'error';
  async function toggle(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    const local = !favorites.isSignedIn;
    const atLimit = local && !pressed && favorites.ids.length >= MAX_LOCAL_FAVORITES;
    try {
      const result = await favorites.toggle(themeId);
      if (!result.ok) {
        toaster.create({ type: 'error', title: t(atLimit ? 'limitReached' : 'toggleFailed') });
        return;
      }
      if (result.data.favorited) {
        setBurst((value) => value + 1);
        if (local && !localToastShown) {
          localToastShown = true;
          toaster.create({ type: 'info', title: t('localSaved') });
        }
      }
    } finally {
      busy.current = false;
    }
  }
  return (
    <Box position="relative" display="inline-flex">
      <IconButton
        aria-label={
          retry ? `${t('syncFailed')} ${common('retry')}` : name ? `${label}: ${name}` : label
        }
        aria-pressed={pressed}
        aria-busy={pending}
        title={retry ? t('syncFailed') : favorites.status === 'loading' ? t('syncing') : label}
        size={size}
        minH="11"
        minW="11"
        rounded="full"
        variant="solid"
        colorPalette={pressed ? 'brand' : 'gray'}
        disabled={favorites.status === 'loading' || pending}
        onClick={() => {
          if (retry) void favorites.refresh();
          else void toggle();
        }}
      >
        <motion.span
          key={burst}
          initial={{ scale: reduced || !burst ? 1 : 1.3 }}
          animate={{ scale: 1 }}
          transition={springs.pop}
        >
          <Icon asChild boxSize="5">
            <HeartIcon weight={pressed ? 'fill' : 'regular'} aria-hidden />
          </Icon>
        </motion.span>
      </IconButton>
      <AnimatePresence>
        {burst > 0 && !reduced ? (
          <Box key={burst} position="absolute" inset="0" pointerEvents="none" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: 0,
                  x: Math.cos((index * Math.PI) / 3) * 24,
                  y: Math.sin((index * Math.PI) / 3) * 24,
                  scale: 0.2,
                }}
                transition={{ duration: 0.45 }}
                style={{ position: 'absolute', insetInlineStart: '50%', top: '50%' }}
              >
                <Box boxSize="1" rounded="full" bg="brand.solid" />
              </motion.span>
            ))}
          </Box>
        ) : null}
      </AnimatePresence>
    </Box>
  );
}
