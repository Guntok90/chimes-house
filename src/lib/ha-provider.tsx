import { useEffect, type ReactNode } from "react";
import { resumeLiveSession, useHouse } from "./house-store";

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
 * event the app notices until foreground / pageshow / focus.
 */
export function HaProvider({ children }: { children: ReactNode }) {
  const boot = useHouse((s) => s.boot);

  useEffect(() => {
    boot();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void resumeLiveSession();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      // bfcache restore always needs a fresh WS; normal show is covered too.
      if (event.persisted || document.visibilityState === "visible") {
        void resumeLiveSession();
      }
    };

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      void resumeLiveSession();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [boot]);

  return <>{children}</>;
}
