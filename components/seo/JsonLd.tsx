import type { ReactElement } from 'react';
import { serializeJsonLd } from '@/lib/utils/json-ld';

export function JsonLd({ data }: { data: unknown }): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
