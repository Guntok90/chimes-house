import { createFileRoute } from "@tanstack/react-router";
import { hasValidInboxSession } from "@/lib/requests/inbox-auth";
import { listHouseRequests } from "@/lib/requests/store";

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

export const Route = createFileRoute("/api/inbox/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasValidInboxSession(request)) {
          return json({ error: "Authentication required" }, 401);
        }
        try {
          const requests = await listHouseRequests();
          return json({ ok: true, requests });
        } catch (err) {
          console.error("[inbox] list failed:", err);
          return json({ error: "Could not load inbox" }, 500);
        }
      },
    },
  },
});
