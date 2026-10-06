import { createFileRoute } from "@tanstack/react-router";
import { hasValidSession } from "@/lib/family-auth/session";
import { getRequestApiToken, hasValidRequestApiToken } from "@/lib/requests/inbox-auth";
import { parseCreateRequestBody } from "@/lib/requests/parse";
import { createHouseRequest } from "@/lib/requests/desk.server";
import { intakeSource } from "@/lib/requests/types";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Create a bug or feature request.
 *
 * Auth (either):
 * - Family session cookie (Dad’s web forms at /bug and /feature)
 * - `Authorization: Bearer <CHIMES_REQUEST_API_TOKEN>` (Dad’s house MCP / REST)
 *
 * Prefer MCP tools `submit_bug` / `submit_feature` at `/api/mcp`.
 * Body: `{ kind?: "bug"|"feature", title, description, images?: [{ data, mimeType?, filename? }] }`
 * Missing `kind` is treated as `"feature"` (older `submit_request` callers).
 * `data` may be a data URL, raw base64 (+ mimeType), or an http(s) image URL.
 * The server downloads URL screenshots and forwards the request to Guy’s desk.
 * Success: `{ ok: true, id }`. Failures return a plain `error` and are not “sent”.
 */
export const Route = createFileRoute("/api/requests")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        }),
      POST: async ({ request }) => {
        const fromFamily = hasValidSession(request);
        const fromMcp = hasValidRequestApiToken(request);
        if (!fromFamily && !fromMcp) {
          if (!getRequestApiToken() && !fromFamily) {
            return json(
              {
                error:
                  "Authentication required (family session or Bearer CHIMES_REQUEST_API_TOKEN)",
              },
              401,
            );
          }
          return json({ error: "Authentication required" }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Expected JSON body" }, 400);
        }

        const parsed = await parseCreateRequestBody(body);
        if (!parsed.ok) {
          return json({ error: parsed.error }, parsed.status);
        }

        try {
          const result = await createHouseRequest({
            kind: parsed.kind,
            title: parsed.title,
            description: parsed.description,
            images: parsed.images,
            source: intakeSource(fromMcp),
          });
          if (!result.ok) {
            return json({ error: result.error }, 502);
          }
          return json({ ok: true, id: result.id });
        } catch (err) {
          console.error("[requests] create failed:", err instanceof Error ? err.name : "error");
          return json({ error: "Could not send request" }, 500);
        }
      },
    },
  },
});
