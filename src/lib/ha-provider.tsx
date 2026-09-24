import { useEffect, type ReactNode } from "react";
import { useHouse } from "./house-store";

/**
 * Boots the HA WebSocket session once for the SPA lifetime.
 *
 * Mounted in the root layout so Overview↔Home (and any soft remount of the
 * dashboard page) cannot re-enter boot and tear down a live connection.
 * The Zustand store + socket singleton already survive remounts; this keeps
 * the *lifecycle* at layout scope too.
 */
export function HaProvider({ children }: { children: ReactNode }) {
  const boot = useHouse((s) => s.boot);

  useEffect(() => {
    boot();
  }, [boot]);

  return <>{children}</>;
}
