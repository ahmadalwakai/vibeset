import type { AppDTO } from '../dto';
import { ICON_SELECTION_KEY } from '../icon-export';
import type { IconSelection } from '../icon-export';
import { iconSelectionSchema } from '../validation/icon-export';

export { ICON_SELECTION_KEY } from '../icon-export';

let volatileSelection: IconSelection | null = null;

export function readIconSelection(): IconSelection | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ICON_SELECTION_KEY);
  } catch {
    return volatileSelection ? iconSelectionSchema.parse(volatileSelection) : null;
  }
  if (!raw || raw.length > 32_768) {
    volatileSelection = null;
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = iconSelectionSchema.safeParse(value);
    volatileSelection = parsed.success ? parsed.data : null;
    return volatileSelection;
  } catch {
    volatileSelection = null;
    return null;
  }
}

export function writeIconSelection(selection: IconSelection): void {
  const parsed = iconSelectionSchema.parse(selection);
  volatileSelection = parsed;
  try {
    localStorage.setItem(ICON_SELECTION_KEY, JSON.stringify(parsed));
  } catch {
    /* Selection remains usable in this tab when storage is denied. */
  }
}

export function reconcileIconSelection(
  selection: IconSelection,
  apps: readonly AppDTO[],
  glyphNames?: readonly string[],
): IconSelection {
  const parsed = iconSelectionSchema.parse(selection);
  const slugs = new Set(apps.map(({ slug }) => slug));
  const glyphs = glyphNames ? new Set(glyphNames) : null;
  return {
    v: 1,
    appSlugs: parsed.appSlugs.filter((slug) => slugs.has(slug)),
    custom: parsed.custom.filter(({ glyph }) => !glyphs || glyphs.has(glyph)),
  };
}
