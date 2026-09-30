#!/usr/bin/env node
/**
 * iPad-viewport smoke: login → Overview → touch drag/resize → persist check.
 * Run against local dev: CHIMES_SITE_PASSWORD=… node scripts/ipad-overview-touch-smoke.mjs
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080";
const PASSWORD = process.env.CHIMES_SITE_PASSWORD || "test-dad-ipad";
const OUT = process.env.SMOKE_OUT || "/opt/cursor/artifacts/screenshots/ipad-overview-touch.png";

mkdirSync(dirname(OUT), { recursive: true });

const iPad = devices["iPad Pro 11"];

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  ...iPad,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();

const result = {
  ok: false,
  steps: [],
  layoutBefore: null,
  layoutAfterReload: null,
  error: null,
};

function note(msg, extra) {
  result.steps.push({ msg, ...(extra || {}) });
  console.log(msg, extra ? JSON.stringify(extra) : "");
}

try {
  // Local Vite is HTTP; session cookie is Secure — inject after API login.
  const loginRes = await page.request.post(`${BASE}/api/login`, {
    data: { password: PASSWORD },
  });
  const loginJson = await loginRes.json();
  if (!loginRes.ok() || !loginJson?.ok) {
    throw new Error(`Login API failed: ${loginRes.status()} ${JSON.stringify(loginJson)}`);
  }
  const setCookie = loginRes.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
  const raw = setCookie.map((h) => h.value).join("\n");
  const match = /chimes_session=([^;]+)/.exec(raw);
  if (!match) throw new Error("No chimes_session in login Set-Cookie");
  const host = new URL(BASE).hostname;
  await context.addCookies([
    {
      name: "chimes_session",
      value: decodeURIComponent(match[1]),
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  note("session cookie injected");

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(600);
  if (page.url().includes("/login")) throw new Error("Still on login after cookie inject");
  note("logged in", { path: new URL(page.url()).pathname });

  // Prefer the visible control — below md the sidebar Overview stays in DOM but hidden.
  const overviewBtn = page.locator('button[aria-label="Overview"]:visible').first();
  await overviewBtn.waitFor({ state: "visible", timeout: 15000 });
  await overviewBtn.click();
  await page.waitForSelector(".overview-ambient", { timeout: 15000 });
  note("overview open");

  // Freeform tiles (not phone stack) at iPad width.
  const tiles = page.locator(".overview-glass-tile");
  const tileCount = await tiles.count();
  note("glass tiles", { tileCount });
  if (tileCount < 1) throw new Error("Expected freeform glass tiles on iPad viewport");

  const resizeBtn = page.locator('button.overview-tile-resize').first();
  await resizeBtn.waitFor({ state: "visible", timeout: 5000 });

  const boxBefore = await tiles.first().boundingBox();
  if (!boxBefore) throw new Error("No bounding box for first tile");

  // Touch resize from corner
  const rx = boxBefore.x + boxBefore.width - 12;
  const ry = boxBefore.y + boxBefore.height - 12;
  await page.touchscreen.tap(rx, ry);
  // Playwright touchscreen has no drag API in older versions — use pointer CDP-style via mouse with touch
  // Use dispatchEvent sequence for touch resize
  await page.evaluate(
    ({ startX, startY, endX, endY }) => {
      const el = document.elementFromPoint(startX, startY);
      if (!el) throw new Error("No element at resize corner");
      const target = el.closest("button.overview-tile-resize") || el;
      const fire = (type, x, y, pointerId = 1) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: y,
            buttons: type === "pointerup" ? 0 : 1,
            button: 0,
          }),
        );
      };
      fire("pointerdown", startX, startY);
      fire("pointermove", endX, endY);
      fire("pointerup", endX, endY);
    },
    {
      startX: rx,
      startY: ry,
      endX: rx + 80,
      endY: ry + 60,
    },
  );

  await page.waitForTimeout(200);
  const boxAfterResize = await tiles.first().boundingBox();
  note("after resize", {
    before: boxBefore,
    after: boxAfterResize,
    dw: boxAfterResize.width - boxBefore.width,
    dh: boxAfterResize.height - boxBefore.height,
  });

  const resized =
    Math.abs(boxAfterResize.width - boxBefore.width) > 8 ||
    Math.abs(boxAfterResize.height - boxBefore.height) > 8;
  if (!resized) throw new Error("Tile size did not change after touch resize");

  // Touch drag via header handle
  const handle = page.locator(".overview-tile-drag-handle").first();
  const hb = await handle.boundingBox();
  if (!hb) throw new Error("No drag handle box");
  const posBefore = await tiles.first().boundingBox();
  await page.evaluate(
    ({ startX, startY, endX, endY }) => {
      const el = document.elementFromPoint(startX, startY);
      if (!el) throw new Error("No element at drag handle");
      const target = el.closest(".overview-tile-drag-handle") || el;
      const fire = (type, x, y) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 2,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: y,
            buttons: type === "pointerup" ? 0 : 1,
            button: 0,
          }),
        );
      };
      fire("pointerdown", startX, startY);
      // Window listeners use capture — also fire on window for move/up like real Safari
      const move = (type, x, y) => {
        window.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 2,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: y,
            buttons: type === "pointerup" ? 0 : 1,
            button: 0,
          }),
        );
      };
      move("pointermove", endX, endY);
      move("pointerup", endX, endY);
    },
    {
      startX: hb.x + hb.width / 2,
      startY: hb.y + hb.height / 2,
      endX: hb.x + hb.width / 2 + 70,
      endY: hb.y + hb.height / 2 + 40,
    },
  );
  await page.waitForTimeout(200);
  const posAfter = await tiles.first().boundingBox();
  note("after drag", {
    before: posBefore,
    after: posAfter,
    dx: posAfter.x - posBefore.x,
    dy: posAfter.y - posBefore.y,
  });
  const moved =
    Math.abs(posAfter.x - posBefore.x) > 8 || Math.abs(posAfter.y - posBefore.y) > 8;
  if (!moved) throw new Error("Tile position did not change after touch drag");

  const layout = await page.evaluate(() => {
    const key = "chimes.overview.layout";
    const legacy = ["chimes.overview.graph", "chimes.overview.flow", "chimes.overview.pond"];
    return {
      map: localStorage.getItem(key),
      legacy: Object.fromEntries(legacy.map((k) => [k, localStorage.getItem(k)])),
      cookie: document.cookie.includes("chimes_overview_layout"),
    };
  });
  result.layoutBefore = layout;
  note("layout saved", {
    hasMap: Boolean(layout.map),
    hasCookie: layout.cookie,
    legacyKeys: Object.keys(layout.legacy).filter((k) => layout.legacy[k]),
  });
  if (!layout.map && !Object.values(layout.legacy).some(Boolean)) {
    throw new Error("No layout persisted to localStorage after drag/resize");
  }

  // Reload + reopen overview — geometry should stick
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('button[aria-label="Overview"]:visible').first().click();
  await page.waitForSelector(".overview-ambient", { timeout: 15000 });
  const afterReload = await tiles.first().boundingBox();
  result.layoutAfterReload = afterReload;
  note("after reload", { box: afterReload, expected: posAfter });

  const stick =
    afterReload &&
    Math.abs(afterReload.x - posAfter.x) < 4 &&
    Math.abs(afterReload.y - posAfter.y) < 4 &&
    Math.abs(afterReload.width - posAfter.width) < 4 &&
    Math.abs(afterReload.height - posAfter.height) < 4;
  if (!stick) throw new Error("Layout did not stick across reload");

  // CSS checks for iPad touch affordances
  const cssOk = await page.evaluate(() => {
    const resize = document.querySelector("button.overview-tile-resize");
    const handle = document.querySelector(".overview-tile-drag-handle");
    const ambient = document.querySelector(".overview-ambient");
    if (!resize || !handle || !ambient) return { ok: false, reason: "missing nodes" };
    const rs = getComputedStyle(resize);
    const hs = getComputedStyle(handle);
    return {
      ok:
        rs.touchAction === "none" &&
        hs.touchAction === "none" &&
        parseFloat(rs.width) >= 44 &&
        parseFloat(hs.minHeight) >= 44,
      touchActionResize: rs.touchAction,
      touchActionHandle: hs.touchAction,
      resizeW: rs.width,
      handleMinH: hs.minHeight,
    };
  });
  note("css touch affordances", cssOk);
  if (!cssOk.ok) throw new Error(`Touch CSS not applied: ${JSON.stringify(cssOk)}`);

  // Logout clears only chimes_session — layout localStorage + cookie must remain.
  const layoutSnapshot = await page.evaluate(() => localStorage.getItem("chimes.overview.layout"));
  await page.evaluate(async () => {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  });
  const cookiesBefore = await context.cookies();
  await context.clearCookies();
  // Restore non-session cookies (layout backup) — mimics real logout Set-Cookie.
  const keep = cookiesBefore.filter((c) => c.name !== "chimes_session");
  if (keep.length) await context.addCookies(keep);

  const afterLogout = await page.evaluate(() => ({
    layout: localStorage.getItem("chimes.overview.layout"),
    hasLayoutCookie: document.cookie.includes("chimes_overview_layout"),
  }));
  note("after logout (storage)", afterLogout);
  if (afterLogout.layout !== layoutSnapshot) {
    throw new Error("Logout wiped chimes.overview.layout from localStorage");
  }
  if (!afterLogout.hasLayoutCookie) {
    throw new Error("Layout cookie missing after logout");
  }

  // Simulate Safari wiping localStorage while cookie backup remains, then re-login.
  await page.evaluate(() => {
    for (const key of [
      "chimes.overview.layout",
      "chimes.overview.graph",
      "chimes.overview.flow",
      "chimes.overview.pond",
    ]) {
      localStorage.removeItem(key);
    }
  });
  const loginRes2 = await page.request.post(`${BASE}/api/login`, {
    data: { password: PASSWORD },
  });
  const raw2 = loginRes2
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("\n");
  const match2 = /chimes_session=([^;]+)/.exec(raw2);
  await context.addCookies([
    {
      name: "chimes_session",
      value: decodeURIComponent(match2[1]),
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.locator('button[aria-label="Overview"]:visible').first().click();
  await page.waitForSelector(".overview-ambient", { timeout: 15000 });
  const afterRelogin = await tiles.first().boundingBox();
  note("after logout/login (cookie restore)", { box: afterRelogin, expected: posAfter });
  const stickRelogin =
    afterRelogin &&
    Math.abs(afterRelogin.x - posAfter.x) < 4 &&
    Math.abs(afterRelogin.y - posAfter.y) < 4 &&
    Math.abs(afterRelogin.width - posAfter.width) < 4 &&
    Math.abs(afterRelogin.height - posAfter.height) < 4;
  if (!stickRelogin) throw new Error("Layout did not stick across logout/login via cookie backup");

  await page.screenshot({ path: OUT, fullPage: false });
  note("screenshot", { path: OUT });
  result.ok = true;
} catch (err) {
  result.error = String(err?.stack || err);
  console.error(result.error);
  try {
    await page.screenshot({ path: OUT.replace(/\.png$/, "-fail.png"), fullPage: false });
  } catch {
    /* ignore */
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: result.ok, steps: result.steps.length, error: result.error }, null, 2));
process.exit(result.ok ? 0 : 1);
