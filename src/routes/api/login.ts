import { createFileRoute } from "@tanstack/react-router";
import {
  clearLoginFailures,
  clientKey,
  createSessionToken,
  getExpectedPassword,
  getSessionSecret,
  isLoginThrottled,
  recordLoginFailure,
  safeEqualString,
  sessionCookieHeader,
} from "@/lib/family-auth/session";

function json(
  body: { ok: boolean; error?: string },
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function readPassword(request: Request): Promise<string> {
  try {
    const data = (await request.json()) as { password?: unknown };
    return typeof data?.password === "string" ? data.password : "";
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        }),
      POST: async ({ request }) => {
        const expected = getExpectedPassword();
        const secret = getSessionSecret();
        if (!expected || !secret) {
          return json({ ok: false, error: "Site password is not configured" }, 503);
        }

        const key = clientKey(request);
        if (isLoginThrottled(key)) {
          return json(
            { ok: false, error: "Too many attempts. Wait a minute and try again." },
            429,
          );
        }

        const password = await readPassword(request);
        if (!password) {
          recordLoginFailure(key);
          return json({ ok: false, error: "Enter the family password" }, 400);
        }

        if (!safeEqualString(password, expected)) {
          recordLoginFailure(key);
          return json({ ok: false, error: "Wrong password" }, 401);
        }

        clearLoginFailures(key);
        const token = createSessionToken(secret);
        if (!token) {
          return json({ ok: false, error: "Could not create session" }, 500);
        }

        return json({ ok: true }, 200, { "Set-Cookie": sessionCookieHeader(token) });
      },
    },
  },
});
