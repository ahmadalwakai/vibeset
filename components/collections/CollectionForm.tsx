'use client';

import { Button, Field, Input, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { toaster } from '@/components/ui/toaster';
import type { UserCollectionSummary, UserCollectionVisibility } from '@/lib/collections';
import type { ErrorMessageCode } from '@/lib/result';
import { createCollectionSchema } from '@/lib/validation/collections';
import { createCollection, updateCollection } from '@/server/actions/collections';

export function CollectionFields({
  title,
  visibility,
  onTitle,
  onVisibility,
  disabled = false,
  invalid = false,
}: {
  title: string;
  visibility: UserCollectionVisibility;
  onTitle: (title: string) => void;
  onVisibility: (visibility: UserCollectionVisibility) => void;
  disabled?: boolean;
  invalid?: boolean;
}): ReactElement {
  const t = useTranslations('saved.collections'),
    errors = useTranslations('errors'),
    id = useId();
  return (
    <Stack gap="4">
      <Field.Root invalid={invalid}>
        <Field.Label htmlFor={`${id}-title`}>{t('titleLabel')}</Field.Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(event) => onTitle(event.target.value)}
          maxLength={60}
          disabled={disabled}
          size="lg"
          autoComplete="off"
        />
        {invalid ? <Field.ErrorText>{errors('VALIDATION')}</Field.ErrorText> : null}
      </Field.Root>
      <Field.Root>
        <Field.Label htmlFor={`${id}-visibility`}>{t('visibilityLabel')}</Field.Label>
        <NativeSelect.Root size="lg" disabled={disabled}>
          <NativeSelect.Field
            id={`${id}-visibility`}
            value={visibility}
            onChange={(event) => {
              if (event.target.value === 'private' || event.target.value === 'unlisted')
                onVisibility(event.target.value);
            }}
          >
            <option value="private">{t('private')}</option>
            <option value="unlisted">{t('unlisted')}</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.HelperText>
          {t(visibility === 'private' ? 'privateHint' : 'unlistedHint')}
        </Field.HelperText>
      </Field.Root>
    </Stack>
  );
}

export function CollectionForm({
  collection,
  onSaved,
  disabled = false,
  onPendingChange,
}: {
  collection?: UserCollectionSummary;
  onSaved: (value: UserCollectionSummary) => void;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}): ReactElement {
  const t = useTranslations('saved.collections'),
    errors = useTranslations('errors');
  const [title, setTitle] = useState(collection?.titleEn ?? ''),
    [visibility, setVisibility] = useState<UserCollectionVisibility>(
      collection?.visibility ?? 'private',
    );
  const [invalid, setInvalid] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<ErrorMessageCode | null>(null),
    [limit, setLimit] = useState(false);
  const busy = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(): Promise<void> {
    if (busy.current || disabled) return;
    const value = createCollectionSchema.safeParse({ titleEn: title, visibility });
    if (!value.success) {
      setInvalid(true);
      return;
    }
    busy.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    setLimit(false);
    try {
      const result = collection
        ? await updateCollection({ id: collection.id, ...value.data })
        : await createCollection(value.data);
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.code);
        setLimit(result.error.fieldErrors?.limit?.includes('collections') === true);
        return;
      }
      onSaved({
        ...(collection ?? { itemCount: 0, coverThumbUrl: null, containsTheme: false }),
        id: result.data.id,
        ...value.data,
      });
      toaster.create({ type: 'success', title: t(collection ? 'updated' : 'created') });
    } catch {
      if (mounted.current) setError('NETWORK');
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        onPendingChange?.(false);
      }
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Stack gap="5">
        <CollectionFields
          title={title}
          visibility={visibility}
          onTitle={(value) => {
            setTitle(value);
            setInvalid(false);
          }}
          onVisibility={setVisibility}
          disabled={pending || disabled}
          invalid={invalid}
        />
        {error ? (
          <Text role="alert" textStyle="body.sm" color="red.fg">
            {limit ? t('limitCollections') : errors(error)}
          </Text>
        ) : null}
        <Button type="submit" colorPalette="brand" size="lg" loading={pending} disabled={disabled}>
          {t(collection ? 'save' : 'create')}
        </Button>
      </Stack>
    </form>
  );
}
