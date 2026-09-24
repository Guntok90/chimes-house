import { useEffect, type ReactNode } from "react";
import { notePageHidden, resumeLiveSession, useHouse } from "./house-store";

/** While visible, periodically probe/reconnect in case a visibility event was missed. */
const LIVE_WATCHDOG_MS = 20_000;

/**
 * Boots the HA WebSocket session once for the SPA lifetime.
 *
 * Mounted in the root layout so Overview↔Home (and any soft remount of the
 * dashboard page) cannot re-enter boot and tear down a live connection.
 * The Zustand store + socket singleton already survive remounts; this keeps
 * the *lifecycle* at layout scope too.
 *
 * Also resumes the live session when the tab becomes visible again — iPad
 * Safari often suspends the WebSocket while backgrounded without a close
 * event the app notices until foreground / pageshow / focus / online.
 */
export function HaProvider({ children }: { children: ReactNode }) {
  const boot = useHouse((s) => s.boot);

  useEffect(() => {
    boot();

    const onHidden = () => {
      notePageHidden();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        onHidden();
        return;
      }
      void resumeLiveSession();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache restore always needs a fresh WS; normal show is covered too.
      if (event.persisted || document.visibilityState === "visible") {
        void resumeLiveSession();
      }
    };

    const onPageHide = () => {
      onHidden();
    };

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      void resumeLiveSession();
    };

    const onOnline = () => {
      // Tailscale / Private Relay often flip offline→online after app switch.
      if (document.visibilityState !== "visible") return;
      void resumeLiveSession();
    };

    // Page Lifecycle (Chromium; harmless no-ops where unsupported).
    const onFreeze = () => {
      onHidden();
    };
    const onResume = () => {
      void resumeLiveSession();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);

    const watchdog = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void resumeLiveSession();
    }, LIVE_WATCHDOG_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
      window.clearInterval(watchdog);
    };
  }, [boot]);

  return <>{children}</>;
}
