import { parseCreateRequestBody } from "../requests/parse.ts";
import type { RequestKind } from "../requests/types.ts";

export type McpImageArg =
  | string
  | {
      data: string;
      mimeType?: string;
    };

export type McpSubmitArgs = {
  title: string;
  description: string;
  images?: McpImageArg[];
};

export type McpSubmitOk = { ok: true; id: string };
export type McpSubmitErr = { ok: false; error: string };
export type McpSubmitResult = McpSubmitOk | McpSubmitErr;

function normalizeImages(images: McpImageArg[] | undefined) {
  if (!images?.length) return undefined;
  return images.map((item) => {
    if (typeof item === "string") return { data: item };
    return { data: item.data, mimeType: item.mimeType };
  });
}

/**
 * Shared path for MCP `submit_bug` / `submit_feature` tools.
 * Always forwards with `source: "mcp"`.
 */
export async function submitHouseRequestViaMcp(
  kind: RequestKind,
  args: McpSubmitArgs,
): Promise<McpSubmitResult> {
  const parsed = await parseCreateRequestBody({
    kind,
    title: args.title,
    description: args.description,
    images: normalizeImages(args.images),
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  try {
    const { createHouseRequest } = await import("../requests/desk.server.ts");
    const result = await createHouseRequest({
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description,
      images: parsed.images,
      source: "mcp",
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, id: result.id };
  } catch (err) {
    console.error("[mcp] submit failed:", err instanceof Error ? err.name : "error");
    return { ok: false, error: "Could not send request" };
  }
}

export function mcpToolResultText(result: McpSubmitResult): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  if (!result.ok) {
    return {
      isError: true,
      content: [{ type: "text", text: result.error }],
    };
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: true, id: result.id }, null, 2),
      },
    ],
  };
}
