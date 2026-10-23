import { z } from 'zod';

export interface StoragePutInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
}
export interface StorageHead {
  bytes: number;
  contentType?: string;
  etag?: string;
}
export interface PresignPutInput {
  key: string;
  contentType: string;
  expiresIn?: number;
}
export interface ObjectStorage {
  put(input: StoragePutInput): Promise<void>;
  head(key: string): Promise<StorageHead | null>;
  getBytes(key: string): Promise<Uint8Array>;
  deleteMany(keys: readonly string[]): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  listPrefixes(prefix: string): Promise<string[]>;
  presignPut(input: PresignPutInput): Promise<string>;
}

const segment = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function validPath(value: string): boolean {
  if (/[^\x21-\x7e]/.test(value)) return false;
  const parts = value.split('/');
  return parts.length <= 16 && parts.every((part) => segment.test(part));
}

export const storageKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(validPath, 'Invalid storage key');
export const storagePrefixSchema = z
  .string()
  .min(2)
  .max(1024)
  .refine(
    (value) => value.endsWith('/') && validPath(value.slice(0, -1)),
    'Invalid storage prefix',
  );
export const storageUuidSchema = z
  .uuid()
  .length(36)
  .transform((value) => value.toLowerCase());
export const storageUserIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/)
  .refine((value) => !/\s/.test(value));
export const storageVersionSchema = z.number().int().min(1).max(2_147_483_647);
export const themeAssetFileSchema = z.enum([
  'thumb.webp',
  'preview-home.webp',
  'preview-lock.webp',
  'og.jpg',
  'wallpaper-phone.jpg',
  'wallpaper-tablet.jpg',
  'wallpaper-desktop.jpg',
]);
