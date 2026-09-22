import { createFileRoute } from "@tanstack/react-router";
import { fetchHaLive, isHaConfigured } from "@/lib/ha.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/ha/live")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        }),
      GET: async () => {
        // Family session is enforced by start.ts middleware (not a public path).
        if (!isHaConfigured()) {
          return json({ configured: false });
        }
        const payload = await fetchHaLive();
        if (payload.error && !payload.live) {
          return json(payload, 502);
        }
        return json(payload);
      },
    },
  },
});
