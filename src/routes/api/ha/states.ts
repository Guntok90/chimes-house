import { createFileRoute } from "@tanstack/react-router";
import { fetchHaStates, isHaConfigured } from "@/lib/ha.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/ha/states")({
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
          return json({ configured: false, states: [] });
        }
        try {
          const states = await fetchHaStates();
          return json({ configured: true, states });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Could not reach Home Assistant";
          return json({ configured: true, error: message, states: [] }, 502);
        }
      },
    },
  },
});
