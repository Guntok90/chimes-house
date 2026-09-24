import {
  autoMap,
  interestFromMap,
  liveFromStates,
  readMap,
  sameLive,
  sameSwitches,
  switchOn,
  writeMap,
  type HaMap,
  type HaState,
  type HaSocket,
} from "./ha.ts";
import { EMPTY_LIVE, type HouseLive } from "./house.ts";

export type LiveStoreSlice = {
  live: HouseLive;
  switches: Record<string, boolean>;
  status: "demo" | "connecting" | "live" | "error";
  map: HaMap;
  refreshHistory: () => Promise<void>;
};

/**
 * Apply a WS state snapshot to the house store.
 *
 * Remap + localStorage write only on the first live payload (or empty map).
 * Later events only recompute live/switches — no autoMap thrash on every
 * Pi entity change.
 */
export function applyLiveStates(
  states: HaState[] | Map<string, HaState>,
  get: () => LiveStoreSlice,
  set: (partial: {
    live: HouseLive;
    switches: Record<string, boolean>;
    map: HaMap;
    status: "live";
    error: undefined;
  }) => void,
  sock: Pick<HaSocket, "interest">,
): void {
  const prev = get();
  const firstLive = prev.status !== "live";
  let mapped = prev.map;
  if (firstLive || Object.keys(mapped).length === 0) {
    const inventory = states instanceof Map ? Array.from(states.values()) : states;
    const saved = readMap();
    // autoMap wins over stale localStorage so preferred Pi entities stick.
    mapped = { ...saved, ...autoMap(inventory) };
    writeMap(mapped);
    sock.interest = interestFromMap(mapped);
  }
  const live = liveFromStates(states, mapped, EMPTY_LIVE);
  const switches = switchOn(states, mapped);
  const liveUnchanged = !firstLive && sameLive(prev.live, live);
  const switchesUnchanged = !firstLive && sameSwitches(prev.switches, switches);
  if (liveUnchanged && switchesUnchanged) {
    return;
  }
  set({
    live: liveUnchanged ? prev.live : live,
    switches: switchesUnchanged ? prev.switches : switches,
    map: mapped,
    status: "live",
    error: undefined,
  });
  if (firstLive) void get().refreshHistory();
}
