export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/**
 * Workspace preview vs deployed app. The deployer writes GROK_PROJECT_ID on
 * every publish; the sandbox preview never has it. Single source of truth for
 * the split — gate audience, gate endpoints and connector-token semantics all
 * key off this predicate.
 */
export function isWorkspacePreview(): boolean {
  return !env("GROK_PROJECT_ID");
}

/** Dad’s Pi via Tailscale Serve — keep in sync with `DEFAULT_HA_URL` in `ha.ts`. */
const FALLBACK_HA_URL = "https://chimes-pi.tail8e29b8.ts.net";

export function haUrl(): string {
  return (env("HA_URL") ?? FALLBACK_HA_URL).replace(/\/$/, "");
}

/** Long-lived HA access token — server only. Absent → demo / browser Connect path. */
export function haToken(): string | undefined {
  return env("HA_TOKEN");
}
