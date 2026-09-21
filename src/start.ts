import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import {
  getExpectedPassword,
  getSessionSecret,
  hasValidSession,
  isAssetPath,
  isPublicPath,
  wantsHtml,
} from "@/lib/family-auth/session";

function loginUrl(request: Request): string {
  const url = new URL(request.url);
  url.pathname = "/login";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function homeUrl(request: Request): string {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function redirect(to: string, status = 303) {
  return new Response(null, {
    status,
    headers: {
      Location: to,
      "Cache-Control": "no-store",
    },
  });
}

function unauthorizedJson() {
  return new Response(JSON.stringify({ error: "Authentication required" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      // Never send WWW-Authenticate — avoids browser Basic Auth dialog.
    },
  });
}

/**
 * Family-password gate for the whole app.
 * HTML navigations without a valid session → /login (no Basic Auth challenge).
 */
const familyGateMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  const { pathname } = url;

  if (isPublicPath(pathname) || isAssetPath(pathname)) {
    if (pathname === "/login" && hasValidSession(request)) {
      return redirect(homeUrl(request));
    }
    return next();
  }

  const expectedPassword = getExpectedPassword();
  const secret = getSessionSecret();
  if (!expectedPassword || !secret) {
    // Misconfigured deploy — never fall open, never trigger Basic dialog.
    if (wantsHtml(request) || request.method === "GET" || request.method === "HEAD") {
      if (wantsHtml(request) || pathname === "/") {
        return redirect(loginUrl(request));
      }
    }
    return unauthorizedJson();
  }

  if (hasValidSession(request)) {
    return next();
  }

  if (wantsHtml(request) || request.method === "GET" || request.method === "HEAD") {
    if (wantsHtml(request) || pathname === "/") {
      return redirect(loginUrl(request));
    }
  }

  return unauthorizedJson();
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, familyGateMiddleware],
}));
