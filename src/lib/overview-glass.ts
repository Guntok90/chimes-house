/**
 * Overview glass info-box helpers (opacity clamp + box geometry).
 * Pure so unit tests can lock Dad-facing behaviour without mounting React.
 */

export const GLASS_OPACITY_KEY = "chimes.overview.glassOpacity";
/** Full clear → solid. Do not raise this floor (was briefly 25%). */
export const GLASS_OPACITY_MIN = 0;
export const GLASS_OPACITY_MAX = 100;
export const GLASS_OPACITY_DEFAULT = 50;

export const BOX_MIN_W = 300;
export const BOX_MIN_H = 220;

export type OverviewBox = { x: number; y: number; w: number; h: number };

/** Teal-deep #1c3940 — glass fill only; content stays fully opaque. */
export function glassFill(pct: number): string {
  return `rgb(28 57 64 / ${clampGlassOpacity(pct) / 100})`;
}

/** Clamp glass opacity to the full 0–100% range (no 25% floor). */
export function clampGlassOpacity(pct: number): number {
  if (!Number.isFinite(pct)) return GLASS_OPACITY_DEFAULT;
  return Math.min(GLASS_OPACITY_MAX, Math.max(GLASS_OPACITY_MIN, Math.round(pct)));
}

/**
 * Backdrop blur (px) scales with opacity so 0% is truly clear (no frost)
 * and 100% keeps the Shyft glass look.
 */
export function glassBackdropBlurPx(pct: number): number {
  const t = clampGlassOpacity(pct) / 100;
  return Number((24 * t).toFixed(2));
}

export type Viewport = { width: number; height: number };

/** Keep a box usable inside the viewport (used on load + manual drag/resize). */
export function clampOverviewBox(box: OverviewBox, viewport: Viewport): OverviewBox {
  const w = Math.min(Math.max(BOX_MIN_W, box.w), Math.max(BOX_MIN_W, viewport.width - 24));
  const h = Math.min(Math.max(BOX_MIN_H, box.h), Math.max(BOX_MIN_H, viewport.height - 24));
  return {
    w,
    h,
    x: Math.min(Math.max(-w + 72, box.x), viewport.width - 72),
    y: Math.min(Math.max(0, box.y), viewport.height - 56),
  };
}

/**
 * On window resize (orientation / Safari chrome / keyboard), only nudge
 * position so the box stays reachable — never mutate width/height.
 * Manual drag-resize still uses {@link clampOverviewBox}.
 */
export function nudgeOverviewBoxPosition(box: OverviewBox, viewport: Viewport): OverviewBox {
  return {
    w: box.w,
    h: box.h,
    x: Math.min(Math.max(-box.w + 72, box.x), viewport.width - 72),
    y: Math.min(Math.max(0, box.y), viewport.height - 56),
  };
}

/**
 * True when automatic size mutation on window resize should be skipped.
 * iPad / coarse-pointer / touch UAs thrash from orientation, safe-area, and
 * keyboard — size must stay manual-only there. Desktop mouse stays free to
 * re-clamp size so boxes remain on-screen after a browser window shrink.
 */
export function prefersManualOnlyBoxResize(opts: {
  maxTouchPoints?: number;
  pointerCoarse?: boolean;
  userAgent?: string;
}): boolean {
  const ua = opts.userAgent ?? "";
  const touchPoints = opts.maxTouchPoints ?? 0;
  const iPadOs =
    /iPad|iPhone|iPod/i.test(ua) ||
    // iPadOS 13+ desktop Safari UA still reports MacIntel with touch.
    (touchPoints > 1 && /Macintosh/i.test(ua));
  return iPadOs || touchPoints > 0 || Boolean(opts.pointerCoarse);
}
