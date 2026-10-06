import { createFileRoute } from "@tanstack/react-router";
import { getRequestApiToken, hasValidRequestApiToken } from "@/lib/requests/inbox-auth";
import { safeEqualString } from "@/lib/family-auth/session";
import { chimesMcpHandler } from "@/lib/mcp/server";

type AuthInfo = {
  token: string;
  clientId: string;
  scopes: string[];
};

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Authentication required" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Bearer realm="chimes-house-mcp"',
    },
  });
}

function authInfoFromRequest(request: Request): AuthInfo | null {
  if (!hasValidRequestApiToken(request)) return null;
  const expected = getRequestApiToken();
  if (!expected) return null;
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const token = match?.[1]?.trim() ?? "";
  if (!token || !safeEqualString(token, expected)) return null;
  return {
    token,
    clientId: "chimes-request-api",
    scopes: ["chimes:submit"],
  };
}

async function handleMcp(request: Request): Promise<Response> {
  if (!getRequestApiToken()) {
    return unauthorized();
  }
  const authInfo = authInfoFromRequest(request);
  if (!authInfo) {
    return unauthorized();
  }
  return chimesMcpHandler.fetch(request, { authInfo });
}

/**
 * Dad’s house MCP — Streamable HTTP.
 *
 * Auth: `Authorization: Bearer <CHIMES_REQUEST_API_TOKEN>`
 *
 * Tools:
 * - `submit_bug` — kind=bug, forwarded to Guy’s desk
 * - `submit_feature` — kind=feature, forwarded to Guy’s desk
 *
 * Cursor / Claude config example:
 * `{ "url": "https://<host>/api/mcp", "headers": { "Authorization": "Bearer …" } }`
 */
export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Cache-Control": "no-store",
            Allow: "GET, POST, DELETE, OPTIONS",
          },
        }),
      GET: async ({ request }) => handleMcp(request),
      POST: async ({ request }) => handleMcp(request),
      DELETE: async ({ request }) => handleMcp(request),
    },
  },
});
