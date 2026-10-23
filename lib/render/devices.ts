export const DEVICE_PRESETS = {
  phone: { w: 1320, h: 2868 },
  tablet: { w: 2048, h: 2732 },
  desktop: { w: 2560, h: 1440 },
  desktop4k: { w: 3840, h: 2160 },
  thumb: { w: 360, h: 780 },
  preview: { w: 720, h: 1560 },
  og: { w: 1200, h: 630 },
} as const;

export type DevicePreset = keyof typeof DEVICE_PRESETS;
