import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GLASS_OPACITY_DEFAULT,
  GLASS_OPACITY_KEY,
  GLASS_OPACITY_MAX,
  GLASS_OPACITY_MIN,
  OVERVIEW_FLOW_BOX_KEY,
  OVERVIEW_GRAPH_BOX_KEY,
  OVERVIEW_LAYOUT_COOKIE,
  OVERVIEW_LAYOUT_KEY,
  OVERVIEW_LAYOUT_STORAGE_KEYS,
  OVERVIEW_POND_BOX_KEY,
  OVERVIEW_WEATHER_BOX_KEY,
  boxesNearlyEqual,
  clampGlassOpacity,
  clampOverviewBox,
  glassBackdropBlurPx,
  glassFill,
  mergeOverviewLayouts,
  nudgeOverviewBoxPosition,
  parseOverviewBox,
  parseOverviewLayout,
  persistOverviewBox,
  prefersManualOnlyBoxResize,
  readOverviewBox,
  readOverviewLayout,
  resolveOverviewBox,
  shouldPersistOverviewBox,
  writeOverviewBox,
  type CookieJar,
} from "./overview-glass.ts";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function memoryCookies(seed: Record<string, string> = {}): CookieJar {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(name: string) {
      return map.has(name) ? map.get(name)! : null;
    },
    setItem(name: string, value: string) {
      map.set(name, value);
    },
  };
}

describe("overview glass opacity", () => {
  it("allows the full 0–100% range with no 25% floor", () => {
    assert.equal(GLASS_OPACITY_MIN, 0);
    assert.equal(GLASS_OPACITY_MAX, 100);
    assert.equal(clampGlassOpacity(0), 0);
    assert.equal(clampGlassOpacity(1), 1);
    assert.equal(clampGlassOpacity(24), 24);
    assert.equal(clampGlassOpacity(25), 25);
    assert.equal(clampGlassOpacity(50), 50);
    assert.equal(clampGlassOpacity(100), 100);
  });

  it("clamps out-of-range and non-finite values", () => {
    assert.equal(clampGlassOpacity(-10), 0);
    assert.equal(clampGlassOpacity(150), 100);
    assert.equal(clampGlassOpacity(12.6), 13);
    assert.equal(clampGlassOpacity(Number.NaN), GLASS_OPACITY_DEFAULT);
    assert.equal(clampGlassOpacity(Number.POSITIVE_INFINITY), GLASS_OPACITY_DEFAULT);
  });

  it("maps 0% to fully clear fill and 100% to solid teal-deep", () => {
    assert.equal(glassFill(0), "rgb(28 57 64 / 0)");
    assert.equal(glassFill(100), "rgb(28 57 64 / 1)");
    assert.equal(glassFill(50), "rgb(28 57 64 / 0.5)");
  });

  it("scales backdrop blur so 0% has no frost", () => {
    assert.equal(glassBackdropBlurPx(0), 0);
    assert.equal(glassBackdropBlurPx(100), 24);
    assert.equal(glassBackdropBlurPx(50), 12);
  });
});

describe("overview box resize policy", () => {
  const viewport = { width: 1024, height: 768 };

  it("clampOverviewBox enforces min size and keeps box on-screen", () => {
    const tiny = clampOverviewBox({ x: 0, y: 0, w: 10, h: 10 }, viewport);
    assert.equal(tiny.w, 300);
    assert.equal(tiny.h, 220);

    const huge = clampOverviewBox({ x: 0, y: 0, w: 5000, h: 5000 }, viewport);
    assert.ok(huge.w <= viewport.width - 24);
    assert.ok(huge.h <= viewport.height - 24);
  });

  it("nudgeOverviewBoxPosition never changes width or height", () => {
    const box = { x: 900, y: 700, w: 420, h: 310 };
    const nudged = nudgeOverviewBoxPosition(box, { width: 800, height: 600 });
    assert.equal(nudged.w, 420);
    assert.equal(nudged.h, 310);
    assert.ok(nudged.x < box.x);
    assert.ok(nudged.y < box.y);
  });

  it("prefers manual-only resize on iPad / touch / coarse pointer", () => {
    assert.equal(
      prefersManualOnlyBoxResize({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0)", maxTouchPoints: 5 }),
      true,
    );
    assert.equal(
      prefersManualOnlyBoxResize({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        maxTouchPoints: 5,
      }),
      true,
    );
    assert.equal(prefersManualOnlyBoxResize({ maxTouchPoints: 1, pointerCoarse: false }), true);
    assert.equal(prefersManualOnlyBoxResize({ pointerCoarse: true, maxTouchPoints: 0 }), true);
    assert.equal(
      prefersManualOnlyBoxResize({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        maxTouchPoints: 0,
        pointerCoarse: false,
      }),
      false,
    );
  });
});

describe("overview box persistence", () => {
  const viewport = { width: 1024, height: 768 };
  const fallback = { x: 28, y: 96, w: 560, h: 340 };
  const saved = { x: 120, y: 180, w: 400, h: 280 };

  it("keeps stable localStorage key names for graph, pond, and flow tiles", () => {
    assert.equal(OVERVIEW_GRAPH_BOX_KEY, "chimes.overview.graph");
    assert.equal(OVERVIEW_POND_BOX_KEY, "chimes.overview.pond");
    assert.equal(OVERVIEW_FLOW_BOX_KEY, "chimes.overview.flow");
    assert.equal(OVERVIEW_WEATHER_BOX_KEY, "chimes.overview.weather");
    assert.equal(OVERVIEW_LAYOUT_KEY, "chimes.overview.layout");
    assert.equal(OVERVIEW_LAYOUT_COOKIE, "chimes_overview_layout");
  });

  it("lists layout keys that logout must never clear", () => {
    assert.ok(OVERVIEW_LAYOUT_STORAGE_KEYS.includes(OVERVIEW_GRAPH_BOX_KEY));
    assert.ok(OVERVIEW_LAYOUT_STORAGE_KEYS.includes(OVERVIEW_POND_BOX_KEY));
    assert.ok(OVERVIEW_LAYOUT_STORAGE_KEYS.includes(OVERVIEW_WEATHER_BOX_KEY));
    assert.ok(OVERVIEW_LAYOUT_STORAGE_KEYS.includes(OVERVIEW_FLOW_BOX_KEY));
    assert.ok(OVERVIEW_LAYOUT_STORAGE_KEYS.includes(OVERVIEW_LAYOUT_KEY));
    assert.ok(OVERVIEW_LAYOUT_STORAGE_KEYS.includes(GLASS_OPACITY_KEY));
  });

  it("parseOverviewBox accepts finite geometry and rejects garbage", () => {
    assert.deepEqual(parseOverviewBox(saved), saved);
    assert.equal(parseOverviewBox(null), null);
    assert.equal(parseOverviewBox({ x: 1, y: 2, w: 3 }), null);
    assert.equal(parseOverviewBox({ x: 1, y: 2, w: Number.NaN, h: 4 }), null);
    assert.equal(parseOverviewBox("nope"), null);
  });

  it("round-trips through storage and prefers saved over defaults on resolve", () => {
    const store = memoryStorage();
    const cookies = memoryCookies();
    assert.equal(readOverviewBox(OVERVIEW_GRAPH_BOX_KEY, store, cookies), null);
    assert.equal(writeOverviewBox(OVERVIEW_GRAPH_BOX_KEY, saved, store, cookies), true);
    assert.deepEqual(readOverviewBox(OVERVIEW_GRAPH_BOX_KEY, store, cookies), saved);

    const restored = resolveOverviewBox(saved, fallback, viewport, { manualOnly: true });
    assert.equal(restored.w, saved.w);
    assert.equal(restored.h, saved.h);
    assert.notEqual(restored.w, fallback.w);

    const fresh = resolveOverviewBox(null, fallback, viewport, { manualOnly: false });
    assert.equal(fresh.w, fallback.w);
    assert.equal(fresh.h, fallback.h);
  });

  it("does not replace a smaller saved flow box with the large default", () => {
    // Regression: old w<560 "stale" migration ignored every custom flow size.
    const smallFlow = { x: 40, y: 200, w: 420, h: 300 };
    const largeDefault = { x: 300, y: 200, w: 680, h: 480 };
    const resolved = resolveOverviewBox(smallFlow, largeDefault, viewport, {
      manualOnly: true,
    });
    assert.equal(resolved.w, 420);
    assert.equal(resolved.h, 300);
    assert.equal(resolved.x, smallFlow.x);
    assert.equal(resolved.y, smallFlow.y);
  });

  it("rejects invalid writes so defaults cannot be stored as NaN garbage", () => {
    const store = memoryStorage();
    const cookies = memoryCookies();
    assert.equal(
      writeOverviewBox(OVERVIEW_FLOW_BOX_KEY, { x: 1, y: 2, w: Number.NaN, h: 4 }, store, cookies),
      false,
    );
    assert.equal(readOverviewBox(OVERVIEW_FLOW_BOX_KEY, store, cookies), null);
  });

  it("merge-writes a new pond tile without wiping graph/flow geometry", () => {
    const store = memoryStorage();
    const cookies = memoryCookies();
    const graph = { x: 10, y: 20, w: 410, h: 300 };
    const flow = { x: 500, y: 80, w: 450, h: 360 };
    const pond = { x: 40, y: 420, w: 380, h: 240 };

    assert.equal(writeOverviewBox(OVERVIEW_GRAPH_BOX_KEY, graph, store, cookies), true);
    assert.equal(writeOverviewBox(OVERVIEW_FLOW_BOX_KEY, flow, store, cookies), true);
    assert.equal(writeOverviewBox(OVERVIEW_POND_BOX_KEY, pond, store, cookies), true);

    assert.deepEqual(readOverviewBox(OVERVIEW_GRAPH_BOX_KEY, store, cookies), graph);
    assert.deepEqual(readOverviewBox(OVERVIEW_FLOW_BOX_KEY, store, cookies), flow);
    assert.deepEqual(readOverviewBox(OVERVIEW_POND_BOX_KEY, store, cookies), pond);

    const layout = readOverviewLayout(store, cookies);
    assert.deepEqual(layout.graph, graph);
    assert.deepEqual(layout.flow, flow);
    assert.deepEqual(layout.pond, pond);
  });

  it("restores from cookie after localStorage is cleared (logout / re-auth)", () => {
    const store = memoryStorage();
    const cookies = memoryCookies();
    const graph = { x: 88, y: 140, w: 390, h: 270 };
    const flow = { x: 520, y: 100, w: 440, h: 350 };

    writeOverviewBox(OVERVIEW_GRAPH_BOX_KEY, graph, store, cookies);
    writeOverviewBox(OVERVIEW_FLOW_BOX_KEY, flow, store, cookies);

    // Simulate Safari wiping site localStorage while first-party cookies remain
    // (or a future logout helper that clears LS but not layout cookies).
    store.clear();
    assert.equal(store.getItem(OVERVIEW_GRAPH_BOX_KEY), null);
    assert.equal(store.getItem(OVERVIEW_LAYOUT_KEY), null);

    assert.deepEqual(readOverviewBox(OVERVIEW_GRAPH_BOX_KEY, store, cookies), graph);
    assert.deepEqual(readOverviewBox(OVERVIEW_FLOW_BOX_KEY, store, cookies), flow);

    const layout = JSON.parse(cookies.getItem(OVERVIEW_LAYOUT_COOKIE)!) as Record<string, unknown>;
    assert.deepEqual(parseOverviewLayout(layout).graph, graph);
  });

  it("denylists default overwrite of a custom save", () => {
    assert.equal(shouldPersistOverviewBox(fallback, saved, fallback), false);
    assert.equal(shouldPersistOverviewBox(saved, saved, fallback), true);
    assert.equal(shouldPersistOverviewBox(saved, null, fallback), true);
    assert.equal(shouldPersistOverviewBox(fallback, null, fallback), true);
    assert.equal(shouldPersistOverviewBox(fallback, fallback, fallback), true);

    const store = memoryStorage();
    const cookies = memoryCookies();
    writeOverviewBox(OVERVIEW_GRAPH_BOX_KEY, saved, store, cookies);

    assert.equal(
      persistOverviewBox(OVERVIEW_GRAPH_BOX_KEY, fallback, {
        fallback,
        storage: store,
        cookies,
      }),
      false,
    );
    assert.deepEqual(readOverviewBox(OVERVIEW_GRAPH_BOX_KEY, store, cookies), saved);

    const nextCustom = { x: 200, y: 220, w: 380, h: 260 };
    assert.equal(
      persistOverviewBox(OVERVIEW_GRAPH_BOX_KEY, nextCustom, {
        fallback,
        storage: store,
        cookies,
      }),
      true,
    );
    assert.deepEqual(readOverviewBox(OVERVIEW_GRAPH_BOX_KEY, store, cookies), nextCustom);
  });

  it("boxesNearlyEqual tolerates 1px clamp noise", () => {
    assert.equal(boxesNearlyEqual(saved, { ...saved, x: saved.x + 0.5 }), true);
    assert.equal(boxesNearlyEqual(saved, { ...saved, w: saved.w + 3 }), false);
  });

  it("mergeOverviewLayouts never drops sibling tiles", () => {
    const merged = mergeOverviewLayouts(
      { graph: saved, flow: fallback },
      { pond: { x: 1, y: 2, w: 300, h: 220 } },
      { flow: { x: 9, y: 9, w: 400, h: 300 } },
    );
    assert.deepEqual(merged.graph, saved);
    assert.deepEqual(merged.pond, { x: 1, y: 2, w: 300, h: 220 });
    assert.deepEqual(merged.flow, { x: 9, y: 9, w: 400, h: 300 });
  });
});
