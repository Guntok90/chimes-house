import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { haBootstrap } from "./ha.server.ts";

const KEYS = ["HA_TOKEN", "HA_URL"] as const;
const saved: Record<string, string | undefined> = {};

for (const key of KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("ha bootstrap", () => {
  it("returns url and token only when HA_TOKEN is set, and does not fetch", () => {
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      called = true;
      throw new Error("server must not fetch Home Assistant");
    }) as typeof fetch;
    try {
      process.env.HA_TOKEN = "secret-token";
      process.env.HA_URL = "https://chimes-pi.tail8e29b8.ts.net/";
      assert.deepEqual(haBootstrap(), {
        configured: true,
        url: "https://chimes-pi.tail8e29b8.ts.net",
        token: "secret-token",
      });
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("never fetches Home Assistant from the server modules", () => {
    const files = [
      new URL("./ha.server.ts", import.meta.url),
      new URL("../routes/api/ha/bootstrap.ts", import.meta.url),
      new URL("../routes/api/ha/live.ts", import.meta.url),
      new URL("../routes/api/ha/states.ts", import.meta.url),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.equal(src.includes("fetch("), false, String(file));
    }
    const bootstrap = readFileSync(
      new URL("../routes/api/ha/bootstrap.ts", import.meta.url),
      "utf8",
    );
    assert.match(bootstrap, /hasValidSession/);
    const store = readFileSync(new URL("./house-store.ts", import.meta.url), "utf8");
    assert.match(store, /\/api\/ha\/bootstrap/);
    assert.equal(store.includes("/api/ha/live"), false);
  });

  it("omits the token when unconfigured", () => {
    delete process.env.HA_TOKEN;
    const payload = haBootstrap();
    assert.deepEqual(payload, { configured: false });
    assert.equal("token" in payload, false);
    assert.equal("url" in payload, false);
  });
});
