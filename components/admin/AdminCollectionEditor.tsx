'use client';
import { Box, Button, Flex, Heading, Image, Stack, Text } from '@chakra-ui/react';
import { ArrowDownIcon, ArrowUpIcon, DotsSixVerticalIcon } from '@phosphor-icons/react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useRouter } from '@/i18n/navigation';
import { useContentMutation } from '@/hooks/useContentMutation';
import type { AdminCollectionDetail, AdminCollectionItem } from '@/lib/admin-content';
import type { ActionResult } from '@/lib/result';
import { localized } from '@/lib/utils/localized';
import {
  adminContentIdSchema,
  adminCollectionItemSchema,
  adminReorderCollectionSchema,
} from '@/lib/validation/admin-content';
import {
  adminDeleteCollection,
  adminRemoveCollectionItem,
  adminReorderCollection,
} from '@/server/actions/admin/collections';
import { adminAddToCollection } from '@/server/actions/admin/themes';
import { PublishedThemePicker } from './PublishedThemePicker';
import { AdminCollectionForm } from './AdminCollectionForm';

function OrderedItem({
  item,
  index,
  total,
  pending,
  removeDisabled,
  move,
  remove,
}: {
  item: AdminCollectionItem;
  index: number;
  total: number;
  pending: boolean;
  removeDisabled: boolean;
  move: (index: number, to: number) => void;
  remove: () => void;
}): ReactElement {
  const t = useTranslations('admin.collections'),
    statuses = useTranslations('creator.status'),
    locale = useLocale(),
    controls = useDragControls(),
    reduced = useReducedMotion();
  const name = localized(item, locale);
  return (
    <Reorder.Item
      value={item}
      dragControls={controls}
      dragListener={false}
      layout="position"
      transition={reduced ? { duration: 0 } : undefined}
    >
      <Stack
        direction="row"
        flexWrap="wrap"
        align="center"
        gap="3"
        p="3"
        my="2"
        borderWidth="hairline"
        borderColor="border"
        bg="bg.panel"
        rounded="card"
      >
        <Button
          aria-label={t('drag')}
          variant="ghost"
          minW="11"
          minH="11"
          touchAction="none"
          disabled={pending}
          onPointerDown={(event) => controls.start(event)}
        >
          <DotsSixVerticalIcon />
        </Button>
        <Box flexShrink={0} boxSize="12" bg="bg.subtle" overflow="hidden" rounded="input">
          {item.thumbUrl ? (
            <Image
              src={item.thumbUrl}
              alt=""
              width={48}
              height={48}
              objectFit="cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
        </Box>
        <Stack flex="1" minW="0" gap="1">
          <Text textStyle="body.sm" overflowWrap="anywhere">
            {name}
          </Text>
          <Text textStyle="caption" color="fg.muted">
            {statuses(item.status)}
          </Text>
        </Stack>
        <Flex flexWrap="wrap" gap="1" w={{ base: 'full', md: 'auto' }} justify="end">
          <Button
            aria-label={t('moveUp', { name })}
            minW="11"
            minH="11"
            variant="ghost"
            disabled={pending || index === 0}
            onClick={() => move(index, index - 1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            aria-label={t('moveDown', { name })}
            minW="11"
            minH="11"
            variant="ghost"
            disabled={pending || index === total - 1}
            onClick={() => move(index, index + 1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button minH="11" variant="outline" disabled={pending || removeDisabled} onClick={remove}>
            {t('remove')}
          </Button>
        </Flex>
      </Stack>
    </Reorder.Item>
  );
}
function CollectionItems({ collection }: { collection: AdminCollectionDetail }): ReactElement {
  const t = useTranslations('admin.collections'),
    errors = useTranslations('errors'),
    router = useRouter(),
    mutation = useContentMutation();
  const [order, setOrder] = useState(collection.items),
    [picker, setPicker] = useState(false);
  const dirty = order.some((item, index) => item.id !== collection.items[index]?.id);
  async function add(raw: unknown): Promise<ActionResult<{ count: number }>> {
    const input = adminCollectionItemSchema.parse(raw),
      result = await adminAddToCollection({
        ids: [input.themeId],
        collectionId: input.collectionId,
      });
    if (!result.ok) return result;
    const failure = result.data.results.find((item) => !item.ok);
    if (failure)
      return {
        ok: false,
        error: { code: failure.code ?? 'INTERNAL', message: 'Unable to add theme' },
      };
    return { ok: true, data: { count: result.data.count } };
  }
  return (
    <Stack gap="4">
      <Heading as="h2" textStyle="heading.md">
        {t('items')}
      </Heading>
      <Text textStyle="body.sm" color="fg.muted">
        {t('hiddenHint')}
      </Text>
      <Text textStyle="caption" color="fg.muted">
        {t('limit')}
      </Text>
      {dirty ? (
        <Text textStyle="body.sm" color="fg.muted" role="status">
          {t('orderHint')}
        </Text>
      ) : null}
      <Button
        minH="11"
        colorPalette="brand"
        disabled={mutation.pending || order.length >= 500 || dirty}
        onClick={() => setPicker(true)}
      >
        {t('addTheme')}
      </Button>
      {order.length ? (
        <Box asChild p="0" listStyleType="none">
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={(next) => {
              if (!mutation.pending) setOrder(next);
            }}
          >
            {order.map((item, index) => (
              <OrderedItem
                key={item.id}
                item={item}
                index={index}
                total={order.length}
                pending={mutation.pending}
                removeDisabled={dirty}
                move={(from, to) =>
                  setOrder((previous) => {
                    const next = [...previous],
                      first = next[from],
                      second = next[to];
                    if (!first || !second) return previous;
                    next[from] = second;
                    next[to] = first;
                    return next;
                  })
                }
                remove={() => {
                  void mutation.run(
                    adminCollectionItemSchema,
                    { collectionId: collection.id, themeId: item.id },
                    adminRemoveCollectionItem,
                    () => router.refresh(),
                  );
                }}
              />
            ))}
          </Reorder.Group>
        </Box>
      ) : (
        <Text>{t('emptyItems')}</Text>
      )}
      <Button
        minH="11"
        variant="outline"
        loading={mutation.pending}
        disabled={!dirty}
        onClick={() => {
          void mutation.run(
            adminReorderCollectionSchema,
            { collectionId: collection.id, themeIds: order.map((item) => item.id) },
            adminReorderCollection,
            () => router.refresh(),
          );
        }}
      >
        {t('saveOrder')}
      </Button>
      {mutation.error ? (
        <Text role="alert" color="red.fg">
          {errors(mutation.error)}
        </Text>
      ) : null}
      <PublishedThemePicker
        open={picker}
        onOpenChange={setPicker}
        disabledIds={order.map((item) => item.id)}
        onPick={(theme) => {
          void mutation.run(
            adminCollectionItemSchema,
            { collectionId: collection.id, themeId: theme.id },
            add,
            () => {
              setPicker(false);
              router.refresh();
            },
          );
        }}
      />
    </Stack>
  );
}
export function AdminCollectionEditor({
  collection,
}: {
  collection: AdminCollectionDetail;
}): ReactElement {
  const t = useTranslations('admin.collections'),
    router = useRouter(),
    mutation = useContentMutation();
  const [deleting, setDeleting] = useState(false);
  return (
    <Stack gap="8">
      <AdminCollectionForm
        key={collection.updatedAt}
        collection={collection}
        onSaved={() => router.refresh()}
      />
      <CollectionItems
        key={JSON.stringify(collection.items.map((item) => [item.id, item.position, item.status]))}
        collection={collection}
      />
      <Button minH="11" colorPalette="red" variant="outline" onClick={() => setDeleting(true)}>
        {t('delete')}
      </Button>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('delete')}
        description={t('deleteHint')}
        confirmationText={collection.slug}
        pending={mutation.pending}
        errorCode={mutation.error}
        onConfirm={() =>
          mutation.run(adminContentIdSchema, { id: collection.id }, adminDeleteCollection, () =>
            router.push('/admin/collections'),
          )
        }
      />
    </Stack>
  );
}
