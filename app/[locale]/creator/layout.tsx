import { Skeleton, Stack } from '@chakra-ui/react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { CreatorShell } from '@/components/layout/CreatorShell';
import { requireCreatorPage } from '@/server/guards';

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function CreatorContent({ children }: { children: ReactNode }): Promise<ReactElement> {
  await connection();
  const session = await requireCreatorPage();
  return (
    <CreatorShell
      ownerId={session.user.id}
      handle={session.creator?.handle ?? null}
      isApproved={session.creator?.status === 'approved'}
    >
      {children}
    </CreatorShell>
  );
}

export default function CreatorLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <Suspense
      fallback={
        <Stack gap="6" p="6">
          <Skeleton h="16" />
          <Skeleton h="96" />
        </Stack>
      }
    >
      <CreatorContent>{children}</CreatorContent>
    </Suspense>
  );
}
