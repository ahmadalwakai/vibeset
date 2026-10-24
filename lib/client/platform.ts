export type Platform = 'ios' | 'android' | 'desktop';

export interface PlatformInfo {
  platform: Platform;
  isIPad: boolean;
  inAppBrowser: boolean;
  standalone: boolean;
}

export function isIPad(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (/iPad/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  );
}

export function isIOS(): boolean {
  return (
    typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/i.test(navigator.userAgent) || isIPad())
  );
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export function isInAppBrowser(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Instagram|FBAN|FBAV|TikTok|musical_ly|Snapchat|Pinterest|LinkedInApp/i.test(
      navigator.userAgent,
    )
  );
}

export function isStandalone(): boolean {
  return (
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && 'standalone' in navigator && navigator.standalone === true)
  );
}

export function canShareFiles(files: File[]): boolean {
  if (!files.length || typeof navigator === 'undefined') return false;
  try {
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files });
  } catch {
    return false;
  }
}

export function getPlatformInfo(): PlatformInfo {
  return {
    platform: isIOS() ? 'ios' : isAndroid() ? 'android' : 'desktop',
    isIPad: isIPad(),
    inAppBrowser: isInAppBrowser(),
    standalone: isStandalone(),
  };
}
