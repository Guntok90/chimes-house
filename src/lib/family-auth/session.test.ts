import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createSessionToken,
  getExpectedPassword,
  getSessionSecret,
  isAssetPath,
  isPublicPath,
  readCookie,
  safeEqualString,
  verifySessionToken,
} from "./session.ts";
import { asErrorText, loginErrorMessage } from "./client-errors.ts";

const ENV_KEYS = ["CHIMES_SITE_PASSWORD", "CHIMES_SESSION_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("family-auth session", () => {
  it("derives a stable secret from the site password", () => {
    process.env.CHIMES_SITE_PASSWORD = "family-secret";
    delete process.env.CHIMES_SESSION_SECRET;
    const a = getSessionSecret();
    const b = getSessionSecret();
    assert.ok(a);
    assert.equal(a, b);
    assert.equal(a!.length, 64);
  });

  it("prefers CHIMES_SESSION_SECRET when long enough", () => {
    process.env.CHIMES_SITE_PASSWORD = "family-secret";
    process.env.CHIMES_SESSION_SECRET = "dedicated-session-secret-key";
    assert.equal(getSessionSecret(), "dedicated-session-secret-key");
  });

  it("returns null secret without password or dedicated secret", () => {
    delete process.env.CHIMES_SITE_PASSWORD;
    delete process.env.CHIMES_SESSION_SECRET;
    assert.equal(getSessionSecret(), null);
    assert.equal(getExpectedPassword(), null);
  });

  it("round-trips a session token", () => {
    process.env.CHIMES_SITE_PASSWORD = "family-secret";
    const secret = getSessionSecret()!;
    const token = createSessionToken(secret);
    assert.ok(token);
    assert.equal(verifySessionToken(token, secret), true);
    assert.equal(verifySessionToken("nope", secret), false);
    assert.equal(verifySessionToken(token, "wrong-secret"), false);
  });

  it("compares passwords safely", () => {
    assert.equal(safeEqualString("abc", "abc"), true);
    assert.equal(safeEqualString("abc", "abd"), false);
    assert.equal(safeEqualString("abc", "abcd"), false);
  });

  it("reads the session cookie", () => {
    assert.equal(readCookie("chimes_session=hello%20world; other=1"), "hello world");
    assert.equal(readCookie(null), null);
  });

  it("classifies public and asset paths", () => {
    assert.equal(isPublicPath("/login"), true);
    assert.equal(isPublicPath("/api/login"), true);
    assert.equal(isPublicPath("/"), false);
    assert.equal(isPublicPath("/api/ha/bootstrap"), false);
    assert.equal(isPublicPath("/api/ha/live"), false);
    assert.equal(isAssetPath("/favicon.svg"), true);
    assert.equal(isAssetPath("/assets/index.js"), true);
    assert.equal(isAssetPath("/"), false);
  });
});

describe("family-auth client errors", () => {
  it("never stringifies objects as [object Object]", () => {
    assert.equal(asErrorText({ error: "Wrong password" }), "Wrong password");
    assert.equal(asErrorText({ message: "Enter the family password" }), "Enter the family password");
    assert.equal(asErrorText({ nested: true }), "");
    assert.equal(loginErrorMessage({ error: "Wrong password" }, 401), "Wrong password");
    assert.equal(loginErrorMessage({}, 429), "Too many attempts. Wait a minute.");
    assert.equal(loginErrorMessage(null, 503), "Site password is not configured");
  });
});
