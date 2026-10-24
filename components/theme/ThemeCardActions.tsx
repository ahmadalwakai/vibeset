'use client';

import { HStack, IconButton, Menu, Portal } from '@chakra-ui/react';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { FavoriteButton } from './FavoriteButton';
import { SaveToCollectionButton } from './SaveToCollectionButton';

export function ThemeCardActions({
  themeId,
  name,
}: {
  themeId: string;
  name: string;
}): ReactElement {
  const t = useTranslations('theme.actions');
  return (
    <HStack gap="1" bg="bg.panel" rounded="button" shadow="card" p="0.5">
      <FavoriteButton themeId={themeId} name={name} />
      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton aria-label={t('more')} variant="ghost" size="lg" rounded="button">
            <DotsThreeIcon aria-hidden size={24} />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content rounded="input">
              <SaveToCollectionButton themeId={themeId} menuItem />
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </HStack>
  );
}
