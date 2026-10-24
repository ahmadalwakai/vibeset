import { z } from 'zod';
import { Hex } from '../render/spec';
import { MAX_UPLOAD_BYTES, UPLOAD_INVALID_REASONS } from '../uploads';
import { storageKeySchema, storageUuidSchema } from './storage';

export const uploadContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const uploadInvalidReasonSchema = z.enum(UPLOAD_INVALID_REASONS);
export const createUploadSchema = z.strictObject({
  contentType: uploadContentTypeSchema,
  bytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});
export const finalizeUploadSchema = z.strictObject({ uploadId: storageUuidSchema });
export const uploadReservationSchema = z.strictObject({
  uploadId: storageUuidSchema,
  url: z
    .url({ protocol: /^https$/ })
    .max(16_384)
    .refine((value) => {
      try {
        const url = new URL(value);
        return !url.username && !url.password;
      } catch {
        return false;
      }
    }),
  headers: z.strictObject({ 'Content-Type': uploadContentTypeSchema }),
});
export const uploadedAssetSchema = z.strictObject({
  uploadId: storageUuidSchema,
  assetKey: storageKeySchema,
  previewUrl: z.url({ protocol: /^https?$/ }),
  width: z.number().int().positive().max(8000),
  height: z.number().int().positive().max(8000),
});
export const finalizedWallpaperUploadSchema = uploadedAssetSchema.extend({
  palette: z.array(Hex).min(1).max(6),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;
export type FinalizeUploadInput = z.infer<typeof finalizeUploadSchema>;
