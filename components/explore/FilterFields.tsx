'use client';
import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { ColorDot } from '@/components/common/ColorDot';
import { TagChip } from '@/components/common/TagChip';
import type { TagDTO, ThemeListQuery } from '@/lib/dto';
import { COLOR_FAMILIES } from '@/lib/validation/themes';

export interface FilterFieldsProps {
  tags: readonly TagDTO[];
  query: ThemeListQuery;
  onChange: (query: ThemeListQuery) => void;
  compact?: boolean;
}
export function FilterFields({
  tags,
  query,
  onChange,
  compact = false,
}: FilterFieldsProps): ReactElement {
  const t = useTranslations('explore');
  const selected = query.tags ?? [];
  return (
    <Stack gap="4">
      {(['aesthetic', 'mood', 'season', 'style'] as const).map((kind) => (
        <Box as="fieldset" key={kind} minW="0">
          <Text as="legend" textStyle="caption" color="fg.muted" mb="2">
            {t(`groups.${kind}`)}
          </Text>
          <Flex
            gap="2"
            wrap={compact ? 'wrap' : 'nowrap'}
            overflowX={compact ? 'visible' : 'auto'}
            pb="1"
          >
            {tags
              .filter((tag) => tag.kind === kind)
              .map((tag) => (
                <TagChip
                  key={tag.slug}
                  tag={tag}
                  selected={selected.includes(tag.slug)}
                  disabled={!selected.includes(tag.slug) && selected.length >= 5}
                  onClick={() =>
                    onChange({
                      ...query,
                      ids: undefined,
                      cursor: undefined,
                      tags: selected.includes(tag.slug)
                        ? selected.filter((slug) => slug !== tag.slug)
                        : [...selected, tag.slug],
                    })
                  }
                />
              ))}
          </Flex>
        </Box>
      ))}
      <Box as="fieldset">
        <Text as="legend" textStyle="caption" color="fg.muted" mb="2">
          {t('groups.color')}
        </Text>
        <Flex gap="2" wrap="wrap">
          {COLOR_FAMILIES.map((color) => (
            <ColorDot
              key={color}
              color={color}
              label={t(`colors.${color}`)}
              selected={query.color === color}
              onClick={() =>
                onChange({
                  ...query,
                  ids: undefined,
                  cursor: undefined,
                  color: query.color === color ? undefined : color,
                })
              }
            />
          ))}
        </Flex>
      </Box>
      {selected.length >= 5 ? (
        <Text textStyle="caption" color="fg.muted">
          {t('filterLimit', { count: 5 })}
        </Text>
      ) : null}
    </Stack>
  );
}
