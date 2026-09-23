/**
 * AC-bus energy balance for Huawei hybrid + grid + Zappi (Chimes-Pi).
 *
 * Sign conventions (live entities):
 * - solarNowW ≥ 0 — PV production (W); prefer inverter_input_power, not active power
 * - gridW > 0 import, gridW < 0 export (prefer myenergi grid over Huawei power_meter)
 * - batteryW > 0 charging, batteryW < 0 discharging
 * - zappiW ≥ 0 — EV charge power (separate Energy Flow node)
 *
 * With a separate car node, household Home excludes Zappi:
 * Conservation: solar + import + discharge = house + export + charge + zappi
 * ⇒ houseW = solarNowW + gridW − batteryW − zappiW
 *
 * Clamped to ≥ 0 so noise / missing legs never invent a negative “load”.
 */
export function deriveHouseW(
  solarNowW: number,
  gridW: number,
  batteryW: number,
  zappiW = 0,
): number {
  const solar = Number.isFinite(solarNowW) ? solarNowW : 0;
  const grid = Number.isFinite(gridW) ? gridW : 0;
  const battery = Number.isFinite(batteryW) ? batteryW : 0;
  const zappi = Number.isFinite(zappiW) ? zappiW : 0;
  return Math.max(0, Math.round(solar + grid - battery - zappi));
}
