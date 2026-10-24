'use client';

import { Button } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ResponsiveSheet } from '@/components/common/ResponsiveSheet';
import { useRouter } from '@/i18n/navigation';
import type { UserCollectionSummary } from '@/lib/collections';
import { CollectionForm } from './CollectionForm';

export function CreateCollectionButton({
  onCreated,
}: {
  onCreated?: (collection: UserCollectionSummary) => void;
}): ReactElement {
  const t = useTranslations('saved.collections'),
    router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button colorPalette="brand" size="lg" onClick={() => setOpen(true)}>
        {t('create')}
      </Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={t('newCollection')}>
        {open ? (
          <CollectionForm
            onSaved={(value) => {
              onCreated?.(value);
              setOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </ResponsiveSheet>
    </>
  );
}
