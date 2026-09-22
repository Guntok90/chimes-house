/**
 * Family-password site gate (Shyft / LinksView pattern).
 * Cookie proves knowledge of CHIMES_SITE_PASSWORD.
 * HA live data uses server HA_TOKEN via /api/ha/* — optional browser token stays in localStorage.
 */
import crypto from "node:crypto";

export const COOKIE_NAME = "chimes_session";
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60; // seconds

const PUBLIC_EXACT = new Set([
  "/login",
  "/api/login",
  "/api/logout",
]);

const PUBLIC_PREFIXES = [
  "/__grok/",
  "/brand/",
  "/media/",
  "/icons/",
  "/@",
  "/node_modules/",
  "/src/",
  "/favicon",
];

export function isPublicPath(pathname: string): boolean {
  if (!pathname) return false;
  if (PUBLIC_EXACT.has(pathname)) return true;
  // Leave Better Auth scaffold reachable without breaking the build.
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/** Static / Vite assets — must load for /login without a session. */
export function isAssetPath(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/assets/")) return true;
  if (pathname.startsWith("/@vite") || pathname.startsWith("/@fs")) return true;
  // File-like paths (favicon.svg, styles chunks, etc.)
  return /\.[a-z0-9]+$/i.test(pathname);
}

export function getSessionSecret(): string | null {
  const dedicated = process.env.CHIMES_SESSION_SECRET?.trim();
  if (dedicated && dedicated.length >= 16) return dedicated;

  const password = process.env.CHIMES_SITE_PASSWORD?.trim();
  if (!password) return null;

  return crypto
    .createHash("sha256")
    .update(`chimes-session-v1:${password}`)
    .digest("hex");
}

export function getExpectedPassword(): string | null {
  const password = process.env.CHIMES_SITE_PASSWORD?.trim();
  return password || null;
}

export function safeEqualString(a: string, b: string): boolean {
  const aa = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (aa.length !== bb.length) {
    crypto.timingSafeEqual(aa, aa);
    return false;
  }
  return crypto.timingSafeEqual(aa, bb);
}

export function createSessionToken(secret = getSessionSecret()): string | null {
  if (!secret) return null;
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = String(exp);
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  secret = getSessionSecret(),
): boolean {
  if (!token || !secret || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  if (!safeEqualString(sig, expected)) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && Date.now() < exp;
}

export function readCookie(
  cookieHeader: string | null | undefined,
  name = COOKIE_NAME,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearSessionCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/** Soft in-memory throttle (best-effort on serverless). */
const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 12;
const failBuckets = new Map<string, { count: number; resetAt: number }>();

/** Read a header from Web Headers (.get) or Node IncomingMessage (plain object). */
export function headerValue(
  headers: Headers | Record<string, string | string[] | undefined> | null | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    const value = (headers as Headers).get(name);
    return value == null ? null : value;
  }
  const plain = headers as Record<string, string | string[] | undefined>;
  const lower = name.toLowerCase();
  const value = plain[lower] ?? plain[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function clientKey(request: { headers?: Headers | Record<string, string | string[] | undefined> }): string {
  const fwd = headerValue(request?.headers, "x-forwarded-for");
  if (fwd) return String(fwd).split(",")[0]!.trim();
  return headerValue(request?.headers, "x-real-ip") || "unknown";
}

export function isLoginThrottled(key: string): boolean {
  const now = Date.now();
  const bucket = failBuckets.get(key);
  if (!bucket) return false;
  if (now > bucket.resetAt) {
    failBuckets.delete(key);
    return false;
  }
  return bucket.count >= FAIL_LIMIT;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const bucket = failBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    failBuckets.set(key, { count: 1, resetAt: now + FAIL_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginFailures(key: string): void {
  failBuckets.delete(key);
}

export function wantsHtml(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

export function hasValidSession(request: Request): boolean {
  const secret = getSessionSecret();
  if (!secret) return false;
  const token = readCookie(request.headers.get("cookie"));
  return Boolean(token && verifySessionToken(token, secret));
}
