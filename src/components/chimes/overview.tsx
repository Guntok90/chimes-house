import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Minimize2 } from "lucide-react";
import { lastHoursWindow } from "@/lib/ha-history";
import {
  HOURS,
  POND_TEMP_DAY,
  POND_TEMP_MONTH,
  POND_TEMP_WEEK,
  POND_TEMP_YEAR,
  WEEK,
  YEAR,
  lastDays,
  usesDemoCharts,
  type DayPoint,
  type HourPoint,
  type TempPoint,
} from "@/lib/house";
import { useHouse, useLive, useWeather } from "@/lib/house-store";
import {
  GLASS_OPACITY_DEFAULT,
  GLASS_OPACITY_KEY,
  GLASS_OPACITY_MAX,
  GLASS_OPACITY_MIN,
  OVERVIEW_FLOW_BOX_KEY,
  OVERVIEW_GRAPH_BOX_KEY,
  OVERVIEW_POND_BOX_KEY,
  OVERVIEW_WEATHER_BOX_KEY,
  clampGlassOpacity,
  clampOverviewBox,
  glassBackdropBlurPx,
  glassFill,
  nudgeOverviewBoxPosition,
  prefersManualOnlyBoxResize,
  persistOverviewBox,
  readOverviewBox,
  resolveOverviewBox,
  boxesNearlyEqual,
  type OverviewBox,
} from "@/lib/overview-glass";
import { cn } from "@/lib/utils";
import {
  DEMO_WEATHER,
  formatWeatherNumber,
  overlayReadings,
  type WeatherLive,
  type WeatherReading,
} from "@/lib/weather";
import {
  ChartScroll,
  DayAllChart,
  EnergyMetersChart,
  METER_COLORS,
  PondTempChart,
} from "./charts";
import { EnergyFlow } from "./energy-flow";
import { NoHistoryYet } from "./no-history";

type Box = OverviewBox;
type ChartRange = "day" | "week" | "month" | "year";
type PondRange = "day" | "week" | "month" | "year";

/**
 * Stack only on phones. iPad Mini portrait is ~744 CSS px — it must stay on the
 * freeform ambient layout (drag/resize), not the phone stack.
 * Match Tailwind `sm` (640px).
 */
const STACK_MQ = "(max-width: 639px)";

let zTop = 20;

const RANGE_OPTS: { id: ChartRange; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** Clear Dad-facing labels — Day = 24h, Week = 7 days, Month = 28 days, Year = 12 months. */
const POND_RANGE_OPTS: { id: PondRange; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function readGlassOpacity(): number {
  try {
    const raw = localStorage.getItem(GLASS_OPACITY_KEY);
    if (!raw) return GLASS_OPACITY_DEFAULT;
    return clampGlassOpacity(Number(raw));
  } catch {
    return GLASS_OPACITY_DEFAULT;
  }
}

function writeGlassOpacity(pct: number) {
  try {
    localStorage.setItem(GLASS_OPACITY_KEY, String(clampGlassOpacity(pct)));
  } catch {
    /* private mode */
  }
}

function useGlassOpacity() {
  const [opacity, setOpacity] = useState(GLASS_OPACITY_DEFAULT);

  useEffect(() => {
    setOpacity(readGlassOpacity());
  }, []);

  function setAndPersist(next: number) {
    const clamped = clampGlassOpacity(next);
    setOpacity(clamped);
    writeGlassOpacity(clamped);
  }

  return [opacity, setAndPersist] as const;
}

function viewportNow() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function detectManualOnlyResize() {
  if (typeof window === "undefined") return false;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return prefersManualOnlyBoxResize({
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    pointerCoarse: coarse,
    userAgent: navigator.userAgent,
  });
}


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
  const [range, setRange] = useState<ChartRange>("day");
  const [pondRange, setPondRange] = useState<PondRange>("day");
  const [glassOpacity, setGlassOpacity] = useGlassOpacity();
  const [tileGrabbing, setTileGrabbing] = useState(false);
  const live = useLive();
  const liveWeather = useWeather();
  const status = useHouse((s) => s.status);
  const weather = usesDemoCharts(status) ? DEMO_WEATHER : liveWeather;
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
  const graphTitle =
    range === "day" ? "Day" : range === "week" ? "Week" : range === "month" ? "Month" : "Year";
  // Day = last 24h · Week = last 7 days · Month = last 28 days · Year = 12 months.
  const graphBadge =
    range === "day"
      ? `${live.solarTodayKwh} kWh solar · 24h`
      : range === "week"
        ? "7 days"
        : range === "month"
          ? "28 days"
          : "12 months";
  const pondBadge =
    live.pondWaterTempC != null || live.gardenTempC != null
      ? [
          live.pondWaterTempC != null ? `${live.pondWaterTempC.toFixed(1)}° water` : null,
          live.gardenTempC != null ? `${live.gardenTempC.toFixed(1)}° air` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : pondRange === "day"
        ? "24 hours"
        : pondRange === "week"
          ? "7 days"
          : pondRange === "month"
            ? "28 days"
            : "12 months";
  const outdoor = weather.byKey.outdoorTemp;
  const weatherBadge =
    outdoor && !outdoor.unavailable && outdoor.value != null
      ? `${formatWeatherNumber(outdoor)}${outdoor.unit ? ` ${outdoor.unit}` : ""}`
      : "Station";
  const tileStyle = {
    backgroundColor: glassFill(glassOpacity),
    backdropFilter: `blur(${glassBackdropBlurPx(glassOpacity)}px)`,
    WebkitBackdropFilter: `blur(${glassBackdropBlurPx(glassOpacity)}px)`,
  } satisfies CSSProperties;

  return (
    <div
      className={cn(
        "overview-ambient fixed inset-0 z-[80] flex h-dvh max-h-dvh flex-col overflow-hidden bg-teal-deep text-sidebar-fg transition-opacity duration-700",
        ready ? "opacity-100" : "opacity-0",
        tileGrabbing && "overview-ambient--grabbing",
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

      <header
        className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-3 sm:gap-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
          paddingBottom: "1rem",
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <img src="/brand/mark.png" alt="" className="size-9 shrink-0 object-contain sm:size-10" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tight sm:text-lg">Chimes</div>
            <div className="text-[0.65rem] uppercase tracking-widest text-sidebar-fg/70 sm:text-xs">
              House
            </div>
          </div>
          <RateWindowBadge offPeak={live.offPeak} compact={stacked} />
        </div>
        <OverviewClock compact={stacked} />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <GlassOpacitySlider value={glassOpacity} onChange={setGlassOpacity} compact={stacked} />
          <button
            type="button"
            aria-label="Close overview"
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              onClose();
            }}
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-md border border-sidebar-fg/25 bg-teal-deep/40 text-sidebar-fg backdrop-blur-sm"
          >
            <Minimize2 className="size-5" strokeWidth={1.7} />
          </button>
        </div>
      </header>

      {stacked ? (
        <div
          className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain"
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <StackedTile title={graphTitle} badge={graphBadge} tall="chart" style={tileStyle}>
            <OverviewGraph range={range} onRangeChange={setRange} />
          </StackedTile>
          <StackedTile title="Weather" badge={weatherBadge} tall="chart" style={tileStyle}>
            <OverviewWeatherPanel weather={weather} />
          </StackedTile>
          <StackedTile
            title="Fish pond water temp"
            badge={pondBadge}
            tall="chart"
            style={tileStyle}
          >
            <OverviewPondGraph range={pondRange} onRangeChange={setPondRange} />
          </StackedTile>
          <StackedTile title="Energy flow" badge={flowBadge} tall="flow" style={tileStyle}>
            <FitFlow />
          </StackedTile>
        </div>
      ) : (
        <>
          <GlassTile
            storageKey={OVERVIEW_GRAPH_BOX_KEY}
            title={graphTitle}
            badge={graphBadge}
            handleOnly
            fallback={defaultGraph}
            style={tileStyle}
            onGrabChange={setTileGrabbing}
          >
            <OverviewGraph range={range} onRangeChange={setRange} />
          </GlassTile>

          <GlassTile
            storageKey={OVERVIEW_WEATHER_BOX_KEY}
            title="Weather"
            badge={weatherBadge}
            handleOnly
            fallback={defaultWeather}
            style={tileStyle}
            onGrabChange={setTileGrabbing}
          >
            <OverviewWeatherPanel weather={weather} />
          </GlassTile>

          <GlassTile
            storageKey={OVERVIEW_POND_BOX_KEY}
            title="Fish pond water temp"
            badge={pondBadge}
            handleOnly
            fallback={defaultPond}
            style={tileStyle}
            onGrabChange={setTileGrabbing}
          >
            <OverviewPondGraph range={pondRange} onRangeChange={setPondRange} />
          </GlassTile>

          <GlassTile
            storageKey={OVERVIEW_FLOW_BOX_KEY}
            title="Energy flow"
            badge={flowBadge}
            fallback={defaultFlow}
            style={tileStyle}
            onGrabChange={setTileGrabbing}
          >
            <FitFlow />
          </GlassTile>
        </>
      )}
    </div>
  );
}

/** Live Octopus / off-peak window — green Cheap, amber Peak. Updates with WS bootstrap. */
function RateWindowBadge({ offPeak, compact = false }: { offPeak: boolean; compact?: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={offPeak ? "Cheap rate window" : "Peak rate window"}
      className={cn(
        "shrink-0 rounded-md border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-widest tabular-nums",
        compact ? "px-1.5 py-0.5 text-[0.6rem]" : "sm:px-2.5 sm:text-xs",
        offPeak
          ? "border-emerald-300/45 bg-emerald-500/30 text-emerald-100"
          : "border-amber-300/50 bg-amber-500/35 text-amber-50",
      )}
    >
      {offPeak ? "Cheap" : "Peak"}
    </span>
  );
}

function GlassOpacitySlider({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md border border-sidebar-fg/20 bg-teal-deep/40 px-2.5 py-1.5 backdrop-blur-sm",
        compact ? "max-w-[11rem]" : "max-w-[14rem]",
      )}
    >
      <span className="shrink-0 text-[0.65rem] uppercase tracking-widest text-sidebar-fg/70">
        Glass
      </span>
      <input
        type="range"
        min={GLASS_OPACITY_MIN}
        max={GLASS_OPACITY_MAX}
        step={1}
        value={value}
        aria-label="Info box glass opacity"
        aria-valuemin={GLASS_OPACITY_MIN}
        aria-valuemax={GLASS_OPACITY_MAX}
        aria-valuenow={value}
        aria-valuetext={`${value} percent`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="overview-glass-slider h-1.5 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-sidebar-fg/25 accent-sand"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-sidebar-fg/85">{value}%</span>
    </label>
  );
}

function StackedTile({
  title,
  badge,
  children,
  tall,
  style,
}: {
  title: string;
  badge: string;
  children: ReactNode;
  tall: "chart" | "flow";
  style: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-sidebar-fg/20 shadow-card",
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
  style,
  onGrabChange,
}: {
  storageKey: string;
  title: string;
  badge: string;
  children: ReactNode;
  fallback: () => Box;
  handleOnly?: boolean;
  style: CSSProperties;
  /** Notify ambient shell so it can set touch-action:none during a gesture. */
  onGrabChange?: (grabbing: boolean) => void;
}) {
  const tile = useRef<HTMLDivElement>(null);
  const mode = useRef<"drag" | "resize" | null>(null);
  const origin = useRef({ px: 0, py: 0, x: 0, y: 0, w: 0, h: 0 });
  const manualOnly = useRef(false);
  /** Sync geometry for persist — React state can lag the last pointermove. */
  const boxRef = useRef<Box | null>(null);
  /** True after the user starts a drag/resize — avoids open/close rewriting saves. */
  const dirty = useRef(false);
  const activePointer = useRef<number | null>(null);
  const onGrabChangeRef = useRef(onGrabChange);
  onGrabChangeRef.current = onGrabChange;
  const [box, setBox] = useState<Box>(() => {
    // First paint must use saved layout when present — hardcoded defaults here
    // previously raced pointerup and could overwrite localStorage on open.
    manualOnly.current = detectManualOnlyResize();
    const vp = typeof window !== "undefined" ? viewportNow() : { width: 1024, height: 768 };
    const saved = readOverviewBox(storageKey);
    const fb =
      typeof window !== "undefined" ? fallback() : { x: 40, y: 110, w: 420, h: 300 };
    const initial = resolveOverviewBox(saved, fb, vp, { manualOnly: manualOnly.current });
    boxRef.current = initial;
    return initial;
  });
  const [grab, setGrab] = useState(false);
  const [z, setZ] = useState(10);

  useEffect(() => {
    // Re-resolve after mount in case Safari chrome changed the viewport between
    // first paint and effect. Prefer any save (localStorage or cookie backup);
    // never replace a good boxRef with hardcoded defaults when storage is empty
    // only because auth remounted — cookie restore runs inside readOverviewBox.
    manualOnly.current = detectManualOnlyResize();
    const saved = readOverviewBox(storageKey);
    const vp = viewportNow();
    const fb = fallback();
    // If first paint already restored a save, only nudge/clamp for viewport —
    // do not re-seed from fallback when saved is somehow briefly null.
    const seed = saved ?? (boxRef.current && !boxesNearlyEqual(boxRef.current, fb) ? boxRef.current : null);
    const initial = resolveOverviewBox(seed, fb, vp, {
      manualOnly: manualOnly.current,
    });
    boxRef.current = initial;
    setBox(initial);

    const onResize = () => {
      const nextVp = viewportNow();
      const current = boxRef.current;
      if (!current) return;
      // iPad / touch: never auto-mutate size (orientation, safe-area, keyboard).
      // Desktop: full clamp so boxes stay usable after a window shrink.
      // Do not write here — transient Safari chrome sizes must not overwrite
      // a good save; pointerup / pagehide / unmount flush boxRef instead.
      const next = manualOnly.current
        ? nudgeOverviewBoxPosition(current, nextVp)
        : clampOverviewBox(current, nextVp);
      boxRef.current = next;
      setBox(next);
    };

    /** Only after user drag/resize (or mid-gesture) — never on plain open/close. */
    const flush = () => {
      const current = boxRef.current;
      if (!current) return;
      if (!dirty.current && !mode.current) return;
      persistOverviewBox(storageKey, current, { fallback: fallback() });
      dirty.current = false;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      // Close Overview / stacked swap / missed pointerup — keep user geometry.
      flush();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [storageKey, fallback]);

  useEffect(() => {
    const applyMove = (clientX: number, clientY: number) => {
      if (!mode.current) return;
      const dx = clientX - origin.current.px;
      const dy = clientY - origin.current.py;
      const vp = viewportNow();
      let next: Box;
      if (mode.current === "drag") {
        const draft = {
          x: origin.current.x + dx,
          y: origin.current.y + dy,
          w: origin.current.w,
          h: origin.current.h,
        };
        // Touch/iPad: drag must not shrink the box via viewport clamp.
        next = manualOnly.current
          ? nudgeOverviewBoxPosition(draft, vp)
          : clampOverviewBox(draft, vp);
      } else {
        next = clampOverviewBox(
          {
            x: origin.current.x,
            y: origin.current.y,
            w: origin.current.w + dx,
            h: origin.current.h + dy,
          },
          vp,
        );
      }
      boxRef.current = next;
      setBox(next);
    };

    const endGesture = (pointerId?: number) => {
      if (!mode.current) return;
      if (
        pointerId != null &&
        activePointer.current != null &&
        pointerId !== activePointer.current
      ) {
        return;
      }
      mode.current = null;
      activePointer.current = null;
      setGrab(false);
      onGrabChangeRef.current?.(false);
      try {
        if (pointerId != null) tile.current?.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      // Prefer boxRef (updated synchronously in move) over a lagged setState.
      // Denylist: refuse to overwrite a custom save with hardcoded defaults.
      const current = boxRef.current;
      if (current) {
        persistOverviewBox(storageKey, current, { fallback: fallback() });
        dirty.current = false;
      }
    };

    const move = (event: PointerEvent) => {
      if (!mode.current) return;
      if (activePointer.current != null && event.pointerId !== activePointer.current) return;
      // Keep the gesture alive on iPad — Safari will otherwise pan/cancel.
      if (event.cancelable) event.preventDefault();
      applyMove(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      endGesture(event.pointerId);
    };

    /**
     * Fallback for iPad Safari builds where pointermove stops after a short
     * drag (gesture claimed as scroll) even with touch-action:none. Non-passive
     * touchmove + preventDefault keeps the finger driving our geometry.
     */
    const touchMove = (event: TouchEvent) => {
      if (!mode.current) return;
      if (event.cancelable) event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      applyMove(touch.clientX, touch.clientY);
    };
    const touchEnd = () => {
      endGesture(activePointer.current ?? undefined);
    };

    const opts: AddEventListenerOptions = { capture: true };
    const touchOpts: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("pointerup", up, opts);
    window.addEventListener("pointercancel", up, opts);
    window.addEventListener("lostpointercapture", up, opts);
    window.addEventListener("touchmove", touchMove, touchOpts);
    window.addEventListener("touchend", touchEnd, opts);
    window.addEventListener("touchcancel", touchEnd, opts);
    return () => {
      window.removeEventListener("pointermove", move, opts);
      window.removeEventListener("pointerup", up, opts);
      window.removeEventListener("pointercancel", up, opts);
      window.removeEventListener("lostpointercapture", up, opts);
      window.removeEventListener("touchmove", touchMove, touchOpts);
      window.removeEventListener("touchend", touchEnd, opts);
      window.removeEventListener("touchcancel", touchEnd, opts);
    };
  }, [storageKey, fallback]);

  function begin(event: ReactPointerEvent, next: "drag" | "resize") {
    // Mouse: primary button only. Touch/pen often report button 0; some Safari
    // builds are inconsistent — do not reject non-mouse on button.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (mode.current) return;
    event.preventDefault();
    event.stopPropagation();
    zTop += 1;
    setZ(zTop);
    mode.current = next;
    dirty.current = true;
    activePointer.current = event.pointerId;
    setGrab(true);
    onGrabChangeRef.current?.(true);
    const current = boxRef.current ?? box;
    origin.current = {
      px: event.clientX,
      py: event.clientY,
      x: current.x,
      y: current.y,
      w: current.w,
      h: current.h,
    };
    try {
      tile.current?.setPointerCapture(event.pointerId);
    } catch {
      /* Safari may throw if the pointer is already gone */
    }
  }

  return (
    <div
      ref={tile}
      style={{ ...style, left: box.x, top: box.y, width: box.w, height: box.h, zIndex: z }}
      className={cn(
        "overview-glass-tile absolute flex flex-col overflow-hidden rounded-lg border border-sidebar-fg/20 shadow-card",
        !handleOnly && "overview-tile-drag-surface",
        grab ? "cursor-grabbing" : handleOnly ? "" : "cursor-grab",
      )}
      onPointerDown={handleOnly ? undefined : (event) => begin(event, "drag")}
    >
      <div
        className={cn(
          "overview-tile-drag-handle flex shrink-0 items-center justify-between gap-3 px-4 py-2.5",
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
      {/* Extra bottom pad so ChartScroll does not sit under the resize hit target. */}
      <div className="min-h-0 flex-1 px-2 pb-10">{children}</div>
      <button
        type="button"
        aria-label={`Resize ${title}`}
        className="overview-tile-resize absolute bottom-0 right-0 z-20 cursor-nwse-resize border-0 bg-transparent p-0"
        onPointerDown={(event) => begin(event, "resize")}
      />
    </div>
  );
}

function OverviewGraph({
  range,
  onRangeChange,
}: {
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
}) {
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const historyStatus = useHouse((s) => s.historyStatus);
  const historyHours = useHouse((s) => s.historyHours);
  const historyWeek = useHouse((s) => s.historyWeek);
  const historyMonth = useHouse((s) => s.historyMonth);
  const historyYear = useHouse((s) => s.historyYear);
  const liveMode = !usesDemoCharts(status);

  const showCars = !liveMode || Boolean(map.zappiW);

  // Day = trailing 24h · Week = 7 days · Month = last 28 days · Year = 12 months.
  const hours: HourPoint[] = liveMode
    ? lastHoursWindow(historyHours, 24)
    : lastHoursWindow(HOURS, 24);
  const weekRows: DayPoint[] = liveMode
    ? historyWeek.length
      ? historyWeek
      : historyMonth.slice(-7)
    : WEEK;
  const monthRows: DayPoint[] = liveMode ? historyMonth : lastDays(28);
  const yearRows: DayPoint[] = liveMode ? historyYear : YEAR;

  const energyData =
    range === "week"
      ? weekRows
      : range === "month"
        ? monthRows
        : range === "year"
          ? yearRows
          : null;

  const ready = useMemo(() => {
    if (!liveMode) return true;
    if (historyStatus === "loading" || historyStatus === "idle") return false;
    if (range === "day") return historyStatus === "ready" && hours.length > 0;
    if (range === "week") return historyStatus === "ready" && weekRows.length > 0;
    if (range === "month") return historyStatus === "ready" && monthRows.length > 0;
    return historyStatus === "ready" && yearRows.length > 0;
  }, [
    liveMode,
    historyStatus,
    range,
    hours.length,
    weekRows.length,
    monthRows.length,
    yearRows.length,
  ]);

  // Day (24h) + Week (7d) fit the tile — no forced horizontal scrubber.
  // Month / Year keep a wider scroll host when the series is dense.
  const scrollWidth = useMemo(() => {
    if (range === "day" || range === "week") return 0;
    if (range === "month") return Math.max(monthRows.length * 28, 420);
    return Math.max(yearRows.length * 56, 420);
  }, [range, monthRows.length, yearRows.length]);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex shrink-0 items-center justify-between gap-2 px-2">
        <GlassRangeTabs value={range} onChange={onRangeChange} />
      </div>
      {!ready ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center px-2">
          <NoHistoryYet label={historyStatus === "loading" ? "graph (loading)" : "graph"} />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1">
            {range === "day" ? (
              <ChartScroll widthPx={scrollWidth}>
                <DayAllChart data={hours.length ? hours : HOURS} showCars={showCars} />
              </ChartScroll>
            ) : energyData && energyData.length > 0 ? (
              <ChartScroll widthPx={scrollWidth}>
                <EnergyMetersChart data={energyData} showCars={showCars} />
              </ChartScroll>
            ) : (
              <div className="flex h-full flex-col justify-center px-2">
                <NoHistoryYet label={`${range} graph`} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-0.5 text-xs text-sidebar-fg/70">
            <Key color={METER_COLORS.solar} label="Solar" />
            <Key color={METER_COLORS.house} label="House" />
            <Key color={METER_COLORS.battery} label="Battery" />
            <Key color={METER_COLORS.grid} label="Grid" />
            {showCars ? <Key color={METER_COLORS.cars} label="Cars (+ into vehicle)" /> : null}
            <Key color={METER_COLORS.soc} label="SOC" dashed />
          </div>
        </>
      )}
    </div>
  );
}

function GlassRangeTabs({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (v: ChartRange) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-sidebar-fg/20 bg-teal-deep/40 p-0.5"
      role="tablist"
      aria-label="Chart range"
    >
      {RANGE_OPTS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "min-h-9 min-w-[2.75rem] rounded-sm px-2.5 text-[0.75rem] font-medium uppercase tracking-wider transition-colors",
            value === opt.id
              ? "bg-sidebar-fg/15 text-sidebar-fg"
              : "text-sidebar-fg/55 hover:text-sidebar-fg/80",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PondRangeTabs({
  value,
  onChange,
}: {
  value: PondRange;
  onChange: (v: PondRange) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-sidebar-fg/20 bg-teal-deep/40 p-0.5"
      role="tablist"
      aria-label="Fish pond water temperature range"
    >
      {POND_RANGE_OPTS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          aria-label={
            opt.id === "day"
              ? "Day — last 24 hours"
              : opt.id === "week"
                ? "Week — last 7 days"
                : opt.id === "month"
                  ? "Month — last 28 days"
                  : "Year — last 12 months"
          }
          onClick={() => onChange(opt.id)}
          className={cn(
            "min-h-9 min-w-[2.75rem] rounded-sm px-2.5 text-[0.75rem] font-medium uppercase tracking-wider transition-colors",
            value === opt.id
              ? "bg-sidebar-fg/15 text-sidebar-fg"
              : "text-sidebar-fg/55 hover:text-sidebar-fg/80",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function OverviewPondGraph({
  range,
  onRangeChange,
}: {
  range: PondRange;
  onRangeChange: (r: PondRange) => void;
}) {
  const status = useHouse((s) => s.status);
  const historyStatus = useHouse((s) => s.historyStatus);
  const historyPondTempDay = useHouse((s) => s.historyPondTempDay);
  const historyPondTempWeek = useHouse((s) => s.historyPondTempWeek);
  const historyPondTempMonth = useHouse((s) => s.historyPondTempMonth);
  const historyPondTempYear = useHouse((s) => s.historyPondTempYear);
  const liveMode = !usesDemoCharts(status);

  const dayRows: TempPoint[] = liveMode ? historyPondTempDay : POND_TEMP_DAY;
  const weekRows: TempPoint[] = liveMode ? historyPondTempWeek : POND_TEMP_WEEK;
  const monthRows: TempPoint[] = liveMode ? historyPondTempMonth : POND_TEMP_MONTH;
  const yearRows: TempPoint[] = liveMode ? historyPondTempYear : POND_TEMP_YEAR;
  const data =
    range === "day"
      ? dayRows
      : range === "week"
        ? weekRows
        : range === "month"
          ? monthRows
          : yearRows;

  const ready = useMemo(() => {
    if (!liveMode) return true;
    if (historyStatus === "loading" || historyStatus === "idle") return false;
    return historyStatus === "ready" && data.length > 0;
  }, [liveMode, historyStatus, data.length]);

  // Day / Week fit the tile; Month / Year may scroll when dense.
  const scrollWidth = useMemo(() => {
    if (range === "day" || range === "week") return 0;
    if (range === "month") return Math.max(data.length * 28, 420);
    return Math.max(data.length * 56, 420);
  }, [data.length, range]);

  const waterLegend =
    range === "day"
      ? "Pond water (hourly)"
      : range === "week" || range === "month"
        ? "Pond water (daily mean)"
        : "Pond water (monthly mean)";
  const gardenLegend =
    range === "day"
      ? "Pond air temperature (hourly)"
      : range === "week" || range === "month"
        ? "Pond air temperature (daily mean)"
        : "Pond air temperature (monthly mean)";
  const showGarden = data.some((p) => p.gardenTempC != null);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex shrink-0 items-center justify-between gap-2 px-2">
        <PondRangeTabs value={range} onChange={onRangeChange} />
      </div>
      {!ready ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center px-2">
          <NoHistoryYet
            label={historyStatus === "loading" ? "pond temp (loading)" : "pond temp"}
          />
        </div>
      ) : data.length > 0 ? (
        <>
          <div className="min-h-0 flex-1">
            <ChartScroll widthPx={scrollWidth}>
              <PondTempChart data={data} />
            </ChartScroll>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-0.5 text-xs text-sidebar-fg/70">
            <Key color={METER_COLORS.pond} label={waterLegend} />
            {showGarden ? <Key color={METER_COLORS.garden} label={gardenLegend} /> : null}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center px-2">
          <NoHistoryYet label={`${range} pond temp`} />
        </div>
      )}
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
      const s = Math.min(el.clientWidth / 1000, el.clientHeight / 580);
      setScale(s);
      setOffset({
        x: (el.clientWidth - 1000 * s) / 2,
        y: (el.clientHeight - 580 * s) / 2,
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
          height: 580,
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

/** Key weather readings — right side, above energy flow when possible. */
function defaultWeather(): Box {
  const w = Math.min(360, window.innerWidth - 48);
  const h = Math.min(420, window.innerHeight - 160);
  return {
    x: Math.max(24, window.innerWidth - w - 28),
    y: 96,
    w,
    h,
  };
}

function defaultPond(): Box {
  const w = Math.min(420, window.innerWidth - 48);
  const h = Math.min(260, window.innerHeight - 160);
  return {
    x: 28,
    y: Math.max(96, Math.min(window.innerHeight - h - 28, 96 + 340 + 16)),
    w,
    h,
  };
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

/** Quiet large numbers — no charts. Rain rate OR rainfall today (one rain slot). */
function OverviewWeatherPanel({ weather }: { weather: WeatherLive }) {
  const rows = overlayReadings(weather);
  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-sidebar-fg/60">
        Waiting for station…
      </div>
    );
  }
  return (
    <div className="grid h-full grid-cols-2 content-start gap-x-4 gap-y-5 overflow-auto px-4 pb-4 pt-1">
      {rows.map((r) => (
        <WeatherAmbientCell key={r.entityId || r.key} reading={r} />
      ))}
    </div>
  );
}

function WeatherAmbientCell({ reading }: { reading: WeatherReading }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[0.65rem] uppercase tracking-widest text-sidebar-fg/55">
        {reading.label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 tabular-nums leading-none">
        <span className="text-3xl font-medium tracking-tight text-sidebar-fg sm:text-4xl">
          {formatWeatherNumber(reading)}
        </span>
        {reading.unit && !reading.unavailable && reading.value != null ? (
          <span className="text-sm text-sidebar-fg/55">{reading.unit}</span>
        ) : null}
      </div>
    </div>
  );
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
