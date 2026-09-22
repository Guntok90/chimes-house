import { EMPTY_LIVE, type HouseLive } from "./house";
import {
  autoMap,
  liveFromStates,
  switchOn,
  type HaMap,
  type HaState,
} from "./ha";
import { haToken, haUrl } from "./env.server";

export type HaLivePayload = {
  configured: boolean;
  live?: HouseLive;
  switches?: Record<string, boolean>;
  map?: HaMap;
  error?: string;
};

export function isHaConfigured(): boolean {
  return Boolean(haToken());
}

export async function fetchHaStates(): Promise<HaState[]> {
  const token = haToken();
  if (!token) {
    throw new Error("HA_TOKEN is not configured");
  }

  const base = haUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${base}/api/states`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Home Assistant returned ${res.status}`);
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error("Home Assistant states response was not a list");
    }
    return data as HaState[];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHaLive(): Promise<HaLivePayload> {
  if (!isHaConfigured()) {
    return { configured: false };
  }

  try {
    const states = await fetchHaStates();
    const map = autoMap(states);
    // EMPTY_LIVE — never blend SNAPSHOT demo numbers into a live payload.
    return {
      configured: true,
      live: liveFromStates(states, map, EMPTY_LIVE),
      switches: switchOn(states, map),
      map,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Home Assistant did not answer in time"
          : err.message
        : "Could not reach Home Assistant";
    return { configured: true, error: message };
  }
}
