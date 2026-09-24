/**
 * Pure decision for foreground resume (visibility / pageshow / focus).
 * Safari iPad often kills the WS while backgrounded without a close the app
 * notices until the tab is foregrounded again — or leaves a zombie OPEN socket.
 */

export type ResumeStatus = "demo" | "connecting" | "live" | "error";
export type ResumeAction = "noop" | "probe" | "reconnect";

export function decideResume(input: {
  reconnectAllowed: boolean;
  hasCreds: boolean;
  hadLiveSession: boolean;
  status: ResumeStatus;
  socketConnected: boolean;
  bootInFlight: boolean;
}): ResumeAction {
  if (!input.reconnectAllowed || !input.hasCreds) return "noop";
  if (input.bootInFlight) return "noop";
  if (input.status === "connecting") return "noop";
  // True demo only — never been live this SPA session (401 / no creds / Use demo).
  if (input.status === "demo" && !input.hadLiveSession) return "noop";
  if (input.socketConnected) return "probe";
  return "reconnect";
}
