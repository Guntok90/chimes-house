/**
 * Guy-only inbox gate — separate from Dad’s family site password.
 * Cookie proves knowledge of GUY_INBOX_PASSWORD.
 */
import crypto from "node:crypto";
import { safeEqualString } from "../family-auth/session.ts";

export const INBOX_COOKIE_NAME = "guy_inbox_session";
export const INBOX_SESSION_DAYS = 14;
export const INBOX_SESSION_MAX_AGE = INBOX_SESSION_DAYS * 24 * 60 * 60;

export function getInboxPassword(): string | null {
  const password = process.env.GUY_INBOX_PASSWORD?.trim();
  return password || null;
}

export function getInboxSessionSecret(): string | null {
  const dedicated = process.env.GUY_INBOX_SESSION_SECRET?.trim();
  if (dedicated && dedicated.length >= 16) return dedicated;

  const password = getInboxPassword();
  if (!password) return null;

  return crypto
    .createHash("sha256")
    .update(`chimes-inbox-v1:${password}`)
    .digest("hex");
}

export function createInboxSessionToken(
  secret = getInboxSessionSecret(),
): string | null {
  if (!secret) return null;
  const exp = Date.now() + INBOX_SESSION_MAX_AGE * 1000;
  const payload = String(exp);
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyInboxSessionToken(
  token: string | null | undefined,
  secret = getInboxSessionSecret(),
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

export function inboxCookieHeader(token: string): string {
  return [
    `${INBOX_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${INBOX_SESSION_MAX_AGE}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearInboxCookieHeader(): string {
  return [
    `${INBOX_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function readInboxCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    if (key !== INBOX_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

export function hasValidInboxSession(request: Request): boolean {
  const secret = getInboxSessionSecret();
  if (!secret) return false;
  const token = readInboxCookie(request.headers.get("cookie"));
  return Boolean(token && verifyInboxSessionToken(token, secret));
}

/** Shared secret for Dad’s house MCP → /api/mcp tools + POST /api/requests */
export function getRequestApiToken(): string | null {
  const token = process.env.CHIMES_REQUEST_API_TOKEN?.trim();
  return token || null;
}

export function hasValidRequestApiToken(request: Request): boolean {
  const expected = getRequestApiToken();
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return false;
  return safeEqualString(match[1]!.trim(), expected);
}
