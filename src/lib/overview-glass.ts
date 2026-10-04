/**
 * Overview glass info-box helpers (opacity clamp + box geometry).
 * Pure so unit tests can lock Dad-facing behaviour without mounting React.
 *
 * Persistence (per device):
 * 1) Legacy per-tile localStorage keys (`chimes.overview.graph` / `.flow` / `.pond`)
 * 2) Unified layout map (`chimes.overview.layout`) — merge-on-write so a new
 *    tile (e.g. pond) never wipes geometry for the others
 * 3) Same-origin cookie backup (`chimes_overview_layout`) — survives logout and
 *    some Safari cases where localStorage is empty after a fresh session while
 *    first-party cookies remain
 *
 * Logout only clears the family session cookie; it must never wipe these keys.
 */

export const GLASS_OPACITY_KEY = "chimes.overview.glassOpacity";
/** Full clear → solid. Do not raise this floor (was briefly 25%). */
export const GLASS_OPACITY_MIN = 0;
export const GLASS_OPACITY_MAX = 100;
export const GLASS_OPACITY_DEFAULT = 50;

/** Freeform Overview glass tiles — per-device localStorage (v1). */
export const OVERVIEW_GRAPH_BOX_KEY = "chimes.overview.graph";
export const OVERVIEW_FLOW_BOX_KEY = "chimes.overview.flow";
export const OVERVIEW_POND_BOX_KEY = "chimes.overview.pond";
export const OVERVIEW_WEATHER_BOX_KEY = "chimes.overview.weather";
export const OVERVIEW_HEAT_BOX_KEY = "chimes.overview.heat";

/** Merged layout document — one JSON object, one tile write at a time. */
export const OVERVIEW_LAYOUT_KEY = "chimes.overview.layout";

/** Cookie backup for the merged layout (not HttpOnly — readable by the SPA). */
export const OVERVIEW_LAYOUT_COOKIE = "chimes_overview_layout";

/** ~1 year — layout should outlive the 30-day family session cookie. */
export const OVERVIEW_LAYOUT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Keys the family logout path must never clear. */
export const OVERVIEW_LAYOUT_STORAGE_KEYS = [
  OVERVIEW_GRAPH_BOX_KEY,
  OVERVIEW_FLOW_BOX_KEY,
  OVERVIEW_POND_BOX_KEY,
  OVERVIEW_WEATHER_BOX_KEY,
  OVERVIEW_HEAT_BOX_KEY,
  OVERVIEW_LAYOUT_KEY,
  GLASS_OPACITY_KEY,
] as const;

/** Short ids inside the merged layout / cookie JSON. */
export const OVERVIEW_TILE_IDS: Record<string, string> = {
  [OVERVIEW_GRAPH_BOX_KEY]: "graph",
  [OVERVIEW_FLOW_BOX_KEY]: "flow",
  [OVERVIEW_POND_BOX_KEY]: "pond",
  [OVERVIEW_WEATHER_BOX_KEY]: "weather",
  [OVERVIEW_HEAT_BOX_KEY]: "heat",
};

export const BOX_MIN_W = 300;
export const BOX_MIN_H = 220;

export type OverviewBox = { x: number; y: number; w: number; h: number };

export type OverviewLayoutMap = Record<string, OverviewBox>;

/** Injectable cookie jar so unit tests do not need `document`. */
export type CookieJar = {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
};

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

/** Accept only finite {x,y,w,h}; reject truncated / garbage JSON shapes. */
export function parseOverviewBox(raw: unknown): OverviewBox | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const x = Number(rec.x);
  const y = Number(rec.y);
  const w = Number(rec.w);
  const h = Number(rec.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, w, h };
}

/** Geometry equality within 1px — enough to catch default overwrite races. */
export function boxesNearlyEqual(a: OverviewBox, b: OverviewBox, epsilon = 1): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.w - b.w) <= epsilon &&
    Math.abs(a.h - b.h) <= epsilon
  );
}

/**
 * Refuse writes that would replace a custom save with hardcoded defaults.
 * First save, intentional custom→custom, and default→default all still pass.
 */
export function shouldPersistOverviewBox(
  next: OverviewBox,
  existing: OverviewBox | null,
  fallback: OverviewBox | null | undefined,
): boolean {
  if (![next.x, next.y, next.w, next.h].every(Number.isFinite)) return false;
  if (!existing || !fallback) return true;
  const existingIsCustom = !boxesNearlyEqual(existing, fallback);
  const nextIsDefault = boxesNearlyEqual(next, fallback);
  if (existingIsCustom && nextIsDefault) return false;
  return true;
}

function storageOrNull(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function defaultCookieJar(): CookieJar | null {
  try {
    if (typeof document === "undefined") return null;
    return {
      getItem(name: string) {
        const prefix = `${name}=`;
        const parts = document.cookie.split(";");
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith(prefix)) continue;
          try {
            return decodeURIComponent(trimmed.slice(prefix.length));
          } catch {
            return trimmed.slice(prefix.length);
          }
        }
        return null;
      },
      setItem(name: string, value: string) {
        const secure =
          typeof location !== "undefined" && location.protocol === "https:" ? "Secure" : "";
        document.cookie = [
          `${name}=${encodeURIComponent(value)}`,
          "Path=/",
          `Max-Age=${OVERVIEW_LAYOUT_COOKIE_MAX_AGE}`,
          "SameSite=Lax",
          secure,
        ]
          .filter(Boolean)
          .join("; ");
      },
    };
  } catch {
    return null;
  }
}

function cookieJarOrNull(cookies?: CookieJar | null): CookieJar | null {
  if (cookies !== undefined) return cookies;
  return defaultCookieJar();
}

/** Parse `{ graph: {x,y,w,h}, ... }` — drop invalid entries, keep the rest. */
export function parseOverviewLayout(raw: unknown): OverviewLayoutMap {
  if (!raw || typeof raw !== "object") return {};
  const out: OverviewLayoutMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const box = parseOverviewBox(value);
    if (box) out[id] = box;
  }
  return out;
}

function readLayoutFromStore(store: Storage | null): OverviewLayoutMap {
  if (!store) return {};
  try {
    const raw = store.getItem(OVERVIEW_LAYOUT_KEY);
    if (!raw) return {};
    return parseOverviewLayout(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function readLayoutFromCookie(cookies: CookieJar | null): OverviewLayoutMap {
  if (!cookies) return {};
  try {
    const raw = cookies.getItem(OVERVIEW_LAYOUT_COOKIE);
    if (!raw) return {};
    return parseOverviewLayout(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/**
 * Merge layout maps — later sources win per tile id, but never delete siblings.
 * Used when hydrating from legacy keys + map + cookie.
 */
export function mergeOverviewLayouts(...maps: OverviewLayoutMap[]): OverviewLayoutMap {
  const out: OverviewLayoutMap = {};
  for (const map of maps) {
    for (const [id, box] of Object.entries(map)) {
      out[id] = box;
    }
  }
  return out;
}

function legacyMapFromStore(store: Storage | null): OverviewLayoutMap {
  if (!store) return {};
  const out: OverviewLayoutMap = {};
  for (const [key, id] of Object.entries(OVERVIEW_TILE_IDS)) {
    try {
      const raw = store.getItem(key);
      if (!raw) continue;
      const box = parseOverviewBox(JSON.parse(raw) as unknown);
      if (box) out[id] = box;
    } catch {
      /* skip bad legacy entry */
    }
  }
  return out;
}

/** Full merged layout from localStorage (+ optional cookie). */
export function readOverviewLayout(
  storage?: Storage | null,
  cookies?: CookieJar | null,
): OverviewLayoutMap {
  const store = storageOrNull(storage);
  const jar = cookieJarOrNull(cookies);
  // Prefer explicit layout map, then fill gaps from legacy keys, then cookie.
  // Cookie is last so a stale cookie cannot clobber a fresher localStorage save;
  // when localStorage is empty after logout/re-auth, cookie still restores.
  const fromMap = readLayoutFromStore(store);
  const fromLegacy = legacyMapFromStore(store);
  const fromCookie = readLayoutFromCookie(jar);
  if (Object.keys(fromMap).length === 0 && Object.keys(fromLegacy).length === 0) {
    return fromCookie;
  }
  return mergeOverviewLayouts(fromCookie, fromLegacy, fromMap);
}

/** Read a saved Overview box; null when missing / invalid / storage blocked. */
export function readOverviewBox(
  key: string,
  storage?: Storage | null,
  cookies?: CookieJar | null,
): OverviewBox | null {
  try {
    const store = storageOrNull(storage);
    const jar = cookieJarOrNull(cookies);
    const tileId = OVERVIEW_TILE_IDS[key];

    // Prefer the dedicated legacy key when present (most recent pointerup write).
    if (store) {
      const raw = store.getItem(key);
      if (raw) {
        const box = parseOverviewBox(JSON.parse(raw) as unknown);
        if (box) return box;
      }
    }

    if (tileId) {
      const layout = readOverviewLayout(store, jar);
      return layout[tileId] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

function writeLayoutArtifacts(
  layout: OverviewLayoutMap,
  store: Storage | null,
  cookies: CookieJar | null,
): boolean {
  const payload = JSON.stringify(layout);
  let ok = false;
  if (store) {
    try {
      store.setItem(OVERVIEW_LAYOUT_KEY, payload);
      ok = true;
    } catch {
      /* private mode / quota */
    }
  }
  if (cookies) {
    try {
      cookies.setItem(OVERVIEW_LAYOUT_COOKIE, payload);
      ok = true;
    } catch {
      /* cookie blocked */
    }
  }
  return ok;
}

/**
 * Persist a box. Merges into the unified layout so other tiles stay put.
 * Also mirrors the legacy per-key entry for older builds. Returns false when
 * every backend (localStorage + cookie) refuses the write.
 */
export function writeOverviewBox(
  key: string,
  box: OverviewBox,
  storage?: Storage | null,
  cookies?: CookieJar | null,
): boolean {
  try {
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return false;
    const store = storageOrNull(storage);
    const jar = cookieJarOrNull(cookies);
    let ok = false;

    if (store) {
      try {
        store.setItem(key, JSON.stringify(box));
        ok = true;
      } catch {
        /* continue — cookie / layout may still work */
      }
    }

    const tileId = OVERVIEW_TILE_IDS[key];
    if (tileId) {
      const layout = mergeOverviewLayouts(readOverviewLayout(store, jar), { [tileId]: box });
      if (writeLayoutArtifacts(layout, store, jar)) ok = true;
    }

    return ok;
  } catch {
    return false;
  }
}

/**
 * User-gesture persist with a denylist: never replace a custom save with
 * geometry that matches the hardcoded fallback (default-paint → accidental
 * pointerup race after logout/login remount).
 */
export function persistOverviewBox(
  key: string,
  box: OverviewBox,
  opts?: {
    fallback?: OverviewBox | null;
    storage?: Storage | null;
    cookies?: CookieJar | null;
  },
): boolean {
  const storage = opts?.storage;
  const cookies = opts?.cookies;
  const existing = readOverviewBox(key, storage, cookies);
  if (!shouldPersistOverviewBox(box, existing, opts?.fallback)) {
    return false;
  }
  return writeOverviewBox(key, box, storage, cookies);
}

/**
 * Prefer saved geometry; fall back to defaults only when nothing valid is stored.
 * Touch/iPad: nudge position only. Desktop: full viewport clamp.
 */
export function resolveOverviewBox(
  saved: OverviewBox | null,
  fallback: OverviewBox,
  viewport: Viewport,
  opts: { manualOnly: boolean },
): OverviewBox {
  const initial = saved ?? fallback;
  return opts.manualOnly
    ? nudgeOverviewBoxPosition(initial, viewport)
    : clampOverviewBox(initial, viewport);
}
