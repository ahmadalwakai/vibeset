'use client';

import { Button, Flex, Icon, Menu, Portal, Spinner, Text } from '@chakra-ui/react';
import { FolderPlusIcon } from '@phosphor-icons/react/dist/csr/FolderPlus';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useThemeMenuActions } from './ThemeMenuActions';

function CollectionLoading(): ReactElement {
  const t = useTranslations('common');
  return (
    <Portal>
      <Flex
        position="fixed"
        bottom="24"
        insetEnd="4"
        zIndex="modal"
        align="center"
        gap="3"
        p="4"
        bg="bg.panel"
        rounded="card"
        shadow="float"
        role="status"
      >
        <Spinner size="sm" />
        <Text textStyle="body.sm">{t('loading')}</Text>
      </Flex>
    </Portal>
  );
}
const SaveToCollectionSheet = dynamic(
  () => import('./SaveToCollectionSheet').then((module) => module.SaveToCollectionSheet),
  { loading: CollectionLoading },
);
function StandaloneCollectionButton({ themeId }: { themeId: string }): ReactElement {
  const t = useTranslations('saved.collections');
  const [opened, setOpened] = useState(false),
    [open, setOpen] = useState(false);
  function show(): void {
    setOpened(true);
    setOpen(true);
  }
  return (
    <>
      <Button size="lg" variant="outline" onClick={show}>
        <Icon asChild boxSize="5">
          <FolderPlusIcon aria-hidden />
        </Icon>
        {t('saveToCollection')}
      </Button>
      {opened ? (
        <SaveToCollectionSheet themeId={themeId} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}

function CollectionMenuItem({ themeId }: { themeId: string }): ReactElement {
  const t = useTranslations('saved.collections');
  const actions = useThemeMenuActions();
  return (
    <Menu.Item
      value="save-to-collection"
      minH="11"
      onSelect={() => actions.openCollection(themeId)}
    >
      <Icon asChild boxSize="5">
        <FolderPlusIcon aria-hidden />
      </Icon>
      {t('saveToCollection')}
    </Menu.Item>
  );
}

export function SaveToCollectionButton({
  themeId,
  menuItem = false,
}: {
  themeId: string;
  menuItem?: boolean;
}): ReactElement {
  return menuItem ? (
    <CollectionMenuItem themeId={themeId} />
  ) : (
    <StandaloneCollectionButton themeId={themeId} />
  );
}
