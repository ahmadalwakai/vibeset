'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { readStudioDraft } from '@/lib/client/studio-draft';
import type { StudioEntryProps } from '@/lib/studio-entry';
import { StudioSkeleton } from './StudioSkeleton';

const StudioShell = dynamic(() => import('./StudioShell').then((m) => m.StudioShell), {
  loading: StudioSkeleton,
});
const subscribe = (): (() => void) => () => undefined;
const client = (): boolean => true;
const server = (): boolean => false;

function DraftEntry(props: StudioEntryProps): ReactElement {
  const [entry] = useState(() => {
    const draft = props.explicit ? null : readStudioDraft();
    return {
      spec: draft?.spec ?? props.initialSpec,
      sourceSlug: draft?.sourceSlug ?? props.sourceSlug,
      restored: !!draft,
    };
  });
  return (
    <StudioShell
      initialSpec={entry.spec}
      sourceSlug={entry.sourceSlug}
      initialSource={props.source?.slug === entry.sourceSlug ? props.source : null}
      initialRemix={props.initialRemix}
      entryError={props.entryError}
      restored={entry.restored}
    />
  );
}

export function StudioEntry(props: StudioEntryProps): ReactElement {
  const mounted = useSyncExternalStore(subscribe, client, server);
  return mounted ? (
    <DraftEntry
      key={JSON.stringify([
        props.initialSpec,
        props.sourceSlug,
        props.explicit,
        props.initialRemix,
      ])}
      {...props}
    />
  ) : (
    <StudioSkeleton />
  );
}
