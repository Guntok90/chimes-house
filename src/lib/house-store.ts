import { create } from "zustand";
import {
  DEFAULT_HA_URL,
  HaSocket,
  autoMap,
  liveFromStates,
  readCreds,
  readMap,
  switchOn,
  writeCreds,
  writeMap,
  type HaCreds,
  type HaMap,
  type HaState,
  type SwitchId,
} from "./ha";
import { SNAPSHOT, type HouseLive } from "./house";

const socket = new HaSocket();
const SERVER_POLL_MS = 7_000;

type Status = "demo" | "connecting" | "live" | "error";

type ServerLiveResponse = {
  configured: boolean;
  live?: HouseLive;
  switches?: Record<string, boolean>;
  map?: HaMap;
  error?: string;
};

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

let serverPollTimer: ReturnType<typeof setInterval> | null = null;
let serverPollInFlight = false;

function stopServerPoll() {
  if (serverPollTimer) {
    clearInterval(serverPollTimer);
    serverPollTimer = null;
  }
}

export const useHouse = create<Store>((set, get) => {
  async function pollServerOnce() {
    if (serverPollInFlight) return;
    if (readCreds()) return;
    serverPollInFlight = true;
    try {
      const res = await fetch("/api/ha/live", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        set({ status: "demo", error: undefined });
        return;
      }
      const data = (await res.json()) as ServerLiveResponse;
      if (!data.configured) {
        // No HA_TOKEN on the host — stay on demo until House Connect.
        if (get().status !== "live") set({ status: "demo", error: undefined });
        return;
      }
      if (data.error && !data.live) {
        if (get().status !== "live") {
          set({ status: "error", error: data.error });
        }
        return;
      }
      if (data.live) {
        if (data.map) writeMap(data.map);
        set({
          live: data.live,
          switches: data.switches ?? {},
          map: data.map ?? get().map,
          status: "live",
          error: undefined,
          url: DEFAULT_HA_URL,
        });
      }
    } catch (err) {
      if (get().status !== "live") {
        set({
          status: "error",
          error: err instanceof Error ? err.message : "Could not reach live house.",
        });
      }
    } finally {
      serverPollInFlight = false;
    }
  }

  function startServerPoll() {
    stopServerPoll();
    set({ status: "connecting", error: undefined });
    void pollServerOnce();
    serverPollTimer = setInterval(() => {
      void pollServerOnce();
    }, SERVER_POLL_MS);
  }

  return {
    live: { ...SNAPSHOT },
    switches: {},
    status: "demo",
    map: {},
    url: DEFAULT_HA_URL,

    boot() {
      const creds = readCreds();
      if (creds) {
        stopServerPoll();
        void get().connect(creds);
        return;
      }
      startServerPoll();
    },

    async connect(creds) {
      stopServerPoll();
      set({ status: "connecting", error: undefined, url: creds.url });
      writeCreds(creds);
      socket.onStatus = (s, err) => {
        if (s === "live") set({ status: "live", error: undefined });
        if (s === "connecting") set({ status: "connecting" });
        if (s === "error") set({ status: "error", error: err });
      };
      socket.onStates = (states: HaState[]) => {
        const saved = readMap();
        const mapped = { ...autoMap(states), ...saved };
        writeMap(mapped);
        set({
          live: liveFromStates(states, mapped, SNAPSHOT),
          switches: switchOn(states, mapped),
          map: mapped,
          status: "live",
        });
      };
      try {
        await socket.connect(creds.url, creds.token);
      } catch (err) {
        set({
          status: "error",
          error: err instanceof Error ? err.message : "Could not connect.",
        });
      }
    },

    disconnect() {
      socket.onStatus = null;
      socket.onStates = null;
      socket.close();
      writeCreds(null);
      set({ status: "demo", live: { ...SNAPSHOT }, error: undefined });
      // Fall back to server live when the host has HA_TOKEN.
      startServerPoll();
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
