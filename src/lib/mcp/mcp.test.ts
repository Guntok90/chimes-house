import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mcpToolResultText } from "./submit.ts";
import { CHIMES_MCP_TOOLS } from "./tool-names.ts";

describe("mcpToolResultText", () => {
  it("formats a successful bug submit with the desk id only", () => {
    const out = mcpToolResultText({
      ok: true,
      id: "req_abc",
    });
    assert.equal(out.isError, undefined);
    assert.equal(out.content.length, 1);
    const parsed = JSON.parse(out.content[0]!.text) as Record<string, unknown>;
    assert.equal(parsed.ok, true);
    assert.equal(parsed.id, "req_abc");
    assert.equal("status" in parsed, false);
    assert.equal("note" in parsed, false);
    assert.equal("queue" in parsed, false);
  });

  it("marks parse errors as isError", () => {
    const out = mcpToolResultText({
      ok: false,
      error: "Title is required",
    });
    assert.equal(out.isError, true);
    assert.equal(out.content[0]!.text, "Title is required");
  });
});

describe("CHIMES_MCP_TOOLS", () => {
  it("exposes separate submit_bug and submit_feature tools", () => {
    assert.deepEqual([...CHIMES_MCP_TOOLS], ["submit_bug", "submit_feature"]);
  });
});
