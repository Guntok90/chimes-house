import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { mcpToolResultText, submitHouseRequestViaMcp } from "./submit.ts";
import { CHIMES_MCP_TOOLS } from "./tool-names.ts";

const imageItemSchema = z.union([
  z.string().min(1),
  z.object({
    data: z.string().min(1),
    mimeType: z.string().optional(),
  }),
]);

const submitInputSchema = z.object({
  title: z.string().min(1).describe("Short title for Guy’s desk"),
  description: z.string().min(1).describe("What happened / what Dad wants, in plain English"),
  images: z
    .array(imageItemSchema)
    .max(6)
    .optional()
    .describe("Optional screenshots: data URLs, raw base64 (+ mimeType), or http(s) image URLs"),
});

/**
 * Build a fresh Chimes house MCP server (per request).
 *
 * Tools:
 * - submit_bug — file a Bug for Guy’s desk
 * - submit_feature — file a Feature idea for Guy’s desk
 */
export function createChimesMcpServer(): McpServer {
  const server = new McpServer({
    name: "chimes-house",
    version: "1.0.0",
  });

  server.registerTool(
    CHIMES_MCP_TOOLS[0],
    {
      title: "Submit bug",
      description:
        "File a Bug report for Chimes (Dad’s house dashboard). Guy reads it on his desk. Use when something is broken or wrong.",
      inputSchema: submitInputSchema,
    },
    async (args) => {
      const result = await submitHouseRequestViaMcp("bug", args);
      return mcpToolResultText(result);
    },
  );

  server.registerTool(
    CHIMES_MCP_TOOLS[1],
    {
      title: "Submit feature",
      description:
        "File a Feature idea for Chimes (Dad’s house dashboard). Guy reads it on his desk. Use when Dad wants something new or improved — not a breakage.",
      inputSchema: submitInputSchema,
    },
    async (args) => {
      const result = await submitHouseRequestViaMcp("feature", args);
      return mcpToolResultText(result);
    },
  );

  return server;
}

/** Stateless Streamable HTTP handler for `/api/mcp`. */
export const chimesMcpHandler = createMcpHandler(() => createChimesMcpServer(), {
  responseMode: "json",
});
