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

export const useHouse = create<Store>((set, get) => ({
  live: { ...SNAPSHOT },
  switches: {},
  status: "demo",
  map: {},
  url: DEFAULT_HA_URL,

  boot() {
    const creds = readCreds();
    if (creds) void get().connect(creds);
  },

  async connect(creds) {
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
  },

  toggle(id) {
    const { map, switches } = get();
    const entity = map[id as SwitchId];
    set({ switches: { ...switches, [id]: !switches[id] } });
    if (entity && get().status === "live") {
      void socket.call(entity);
    }
  },
}));

export function useLive() {
  return useHouse((s) => s.live);
}
