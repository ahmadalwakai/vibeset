'use client';

import {
  Button,
  Field,
  Fieldset,
  Icon,
  IconButton,
  Input,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ReactElement } from 'react';
import type { CreatorLink } from '@/lib/creator';

export function CreatorProfileFields({
  displayName,
  bio,
  links,
  onDisplayName,
  onBio,
  onLinks,
  disabled = false,
  invalid = [],
}: {
  displayName: string;
  bio: string;
  links: CreatorLink[];
  onDisplayName: (value: string) => void;
  onBio: (value: string) => void;
  onLinks: (value: CreatorLink[]) => void;
  disabled?: boolean;
  invalid?: string[];
}): ReactElement {
  const t = useTranslations('creator.fields');
  const errors = useTranslations('errors');
  const id = useId();
  return (
    <Stack gap="5">
      <Field.Root invalid={invalid.includes('displayName')}>
        <Field.Label htmlFor={`${id}-name`}>{t('displayName')}</Field.Label>
        <Input
          id={`${id}-name`}
          value={displayName}
          maxLength={60}
          disabled={disabled}
          minH="11"
          autoComplete="name"
          onChange={(event) => onDisplayName(event.target.value)}
        />
        <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
      </Field.Root>
      <Field.Root invalid={invalid.includes('bio')}>
        <Field.Label htmlFor={`${id}-bio`}>{t('bio')}</Field.Label>
        <Textarea
          id={`${id}-bio`}
          value={bio}
          maxLength={280}
          disabled={disabled}
          minH="24"
          onChange={(event) => onBio(event.target.value)}
        />
        <Text textStyle="caption" color="fg.muted" alignSelf="end">
          {t('counter', { count: bio.length, max: 280 })}
        </Text>
        <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText>
      </Field.Root>
      <Fieldset.Root disabled={disabled} invalid={invalid.includes('links')}>
        <Fieldset.Legend textStyle="body.sm">{t('links')}</Fieldset.Legend>
        <Fieldset.Content gap="4">
          {links.map((link, index) => (
            <Stack key={index} p="3" gap="3" rounded="input" bg="bg.subtle">
              <Field.Root>
                <Field.Label htmlFor={`${id}-label-${index}`}>{t('linkLabel')}</Field.Label>
                <Input
                  id={`${id}-label-${index}`}
                  value={link.label}
                  maxLength={80}
                  minH="11"
                  disabled={disabled}
                  onChange={(event) =>
                    onLinks(
                      links.map((value, position) =>
                        position === index ? { ...value, label: event.target.value } : value,
                      ),
                    )
                  }
                />
              </Field.Root>
              <Field.Root>
                <Field.Label htmlFor={`${id}-url-${index}`}>{t('linkUrl')}</Field.Label>
                <Input
                  id={`${id}-url-${index}`}
                  value={link.url}
                  type="url"
                  dir="ltr"
                  maxLength={2048}
                  minH="11"
                  disabled={disabled}
                  onChange={(event) =>
                    onLinks(
                      links.map((value, position) =>
                        position === index ? { ...value, url: event.target.value } : value,
                      ),
                    )
                  }
                />
              </Field.Root>
              <IconButton
                alignSelf="end"
                aria-label={t('removeLink', { number: index + 1 })}
                variant="ghost"
                minH="11"
                minW="11"
                disabled={disabled}
                onClick={() => onLinks(links.filter((_, position) => position !== index))}
              >
                <Icon asChild boxSize="5">
                  <XIcon aria-hidden />
                </Icon>
              </IconButton>
            </Stack>
          ))}
          <Text textStyle="caption" color="fg.muted">
            {t('maxLinks')}
          </Text>
          <Button
            variant="outline"
            minH="11"
            disabled={disabled || links.length >= 3}
            onClick={() => onLinks([...links, { label: '', url: '' }])}
          >
            {t('addLink')}
          </Button>
        </Fieldset.Content>
        <Fieldset.ErrorText>{errors('VALIDATION')}</Fieldset.ErrorText>
      </Fieldset.Root>
    </Stack>
  );
}
