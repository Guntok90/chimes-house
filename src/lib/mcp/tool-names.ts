/** Tool names exposed at `/api/mcp` — keep in sync with `server.ts` registration. */
export const CHIMES_MCP_TOOLS = ["submit_bug", "submit_feature"] as const;
export type ChimesMcpToolName = (typeof CHIMES_MCP_TOOLS)[number];
