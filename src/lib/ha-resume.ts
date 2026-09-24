/**
 * Pure decision for foreground resume (visibility / pageshow / focus / online).
 *
 * iPad Safari often:
 * - kills the WS while backgrounded without a close JS notices until wake
 * - leaves readyState OPEN (zombie) that still looks connected
 * - wakes Tailscale/Private Relay a beat after visibilitychange
 *
 * After a real background stretch, prefer reconnect over ping — probing a
 * zombie only burns the timeout and leaves the badge on Live.
 */

export type ResumeStatus = "demo" | "connecting" | "live" | "error";
export type ResumeAction = "noop" | "probe" | "reconnect" | "rebootstrap";

/** Hidden this long → iOS has almost certainly killed or zombied the socket. */
export const FORCE_RECONNECT_HIDDEN_MS = 1_000;

/** Allow interrupting a stuck handshake (HA connect budget is 8s). */
export const STUCK_CONNECTING_MS = 10_000;

export function decideResume(input: {
  reconnectAllowed: boolean;
  hasCreds: boolean;
  hadLiveSession: boolean;
  status: ResumeStatus;
  socketConnected: boolean;
  bootInFlight: boolean;
  /** ms the page spent hidden/frozen; 0 if not from background. */
  hiddenForMs: number;
  /** ms spent in status === "connecting" (0 if not connecting). */
  connectingForMs: number;
}): ResumeAction {
  if (!input.reconnectAllowed) return "noop";
  if (input.bootInFlight) return "noop";

  // True demo only — never been live this SPA session (401 / no creds / Use demo).
  if (input.status === "demo" && !input.hadLiveSession) return "noop";

  const wantsLive =
    input.hadLiveSession ||
    input.status === "live" ||
    input.status === "error" ||
    input.status === "connecting";
  if (!wantsLive) return "noop";

  // Hard refresh recovers via /api/ha/bootstrap even when localStorage is empty
  // (Private Relay / ITP / tab discard). Resume must use the same path.
  if (!input.hasCreds) return "rebootstrap";

  // In-flight connect: only interrupt if past the handshake budget.
  if (input.status === "connecting" && input.connectingForMs < STUCK_CONNECTING_MS) {
    return "noop";
  }

  // Real backgrounding → skip probe. OPEN zombies are common on iPad Safari;
  // ping just delays Connecting and races scheduleReconnect.
  if (input.hiddenForMs >= FORCE_RECONNECT_HIDDEN_MS) {
    return "reconnect";
  }

  if (input.socketConnected) return "probe";
  return "reconnect";
}
