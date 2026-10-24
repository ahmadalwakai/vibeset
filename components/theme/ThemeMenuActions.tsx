'use client';

import { Flex, Portal, Spinner, Text } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface MenuActions {
  openReport: (themeId: string) => void;
  openCollection: (themeId: string) => void;
}
const MenuActionsContext = createContext<MenuActions | null>(null);

function LoadingAction(): ReactElement {
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
const ReportDialog = dynamic(() => import('./ReportDialog').then((module) => module.ReportDialog), {
  loading: LoadingAction,
});
const SaveToCollectionSheet = dynamic(
  () => import('./SaveToCollectionSheet').then((module) => module.SaveToCollectionSheet),
  { loading: LoadingAction },
);

/** Keep overlay ownership outside the Menu.Content subtree that unmounts on selection. */
export function ThemeMenuActions({ children }: { children: ReactNode }): ReactElement {
  const [active, setActive] = useState<{
    kind: 'report' | 'collection';
    themeId: string;
    open: boolean;
  } | null>(null);
  const openReport = useCallback(
    (themeId: string): void => setActive({ kind: 'report', themeId, open: true }),
    [],
  );
  const openCollection = useCallback(
    (themeId: string): void => setActive({ kind: 'collection', themeId, open: true }),
    [],
  );
  const actions = useMemo(() => ({ openReport, openCollection }), [openReport, openCollection]);
  return (
    <MenuActionsContext value={actions}>
      {children}
      {active?.kind === 'report' ? (
        <ReportDialog
          key={active.themeId}
          themeId={active.themeId}
          open={active.open}
          onOpenChange={(open) =>
            setActive((current) =>
              current?.kind === 'report' && current.themeId === active.themeId
                ? { ...current, open }
                : current,
            )
          }
        />
      ) : active?.kind === 'collection' ? (
        <SaveToCollectionSheet
          key={active.themeId}
          themeId={active.themeId}
          open={active.open}
          onOpenChange={(open) =>
            setActive((current) =>
              current?.kind === 'collection' && current.themeId === active.themeId
                ? { ...current, open }
                : current,
            )
          }
        />
      ) : null}
    </MenuActionsContext>
  );
}

export function useThemeMenuActions(): MenuActions {
  const context = useContext(MenuActionsContext);
  if (!context) throw new Error('ThemeMenuActions is required for a theme menu action');
  return context;
}
