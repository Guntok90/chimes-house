import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createInboxSessionToken,
  getInboxPassword,
  getInboxSessionSecret,
  getRequestApiToken,
  hasValidRequestApiToken,
  readInboxCookie,
  verifyInboxSessionToken,
} from "./inbox-auth.ts";
import { parseCreateRequestBody, parseInlineImage } from "./parse.ts";

const ENV_KEYS = [
  "GUY_INBOX_PASSWORD",
  "GUY_INBOX_SESSION_SECRET",
  "CHIMES_REQUEST_API_TOKEN",
] as const;
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

describe("inbox auth", () => {
  it("derives a stable secret from GUY_INBOX_PASSWORD", () => {
    process.env.GUY_INBOX_PASSWORD = "guy-secret";
    delete process.env.GUY_INBOX_SESSION_SECRET;
    const a = getInboxSessionSecret();
    const b = getInboxSessionSecret();
    assert.ok(a);
    assert.equal(a, b);
    assert.equal(getInboxPassword(), "guy-secret");
  });

  it("round-trips an inbox session token", () => {
    process.env.GUY_INBOX_PASSWORD = "guy-secret";
    const secret = getInboxSessionSecret()!;
    const token = createInboxSessionToken(secret);
    assert.ok(token);
    assert.equal(verifyInboxSessionToken(token, secret), true);
    assert.equal(verifyInboxSessionToken("nope", secret), false);
  });

  it("reads the inbox cookie", () => {
    assert.equal(
      readInboxCookie("guy_inbox_session=hello%20world; other=1"),
      "hello world",
    );
    assert.equal(readInboxCookie(null), null);
  });

  it("accepts Bearer CHIMES_REQUEST_API_TOKEN", () => {
    process.env.CHIMES_REQUEST_API_TOKEN = "mcp-token-value";
    assert.equal(getRequestApiToken(), "mcp-token-value");
    const ok = new Request("https://example.com/api/requests", {
      headers: { Authorization: "Bearer mcp-token-value" },
    });
    const bad = new Request("https://example.com/api/requests", {
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(hasValidRequestApiToken(ok), true);
    assert.equal(hasValidRequestApiToken(bad), false);
  });
});

describe("request parse", () => {
  it("requires kind, title and description", async () => {
    const missingKind = await parseCreateRequestBody({
      title: "x",
      description: "y",
    });
    assert.equal(missingKind.ok, false);
    const missing = await parseCreateRequestBody({
      kind: "bug",
      title: "",
      description: "x",
    });
    assert.equal(missing.ok, false);
    const ok = await parseCreateRequestBody({
      kind: "bug",
      title: "Battery tile blank",
      description: "On the iPad overview the SOC stays at —",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.kind, "bug");
      assert.equal(ok.title, "Battery tile blank");
      assert.equal(ok.images.length, 0);
    }
  });

  it("accepts feature kind", async () => {
    const ok = await parseCreateRequestBody({
      kind: "feature",
      title: "Show EV Ready by on Home",
      description: "Would help Dad glance at the target time without opening Charge.",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.kind, "feature");
  });

  it("parses a tiny PNG data URL", async () => {
    // 1x1 PNG
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const inline = parseInlineImage({
      data: `data:image/png;base64,${png}`,
    });
    assert.equal(inline.ok, true);
    if (inline.ok) {
      assert.equal(inline.image.mimeType, "image/png");
      assert.ok(inline.image.byteLength > 16);
    }

    const body = await parseCreateRequestBody({
      kind: "bug",
      title: "With shot",
      description: "See image",
      images: [{ data: `data:image/png;base64,${png}` }],
    });
    assert.equal(body.ok, true);
    if (body.ok) assert.equal(body.images.length, 1);
  });

  it("rejects unsupported mime", () => {
    const bad = parseInlineImage({
      data: "AAAA",
      mimeType: "application/pdf",
    });
    assert.equal(bad.ok, false);
  });
});
