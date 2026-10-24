export interface FocalPoint {
  focalX: number;
  focalY: number;
}
const deltas: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-0.05, 0],
  ArrowRight: [0.05, 0],
  ArrowUp: [0, -0.05],
  ArrowDown: [0, 0.05],
};
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function focalFromKey(key: string, point: FocalPoint): FocalPoint | null {
  const delta = deltas[key];
  return delta
    ? { focalX: clamp(point.focalX + delta[0]), focalY: clamp(point.focalY + delta[1]) }
    : null;
}

/** Bounds must describe the uncropped image content, not a cover-fitted frame. */
export function focalFromPointer(
  x: number,
  y: number,
  bounds: { left: number; top: number; width: number; height: number },
): FocalPoint | null {
  if (
    ![x, y, bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  return {
    focalX: clamp((x - bounds.left) / bounds.width),
    focalY: clamp((y - bounds.top) / bounds.height),
  };
}
