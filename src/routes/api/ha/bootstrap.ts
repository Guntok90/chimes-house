import { createFileRoute } from "@tanstack/react-router";
import { hasValidSession } from "@/lib/family-auth/session";
import { haBootstrap } from "@/lib/ha.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Cookie",
    },
  });
}

export const Route = createFileRoute("/api/ha/bootstrap")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        }),
      GET: async ({ request }) => {
        // Family cookie is also enforced by start.ts. Checked here so a future
        // public-path mistake cannot hand out HA_TOKEN.
        if (!hasValidSession(request)) {
          return json({ error: "Authentication required" }, 401);
        }
        return json(haBootstrap());
      },
    },
  },
});
