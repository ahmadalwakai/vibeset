import { describe, expect, it } from 'vitest';
import { focalFromKey, focalFromPointer } from '../../components/creator/photo-tools-state';

describe('uncropped photo focal coordinates', () => {
  it('uses the exact full-image bounds even for a non-phone source ratio', () => {
    expect(focalFromPointer(164, 190, { left: 100, top: 50, width: 256, height: 400 })).toEqual({
      focalX: 0.25,
      focalY: 0.35,
    });
  });
  it('clamps edge taps instead of producing schema-invalid focal values', () => {
    expect(focalFromPointer(0, 900, { left: 100, top: 50, width: 256, height: 400 })).toEqual({
      focalX: 0,
      focalY: 1,
    });
  });
  it.each([0, -1, Number.NaN, Infinity])('ignores non-rendered image bounds %s', (width) => {
    expect(focalFromPointer(100, 100, { left: 0, top: 0, width, height: 400 })).toBeNull();
  });
  it('keeps arrow movement in physical photo coordinates in either UI language', () => {
    const center = { focalX: 0.5, focalY: 0.5 };
    expect(focalFromKey('ArrowLeft', center)).toEqual({ focalX: 0.45, focalY: 0.5 });
    expect(focalFromKey('ArrowRight', center)).toEqual({ focalX: 0.55, focalY: 0.5 });
    expect(focalFromKey('ArrowUp', center)).toEqual({ focalX: 0.5, focalY: 0.45 });
    expect(focalFromKey('ArrowDown', center)).toEqual({ focalX: 0.5, focalY: 0.55 });
    expect(center).toEqual({ focalX: 0.5, focalY: 0.5 });
  });
  it('clamps repeated arrow keys at each edge and ignores unrelated keys', () => {
    expect(focalFromKey('ArrowLeft', { focalX: 0, focalY: 0 })).toEqual({ focalX: 0, focalY: 0 });
    expect(focalFromKey('ArrowDown', { focalX: 1, focalY: 1 })).toEqual({ focalX: 1, focalY: 1 });
    expect(focalFromKey('Enter', { focalX: 0.5, focalY: 0.5 })).toBeNull();
  });
});
