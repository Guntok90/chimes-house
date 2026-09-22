import { create } from "zustand";
import {
  DEFAULT_HA_URL,
  HaSocket,
  autoMap,
  credsForBoot,
  liveFromStates,
  readCreds,
  readMap,
  switchOn,
  writeCreds,
  writeMap,
  wsFailureMessage,
  type HaBootstrapResponse,
  type HaCreds,
  type HaMap,
  type HaState,
  type SwitchId,
} from "./ha";
import { EMPTY_LIVE, SNAPSHOT, type HouseLive } from "./house";

const socket = new HaSocket();

type Status = "demo" | "connecting" | "live" | "error";

type Store = {
  live: HouseLive;
  switches: Record<string, boolean>;
  status: Status;
  error?: string;
  map: HaMap;
  url: string;
  connect: (creds: HaCreds) => Promise<void>;
  disconnect: () => void;
  boot: () => void;
  toggle: (id: string) => void;
};

let bootInFlight: Promise<void> | null = null;

export const useHouse = create<Store>((set, get) => {
  return {
    live: { ...SNAPSHOT },
    switches: {},
    status: "demo",
    map: {},
    url: DEFAULT_HA_URL,

    boot() {
      if (bootInFlight) return;
      bootInFlight = (async () => {
        set({ status: "connecting", error: undefined });
        let bootstrap: HaBootstrapResponse | null = null;
        let bootstrapFailed = false;
        try {
          const res = await fetch("/api/ha/bootstrap", {
            credentials: "include",
            cache: "no-store",
          });
          if (res.status === 401) {
            set({ status: "demo", live: { ...SNAPSHOT }, error: undefined });
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
          });
          return;
        }
        await get().connect(creds);
      })().finally(() => {
        bootInFlight = null;
      });
    },

    async connect(creds) {
      set({ status: "connecting", error: undefined, url: creds.url });
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
          });
        }
      };
      socket.onStates = (states: HaState[]) => {
        const saved = readMap();
        // autoMap wins over stale localStorage so preferred Pi entities stick.
        const mapped = { ...saved, ...autoMap(states) };
        writeMap(mapped);
        set({
          live: liveFromStates(states, mapped, EMPTY_LIVE),
          switches: switchOn(states, mapped),
          map: mapped,
          status: "live",
          error: undefined,
        });
      };
      try {
        await socket.connect(creds.url, creds.token);
      } catch (err) {
        socket.close();
        set({
          status: "error",
          error: wsFailureMessage(err instanceof Error ? err.message : "Could not connect."),
          live: { ...SNAPSHOT },
        });
      }
    },

    disconnect() {
      socket.onStatus = null;
      socket.onStates = null;
      socket.close();
      writeCreds(null);
      set({ status: "demo", live: { ...SNAPSHOT }, error: undefined });
    },

    toggle(id) {
      const { map, switches } = get();
      const entity = map[id as SwitchId];
      set({ switches: { ...switches, [id]: !switches[id] } });
      if (entity && get().status === "live" && readCreds()) {
        void socket.call(entity);
      }
    },
  };
});

export function useLive() {
  return useHouse((s) => s.live);
}
