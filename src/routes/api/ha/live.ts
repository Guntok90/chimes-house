import { createFileRoute } from "@tanstack/react-router";
import { isHaConfigured } from "@/lib/ha.server";

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
        // Do not fetch HA from here. Serverless cannot reach Tailscale.
        // Logged-in browsers use GET /api/ha/bootstrap, then a WebSocket.
        return json({
          configured: isHaConfigured(),
          transport: "browser-websocket",
        });
      },
    },
  },
});
