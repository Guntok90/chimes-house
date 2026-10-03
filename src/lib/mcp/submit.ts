import { parseCreateRequestBody } from "../requests/parse.ts";
import type { RequestKind, StoredRequest } from "../requests/types.ts";

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

export type McpSubmitOk = { ok: true; request: StoredRequest };
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
 * Always stores `source: "mcp"`.
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
    // Lazy so unit tests can import MCP helpers without bootstrapping PGLite.
    const { createHouseRequest } = await import("../requests/store.ts");
    const request = await createHouseRequest({
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description,
      images: parsed.images,
      source: "mcp",
    });
    return { ok: true, request };
  } catch (err) {
    console.error("[mcp] submit failed:", err);
    return { ok: false, error: "Could not save request" };
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
  const { request } = result;
  const summary = {
    ok: true,
    id: request.id,
    kind: request.kind,
    title: request.title,
    imageCount: request.images.length,
    createdAt: request.createdAt,
  };
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(summary, null, 2),
      },
    ],
  };
}
