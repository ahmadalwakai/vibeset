import type { ThemeSpec } from './render/spec';

export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  locale: 'en' | 'ar';
}

export interface SavedRemix {
  id: string;
  nameEn: string;
  spec: ThemeSpec;
  updatedAt: string;
  createdAt: string;
}

export interface AccountCleanupPlan {
  userId: string;
  keys: string[];
  prefixes: string[];
  tags: string[];
}
