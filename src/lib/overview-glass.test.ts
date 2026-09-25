import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GLASS_OPACITY_DEFAULT,
  GLASS_OPACITY_MAX,
  GLASS_OPACITY_MIN,
  clampGlassOpacity,
  clampOverviewBox,
  glassBackdropBlurPx,
  glassFill,
  nudgeOverviewBoxPosition,
  prefersManualOnlyBoxResize,
} from "./overview-glass.ts";

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
