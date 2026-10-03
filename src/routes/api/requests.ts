import { createFileRoute } from "@tanstack/react-router";
import { hasValidSession } from "@/lib/family-auth/session";
import {
  getRequestApiToken,
  hasValidRequestApiToken,
} from "@/lib/requests/inbox-auth";
import { parseCreateRequestBody } from "@/lib/requests/parse";
import { createHouseRequest } from "@/lib/requests/store";

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
 * - `Authorization: Bearer <CHIMES_REQUEST_API_TOKEN>` (Dad’s house MCP)
 *
 * Body: `{ kind: "bug"|"feature", title, description, images?: [{ data, mimeType? }] }`
 * `data` may be a data URL, raw base64 (+ mimeType), or an http(s) image URL.
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
          const stored = await createHouseRequest({
            kind: parsed.kind,
            title: parsed.title,
            description: parsed.description,
            images: parsed.images,
            source: fromMcp && !fromFamily ? "mcp" : "web",
          });
          return json({ ok: true, request: stored }, 201);
        } catch (err) {
          console.error("[requests] create failed:", err);
          return json({ error: "Could not save request" }, 500);
        }
      },
    },
  },
});
