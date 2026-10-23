'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

// Collect styles per request so streamed Chakra markup hydrates in the same order.
export function EmotionRegistry({ children }: { children: ReactNode }): ReactElement {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: 'css' });
    cache.compat = true;
    const originalInsert = cache.insert;
    let inserted: string[] = [];

    cache.insert = (...args): ReturnType<typeof originalInsert> => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return originalInsert(...args);
    };

    function flush(): string[] {
      const names = inserted;
      inserted = [];
      return names;
    }

    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    const styles = names.map((name) => cache.inserted[name]).join('');

    return (
      <style
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
