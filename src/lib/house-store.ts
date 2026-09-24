import { create } from "zustand";
import {
  daysFromStatistics,
  historyEntityIds,
  hoursFromHistory,
  normalizeHistoryResult,
  type HaStatisticsBag,
} from "./ha-history";
import {
  DEFAULT_HA_URL,
  HaSocket,
  autoMap,
  credsForBoot,
  liveFromStates,
  readCreds,
  readMap,
  switchOn,
  tariffsFromStates,
  writeCreds,
  writeMap,
  wsFailureMessage,
  type HaBootstrapResponse,
  type HaCreds,
  type HaMap,
  type HaState,
  type SwitchId,
} from "./ha";
import { EMPTY_LIVE, SNAPSHOT, type DayPoint, type HourPoint, type HouseLive } from "./house";
import {
  DEFAULT_TARIFFS,
  clampRate,
  estimateImportCost,
  readLocalTariffs,
  resolveTariffs,
  writeLocalTariffs,
  type TariffRates,
  type TariffState,
} from "./tariffs";

const socket = new HaSocket();

type Status = "demo" | "connecting" | "live" | "error";
type HistoryStatus = "idle" | "loading" | "ready" | "empty";

function bootTariffs(): TariffState {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_TARIFFS, source: "default", haHelpers: false };
  }
  return resolveTariffs(null, readLocalTariffs());
}

function remapDayCosts(days: DayPoint[], rates: TariffRates): DayPoint[] {
  return days.map((d) => ({ ...d, cost: estimateImportCost(d.gridIn, rates) }));
}

type Store = {
  live: HouseLive;
  switches: Record<string, boolean>;
  status: Status;
  error?: string;
  map: HaMap;
  url: string;
  /** Live HA history only — never demo WEEK/HOURS while status === "live". */
  historyHours: HourPoint[];
  historyWeek: DayPoint[];
  historyMonth: DayPoint[];
  historyStatus: HistoryStatus;
  /** Custom £/kWh rates for History/Energy spend maths. */
  tariffs: TariffState;
  connect: (creds: HaCreds) => Promise<void>;
  disconnect: () => void;
  boot: () => void;
  toggle: (id: string) => void;
  refreshHistory: () => Promise<void>;
  /** Persist cheap/peak rates (HA helpers when mapped, else localStorage). */
  setTariffs: (patch: Partial<TariffRates>) => Promise<void>;
};

let bootInFlight: Promise<void> | null = null;
let historyInFlight: Promise<void> | null = null;

export const useHouse = create<Store>((set, get) => {
  return {
    live: { ...SNAPSHOT },
    switches: {},
    status: "demo",
    map: {},
    url: DEFAULT_HA_URL,
    historyHours: [],
    historyWeek: [],
    historyMonth: [],
    historyStatus: "idle",
    tariffs: bootTariffs(),

    boot() {
      if (bootInFlight) return;
      bootInFlight = (async () => {
        set({
          status: "connecting",
          error: undefined,
          tariffs: resolveTariffs(null, readLocalTariffs()),
        });
        let bootstrap: HaBootstrapResponse | null = null;
        let bootstrapFailed = false;
        try {
          const res = await fetch("/api/ha/bootstrap", {
            credentials: "include",
            cache: "no-store",
          });
          if (res.status === 401) {
            set({ status: "demo", live: { ...SNAPSHOT }, error: undefined, historyStatus: "idle" });
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
          set({
            status: bootstrapFailed ? "error" : "demo",
            live: { ...SNAPSHOT },
            error: bootstrapFailed
              ? "Could not read Pi setup. Connect from House, on Tailscale."
              : undefined,
            historyStatus: "idle",
          });
          return;
        }
        await get().connect(creds);
      })().finally(() => {
        bootInFlight = null;
      });
    },

    async connect(creds) {
      set({
        status: "connecting",
        error: undefined,
        url: creds.url,
        historyHours: [],
        historyWeek: [],
        historyMonth: [],
        historyStatus: "idle",
      });
      writeCreds(creds);
      socket.onStatus = (s, err) => {
        // Stay on "connecting" until the first state payload. A Live badge
        // with the demo snapshot would read as dusk (0 W, 16.68 kWh).
        if (s === "connecting") set({ status: "connecting", error: undefined });
        if (s === "error") {
          set({
            status: "error",
            error: wsFailureMessage(err ?? "Disconnected."),
            live: { ...SNAPSHOT },
            historyHours: [],
            historyWeek: [],
            historyMonth: [],
            historyStatus: "idle",
            tariffs: resolveTariffs(null, readLocalTariffs()),
          });
        }
      };
      socket.onStates = (states: HaState[]) => {
        const saved = readMap();
        // autoMap wins over stale localStorage so preferred Pi entities stick.
        const mapped = { ...saved, ...autoMap(states) };
        writeMap(mapped);
        const wasLive = get().status === "live";
        const local = readLocalTariffs();
        const haRates = tariffsFromStates(states, mapped);
        const tariffs = resolveTariffs(
          Object.keys(haRates).length ? haRates : null,
          local,
        );
        // Cache HA values locally so demo / reconnect still has last-known rates.
        if (tariffs.source === "ha") writeLocalTariffs(tariffs);
        set({
          live: liveFromStates(states, mapped, EMPTY_LIVE),
          switches: switchOn(states, mapped),
          map: mapped,
          status: "live",
          error: undefined,
          tariffs,
          historyWeek: remapDayCosts(get().historyWeek, tariffs),
          historyMonth: remapDayCosts(get().historyMonth, tariffs),
        });
        if (!wasLive) void get().refreshHistory();
      };
      try {
        await socket.connect(creds.url, creds.token);
      } catch (err) {
        socket.close();
        set({
          status: "error",
          error: wsFailureMessage(err instanceof Error ? err.message : "Could not connect."),
          live: { ...SNAPSHOT },
          historyStatus: "idle",
          tariffs: resolveTariffs(null, readLocalTariffs()),
        });
      }
    },

    async refreshHistory() {
      if (historyInFlight) return historyInFlight;
      if (get().status !== "live") return;
      const map = get().map;
      const ids = historyEntityIds(map);
      if (!ids.length) {
        set({ historyStatus: "empty", historyHours: [], historyWeek: [], historyMonth: [] });
        return;
      }
      set({ historyStatus: "loading" });
      historyInFlight = (async () => {
        try {
          const end = new Date();
          const start24 = new Date(end.getTime() - 24 * 60 * 60 * 1000);
          const start28 = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
          let hours: HourPoint[] = [];
          let week: DayPoint[] = [];
          let month: DayPoint[] = [];
          const rates: TariffRates = get().tariffs;

          // Hourly and daily paths are independent — a stats parse throw must
          // not wipe an otherwise-valid 24h series (and never invent demo data).
          try {
            const raw = await socket.historyDuringPeriod(
              ids,
              start24.toISOString(),
              end.toISOString(),
            );
            hours = hoursFromHistory(normalizeHistoryResult(raw), map, end);
          } catch {
            hours = [];
          }

          try {
            const stats = (await socket.statisticsDuringPeriod(
              ids,
              start28.toISOString(),
              end.toISOString(),
              "day",
            )) as HaStatisticsBag;
            week = daysFromStatistics(stats, map, 7, end, rates);
            month = daysFromStatistics(stats, map, 28, end, rates);
          } catch {
            week = [];
            month = [];
          }

          const empty = hours.length === 0 && week.length === 0;
          set({
            historyHours: hours,
            historyWeek: week,
            historyMonth: month,
            historyStatus: empty ? "empty" : "ready",
          });
        } finally {
          historyInFlight = null;
        }
      })();
      return historyInFlight;
    },

    disconnect() {
      socket.onStatus = null;
      socket.onStates = null;
      socket.close();
      writeCreds(null);
      set({
        status: "demo",
        live: { ...SNAPSHOT },
        error: undefined,
        historyHours: [],
        historyWeek: [],
        historyMonth: [],
        historyStatus: "idle",
        tariffs: resolveTariffs(null, readLocalTariffs()),
      });
    },

    toggle(id) {
      const { map, switches, status } = get();
      const entity = map[id as SwitchId];
      if (!entity) return;
      set({ switches: { ...switches, [id]: !switches[id] } });
      if (status === "live" && readCreds()) {
        void socket.call(entity);
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
      if (status !== "live" || !readCreds()) return;

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
        return;
      }
      try {
        await Promise.all(writes);
      } catch {
        // Keep local values; mark as local so the UI explains the fallback.
        set({
          tariffs: { ...next, source: "local", haHelpers: Boolean(map.tariffCheap || map.tariffPeak) },
        });
      }
    },
  };
});

export function useLive() {
  return useHouse((s) => s.live);
}

export function useTariffs() {
  return useHouse((s) => s.tariffs);
}
