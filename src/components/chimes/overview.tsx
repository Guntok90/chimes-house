import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Minimize2 } from "lucide-react";
import { HOURS } from "@/lib/house";
import { useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { DayAllChart } from "./charts";
import { EnergyFlow } from "./energy-flow";

type Box = { x: number; y: number; w: number; h: number };

/** Match Tailwind `md` — freeform tiles above; stacked scroll below. */
const STACK_MQ = "(max-width: 767px)";

const MIN_W = 300;
const MIN_H = 220;
let zTop = 20;

function useStackedOverview() {
  const [stacked, setStacked] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(STACK_MQ).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(STACK_MQ);
    const sync = () => setStacked(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return stacked;
}

export function Overview({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const live = useLive();
  const stacked = useStackedOverview();

  useEffect(() => {
    const el = video.current;
    const slow = () => {
      if (!el) return;
      el.playbackRate = 0.3;
      el.defaultPlaybackRate = 0.3;
    };
    if (el) {
      slow();
      el.addEventListener("play", slow);
      el.addEventListener("loadedmetadata", slow);
      void el.play().catch(() => {});
    }
    const id = window.setTimeout(() => setReady(true), 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("play", slow);
      el?.removeEventListener("loadedmetadata", slow);
    };
  }, [onClose]);

  const flowBadge =
    live.batteryW < -30 ? "On battery" : live.solarNowW > 30 ? "Solar" : "Idle";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex flex-col overflow-hidden bg-teal-deep text-sidebar-fg transition-opacity duration-700",
        ready ? "opacity-100" : "opacity-0",
      )}
    >
      <video
        ref={video}
        className="absolute inset-0 h-full w-full object-cover"
        src="/media/house.mp4"
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
      />
      <div className="overview-wash pointer-events-none absolute inset-0" />

      <header className="relative z-20 flex shrink-0 items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:p-6 md:p-10">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <img src="/brand/mark.png" alt="" className="size-9 shrink-0 object-contain sm:size-10" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tight sm:text-lg">Chimes</div>
            <div className="text-[0.65rem] uppercase tracking-widest text-sidebar-fg/70 sm:text-xs">
              House
            </div>
          </div>
        </div>
        <OverviewClock compact={stacked} />
        <button
          type="button"
          aria-label="Close overview"
          onPointerDown={(event) => {
            if (event.button === 0) onClose();
          }}
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-md border border-sidebar-fg/25 bg-teal-deep/40 text-sidebar-fg backdrop-blur-sm"
        >
          <Minimize2 className="size-5" strokeWidth={1.7} />
        </button>
      </header>

      {stacked ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-5">
          <StackedTile title="Today" badge={`${live.solarTodayKwh} kWh solar`} tall="chart">
            <DayGraph />
          </StackedTile>
          <StackedTile title="Energy flow" badge={flowBadge} tall="flow">
            <FitFlow />
          </StackedTile>
        </div>
      ) : (
        <>
          <GlassTile
            storageKey="chimes.overview.graph"
            title="Today"
            badge={`${live.solarTodayKwh} kWh solar`}
            handleOnly
            fallback={defaultGraph}
          >
            <DayGraph />
          </GlassTile>

          <GlassTile
            storageKey="chimes.overview.flow"
            title="Energy flow"
            badge={flowBadge}
            fallback={defaultFlow}
          >
            <FitFlow />
          </GlassTile>
        </>
      )}
    </div>
  );
}

function StackedTile({
  title,
  badge,
  children,
  tall,
}: {
  title: string;
  badge: string;
  children: ReactNode;
  tall: "chart" | "flow";
}) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-sidebar-fg/20 bg-teal-deep/50 shadow-card backdrop-blur-xl",
        tall === "chart" ? "h-[min(42dvh,20rem)] min-h-[14rem]" : "h-[min(52dvh,24rem)] min-h-[17.5rem]",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-widest text-sidebar-fg/70">{title}</div>
        <div className="rounded-full border border-sidebar-fg/20 px-2 py-0.5 text-xs tabular-nums">
          {badge}
        </div>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-4">{children}</div>
    </div>
  );
}

function GlassTile({
  storageKey,
  title,
  badge,
  children,
  fallback,
  handleOnly = false,
}: {
  storageKey: string;
  title: string;
  badge: string;
  children: ReactNode;
  fallback: () => Box;
  handleOnly?: boolean;
}) {
  const tile = useRef<HTMLDivElement>(null);
  const mode = useRef<"drag" | "resize" | null>(null);
  const origin = useRef({ px: 0, py: 0, x: 0, y: 0, w: 0, h: 0 });
  const [box, setBox] = useState<Box>({ x: 40, y: 110, w: 420, h: 300 });
  const [grab, setGrab] = useState(false);
  const [z, setZ] = useState(10);

  useEffect(() => {
    const saved = readBox(storageKey);
    const stale = storageKey === "chimes.overview.flow" && saved && saved.w < 560;
    setBox(clamp(stale || !saved ? fallback() : saved));
    const onResize = () => setBox((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [storageKey, fallback]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!mode.current) return;
      const dx = event.clientX - origin.current.px;
      const dy = event.clientY - origin.current.py;
      if (mode.current === "drag") {
        setBox(
          clamp({
            x: origin.current.x + dx,
            y: origin.current.y + dy,
            w: origin.current.w,
            h: origin.current.h,
          }),
        );
      } else {
        setBox(
          clamp({
            x: origin.current.x,
            y: origin.current.y,
            w: origin.current.w + dx,
            h: origin.current.h + dy,
          }),
        );
      }
    };
    const up = (event: PointerEvent) => {
      if (!mode.current) return;
      mode.current = null;
      setGrab(false);
      try {
        tile.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      setBox((current) => {
        writeBox(storageKey, current);
        return current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [storageKey]);

  function begin(event: ReactPointerEvent, next: "drag" | "resize") {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    zTop += 1;
    setZ(zTop);
    mode.current = next;
    setGrab(true);
    origin.current = {
      px: event.clientX,
      py: event.clientY,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
    };
    tile.current?.setPointerCapture(event.pointerId);
  }

  return (
    <div
      ref={tile}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: z }}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-lg border border-sidebar-fg/20 bg-teal-deep/50 shadow-card backdrop-blur-xl",
        grab ? "cursor-grabbing" : handleOnly ? "" : "cursor-grab",
      )}
      onPointerDown={handleOnly ? undefined : (event) => begin(event, "drag")}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 px-4 py-2.5",
          handleOnly && (grab ? "cursor-grabbing" : "cursor-grab"),
        )}
        onPointerDown={handleOnly ? (event) => begin(event, "drag") : undefined}
      >
        <div className="text-xs font-medium uppercase tracking-widest text-sidebar-fg/70">
          {title}
        </div>
        <div className="rounded-full border border-sidebar-fg/20 px-2 py-0.5 text-xs tabular-nums">
          {badge}
        </div>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-4">{children}</div>
      <button
        type="button"
        aria-label={`Resize ${title}`}
        className="absolute bottom-1.5 right-1.5 z-10 size-7 cursor-nwse-resize"
        onPointerDown={(event) => begin(event, "resize")}
      >
        <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b-2 border-r-2 border-sidebar-fg/55" />
      </button>
    </div>
  );
}

function DayGraph() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <DayAllChart data={HOURS} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-1 text-xs text-sidebar-fg/70">
        <Key color="#e6d2c0" label="Solar" />
        <Key color="#ae593c" label="House" />
        <Key color="#7eb8c0" label="Battery" />
        <Key color="#c4a484" label="Grid" />
        <Key color="#f4efe8" label="SOC" dashed />
      </div>
    </div>
  );
}

function Key({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-px w-3.5"
        style={{ borderTop: `${dashed ? "1.5px dashed" : "2px solid"} ${color}` }}
      />
      {label}
    </span>
  );
}

function FitFlow() {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(el.clientWidth / 1000, el.clientHeight / 560);
      setScale(s);
      setOffset({
        x: (el.clientWidth - 1000 * s) / 2,
        y: (el.clientHeight - 560 * s) / 2,
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={host} className="h-full w-full overflow-hidden">
      <div
        className="origin-top-left"
        style={{
          width: 1000,
          height: 560,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <EnergyFlow tone="glass" bare />
      </div>
    </div>
  );
}

function defaultGraph(): Box {
  const w = Math.min(560, window.innerWidth - 48);
  const h = Math.min(340, window.innerHeight - 160);
  return { x: 28, y: 96, w, h };
}

function defaultFlow(): Box {
  const w = Math.min(680, window.innerWidth - 56);
  const h = Math.min(480, window.innerHeight - 120);
  return {
    x: Math.max(24, window.innerWidth - w - 28),
    y: Math.max(88, window.innerHeight - h - 28),
    w,
    h,
  };
}

function clamp(box: Box): Box {
  const w = Math.min(Math.max(MIN_W, box.w), Math.max(MIN_W, window.innerWidth - 24));
  const h = Math.min(Math.max(MIN_H, box.h), Math.max(MIN_H, window.innerHeight - 24));
  return {
    w,
    h,
    x: Math.min(Math.max(-w + 72, box.x), window.innerWidth - 72),
    y: Math.min(Math.max(0, box.y), window.innerHeight - 56),
  };
}

function readBox(key: string): Box | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Box;
    if (![parsed.x, parsed.y, parsed.w, parsed.h].every(Number.isFinite)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBox(key: string, box: Box) {
  try {
    localStorage.setItem(key, JSON.stringify(box));
  } catch {
    /* private mode */
  }
}

function OverviewClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: compact ? "short" : "long",
    day: "numeric",
    month: compact ? "short" : "long",
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  const hello = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  return (
    <div className="min-w-0 flex-1 px-1 text-center sm:flex-none sm:px-0">
      <div
        className={cn(
          "font-medium tracking-tight tabular-nums leading-none",
          compact ? "text-2xl" : "text-3xl md:text-4xl",
        )}
      >
        {time}
      </div>
      <div
        className={cn(
          "mt-1 text-sidebar-fg/75",
          compact ? "truncate text-[0.65rem] leading-snug" : "text-xs md:text-sm",
        )}
      >
        {date} · {hello}
      </div>
    </div>
  );
}
