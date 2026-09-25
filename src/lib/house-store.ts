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
  DEFAULT_EV_READY_BY_OPTIONS,
  DEFAULT_HA_URL,
  DEFAULT_ZAPPI_MODES,
  HaSocket,
  areaSwitchesFromStates,
  chargeLimitMetaMap,
  credsForBoot,
  demoAreaSwitches,
  demoFanControl,
  evReadyByOptions,
  fanControlFromStates,
  fanLevelToPercentage,
  haWriteFailureMessage,
  isHaTimeoutError,
  readCreds,
  tariffsFromStates,
  writeCreds,
  wsFailureMessage,
  zappiModeOptions,
  type AreaSwitch,
  type ChargeLimitKey,
  type FanControl,
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
import { gridSpendPartsGbp } from "./octopus";

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
    // Reprice from the stored TOU kWh split when we have one (hourly stats or
    // prior approx). Never re-apply the flat 25%/75% blend — that inflated
    // Peak £ for overnight-charging homes after tariff Save.
    const low = d.importOffPeakKwh;
    const high = d.importPeakKwh;
    if (typeof low === "number" && typeof high === "number" && (low > 0 || high > 0 || d.gridIn <= 0)) {
      const spend = gridSpendPartsGbp(low, high, {
        lowGbpPerKwh: rates.cheap,
        highGbpPerKwh: rates.peak,
      });
      return {
        ...d,
        costOffPeak: spend.offPeak,
        costPeak: spend.peak,
        cost: spend.total,
      };
    }
    const spend = estimateImportCostParts(d.gridIn, rates);
    return {
      ...d,
      importOffPeakKwh: Number((d.gridIn * 0.25).toFixed(4)),
      importPeakKwh: Number((d.gridIn * 0.75).toFixed(4)),
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
  minDischargeSoc: { ...CHARGE_LIMIT_DEFAULTS.minDischargeSoc },
};

/** In-flight Battery / Zappi / Octopus Apply — holds optimistic UI until HA state confirms. */
export type WritePending = {
  key: "gridCharge" | "zappiMode" | "evReadyBy" | ChargeLimitKey;
  expected: boolean | number | string;
};

type Store = {
  live: HouseLive;
  switches: Record<string, boolean>;
  /** All controllable switches/lights by HA area (Home). */
  areaSwitches: AreaSwitch[];
  /** Curated Home Fan tile (on/off + speed). Unmapped when live ids missing. */
  fanControl: FanControl;
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
  /** Options for Octopus Intelligent EV ready-by select (HA attributes or defaults). */
  evReadyByOptions: string[];
  /** Last write error from Battery / Zappi / Octopus Apply (cleared on success). */
  writeError?: string;
  /**
   * Optimistic write in flight. While set, live updates must not silently
   * overwrite the pending control with a stale Off / old % from the Pi.
   */
  writePending?: WritePending;
  /** Custom £/kWh rates for History/Energy spend maths (not Octopus Dispatch). */
  tariffs: TariffState;
  connect: (creds: HaCreds, opts?: { preserveData?: boolean }) => Promise<void>;
  disconnect: () => void;
  /** @param opts.force Re-run boot even if status looks live (zombie after iOS suspend). */
  boot: (opts?: { force?: boolean }) => void;
  toggle: (id: string) => void;
  /** Explicit Apply: set grid / solar / min-discharge SOC via number.set_value. */
  applyChargeLimit: (key: ChargeLimitKey, value: number) => Promise<boolean>;
  /** Explicit Apply: turn charge-from-grid switch on/off. */
  applyGridCharge: (allow: boolean) => Promise<boolean>;
  /** Explicit Apply: set Zappi charge mode via select.select_option. */
  applyZappiMode: (mode: string) => Promise<boolean>;
  /**
   * Explicit Apply: set Octopus Intelligent “EV ready by” via select.select_option
   * or time.set_value. Does not touch charge automations
   * (including automation.charge_cars_at_off_peak).
   */
  applyEvReadyBy: (time: string) => Promise<boolean>;
  /** Toggle by HA entity_id (or demo.* id) — Home area tiles. */
  toggleEntity: (entityId: string) => void;
  /** Home Fan on/off (fan.turn_on / turn_off, or demo). */
  toggleFan: () => void;
  /** Home Fan discrete speed level (1–N). */
  setFanSpeedLevel: (level: number) => void;
  /** Optional Tuya fan light toggle when mapped. */
  toggleFanLight: () => void;
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

function switchStateMatches(state: string, allow: boolean): boolean {
  const v = state.toLowerCase();
  const on =
    v === "on" || v === "true" || v === "yes" || v === "active" || v === "enabled";
  return allow ? on : !on;
}

function numberStateMatches(state: string, expected: number): boolean {
  const n = Number.parseFloat(state);
  return Number.isFinite(n) && Math.round(n) === Math.round(expected);
}

/**
 * After applyLiveStates, keep optimistic pending values until HA confirms —
 * otherwise a slow Huawei write + timed-out call looks like Allowed → Off.
 */
function holdPendingLive(get: () => Store, set: (partial: Partial<Store>) => void) {
  const pending = get().writePending;
  if (!pending) return;
  const live = get().live;
  if (pending.key === "gridCharge") {
    if (live.gridCharge === pending.expected) {
      set({ writePending: undefined });
      return;
    }
    set({ live: { ...live, gridCharge: pending.expected as boolean } });
    return;
  }
  if (pending.key === "zappiMode") {
    if (live.zappiMode === pending.expected) {
      set({ writePending: undefined });
      return;
    }
    set({ live: { ...live, zappiMode: String(pending.expected) } });
    return;
  }
  if (pending.key === "evReadyBy") {
    if (live.evReadyBy === pending.expected) {
      set({ writePending: undefined });
      return;
    }
    set({ live: { ...live, evReadyBy: String(pending.expected) } });
    return;
  }
  const key = pending.key;
  if (live[key] === pending.expected) {
    set({ writePending: undefined });
    return;
  }
  set({ live: { ...live, [key]: pending.expected as number } });
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
    fanControl: demoFanControl(),
    status: "demo",
    map: {},
    url: DEFAULT_HA_URL,
    ...emptyHistory(),
    historyStatus: "idle",
    chargeLimitMeta: DEMO_CHARGE_META,
    zappiModeOptions: [...DEFAULT_ZAPPI_MODES],
    evReadyByOptions: [...DEFAULT_EV_READY_BY_OPTIONS],
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
              fanControl: demoFanControl(),
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
        holdPendingLive(get, set);
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
          fanControl: fanControlFromStates(list, mapped),
          chargeLimitMeta: chargeLimitMetaMap(list, mapped),
          zappiModeOptions: zappiModeOptions(list, mapped),
          evReadyByOptions: evReadyByOptions(list, mapped),
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
            year = monthsFromStatistics(yearStats, map, HISTORY_YEAR_COUNT, end, {
              rates: ratesForHistory(get().tariffs),
            });
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
        fanControl: demoFanControl(),
        error: undefined,
        writeError: undefined,
        writePending: undefined,
        chargeLimitMeta: DEMO_CHARGE_META,
        zappiModeOptions: [...DEFAULT_ZAPPI_MODES],
        evReadyByOptions: [...DEFAULT_EV_READY_BY_OPTIONS],
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
      const previous = live[key];
      const labels: Record<ChargeLimitKey, string> = {
        gridChargeCutoffSoc: "grid charge cutoff",
        solarChargeCutoffSoc: "solar charge cutoff",
        minDischargeSoc: "minimum SOC",
      };
      set({
        live: { ...live, [key]: clamped },
        writeError: undefined,
        writePending: { key, expected: clamped },
      });

      let timedOut = false;
      try {
        await socket.setNumber(entity, clamped);
      } catch (err) {
        timedOut = isHaTimeoutError(err);
        if (!timedOut) {
          set({
            live: { ...get().live, [key]: previous },
            writeError: haWriteFailureMessage(err, labels[key]),
            writePending: undefined,
          });
          return false;
        }
      }

      const confirmed = await socket.waitForCachedState(
        entity,
        (s) => numberStateMatches(s.state, clamped),
        timedOut ? 45_000 : 12_000,
      );
      if (confirmed) {
        set({
          live: { ...get().live, [key]: clamped },
          writeError: undefined,
          writePending: undefined,
        });
        return true;
      }

      set({
        live: { ...get().live, [key]: previous },
        writeError: timedOut
          ? `Home Assistant timed out and ${labels[key]} did not change on the Pi. Check Tailscale, then Apply again.`
          : `${labels[key]} did not update on the Pi.`,
        writePending: undefined,
      });
      return false;
    },

    async applyGridCharge(allow) {
      const { map, status, live } = get();
      const entity = map.gridCharge;
      if (!entity || status !== "live" || !readCreds()) {
        set({ writeError: "Not connected to the Pi — charge limits stay read-only." });
        return false;
      }
      const previous = live.gridCharge;
      set({
        live: { ...live, gridCharge: allow },
        writeError: undefined,
        writePending: { key: "gridCharge", expected: allow },
      });

      let timedOut = false;
      try {
        await socket.call(entity, allow);
      } catch (err) {
        timedOut = isHaTimeoutError(err);
        if (!timedOut) {
          set({
            live: { ...get().live, gridCharge: previous },
            writeError: haWriteFailureMessage(err, "charge from grid"),
            writePending: undefined,
          });
          return false;
        }
      }

      // Timeout is not failure yet — Huawei Modbus often ACKs after the WS result.
      const confirmed = await socket.waitForCachedState(
        entity,
        (s) => switchStateMatches(s.state, allow),
        timedOut ? 45_000 : 12_000,
      );
      if (confirmed) {
        set({
          live: { ...get().live, gridCharge: allow },
          writeError: undefined,
          writePending: undefined,
        });
        return true;
      }

      set({
        live: { ...get().live, gridCharge: previous },
        writeError: timedOut
          ? "Home Assistant timed out and charge from grid did not change on the Pi. Check Tailscale, then Apply again."
          : "Charge from grid did not update on the Pi.",
        writePending: undefined,
      });
      return false;
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
      const previous = live.zappiMode;
      set({
        live: { ...live, zappiMode: trimmed },
        writeError: undefined,
        writePending: { key: "zappiMode", expected: trimmed },
      });

      let timedOut = false;
      try {
        await socket.setSelect(entity, trimmed);
      } catch (err) {
        timedOut = isHaTimeoutError(err);
        if (!timedOut) {
          set({
            live: { ...get().live, zappiMode: previous },
            writeError: haWriteFailureMessage(err, "Zappi mode"),
            writePending: undefined,
          });
          return false;
        }
      }

      const confirmed = await socket.waitForCachedState(
        entity,
        (s) => s.state.trim() === trimmed,
        timedOut ? 45_000 : 12_000,
      );
      if (confirmed) {
        set({
          live: { ...get().live, zappiMode: trimmed },
          writeError: undefined,
          writePending: undefined,
        });
        return true;
      }

      set({
        live: { ...get().live, zappiMode: previous },
        writeError: timedOut
          ? "Home Assistant timed out and Zappi mode did not change on the Pi. Check Tailscale, then Apply again."
          : "Zappi mode did not update on the Pi.",
        writePending: undefined,
      });
      return false;
    },

    async applyEvReadyBy(time) {
      const { map, status, live, evReadyByOptions: options } = get();
      const entity = map.evReadyBy;
      const trimmed = time.trim();
      if (!entity || status !== "live" || !readCreds()) {
        set({ writeError: "Not connected to the Pi — EV ready-by stays read-only." });
        return false;
      }
      if (!trimmed || (options.length > 0 && !options.includes(trimmed))) {
        set({ writeError: "Pick a ready-by time Octopus accepts, then Apply." });
        return false;
      }
      const previous = live.evReadyBy;
      set({
        live: { ...live, evReadyBy: trimmed },
        writeError: undefined,
        writePending: { key: "evReadyBy", expected: trimmed },
      });

      const domain = entity.split(".")[0] ?? "";
      let timedOut = false;
      try {
        if (domain === "select" || domain === "input_select") {
          await socket.setSelect(entity, trimmed);
        } else if (domain === "time" || domain === "input_datetime") {
          await socket.setTime(entity, trimmed);
        } else {
          set({
            live: { ...get().live, evReadyBy: previous },
            writeError: `Ready-by entity ${entity} is not a select/time helper — cannot write.`,
            writePending: undefined,
          });
          return false;
        }
      } catch (err) {
        timedOut = isHaTimeoutError(err);
        if (!timedOut) {
          set({
            live: { ...get().live, evReadyBy: previous },
            writeError: haWriteFailureMessage(err, "EV ready by"),
            writePending: undefined,
          });
          return false;
        }
      }

      const confirmed = await socket.waitForCachedState(
        entity,
        (s) => {
          const raw = s.state.trim();
          const m = raw.match(/^(\d{1,2}):(\d{2})/);
          const normalized = m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : raw;
          return normalized === trimmed || raw === trimmed;
        },
        timedOut ? 45_000 : 12_000,
      );
      if (confirmed) {
        set({
          live: { ...get().live, evReadyBy: trimmed },
          writeError: undefined,
          writePending: undefined,
        });
        return true;
      }

      set({
        live: { ...get().live, evReadyBy: previous },
        writeError: timedOut
          ? "Home Assistant timed out and EV ready-by did not change on the Pi. Check Tailscale, then Apply again."
          : "EV ready-by did not update on the Pi.",
        writePending: undefined,
      });
      return false;
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
        historyDays: remapDayCosts(get().historyDays, next),
        historyYear: remapDayCosts(get().historyYear, next),
      });

      const { map, status } = get();
      if (status === "live" && readCreds()) {
        // Recompute from hourly TOU stats so Peak/Off-peak £ stay accurate.
        void get().refreshHistory();
      }
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

    toggleFan() {
      const { fanControl, status } = get();
      if (!fanControl.available || !fanControl.entityId) return;
      const nextOn = !fanControl.on;
      const level = fanControl.speedLevel && fanControl.speedLevel > 0 ? fanControl.speedLevel : 2;
      const nextPct = nextOn ? fanLevelToPercentage(level, fanControl.speedCount) : 0;
      set({
        fanControl: {
          ...fanControl,
          on: nextOn,
          percentage: nextPct,
          speedLevel: nextOn ? level : null,
        },
      });
      if (fanControl.entityId.startsWith("demo.")) return;
      if (status === "live" && readCreds()) {
        void socket.call(fanControl.entityId, nextOn);
      }
    },

    setFanSpeedLevel(level) {
      const { fanControl, status } = get();
      if (!fanControl.available || !fanControl.entityId) return;
      if (fanControl.speedMode === "none") return;
      const count = Math.max(2, fanControl.speedCount);
      const clamped = Math.min(count, Math.max(1, Math.round(level)));
      const pct = fanLevelToPercentage(clamped, count);
      set({
        fanControl: {
          ...fanControl,
          on: true,
          percentage: pct,
          speedLevel: clamped,
        },
      });
      if (fanControl.entityId.startsWith("demo.")) return;
      if (status !== "live" || !readCreds()) return;

      if (fanControl.speedEntityId && fanControl.speedMode === "select") {
        const option =
          fanControl.speedOptions[clamped - 1] ??
          fanControl.speedOptions.find((o) => o.includes(String(clamped))) ??
          String(clamped);
        void socket.setSelect(fanControl.speedEntityId, option);
        if (!fanControl.on) void socket.call(fanControl.entityId, true);
        return;
      }
      if (fanControl.speedEntityId && fanControl.speedMode === "number") {
        // Prefer writing the discrete level (Tuya 1–N) when the helper max looks small.
        void socket.setNumber(fanControl.speedEntityId, clamped);
        if (!fanControl.on) void socket.call(fanControl.entityId, true);
        return;
      }
      if (fanControl.entityId.startsWith("fan.")) {
        void socket.setFanPercentage(fanControl.entityId, pct);
      }
    },

    toggleFanLight() {
      const { fanControl, status } = get();
      if (!fanControl.available || !fanControl.lightEntityId) return;
      const nextOn = !fanControl.lightOn;
      set({ fanControl: { ...fanControl, lightOn: nextOn } });
      if (fanControl.lightEntityId.startsWith("demo.")) return;
      if (status === "live" && readCreds()) {
        void socket.call(fanControl.lightEntityId, nextOn);
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
  "willow-tree",
  "range-rover-hybrid",
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
    fanControl: fanControlFromStates(lastStates, useHouse.getState().map),
  });
}

export function useLive() {
  return useHouse((s) => s.live);
}

export function useTariffs() {
  return useHouse((s) => s.tariffs);
}
