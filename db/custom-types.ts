import { customType } from 'drizzle-orm/pg-core';

export const tsvector = customType<{ data: string }>({
  dataType(): string {
    return 'tsvector';
  },
});
