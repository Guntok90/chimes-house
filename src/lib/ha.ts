import { SNAPSHOT, type HouseLive } from "./house";

export type HaState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};

export type HaMap = Partial<Record<keyof HouseLive | SwitchId, string>>;

export type SwitchId =
  | "lamp"
  | "kitchen"
  | "pergola"
  | "pond-1"
  | "pond-2"
  | "telly"
  | "fish"
  | "stevie-blanket"
  | "baby-blanket";

export const SWITCHES: { id: SwitchId; label: string; match: string[] }[] = [
  { id: "lamp", label: "Lamp", match: ["lamp", "lounge lamp", "living lamp"] },
  { id: "kitchen", label: "Kitchen", match: ["kitchen"] },
  { id: "pergola", label: "Pergola", match: ["pergola"] },
  { id: "pond-1", label: "Pond 1", match: ["pond 1", "pond_1", "pond1"] },
  { id: "pond-2", label: "Pond 2", match: ["pond 2", "pond_2", "pond2"] },
  { id: "telly", label: "Telly", match: ["telly", "tv", "television"] },
  { id: "fish", label: "Fish", match: ["fish", "aquarium"] },
  { id: "stevie-blanket", label: "Stevie’s blanket", match: ["stevie", "blanket"] },
  { id: "baby-blanket", label: "Baby’s blanket", match: ["baby", "blanket"] },
];

const CREDS = "chimes.ha.creds";
const MAP = "chimes.ha.map";

export type HaCreds = { url: string; token: string };

export function readCreds(): HaCreds | null {
  try {
    const raw = localStorage.getItem(CREDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HaCreds;
    if (!parsed.url || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreds(creds: HaCreds | null) {
  if (!creds) localStorage.removeItem(CREDS);
  else localStorage.setItem(CREDS, JSON.stringify(creds));
}

export function readMap(): HaMap {
  try {
    return JSON.parse(localStorage.getItem(MAP) || "{}") as HaMap;
  } catch {
    return {};
  }
}

export function writeMap(map: HaMap) {
  localStorage.setItem(MAP, JSON.stringify(map));
}

export function toWs(url: string) {
  const u = new URL(url);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/api/websocket";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function num(state: string) {
  const n = Number.parseFloat(state);
  return Number.isFinite(n) ? n : null;
}

function blob(s: HaState) {
  return `${s.entity_id} ${String(s.attributes.friendly_name ?? "")}`.toLowerCase();
}

function find(states: HaState[], test: (s: HaState, b: string) => boolean) {
  return states.find((s) => s.state !== "unavailable" && s.state !== "unknown" && test(s, blob(s)));
}

export function autoMap(states: HaState[]): HaMap {
  const map: HaMap = {};
  const soc = find(
    states,
    (s, b) =>
      (b.includes("soc") || b.includes("state_of_charge") || b.includes("battery_capacity")) &&
      (b.includes("battery") || b.includes("luna") || b.includes("ess")),
  );
  const battW = find(
    states,
    (s, b) =>
      (b.includes("battery") || b.includes("luna")) &&
      (b.includes("power") || b.includes("charge_discharge")) &&
      !b.includes("pv") &&
      !b.includes("today"),
  );
  const solarNow = find(
    states,
    (s, b) =>
      (b.includes("pv") || b.includes("solar") || b.includes("input_power")) &&
      (b.includes("power") || b.includes("watt")) &&
      !b.includes("today") &&
      !b.includes("daily") &&
      !b.includes("battery"),
  );
  const solarToday = find(
    states,
    (s, b) =>
      (b.includes("solar") || b.includes("pv") || b.includes("yield")) &&
      (b.includes("today") || b.includes("daily")) &&
      !b.includes("battery"),
  );
  const house = find(
    states,
    (s, b) =>
      (b.includes("house") || b.includes("load") || b.includes("consumption")) &&
      (b.includes("power") || b.includes("watt")) &&
      !b.includes("battery") &&
      !b.includes("solar"),
  );
  const grid = find(
    states,
    (s, b) =>
      (b.includes("grid") || b.includes("meter")) &&
      (b.includes("power") || b.includes("watt")) &&
      !b.includes("today"),
  );
  const inverterW = find(
    states,
    (s, b) =>
      (b.includes("inverter") || b.includes("sun2000") || b.includes("active_power")) &&
      (b.includes("power") || b.includes("active")) &&
      !b.includes("battery"),
  );
  const inverterStatus = find(states, (s, b) => b.includes("inverter") && (b.includes("status") || b.includes("state")));
  const zappiMode = find(states, (s, b) => b.includes("zappi") && b.includes("mode"));
  const zappiPlug = find(
    states,
    (s, b) => b.includes("zappi") && (b.includes("plug") || b.includes("connected") || b.includes("status")),
  );
  const offPeak = find(
    states,
    (s, b) => b.includes("off_peak") || b.includes("off-peak") || (b.includes("octopus") && b.includes("slot")),
  );
  const intelligent = find(states, (s, b) => b.includes("intelligent") || (b.includes("octopus") && b.includes("ready")));
  const gridCharge = find(states, (s, b) => b.includes("grid") && b.includes("charge"));
  const stevie = find(states, (s, b) => s.entity_id.startsWith("person.") && (b.includes("stevie") || b.includes("steve")));

  if (soc) map.soc = soc.entity_id;
  if (battW) map.batteryW = battW.entity_id;
  if (solarNow) map.solarNowW = solarNow.entity_id;
  if (solarToday) map.solarTodayKwh = solarToday.entity_id;
  if (house) map.houseW = house.entity_id;
  if (grid) map.gridW = grid.entity_id;
  if (inverterW) map.inverterW = inverterW.entity_id;
  if (inverterStatus) map.inverterStatus = inverterStatus.entity_id;
  if (zappiMode) map.zappiMode = zappiMode.entity_id;
  if (zappiPlug) map.zappiPlugged = zappiPlug.entity_id;
  if (offPeak) map.offPeak = offPeak.entity_id;
  if (intelligent) map.intelligent = intelligent.entity_id;
  if (gridCharge) map.gridCharge = gridCharge.entity_id;
  if (stevie) map.stevieHome = stevie.entity_id;

  for (const sw of SWITCHES) {
    const hit = states.find((s) => {
      if (!s.entity_id.startsWith("light.") && !s.entity_id.startsWith("switch.")) return false;
      const b = blob(s);
      return sw.match.some((m) => b.includes(m));
    });
    if (hit) map[sw.id] = hit.entity_id;
  }
  return map;
}

export function liveFromStates(states: HaState[], map: HaMap, fallback: HouseLive): HouseLive {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const take = (key: keyof HouseLive) => {
    const id = map[key];
    return id ? byId.get(id) : undefined;
  };
  const n = (key: keyof HouseLive, current: number) => {
    const s = take(key);
    if (!s) return current;
    return num(s.state) ?? current;
  };
  const flag = (key: keyof HouseLive, current: boolean) => {
    const s = take(key);
    if (!s) return current;
    const v = s.state.toLowerCase();
    return v === "on" || v === "true" || v === "home" || v === "yes" || v === "active";
  };

  const batt = take("batteryW");
  let batteryW = n("batteryW", fallback.batteryW);
  if (batt) {
    const b = blob(batt);
    const charging = b.includes("charg") && !b.includes("discharg");
    if (b.includes("discharg") && batteryW > 0) batteryW = -batteryW;
    if (charging && batteryW < 0) batteryW = Math.abs(batteryW);
  }

  return {
    soc: Math.round(n("soc", fallback.soc)),
    batteryW: Math.round(batteryW),
    inverterW: Math.round(n("inverterW", fallback.inverterW)),
    solarNowW: Math.round(n("solarNowW", fallback.solarNowW)),
    houseW: Math.round(n("houseW", fallback.houseW)),
    gridW: Math.round(n("gridW", fallback.gridW)),
    solarTodayKwh: Number(n("solarTodayKwh", fallback.solarTodayKwh).toFixed(2)),
    inverterStatus: take("inverterStatus")?.state ?? fallback.inverterStatus,
    zappiMode: take("zappiMode")?.state ?? fallback.zappiMode,
    zappiPlugged: flag("zappiPlugged", fallback.zappiPlugged),
    intelligent: flag("intelligent", fallback.intelligent),
    offPeak: flag("offPeak", fallback.offPeak),
    gridCharge: flag("gridCharge", fallback.gridCharge),
    stevieHome: flag("stevieHome", fallback.stevieHome),
  };
}

export function switchOn(states: HaState[], map: HaMap): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const sw of SWITCHES) {
    const id = map[sw.id];
    const s = id ? states.find((x) => x.entity_id === id) : undefined;
    if (s) out[sw.id] = s.state === "on";
  }
  return out;
}

type Msg = { id?: number; type: string; [k: string]: unknown };

export class HaSocket {
  private ws: WebSocket | null = null;
  private id = 1;
  private pending = new Map<number, { ok: (v: unknown) => void; err: (e: Error) => void }>();
  private states: HaState[] = [];
  onStates: ((states: HaState[]) => void) | null = null;
  onStatus: ((s: "connecting" | "live" | "error", err?: string) => void) | null = null;

  async connect(url: string, token: string) {
    this.close();
    this.onStatus?.("connecting");
    const ws = new WebSocket(toWs(url));
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Home Assistant did not answer.")), 8000);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as Msg;
        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: token }));
          return;
        }
        if (msg.type === "auth_ok") {
          window.clearTimeout(timer);
          resolve();
          return;
        }
        if (msg.type === "auth_invalid") {
          window.clearTimeout(timer);
          reject(new Error("Token refused."));
          return;
        }
        if (typeof msg.id === "number") {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.success === false) p.err(new Error("Home Assistant request failed."));
            else p.ok(msg.result);
          }
        }
        if (msg.type === "event") {
          const event = msg.event as { data?: { new_state?: HaState } };
          const next = event.data?.new_state;
          if (next) {
            const i = this.states.findIndex((s) => s.entity_id === next.entity_id);
            if (i >= 0) this.states[i] = next;
            else this.states.push(next);
            this.onStates?.([...this.states]);
          }
        }
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Could not reach Home Assistant."));
      };
      ws.onclose = () => {
        this.onStatus?.("error", "Disconnected.");
      };
    });
    this.onStatus?.("live");
    this.states = (await this.send("get_states")) as HaState[];
    this.onStates?.([...this.states]);
    await this.send("subscribe_events", { event_type: "state_changed" });
    return this.states;
  }

  async call(entityId: string, turnOn?: boolean) {
    const [domain] = entityId.split(".");
    const service =
      turnOn === undefined ? "toggle" : turnOn ? "turn_on" : "turn_off";
    await this.send("call_service", {
      domain,
      service,
      target: { entity_id: entityId },
    });
  }

  private send(type: string, extra: Record<string, unknown> = {}) {
    const id = this.id++;
    return new Promise((ok, err) => {
      this.pending.set(id, { ok, err });
      this.ws?.send(JSON.stringify({ id, type, ...extra }));
    });
  }

  close() {
    this.ws?.close();
    this.ws = null;
    this.pending.clear();
  }
}

export { SNAPSHOT };
