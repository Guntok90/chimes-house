export type HouseLive = {
  soc: number;
  batteryW: number;
  inverterW: number;
  solarNowW: number;
  houseW: number;
  gridW: number;
  solarTodayKwh: number;
  inverterStatus: string;
  zappiMode: string;
  zappiPlugged: boolean;
  /** Zappi charge power (W) when a myenergi power entity is present. */
  zappiW: number;
  intelligent: boolean;
  offPeak: boolean;
  gridCharge: boolean;
  stevieHome: boolean;
  /** From `sun.sun` when available; demo evening snapshot is below horizon. */
  sunAboveHorizon: boolean;
};

/**
 * Neutral values used while mapping HA states — never fall back to demo numbers
 * (e.g. 16.68 kWh) once we are on a live path.
 */
export const EMPTY_LIVE: HouseLive = {
  soc: 0,
  batteryW: 0,
  inverterW: 0,
  solarNowW: 0,
  houseW: 0,
  gridW: 0,
  solarTodayKwh: 0,
  inverterStatus: "—",
  zappiMode: "—",
  zappiPlugged: false,
  zappiW: 0,
  intelligent: false,
  offPeak: false,
  gridCharge: false,
  stevieHome: false,
  sunAboveHorizon: true,
};

export const SNAPSHOT: HouseLive = {
  soc: 81,
  batteryW: -376,
  inverterW: 374,
  solarNowW: 0,
  houseW: 374,
  gridW: 0,
  solarTodayKwh: 16.68,
  inverterStatus: "On-grid",
  zappiMode: "Eco+",
  zappiPlugged: false,
  zappiW: 0,
  intelligent: true,
  offPeak: true,
  gridCharge: false,
  stevieHome: true,
  sunAboveHorizon: false,
};

/** Demo snapshot. Live values come from `useLive()`. */
export const LIVE = SNAPSHOT;

export type ConnectionStatus = "demo" | "connecting" | "live" | "error";

/**
 * Solar caption. “after dusk” only while a live socket says sun.sun is below
 * the horizon — never for a failed connect or the demo snapshot.
 */
export function solarStatusHint(status: ConnectionStatus, live: HouseLive): string {
  if (status !== "live") return status === "error" ? "not connected" : "demo";
  if (live.solarNowW > 30) return "producing";
  if (live.sunAboveHorizon === false) return "after dusk";
  return "idle";
}

export type DayPoint = {
  key: string;
  label: string;
  solar: number;
  house: number;
  gridIn: number;
  gridOut: number;
  battCharge: number;
  battDischarge: number;
  cost: number;
};

export type HourPoint = {
  hour: string;
  soc: number;
  battW: number;
  solarW: number;
  houseW: number;
  gridW: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const NOW = new Date("2026-09-20T21:00:00+01:00");

export function lastDays(count: number): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(NOW);
    d.setDate(NOW.getDate() - i);
    const seed = d.getDate() + d.getMonth() * 13;
    const solar =
      i === 0 ? SNAPSHOT.solarTodayKwh : clamp(9.2 + ((seed * 17) % 90) / 10, 6.4, 18.8);
    const house = clamp(11.5 + ((seed * 11) % 50) / 10, 10.2, 16.4);
    const battCharge = clamp(solar * 0.42 + (seed % 5) * 0.15, 2.1, 9.8);
    const battDischarge = clamp(house * 0.38 + (seed % 4) * 0.2, 2.4, 8.6);
    const surplus = Math.max(0, solar - house + battDischarge - battCharge);
    const short = Math.max(0, house - solar - battDischarge + battCharge * 0.15);
    const gridOut = clamp(surplus * 0.55, 0, 6.2);
    const gridIn = clamp(short * 0.7, 0.2, 8.4);
    const cost = Number((gridIn * (SNAPSHOT.offPeak && i === 0 ? 0.07 : 0.226)).toFixed(2));
    out.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      solar: Number(solar.toFixed(2)),
      house: Number(house.toFixed(2)),
      gridIn: Number(gridIn.toFixed(2)),
      gridOut: Number(gridOut.toFixed(2)),
      battCharge: Number(battCharge.toFixed(2)),
      battDischarge: Number(battDischarge.toFixed(2)),
      cost,
    });
  }
  return out;
}

export function lastHours(): HourPoint[] {
  const out: HourPoint[] = [];
  let soc = 54;
  for (let h = 0; h < 24; h++) {
    const isNowSlot = h === 21;
    let solarW = 0;
    if (h >= 7 && h <= 18) {
      const peak = 1 - Math.abs(h - 13) / 7;
      solarW = Math.round(peak * 4200);
    }
    const houseW = h < 6 ? 220 : h < 9 ? 640 : h < 17 ? 410 : h < 22 ? 520 : 280;
    let battW = 0;
    if (solarW > houseW + 200) battW = Math.min(2200, solarW - houseW);
    else if (solarW < houseW - 80) battW = -(houseW - solarW);
    if (isNowSlot) {
      solarW = SNAPSHOT.solarNowW;
      battW = SNAPSHOT.batteryW;
      soc = SNAPSHOT.soc;
    } else {
      soc = clamp(soc + (battW / 10000) * 100, 12, 98);
    }
    const gridW = houseW - solarW - (battW < 0 ? -battW : 0) + (battW > 0 ? battW : 0);
    out.push({
      hour: `${String(h).padStart(2, "0")}:00`,
      soc: Math.round(soc),
      battW: Math.round(battW),
      solarW,
      houseW,
      gridW: Math.round(gridW * 0.15),
    });
  }
  out[21] = {
    hour: "21:00",
    soc: SNAPSHOT.soc,
    battW: SNAPSHOT.batteryW,
    solarW: SNAPSHOT.solarNowW,
    houseW: SNAPSHOT.houseW,
    gridW: SNAPSHOT.gridW,
  };
  return out;
}

export const WEEK = lastDays(7);
export const MONTH = lastDays(28);
export const HOURS = lastHours();
