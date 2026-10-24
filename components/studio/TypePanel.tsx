'use client';

import { Button, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { FONT_IDS } from '@/lib/render/spec';
import type { StudioPanelProps } from '@/lib/studio';
import { fontFamilyFor } from './panel-utils';

export function TypePanel({ spec, onChange }: StudioPanelProps): ReactElement {
  const t = useTranslations('studio');
  return (
    <Stack gap="5">
      {(['display', 'body'] as const).map((role) => (
        <Stack
          key={role}
          gap="3"
          role="group"
          aria-label={t(role === 'display' ? 'fields.displayFont' : 'fields.bodyFont')}
        >
          <Text as="h3" textStyle="heading.sm">
            {t(role === 'display' ? 'fields.displayFont' : 'fields.bodyFont')}
          </Text>
          {FONT_IDS.map((font) => (
            <Button
              key={font}
              minH="20"
              h="auto"
              py="3"
              rounded="input"
              variant="outline"
              alignItems="start"
              flexDirection="column"
              gap="1"
              whiteSpace="normal"
              textAlign="start"
              borderColor={spec.type[role] === font ? 'brand.solid' : 'border'}
              bg={spec.type[role] === font ? 'brand.subtle' : 'bg.panel'}
              aria-pressed={spec.type[role] === font}
              onClick={() => onChange({ type: 'setFont', role, font })}
            >
              <Text as="span" textStyle="caption" color="fg.muted">
                {t(`fonts.${font}`)}
              </Text>
              <Text
                as="span"
                textStyle={role === 'display' ? 'heading.md' : 'body.md'}
                fontFamily={fontFamilyFor(font)}
              >
                {t(role === 'display' ? 'type.sample' : 'type.bodySample')}
              </Text>
            </Button>
          ))}
        </Stack>
      ))}
      <Text textStyle="caption" color="fg.muted">
        {t('type.arabicHint')}
      </Text>
    </Stack>
  );
}
