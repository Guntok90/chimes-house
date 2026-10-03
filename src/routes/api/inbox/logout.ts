import { createFileRoute } from "@tanstack/react-router";
import { clearInboxCookieHeader } from "@/lib/requests/inbox-auth";

export const Route = createFileRoute("/api/inbox/logout")({
  server: {
    handlers: {
      POST: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Set-Cookie": clearInboxCookieHeader(),
          },
        }),
    },
  },
});
