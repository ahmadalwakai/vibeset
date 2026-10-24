'use client';
import { Button, HStack } from '@chakra-ui/react';
import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import type { TagDTO, ThemeListQuery } from '@/lib/dto';
import { FilterFields } from './FilterFields';

export interface FilterSheetProps {
  tags: readonly TagDTO[];
  query: ThemeListQuery;
  onApply: (query: ThemeListQuery) => void;
}
export function FilterSheet({ tags, query, onApply }: FilterSheetProps): ReactElement {
  const t = useTranslations('explore');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(query);
  const trigger = useRef<HTMLButtonElement>(null);
  const count = (query.tags?.length ?? 0) + Number(Boolean(query.color));
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="lg"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft(query);
          setOpen(true);
        }}
      >
        <SlidersHorizontalIcon aria-hidden />
        {t('filters')}
        {count ? <span>({count})</span> : null}
      </Button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={t('filters')}
        finalFocusEl={() => trigger.current}
        footer={
          <HStack w="full" gap="3">
            <Button
              variant="outline"
              flex="1"
              size="lg"
              onClick={() => setDraft({ ...draft, tags: undefined, color: undefined })}
            >
              {t('resetFilters')}
            </Button>
            <Button
              colorPalette="brand"
              flex="1"
              size="lg"
              onClick={() => {
                // Only the sheet's filters are drafts; keep any newer search/sort URL state.
                onApply({
                  ...query,
                  ids: undefined,
                  cursor: undefined,
                  tags: draft.tags,
                  color: draft.color,
                });
                setOpen(false);
              }}
            >
              {t('applyFilters')}
            </Button>
          </HStack>
        }
      >
        <FilterFields tags={tags} query={draft} onChange={setDraft} compact />
      </ResponsiveSheet>
    </>
  );
}
