import { haToken, haUrl } from "./env.server.ts";

/**
 * Creds the logged-in browser uses to open a WebSocket to the Pi.
 * Vercel cannot reach Tailscale MagicDNS, so this never fetches Home Assistant.
 */
export type HaBootstrap = { configured: false } | { configured: true; url: string; token: string };

export function isHaConfigured(): boolean {
  return Boolean(haToken());
}

export function haBootstrap(): HaBootstrap {
  const token = haToken();
  if (!token) return { configured: false };
  return { configured: true, url: haUrl(), token };
}
