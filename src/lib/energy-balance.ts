/**
 * AC-bus energy balance for Huawei hybrid + grid meter (Chimes-Pi).
 *
 * Sign conventions (live entities):
 * - solarNowW ≥ 0 — PV production (W)
 * - gridW > 0 import, gridW < 0 export (power_meter / myenergi grid)
 * - batteryW > 0 charging, batteryW < 0 discharging
 *
 * Conservation: solar + import + discharge = house + export + charge
 * ⇒ houseW = solarNowW + gridW − batteryW
 *
 * Clamped to ≥ 0 so noise / missing legs never invent a negative “load”.
 */
export function deriveHouseW(solarNowW: number, gridW: number, batteryW: number): number {
  const solar = Number.isFinite(solarNowW) ? solarNowW : 0;
  const grid = Number.isFinite(gridW) ? gridW : 0;
  const battery = Number.isFinite(batteryW) ? batteryW : 0;
  return Math.max(0, Math.round(solar + grid - battery));
}
