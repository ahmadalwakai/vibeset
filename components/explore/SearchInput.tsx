'use client';
import { Box, Icon, IconButton, Input } from '@chakra-ui/react';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { normalizeThemeListQuery, themeListQuerySchema } from '@/lib/validation/themes';
import { exploreHref } from './useExploreQuery';

export interface SearchInputProps {
  compact?: boolean;
  autoFocus?: boolean;
}
export function SearchInput({ compact = false, autoFocus }: SearchInputProps): ReactElement {
  const t = useTranslations('explore');
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const urlValue = pathname === '/explore' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState({ url: urlValue, draft: urlValue });
  const [composing, setComposing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Reconcile URL navigation before painting; a pending debounce is cancelled by its effect.
  if (value.url !== urlValue) setValue({ url: urlValue, draft: urlValue });
  const queryString = params.toString();
  useEffect(() => {
    const q = value.draft.trim();
    if (composing || q === urlValue || q.length === 1) return;
    const timer = setTimeout(() => {
      const query =
        pathname === '/explore'
          ? normalizeThemeListQuery(new URLSearchParams(queryString))
          : { sort: 'trending' as const, limit: 24 };
      const candidate = themeListQuerySchema.safeParse({
        ...query,
        ids: undefined,
        cursor: undefined,
        q: q || undefined,
      });
      if (candidate.success) router.replace(exploreHref(candidate.data), { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value.draft, composing, urlValue, pathname, queryString, router]);
  return (
    <Box position="relative" w="full" minW="0">
      <Icon
        position="absolute"
        insetStart="3"
        top="3.5"
        color="fg.muted"
        pointerEvents="none"
        boxSize="5"
      >
        <MagnifyingGlassIcon aria-hidden />
      </Icon>
      <Input
        ref={input}
        type="search"
        value={value.draft}
        onChange={(event) => setValue({ url: urlValue, draft: event.target.value })}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        aria-label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        maxLength={64}
        autoFocus={autoFocus ?? (!compact && params.get('focus') === '1')}
        size="lg"
        ps="10"
        pe="12"
        rounded="full"
        bg="bg.panel"
      />
      {value.draft ? (
        <IconButton
          position="absolute"
          insetEnd="0.5"
          top="0.5"
          variant="ghost"
          size="md"
          minH="11"
          minW="11"
          rounded="full"
          aria-label={t('clearSearch')}
          onClick={() => {
            setComposing(false);
            setValue({ url: urlValue, draft: '' });
            input.current?.focus();
          }}
        >
          <XIcon aria-hidden />
        </IconButton>
      ) : null}
    </Box>
  );
}
