'use client';

import {
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  IconButton,
  Image,
  Link as ChakraLink,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp';
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/csr/DotsSixVertical';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { CollectionForm } from '@/components/collections/CollectionForm';
import { ThemeGrid } from '@/components/theme/ThemeGrid';
import { toaster } from '@/components/ui/toaster';
import { Link, useRouter } from '@/i18n/navigation';
import type { UserCollectionDetail } from '@/lib/collections';
import type { ThemeCardDTO } from '@/lib/dto';
import { copyUrl } from '@/lib/client/share';
import { localized } from '@/lib/utils/localized';
import {
  deleteCollection,
  removeFromCollection,
  reorderCollection,
} from '@/server/actions/collections';

function OrderedTheme({
  theme,
  index,
  total,
  pending,
  move,
  remove,
  onDragEnd,
}: {
  theme: ThemeCardDTO;
  index: number;
  total: number;
  pending: boolean;
  move: (from: number, to: number) => void;
  remove: (theme: ThemeCardDTO) => void;
  onDragEnd: () => void;
}): ReactElement {
  const t = useTranslations('saved.collections'),
    locale = useLocale(),
    controls = useDragControls(),
    reduced = useReducedMotion();
  const name = localized(theme, locale);
  return (
    <Box asChild bg="card.bg" rounded="card" borderWidth="hairline" borderColor="border" p="3">
      <Reorder.Item
        value={theme}
        dragListener={false}
        dragControls={controls}
        onDragEnd={onDragEnd}
        layout="position"
        transition={reduced ? { duration: 0 } : undefined}
      >
        <Flex gap="3" align="center" minW="0" flexWrap="wrap">
          <IconButton
            size="lg"
            variant="ghost"
            disabled={pending}
            aria-label={`${t('reorder')}: ${name}`}
            onPointerDown={(event) => {
              if (!pending) controls.start(event);
            }}
            touchAction="none"
          >
            <Icon asChild boxSize="5">
              <DotsSixVerticalIcon aria-hidden />
            </Icon>
          </IconButton>
          {theme.thumbUrl ? (
            <Image
              src={theme.thumbUrl}
              alt=""
              width={360}
              height={780}
              boxSize="12"
              objectFit="cover"
              rounded="input"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Box boxSize="12" rounded="input" bg={theme.dominantColor ?? 'bg.muted'} />
          )}
          <Box flex="1" minW="24">
            <ChakraLink
              asChild
              display="inline-flex"
              minH="11"
              alignItems="center"
              textStyle="body.sm"
              fontWeight="semibold"
              overflowWrap="anywhere"
            >
              <Link href={`/t/${theme.slug}`}>{name}</Link>
            </ChakraLink>
          </Box>
          <HStack gap="1">
            <IconButton
              size="lg"
              variant="ghost"
              disabled={pending || index === 0}
              aria-label={`${t('moveUp')}: ${name}`}
              onClick={() => move(index, index - 1)}
            >
              <Icon asChild boxSize="5">
                <ArrowUpIcon aria-hidden />
              </Icon>
            </IconButton>
            <IconButton
              size="lg"
              variant="ghost"
              disabled={pending || index === total - 1}
              aria-label={`${t('moveDown')}: ${name}`}
              onClick={() => move(index, index + 1)}
            >
              <Icon asChild boxSize="5">
                <ArrowDownIcon aria-hidden />
              </Icon>
            </IconButton>
            <IconButton
              size="lg"
              variant="ghost"
              disabled={pending}
              aria-label={`${t('remove')}: ${name}`}
              onClick={() => remove(theme)}
            >
              <Icon asChild boxSize="5">
                <TrashIcon aria-hidden />
              </Icon>
            </IconButton>
          </HStack>
        </Flex>
      </Reorder.Item>
    </Box>
  );
}

export function UserCollectionEditor({
  collection,
}: {
  collection: UserCollectionDetail;
}): ReactElement {
  const t = useTranslations('saved.collections'),
    errors = useTranslations('errors'),
    router = useRouter();
  const [items, setItems] = useState(collection.items),
    [summary, setSummary] = useState(collection),
    [pending, setPending] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const busy = useRef(false),
    mounted = useRef(false),
    latest = useRef(items),
    persisted = useRef(items);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function reorder(next: ThemeCardDTO[]): void {
    if (busy.current) return;
    latest.current = next;
    setItems(next);
  }
  async function saveOrder(): Promise<void> {
    if (
      busy.current ||
      latest.current.every((value, index) => value.id === persisted.current[index]?.id)
    )
      return;
    busy.current = true;
    setPending(true);
    const next = latest.current;
    try {
      const result = await reorderCollection({
        collectionId: collection.id,
        themeIds: next.map(({ id }) => id),
      });
      if (!mounted.current) return;
      if (!result.ok) {
        latest.current = persisted.current;
        setItems(persisted.current);
        toaster.create({ type: 'error', title: errors(result.error.code) });
        router.refresh();
      } else {
        persisted.current = next;
        toaster.create({ type: 'success', title: t('orderSaved') });
      }
    } catch {
      if (mounted.current) {
        latest.current = persisted.current;
        setItems(persisted.current);
        toaster.create({ type: 'error', title: errors('NETWORK') });
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  function move(from: number, to: number): void {
    if (busy.current || to < 0 || to >= items.length) return;
    const next = [...items],
      [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder(next);
    void saveOrder();
  }
  async function remove(theme: ThemeCardDTO): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const before = items,
      next = before.filter(({ id }) => id !== theme.id);
    latest.current = next;
    setItems(next);
    try {
      const result = await removeFromCollection({ collectionId: collection.id, themeId: theme.id });
      if (!mounted.current) return;
      if (!result.ok) {
        latest.current = before;
        setItems(before);
        toaster.create({ type: 'error', title: errors(result.error.code) });
      } else {
        persisted.current = next;
        setSummary((value) => ({ ...value, itemCount: result.data.itemCount }));
        toaster.create({ type: 'success', title: t('removed') });
        router.refresh();
      }
    } catch {
      if (mounted.current) {
        latest.current = before;
        setItems(before);
        toaster.create({ type: 'error', title: errors('NETWORK') });
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function copy(): Promise<void> {
    try {
      const url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      await copyUrl(url.href);
      toaster.create({ type: 'success', title: t('linkCopied') });
    } catch {
      toaster.create({ type: 'error', title: t('shareFailed') });
    }
  }
  return (
    <Stack gap="8">
      {collection.canEdit ? (
        <CollectionForm
          collection={summary}
          disabled={pending}
          onPendingChange={(value) => {
            busy.current = value;
            setPending(value);
          }}
          onSaved={(value) => {
            setSummary((before) => ({ ...before, ...value }));
            router.refresh();
          }}
        />
      ) : (
        <Text textStyle="body.sm" color="fg.muted">
          {t('readOnly')}
        </Text>
      )}
      <Flex gap="3" align="center" flexWrap="wrap">
        <Text textStyle="body.md">{t('itemCount', { count: summary.itemCount })}</Text>
        {summary.visibility === 'unlisted' ? (
          <Button size="lg" variant="outline" onClick={() => void copy()}>
            {t('copyLink')}
          </Button>
        ) : null}
        <Button asChild size="lg" variant="ghost">
          <Link href="/saved">{t('backSaved')}</Link>
        </Button>
      </Flex>
      {!items.length ? (
        <EmptyState
          title={t('emptyItemsTitle')}
          description={t('emptyItemsBody')}
          action={
            <Button asChild size="lg" colorPalette="brand">
              <Link href="/explore">{t('browseThemes')}</Link>
            </Button>
          }
        />
      ) : collection.canEdit ? (
        <Stack gap="3">
          <Text textStyle="body.sm" color="fg.muted">
            {t('reorderHint')}
          </Text>
          <Box asChild display="grid" gap="3" listStyleType="none" p="0" m="0">
            <Reorder.Group axis="y" values={items} onReorder={reorder}>
              {items.map((theme, index) => (
                <OrderedTheme
                  key={theme.id}
                  theme={theme}
                  index={index}
                  total={items.length}
                  pending={pending}
                  move={move}
                  remove={(value) => void remove(value)}
                  onDragEnd={() => void saveOrder()}
                />
              ))}
            </Reorder.Group>
          </Box>
        </Stack>
      ) : (
        <ThemeGrid themes={items} />
      )}
      {collection.canEdit ? (
        <Button
          size="lg"
          variant="outline"
          colorPalette="red"
          disabled={pending}
          alignSelf="start"
          onClick={() => setConfirmDelete(true)}
        >
          {t('delete')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        onConfirm={async () => {
          const result = await deleteCollection({ id: collection.id });
          if (!result.ok) {
            toaster.create({ type: 'error', title: errors(result.error.code) });
            return false;
          }
          toaster.create({ type: 'success', title: t('deleted') });
          router.replace('/saved');
          return true;
        }}
      />
    </Stack>
  );
}
