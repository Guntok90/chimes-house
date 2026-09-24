import { create } from "zustand";
import {
  daysFromStatistics,
  historyEntityIds,
  hoursFromHistory,
  monthsFromStatistics,
  normalizeHistoryResult,
  type HaStatisticsBag,
} from "./ha-history";
import {
  CHARGE_LIMIT_DEFAULTS,
  DEFAULT_HA_URL,
  DEFAULT_ZAPPI_MODES,
  HaSocket,
  areaSwitchesFromStates,
  chargeLimitMetaMap,
  credsForBoot,
  demoAreaSwitches,
  readCreds,
  tariffsFromStates,
  writeCreds,
  wsFailureMessage,
  zappiModeOptions,
  type AreaSwitch,
  type ChargeLimitKey,
  type HaArea,
  type HaBootstrapResponse,
  type HaCreds,
  type HaEntityReg,
  type HaMap,
  type HaState,
  type NumberControlMeta,
  type SwitchId,
} from "./ha";
import { applyLiveStates } from "./live-updates";
import { SNAPSHOT, type DayPoint, type HourPoint, type HouseLive } from "./house";
import { decideResume, FORCE_RECONNECT_HIDDEN_MS, STUCK_CONNECTING_MS } from "./ha-resume";
import {
  clampRate,
  estimateImportCostParts,
  readLocalTariffs,
  resolveTariffs,
  writeLocalTariffs,
  type TariffRates,
  type TariffState,
} from "./tariffs";

export {
  decideResume,
  FORCE_RECONNECT_HIDDEN_MS,
  STUCK_CONNECTING_MS,
} from "./ha-resume";
export type { ResumeAction } from "./ha-resume";

const socket = new HaSocket();

let areasCache: HaArea[] = [];
let entityRegCache: HaEntityReg[] = [];
let lastStates: HaState[] = [];

/** When the tab was backgrounded / frozen (iOS Safari suspend). */
let pageHiddenAt: number | null = null;
/** When status last entered "connecting" — detect stuck handshakes. */
let connectingStartedAt: number | null = null;

function rebuildAreaSwitches(states: HaState[]) {
  return areaSwitchesFromStates(states, areasCache, entityRegCache);
}

function bootTariffs(): TariffState {
  return resolveTariffs(null, readLocalTariffs());
}

function remapDayCosts(days: DayPoint[], rates: TariffRates): DayPoint[] {
  return days.map((d) => {
    // Prefer TOU window weighting when we lack per-day hourly rows here;
    // refreshHistory recomputes with hourStats when live.
    const spend = estimateImportCostParts(d.gridIn, rates);
    return {
      ...d,
      costOffPeak: spend.costOffPeak,
      costPeak: spend.costPeak,
      cost: spend.cost,
    };
  });
}

function ratesForHistory(tariffs: TariffRates): {
  lowGbpPerKwh: number;
  highGbpPerKwh: number;
} {
  return { lowGbpPerKwh: tariffs.cheap, highGbpPerKwh: tariffs.peak };
}

/** Hourly points for Overview day tab (past week, scrollable). */
export const HISTORY_HOUR_COUNT = 7 * 24;
/** Daily points kept for week scroll + month tab. */
export const HISTORY_DAY_COUNT = 56;
/** Monthly points for year tab. */
export const HISTORY_YEAR_COUNT = 12;

type Status = "demo" | "connecting" | "live" | "error";
type HistoryStatus = "idle" | "loading" | "ready" | "empty";

const DEMO_CHARGE_META: Record<ChargeLimitKey, NumberControlMeta> = {
  gridChargeCutoffSoc: { ...CHARGE_LIMIT_DEFAULTS.gridChargeCutoffSoc },
  solarChargeCutoffSoc: { ...CHARGE_LIMIT_DEFAULTS.solarChargeCutoffSoc },
};

type Store = {
  live: HouseLive;
  switches: Record<string, boolean>;
  /** All controllable switches/lights by HA area (Home). */
  areaSwitches: AreaSwitch[];
  status: Status;
  error?: string;
  map: HaMap;
  url: string;
  /** Live HA history only — never demo WEEK/HOURS while status === "live". */
  /** Past-week hourly (≤168). Battery view uses the last 24. */
  historyHours: HourPoint[];
  /** Longer daily series for Overview week scroll (≤56). */
  historyDays: DayPoint[];
  /** Last 7 days — History view + Overview week window. */
  historyWeek: DayPoint[];
  historyMonth: DayPoint[];
  /** Last 12 months from period:month statistics. */
  historyYear: DayPoint[];
  historyStatus: HistoryStatus;
  /** Min/max/step for mapped Huawei charge-limit number entities. */
  chargeLimitMeta: Record<ChargeLimitKey, NumberControlMeta>;
  /** Options for mapped Zappi charge-mode select (HA attributes or defaults). */
  zappiModeOptions: string[];
  /** Last write error from Battery charge-limit Apply (cleared on success). */
  writeError?: string;
  /** Custom £/kWh rates for History/Energy spend maths (not Octopus Dispatch). */
  tariffs: TariffState;
  connect: (creds: HaCreds, opts?: { preserveData?: boolean }) => Promise<void>;
  disconnect: () => void;
  /** @param opts.force Re-run boot even if status looks live (zombie after iOS suspend). */
  boot: (opts?: { force?: boolean }) => void;
  toggle: (id: string) => void;
  /** Explicit Apply: set grid / solar charge cutoff SOC via number.set_value. */
  applyChargeLimit: (key: ChargeLimitKey, value: number) => Promise<boolean>;
  /** Explicit Apply: turn charge-from-grid switch on/off. */
  applyGridCharge: (allow: boolean) => Promise<boolean>;
  /** Explicit Apply: set Zappi charge mode via select.select_option. */
  applyZappiMode: (mode: string) => Promise<boolean>;
  /** Toggle by HA entity_id (or demo.* id) — Home area tiles. */
  toggleEntity: (entityId: string) => void;
  /** Save custom cheap/peak £/kWh — HA helpers when mapped, else localStorage. */
  setTariffs: (patch: Partial<TariffRates>) => Promise<boolean>;
  refreshHistory: () => Promise<void>;
};

let bootInFlight: Promise<void> | null = null;
let connectInFlight: Promise<void> | null = null;
let historyInFlight: Promise<void> | null = null;
/** Once we have been live this SPA session, keep last readings across drops. */
let hadLiveSession = false;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
/** Suppress reconnect when the user explicitly chose demo / we are tearing down. */
let reconnectAllowed = true;

function clearReconnectTimer() {
  if (reconnectTimer == null) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function markConnecting() {
  connectingStartedAt = Date.now();
}

function clearConnectingClock() {
  connectingStartedAt = null;
}

function connectingForMs(status: Status): number {
  if (status !== "connecting" || connectingStartedAt == null) return 0;
  return Date.now() - connectingStartedAt;
}

/** Record that the page left the foreground (app switch / home / freeze). */
export function notePageHidden() {
  if (pageHiddenAt == null) pageHiddenAt = Date.now();
}

function takeHiddenForMs(): number {
  if (pageHiddenAt == null) return 0;
  const ms = Date.now() - pageHiddenAt;
  pageHiddenAt = null;
  return ms;
}

function emptyHistory() {
  return {
    historyHours: [] as HourPoint[],
    historyDays: [] as DayPoint[],
    historyWeek: [] as DayPoint[],
    historyMonth: [] as DayPoint[],
    historyYear: [] as DayPoint[],
  };
}

function scheduleReconnect(get: () => Store) {
  if (!reconnectAllowed) return;
  if (reconnectTimer != null) return;
  const creds = readCreds();
  if (!creds) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30_000);
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (!reconnectAllowed) return;
    const { status } = get();
    if (status === "live" && socket.connected) return;
    if (status === "connecting") return;
    void get().connect(creds, { preserveData: true });
  }, delay);
}

let resumeInFlight: Promise<void> | null = null;

/**
 * Re-establish the HA WebSocket after the page returns to the foreground.
 * Keeps last known readings (Connecting), never flips to Demo on a transient kill.
 */
export function resumeLiveSession(): Promise<void> {
  if (resumeInFlight) return resumeInFlight;
  resumeInFlight = (async () => {
    const hiddenForMs = takeHiddenForMs();
    const state = useHouse.getState();
    const action = decideResume({
      reconnectAllowed,
      hasCreds: Boolean(readCreds()),
      hadLiveSession,
      status: state.status,
      socketConnected: socket.connected,
      bootInFlight: Boolean(bootInFlight),
      hiddenForMs,
      connectingForMs: connectingForMs(state.status),
    });
    if (action === "noop") return;

    if (action === "rebootstrap") {
      // Same recovery path as a hard refresh — pull token from /api/ha/bootstrap.
      useHouse.getState().boot({ force: true });
      return;
    }

    if (action === "probe") {
      const ok = await socket.probe();
      if (ok) {
        // After any background blip, confirm beyond ping (events can die while
        // pong still answers). Watchdog probes (hiddenForMs === 0) trust ping.
        if (hiddenForMs > 0) {
          const fresh = await socket.refreshStates();
          if (fresh) return;
          // Ping worked but get_states did not — treat as zombie.
        } else {
          return;
        }
      }
      // Zombie OPEN socket (common after iPad Safari suspend) — fall through.
    }

    if (!reconnectAllowed) return;
    const creds = readCreds();
    if (!creds) {
      useHouse.getState().boot({ force: true });
      return;
    }
    if (bootInFlight) return;
    const { status } = useHouse.getState();
    // Another connect already in progress (and not stuck) — let it finish.
    if (status === "connecting" && connectingForMs(status) < STUCK_CONNECTING_MS) {
      return;
    }
    if (connectInFlight && connectingForMs("connecting") < STUCK_CONNECTING_MS) {
      return;
    }

    clearReconnectTimer();
    reconnectAttempt = 0;

    // Tailscale / Private Relay often lag visibilitychange by a few hundred ms.
    // After a real background stretch, settle briefly then retry a couple times
    // so we do not stick on Error until the user refreshes.
    const settleMs = hiddenForMs >= FORCE_RECONNECT_HIDDEN_MS ? 250 : 0;
    const attempts = hiddenForMs >= FORCE_RECONNECT_HIDDEN_MS ? 3 : 1;
    for (let i = 0; i < attempts; i++) {
      if (!reconnectAllowed) return;
      if (i > 0) await sleep(400 * i);
      else if (settleMs) await sleep(settleMs);
      if (bootInFlight) return;
      const now = useHouse.getState();
      if (now.status === "live" && socket.connected) return;
      if (
        (now.status === "connecting" || connectInFlight) &&
        connectingForMs("connecting") < STUCK_CONNECTING_MS &&
        i > 0
      ) {
        return;
      }
      await useHouse.getState().connect(creds, { preserveData: true });
      if (useHouse.getState().status === "live" && socket.connected) return;
    }
  })().finally(() => {
    resumeInFlight = null;
  });
  return resumeInFlight;
}

export const useHouse = create<Store>((set, get) => {
  return {
    live: { ...SNAPSHOT },
    switches: {},
    areaSwitches: demoAreaSwitches({}),
    status: "demo",
    map: {},
    url: DEFAULT_HA_URL,
    ...emptyHistory(),
    historyStatus: "idle",
    chargeLimitMeta: DEMO_CHARGE_META,
    zappiModeOptions: [...DEFAULT_ZAPPI_MODES],
    tariffs: bootTariffs(),

    boot(opts) {
      if (bootInFlight) return;
      const force = Boolean(opts?.force);
      // Soft remount / Strict Mode / Overview↔Home must not tear down Live.
      if (!force && get().status === "live" && socket.connected) return;
      if (!force && get().status === "connecting") return;
      // Force path: drop a zombie OPEN socket so we do not skip reconnect.
      if (force && socket.connected) {
        socket.close();
      }

      bootInFlight = (async () => {
        reconnectAllowed = true;
        const preserve = hadLiveSession;
        markConnecting();
        set({ status: "connecting", error: undefined });
        let bootstrap: HaBootstrapResponse | null = null;
        let bootstrapFailed = false;
        try {
          const res = await fetch("/api/ha/bootstrap", {
            credentials: "include",
            cache: "no-store",
          });
          if (res.status === 401) {
            hadLiveSession = false;
            clearReconnectTimer();
            reconnectAllowed = false;
            clearConnectingClock();
            set({
              status: "demo",
              live: { ...SNAPSHOT },
              areaSwitches: demoAreaSwitches({}),
              tariffs: resolveTariffs(null, readLocalTariffs()),
              error: undefined,
              ...emptyHistory(),
              historyStatus: "idle",
            });
            return;
          }
          if (!res.ok) {
            bootstrapFailed = true;
          } else {
            bootstrap = (await res.json()) as HaBootstrapResponse;
          }
        } catch {
          bootstrapFailed = true;
        }

        const creds = credsForBoot(bootstrap, readCreds());
        if (!creds) {
          hadLiveSession = false;
          clearConnectingClock();
          set({
            status: bootstrapFailed ? "error" : "demo",
            live: { ...SNAPSHOT },
            error: bootstrapFailed
              ? "Could not read Pi setup. Connect from House, on Tailscale."
              : undefined,
            ...emptyHistory(),
            historyStatus: "idle",
          });
          return;
        }
        await get().connect(creds, { preserveData: preserve });
      })().finally(() => {
        bootInFlight = null;
      });
    },

    async connect(creds, opts) {
      // Serialize connects — a resume retry must not overlap an in-flight handshake
      // or the first call's catch can wipe a successful second socket.
      if (connectInFlight) {
        if (connectingForMs("connecting") < STUCK_CONNECTING_MS) {
          return connectInFlight;
        }
        // Stuck past handshake budget (common when Tailscale is still asleep) —
        // abort the socket so the hung connect rejects, then start fresh.
        socket.close();
        try {
          await connectInFlight;
        } catch {
          // Prior attempt failed as expected after close.
        }
      }

      const preserveData = Boolean(opts?.preserveData) || hadLiveSession;
      reconnectAllowed = true;
      clearReconnectTimer();
      markConnecting();
      set({
        status: "connecting",
        error: undefined,
        url: creds.url,
        ...(preserveData
          ? {}
          : {
              ...emptyHistory(),
              historyStatus: "idle" as const,
            }),
      });
      writeCreds(creds);
      socket.interest = null;
      socket.onStatus = (s, err) => {
        // Stay on "connecting" until the first state payload. A Live badge
        // with the demo snapshot would read as dusk (0 W, 16.68 kWh).
        if (s === "connecting") {
          markConnecting();
          set({ status: "connecting", error: undefined });
        }
        if (s === "error") {
          socket.interest = null;
          clearConnectingClock();
          if (hadLiveSession) {
            // Keep last live readings — do not silently drop to demo curves.
            set({
              status: "error",
              error: wsFailureMessage(err ?? "Disconnected."),
            });
            scheduleReconnect(get);
            return;
          }
          set({
            status: "error",
            error: wsFailureMessage(err ?? "Disconnected."),
            live: { ...SNAPSHOT },
            ...emptyHistory(),
            historyStatus: "idle",
          });
        }
      };
      socket.onStates = (states) => {
        const list = states instanceof Map ? Array.from(states.values()) : states;
        lastStates = list;
        const wasLive = get().status === "live";
        applyLiveStates(states, get, set, socket);
        if (get().status === "live") {
          hadLiveSession = true;
          reconnectAttempt = 0;
          clearReconnectTimer();
          clearConnectingClock();
        }
        const mapped = get().map;
        const haRates = tariffsFromStates(list, mapped);
        const tariffs = resolveTariffs(haRates, readLocalTariffs());
        if (tariffs.source === "ha") writeLocalTariffs(tariffs);
        set({
          areaSwitches: rebuildAreaSwitches(list),
          chargeLimitMeta: chargeLimitMetaMap(list, mapped),
          zappiModeOptions: zappiModeOptions(list, mapped),
          tariffs,
        });
        if (!wasLive && get().status === "live") {
          void refreshRegistries();
        }
      };

      connectInFlight = (async () => {
        try {
          await socket.connect(creds.url, creds.token);
        } catch (err) {
          socket.close();
          clearConnectingClock();
          const message = wsFailureMessage(
            err instanceof Error ? err.message : "Could not connect.",
          );
          if (hadLiveSession) {
            set({ status: "error", error: message });
            scheduleReconnect(get);
            return;
          }
          set({
            status: "error",
            error: message,
            live: { ...SNAPSHOT },
            historyStatus: "idle",
          });
        }
      })().finally(() => {
        connectInFlight = null;
      });
      return connectInFlight;
    },

    async refreshHistory() {
      if (historyInFlight) return historyInFlight;
      if (get().status !== "live") return;
      const map = get().map;
      const ids = historyEntityIds(map);
      if (!ids.length) {
        set({ historyStatus: "empty", ...emptyHistory() });
        return;
      }
      set({ historyStatus: "loading" });
      historyInFlight = (async () => {
        try {
          const end = new Date();
          const startHours = new Date(end.getTime() - HISTORY_HOUR_COUNT * 60 * 60 * 1000);
          const startDays = new Date(end.getTime() - HISTORY_DAY_COUNT * 24 * 60 * 60 * 1000);
          const startYear = new Date(end.getFullYear(), end.getMonth() - (HISTORY_YEAR_COUNT - 1), 1);

          let hours: HourPoint[] = [];
          let days: DayPoint[] = [];
          let week: DayPoint[] = [];
          let month: DayPoint[] = [];
          let year: DayPoint[] = [];

          // Hourly and daily paths are independent — a stats parse throw must
          // not wipe an otherwise-valid series (and never invent demo data).
          try {
            const raw = await socket.historyDuringPeriod(
              ids,
              startHours.toISOString(),
              end.toISOString(),
            );
            hours = hoursFromHistory(normalizeHistoryResult(raw), map, end, HISTORY_HOUR_COUNT);
          } catch {
            hours = [];
          }

          try {
            const stats = (await socket.statisticsDuringPeriod(
              ids,
              startDays.toISOString(),
              end.toISOString(),
              "day",
            )) as HaStatisticsBag;

            // Hourly grid import for cheap/peak spend split (Intelligent Go window).
            let hourStats: HaStatisticsBag = {};
            if (map.gridW) {
              try {
                hourStats = (await socket.statisticsDuringPeriod(
                  [map.gridW],
                  startDays.toISOString(),
                  end.toISOString(),
                  "hour",
                )) as HaStatisticsBag;
              } catch {
                hourStats = {};
              }
            }

            const tariffs = get().tariffs;
            const rates = ratesForHistory(tariffs);
            const opts = { hourStats, rates };
            days = daysFromStatistics(stats, map, HISTORY_DAY_COUNT, end, opts);
            week = days.length ? days.slice(-7) : daysFromStatistics(stats, map, 7, end, opts);
            month = days.length
              ? days.slice(-28)
              : daysFromStatistics(stats, map, 28, end, opts);
          } catch {
            days = [];
            week = [];
            month = [];
          }

          try {
            const yearStats = (await socket.statisticsDuringPeriod(
              ids,
              startYear.toISOString(),
              end.toISOString(),
              "month",
            )) as HaStatisticsBag;
            year = monthsFromStatistics(yearStats, map, HISTORY_YEAR_COUNT, end);
          } catch {
            year = [];
          }

          const empty =
            hours.length === 0 && days.length === 0 && week.length === 0 && year.length === 0;
          set({
            historyHours: hours,
            historyDays: days,
            historyWeek: week,
            historyMonth: month,
            historyYear: year,
            historyStatus: empty ? "empty" : "ready",
          });
        } finally {
          historyInFlight = null;
        }
      })();
      return historyInFlight;
    },

    disconnect() {
      reconnectAllowed = false;
      clearReconnectTimer();
      hadLiveSession = false;
      reconnectAttempt = 0;
      clearConnectingClock();
      pageHiddenAt = null;
      socket.onStatus = null;
      socket.onStates = null;
      socket.interest = null;
      socket.close();
      writeCreds(null);
      set({
        status: "demo",
        live: { ...SNAPSHOT },
        areaSwitches: demoAreaSwitches({}),
        error: undefined,
        writeError: undefined,
        chargeLimitMeta: DEMO_CHARGE_META,
        zappiModeOptions: [...DEFAULT_ZAPPI_MODES],
        ...emptyHistory(),
        historyStatus: "idle",
      });
    },

    toggle(id) {
      const { map, switches, status, areaSwitches } = get();
      const entity = map[id as SwitchId];
      if (!entity) return;
      const nextOn = !switches[id];
      const nextArea = areaSwitches.map((s) =>
        s.entityId === entity ? { ...s, on: nextOn } : s,
      );
      set({ switches: { ...switches, [id]: nextOn }, areaSwitches: nextArea });
      // Same call path as Home: explicit turn_on / turn_off (not HA "toggle").
      if (status === "live" && readCreds()) {
        void socket.call(entity, nextOn);
      }
    },

    async applyChargeLimit(key, value) {
      const { map, status, live, chargeLimitMeta } = get();
      const entity = map[key];
      if (!entity || status !== "live" || !readCreds()) {
        set({ writeError: "Not connected to the Pi — charge limits stay read-only." });
        return false;
      }
      const meta = chargeLimitMeta[key];
      const clamped = Math.min(meta.max, Math.max(meta.min, Math.round(value)));
      set({
        live: { ...live, [key]: clamped },
        writeError: undefined,
      });
      try {
        await socket.setNumber(entity, clamped);
        return true;
      } catch (err) {
        set({
          writeError:
            err instanceof Error ? err.message : "Could not set the charge limit on the Pi.",
        });
        return false;
      }
    },

    async applyGridCharge(allow) {
      const { map, status, live } = get();
      const entity = map.gridCharge;
      if (!entity || status !== "live" || !readCreds()) {
        set({ writeError: "Not connected to the Pi — charge limits stay read-only." });
        return false;
      }
      set({ live: { ...live, gridCharge: allow }, writeError: undefined });
      try {
        await socket.call(entity, allow);
        return true;
      } catch (err) {
        set({
          writeError:
            err instanceof Error ? err.message : "Could not set charge from grid on the Pi.",
        });
        return false;
      }
    },

    async applyZappiMode(mode) {
      const { map, status, live, zappiModeOptions: options } = get();
      const entity = map.zappiMode;
      const trimmed = mode.trim();
      if (!entity || status !== "live" || !readCreds()) {
        set({ writeError: "Not connected to the Pi — Zappi mode stays read-only." });
        return false;
      }
      if (!trimmed || (options.length > 0 && !options.includes(trimmed))) {
        set({ writeError: "Pick a Zappi mode the charger supports, then Apply." });
        return false;
      }
      set({ live: { ...live, zappiMode: trimmed }, writeError: undefined });
      try {
        await socket.setSelect(entity, trimmed);
        return true;
      } catch (err) {
        set({
          writeError:
            err instanceof Error ? err.message : "Could not set Zappi mode on the Pi.",
        });
        return false;
      }
    },

    async setTariffs(patch) {
      const prev = get().tariffs;
      const next: TariffState = {
        cheap: clampRate(patch.cheap ?? prev.cheap),
        peak: clampRate(patch.peak ?? prev.peak),
        source: prev.haHelpers ? "ha" : "local",
        haHelpers: prev.haHelpers,
      };
      writeLocalTariffs(next);
      set({
        tariffs: next,
        historyWeek: remapDayCosts(get().historyWeek, next),
        historyMonth: remapDayCosts(get().historyMonth, next),
      });

      const { map, status } = get();
      if (status !== "live" || !readCreds()) return true;

      const writes: Promise<void>[] = [];
      if (patch.cheap != null && map.tariffCheap) {
        writes.push(socket.setNumber(map.tariffCheap, next.cheap));
      }
      if (patch.peak != null && map.tariffPeak) {
        writes.push(socket.setNumber(map.tariffPeak, next.peak));
      }
      if (!writes.length) {
        // Helpers not created yet — localStorage already holds the rates.
        set({
          tariffs: { ...next, source: "local", haHelpers: false },
        });
        return true;
      }
      try {
        await Promise.all(writes);
        return true;
      } catch {
        // Keep local values; mark as local so the UI explains the fallback.
        set({
          tariffs: { ...next, source: "local", haHelpers: Boolean(map.tariffCheap || map.tariffPeak) },
        });
        return false;
      }
    },

    toggleEntity(entityId) {
      const { areaSwitches, status, map } = get();
      const hit = areaSwitches.find((s) => s.entityId === entityId);
      if (!hit || !hit.available) return;

      const nextOn = !hit.on;
      const nextArea = areaSwitches.map((s) =>
        s.entityId === entityId ? { ...s, on: nextOn } : s,
      );

      // Keep curated SwitchId map in sync when this entity is one of them.
      const nextSwitches = { ...get().switches };
      for (const [key, mapped] of Object.entries(map)) {
        if (mapped === entityId && SWITCH_IDS.has(key)) {
          nextSwitches[key] = nextOn;
          break;
        }
      }
      if (entityId.startsWith("demo.")) {
        nextSwitches[entityId.slice("demo.".length)] = nextOn;
      }

      set({ areaSwitches: nextArea, switches: nextSwitches });

      if (entityId.startsWith("demo.")) return;
      if (status === "live" && readCreds()) {
        void socket.call(entityId, nextOn);
      }
    },
  };
});

const SWITCH_IDS = new Set<string>([
  "lamp",
  "kitchen",
  "pergola",
  "pond-1",
  "pond-2",
  "telly",
  "fish",
  "stevie-blanket",
  "baby-blanket",
]);

async function refreshRegistries() {
  try {
    const [areas, entities] = await Promise.all([
      socket.listAreas(),
      socket.listEntityRegistry(),
    ]);
    areasCache = areas;
    entityRegCache = entities;
  } catch {
    // Keep empty caches — switches still list under Spares from states alone.
  }
  if (useHouse.getState().status !== "live") return;
  useHouse.setState({
    areaSwitches: rebuildAreaSwitches(lastStates),
  });
}

export function useLive() {
  return useHouse((s) => s.live);
}

export function useTariffs() {
  return useHouse((s) => s.tariffs);
}
