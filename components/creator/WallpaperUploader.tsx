'use client';

import type { ReactElement } from 'react';
import type { FinalizedWallpaperUpload } from '@/lib/uploads';
import { UploadControl } from './UploadControl';

export function WallpaperUploader({
  onUploaded,
  disabled,
  onPendingChange,
}: {
  onUploaded: (data: FinalizedWallpaperUpload) => void;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}): ReactElement {
  return (
    <UploadControl
      kind="wallpaper"
      disabled={disabled}
      onPendingChange={onPendingChange}
      onUploaded={(data) => {
        if ('palette' in data) onUploaded(data);
      }}
    />
  );
}
