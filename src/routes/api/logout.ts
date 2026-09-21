import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookieHeader } from "@/lib/family-auth/session";

function json(body: { ok: boolean; error?: string }, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        }),
      POST: async () =>
        json({ ok: true }, 200, { "Set-Cookie": clearSessionCookieHeader() }),
    },
  },
});
