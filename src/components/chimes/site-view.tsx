import { useEffect, useRef } from "react";
import { PageTitle } from "./ui";

export function SiteView() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = () => {};
    let cancelled = false;
    void import("./energy-scene").then((m) => {
      if (cancelled || !host.current) return;
      stop = m.mountEnergyScene(host.current);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div className="space-y-4">
      <PageTitle>Site</PageTitle>
      <div className="relative overflow-hidden rounded-lg border border-line bg-paper-deep">
        <div
          ref={host}
          className="relative isolate z-0 h-[28rem] w-full overflow-hidden md:h-[calc(100dvh-10rem)]"
        />
        <p className="pointer-events-none absolute right-3 top-3 text-xs text-ink-soft md:right-4 md:top-4">
          Drag to look around
        </p>
      </div>
    </div>
  );
}
