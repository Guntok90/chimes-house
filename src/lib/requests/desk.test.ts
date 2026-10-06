import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { submitHouseRequestViaMcp } from "../mcp/submit.ts";
import { createHouseRequest, DESK_INTAKE_URL } from "./desk.server.ts";
import { parseCreateRequestBody, parseInlineImage } from "./parse.ts";
import { intakeSource, MAX_IMAGE_BYTES, MAX_REQUEST_IMAGES } from "./types.ts";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Fake value used only inside this test. Never a real desk token. */
const TEST_TOKEN = "desk-test-token-not-a-secret";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

type FetchCall = { url: string; init?: RequestInit };

let originalFetch: typeof fetch;
let originalError: typeof console.error;
let savedToken: string | undefined;

function pngResponse(): Response {
  return new Response(Buffer.from(TINY_PNG, "base64"), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

function deskOk(id = "desk_1"): Response {
  return new Response(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://desk.shyftstudio.at") && url !== DESK_INTAKE_URL) {
      throw new Error("refusing unexpected desk host");
    }
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

function deskBody(call: FetchCall | undefined): {
  kind: string;
  title: string;
  description: string;
  from: string;
  source: string;
  images: Array<{ data: string; mimeType: string; filename: string }>;
} {
  assert.ok(call, "expected a desk call");
  return JSON.parse(String(call.init?.body)) as {
    kind: string;
    title: string;
    description: string;
    from: string;
    source: string;
    images: Array<{ data: string; mimeType: string; filename: string }>;
  };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalError = console.error;
  savedToken = process.env.DESK_INTAKE_TOKEN;
  process.env.DESK_INTAKE_TOKEN = TEST_TOKEN;
  console.error = () => {};
  globalThis.fetch = (async () => {
    throw new Error("refusing unexpected network call");
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  if (savedToken === undefined) delete process.env.DESK_INTAKE_TOKEN;
  else process.env.DESK_INTAKE_TOKEN = savedToken;
});

describe("intake source", () => {
  it("maps the web form to form and a bearer caller to mcp", () => {
    assert.equal(intakeSource(false), "form");
    assert.equal(intakeSource(true), "mcp");
  });
});

describe("createHouseRequest desk payload", () => {
  it("posts kind, source form, and from Dad", async () => {
    const calls = installFetch(async (url) => {
      assert.equal(url, DESK_INTAKE_URL);
      return deskOk("desk_bug_1");
    });

    const result = await createHouseRequest({
      kind: "bug",
      title: "Battery tile blank",
      description: "SOC stays at a dash on the iPad",
      images: [],
      source: "form",
    });

    assert.deepEqual(result, { ok: true, id: "desk_bug_1" });
    const body = deskBody(calls[0]);
    assert.deepEqual(body, {
      kind: "bug",
      title: "Battery tile blank",
      description: "SOC stays at a dash on the iPad",
      from: "Dad",
      source: "form",
      images: [],
    });
    const auth = new Headers(calls[0]?.init?.headers).get("authorization");
    assert.equal(auth, `Bearer ${TEST_TOKEN}`);
    assert.equal(JSON.stringify(result).includes(TEST_TOKEN), false);
    assert.equal(JSON.stringify(body).includes(TEST_TOKEN), false);
    assert.equal("status" in body, false);
    assert.equal("note" in body, false);
  });

  it("posts a feature from mcp with a data-URL screenshot", async () => {
    const calls = installFetch(async () => deskOk("desk_feat_2"));
    const parsed = await parseCreateRequestBody({
      kind: "feature",
      title: "Show EV Ready by on Home",
      description: "Dad wants the target time on the home screen",
      images: [
        {
          data: `data:image/png;base64,${TINY_PNG}`,
          filename: "shot.png",
        },
      ],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const result = await createHouseRequest({
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description,
      images: parsed.images,
      source: "mcp",
    });
    assert.deepEqual(result, { ok: true, id: "desk_feat_2" });
    const body = deskBody(calls[0]);
    assert.equal(body.kind, "feature");
    assert.equal(body.source, "mcp");
    assert.equal(body.from, "Dad");
    assert.equal(body.images.length, 1);
    assert.equal(body.images[0]!.mimeType, "image/png");
    assert.equal(body.images[0]!.filename, "shot.png");
    assert.equal(body.images[0]!.data, `data:image/png;base64,${TINY_PNG}`);
    assert.equal(body.images[0]!.data.startsWith("http"), false);
  });
});

describe("image limits", () => {
  it("accepts jpg, png, and webp and at most 6 images", async () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp"] as const) {
      const parsed = await parseCreateRequestBody({
        kind: "bug",
        title: "Shot",
        description: "One image",
        images: [{ data: `data:${mime};base64,${TINY_PNG}`, mimeType: mime }],
      });
      assert.equal(parsed.ok, true, mime);
    }

    const six = await parseCreateRequestBody({
      kind: "bug",
      title: "Six shots",
      description: "Still under the cap",
      images: Array.from({ length: MAX_REQUEST_IMAGES }, () => ({
        data: `data:image/png;base64,${TINY_PNG}`,
      })),
    });
    assert.equal(six.ok, true);

    const seven = await parseCreateRequestBody({
      kind: "bug",
      title: "Too many",
      description: "Over the cap",
      images: Array.from({ length: MAX_REQUEST_IMAGES + 1 }, () => ({
        data: `data:image/png;base64,${TINY_PNG}`,
      })),
    });
    assert.equal(seven.ok, false);
    if (!seven.ok) assert.match(seven.error, /6/);

    const gif = parseInlineImage({
      data: `data:image/gif;base64,${TINY_PNG}`,
    });
    assert.equal(gif.ok, false);

    const tooBig = "A".repeat(Math.ceil(((MAX_IMAGE_BYTES + 1) * 4) / 3));
    const huge = parseInlineImage({
      data: tooBig,
      mimeType: "image/png",
    });
    assert.equal(huge.ok, false);
    if (!huge.ok) assert.match(huge.error, /too large/i);
  });

  it("does not call the desk when an image is over the limit", async () => {
    let called = false;
    installFetch(async () => {
      called = true;
      return deskOk();
    });

    const viaParse = await submitHouseRequestViaMcp("bug", {
      title: "Too many",
      description: "Seven screenshots",
      images: Array.from({ length: 7 }, () => `data:image/png;base64,${TINY_PNG}`),
    });
    assert.equal(viaParse.ok, false);
    assert.equal(called, false);

    const direct = await createHouseRequest({
      kind: "feature",
      title: "Huge",
      description: "One oversized image",
      source: "form",
      images: [
        {
          mimeType: "image/png",
          dataBase64: TINY_PNG,
          byteLength: MAX_IMAGE_BYTES + 1,
        },
      ],
    });
    assert.equal(direct.ok, false);
    if (!direct.ok) assert.match(direct.error, /too large/i);
    assert.equal(called, false);
    assert.equal(direct.ok ? "" : direct.error.includes(TEST_TOKEN), false);
  });
});

describe("URL screenshots", () => {
  it("downloads an http image and sends base64 to the desk", async () => {
    const shotUrl = "https://cdn.example/shots/shot.png";
    const calls = installFetch(async (url) => {
      if (url === shotUrl) return pngResponse();
      if (url === DESK_INTAKE_URL) return deskOk("desk_shot");
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await submitHouseRequestViaMcp("bug", {
      title: "Day graph blank",
      description: "The energy graph is empty after midnight",
      images: [shotUrl],
    });

    assert.deepEqual(result, { ok: true, id: "desk_shot" });
    assert.deepEqual(
      calls.map((call) => call.url),
      [shotUrl, DESK_INTAKE_URL],
    );
    const body = deskBody(calls[1]);
    assert.equal(body.kind, "bug");
    assert.equal(body.source, "mcp");
    assert.equal(body.from, "Dad");
    assert.equal(body.images.length, 1);
    assert.equal(body.images[0]!.mimeType, "image/png");
    assert.equal(body.images[0]!.filename, "shot.png");
    assert.equal(body.images[0]!.data, `data:image/png;base64,${TINY_PNG}`);
    assert.equal(body.images[0]!.data.includes(shotUrl), false);
    assert.equal(body.images[0]!.data.startsWith("http"), false);
  });
});

describe("desk failure", () => {
  it("returns a plain error when the desk is down and does not claim success", async () => {
    installFetch(async () => new Response("nope", { status: 500 }));
    const failed = await createHouseRequest({
      kind: "bug",
      title: "Broken tile",
      description: "It stays blank",
      images: [],
      source: "form",
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.error, "Could not send request");
      assert.equal(failed.error.includes(TEST_TOKEN), false);
    }

    installFetch(async () => {
      throw new Error(`connect failed ${TEST_TOKEN}`);
    });
    const thrown = await submitHouseRequestViaMcp("feature", {
      title: "Idea",
      description: "A new tile",
    });
    assert.deepEqual(thrown, { ok: false, error: "Could not send request" });

    installFetch(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "queue full" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const rejected = await createHouseRequest({
      kind: "feature",
      title: "Idea",
      description: "A new tile",
      images: [],
      source: "mcp",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error, "Could not send request");
  });

  it("does not call the desk when the token is missing", async () => {
    delete process.env.DESK_INTAKE_TOKEN;
    let called = false;
    installFetch(async () => {
      called = true;
      return deskOk();
    });
    const result = await createHouseRequest({
      kind: "bug",
      title: "Broken tile",
      description: "It stays blank",
      images: [],
      source: "form",
    });
    assert.deepEqual(result, { ok: false, error: "Could not send request" });
    assert.equal(called, false);
  });
});

describe("desk token stays off the client", () => {
  it("mentions DESK_INTAKE_TOKEN only in the server module", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name === ".output") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|jsx?|mjs|css|md|html|json)$/.test(name)) files.push(path);
      }
    };
    walk(join(repoRoot, "src"));

    const hits = files
      .filter((file) => readFileSync(file, "utf8").includes("DESK_INTAKE_TOKEN"))
      .map((file) => relative(repoRoot, file))
      .filter((rel) => rel !== "src/lib/requests/desk.server.ts")
      .filter((rel) => !rel.endsWith(".test.ts"));
    assert.deepEqual(hits, []);

    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    assert.equal(readme.includes("DESK_INTAKE_TOKEN"), false);
    assert.equal(readme.includes(TEST_TOKEN), false);
    const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
    assert.equal(example.includes("DESK_INTAKE_TOKEN"), false);
    assert.equal(example.includes(TEST_TOKEN), false);

    const clientRoots = [join(repoRoot, "src/components"), join(repoRoot, "src/routes")];
    for (const root of clientRoots) {
      const pages: string[] = [];
      const walkPages = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) {
            if (name === "api") continue;
            walkPages(path);
          } else pages.push(path);
        }
      };
      walkPages(root);
      for (const file of pages) {
        const text = readFileSync(file, "utf8");
        const rel = relative(repoRoot, file);
        assert.equal(text.includes("DESK_INTAKE_TOKEN"), false, rel);
        assert.equal(text.includes("desk.shyftstudio.at"), false, rel);
        assert.equal(text.includes(TEST_TOKEN), false, rel);
      }
    }

    const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    assert.equal(store.includes("INSERT INTO house_requests"), false);
    assert.equal(store.includes("INSERT INTO house_request_images"), false);

    const route = readFileSync(new URL("../../routes/api/requests.ts", import.meta.url), "utf8");
    assert.match(route, /intakeSource\(fromMcp\)/);
    assert.equal(route.includes("DESK_INTAKE_TOKEN"), false);
    assert.equal(route.includes("house_requests"), false);
    assert.match(route, /ok: true, id: result\.id/);
  });
});
