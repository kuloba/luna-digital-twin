import type { Metric, MetricKey } from "./types";

type Preset = Omit<Metric, "key" | "value" | "bias" | "history"> & { value?: number };

/** Default metric definitions. Individual assets override setpoints and bands. */
export const METRIC_PRESETS: Record<MetricKey, Preset> = {
  temp: { label: "Air temp", unit: "°C", setpoint: 21, low: 19.5, high: 23, noise: 0.06, response: 0.12, precision: 1 },
  rh: { label: "Humidity", unit: "%", setpoint: 66, low: 58, high: 76, noise: 0.25, response: 0.12, precision: 0 },
  vpd: { label: "VPD", unit: "kPa", setpoint: 0.95, low: 0.8, high: 1.2, noise: 0, response: 1, precision: 2 },
  co2: { label: "CO₂", unit: "ppm", setpoint: 1000, low: 850, high: 1200, noise: 6, response: 0.1, precision: 0 },
  ppfd: { label: "PPFD", unit: "µmol/m²/s", setpoint: 280, low: 250, high: 320, noise: 1.2, response: 0.2, precision: 0 },
  dli: { label: "DLI", unit: "mol/m²/d", setpoint: 17, low: 15, high: 19, noise: 0.02, response: 0.05, precision: 1 },
  ec: { label: "EC", unit: "mS/cm", setpoint: 1.8, low: 1.6, high: 2.05, noise: 0.006, response: 0.12, precision: 2 },
  ph: { label: "pH", unit: "", setpoint: 5.9, low: 5.6, high: 6.2, noise: 0.006, response: 0.12, precision: 2 },
  waterTemp: { label: "Root-zone temp", unit: "°C", setpoint: 20, low: 18, high: 22, noise: 0.03, response: 0.1, precision: 1 },
  do: { label: "Dissolved O₂", unit: "mg/L", setpoint: 8.3, low: 7, high: 9.6, noise: 0.03, response: 0.1, precision: 1 },
  moisture: { label: "Substrate moisture", unit: "%", setpoint: 64, low: 56, high: 72, noise: 0.2, response: 0.08, precision: 0 },
  germination: { label: "Germination", unit: "%", setpoint: 96, low: 90, high: 100, noise: 0.05, response: 0.05, precision: 1 },
  battery: { label: "Battery", unit: "%", setpoint: 80, low: 20, high: 100, noise: 0, response: 0, precision: 0 },
  payload: { label: "Payload", unit: "kg", setpoint: 0, low: 0, high: 180, noise: 0, response: 1, precision: 0 },
  throughput: { label: "Throughput", unit: "trays/h", setpoint: 120, low: 95, high: 160, noise: 1.5, response: 0.1, precision: 0 },
  cycleTime: { label: "Cycle time", unit: "s", setpoint: 28, low: 20, high: 34, noise: 0.3, response: 0.1, precision: 1 },
  passRate: { label: "Grade-A pass", unit: "%", setpoint: 94.5, low: 91, high: 100, noise: 0.15, response: 0.08, precision: 1 },
  rejectRate: { label: "Reject rate", unit: "%", setpoint: 1.6, low: 0, high: 3.5, noise: 0.08, response: 0.08, precision: 1 },
  weightDev: { label: "Weight deviation", unit: "g", setpoint: 1.2, low: -4, high: 4, noise: 0.15, response: 0.1, precision: 1 },
  load: { label: "Load", unit: "%", setpoint: 60, low: 0, high: 92, noise: 0, response: 0.02, precision: 0 },
  power: { label: "Power draw", unit: "kW", setpoint: 42, low: 0, high: 60, noise: 0.4, response: 0.1, precision: 1 },
  flow: { label: "Flow", unit: "L/min", setpoint: 18, low: 14, high: 22, noise: 0.15, response: 0.15, precision: 1 },
  doorOpen: { label: "Door", unit: "", setpoint: 0, low: 0, high: 0.5, noise: 0, response: 1, precision: 0 },
  coverage: { label: "Scan coverage", unit: "%", setpoint: 100, low: 85, high: 100, noise: 0, response: 0, precision: 0 },
  level: { label: "Level", unit: "%", setpoint: 70, low: 20, high: 98, noise: 0, response: 0, precision: 0 },
  pressure: { label: "Pressure", unit: "bar", setpoint: 2.4, low: 1.8, high: 3, noise: 0.01, response: 0.15, precision: 2 },
  uv: { label: "UV dose", unit: "mJ/cm²", setpoint: 250, low: 200, high: 320, noise: 1.5, response: 0.1, precision: 0 },
};

let seed = 1337;
/** Deterministic PRNG so every load of the demo starts identically. */
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
export function resetRand(s = 1337) {
  seed = s;
}
export const jitter = (amp: number) => (rand() * 2 - 1) * amp;

export function metric(key: MetricKey, overrides: Partial<Preset> = {}): Metric {
  const preset = { ...METRIC_PRESETS[key], ...overrides };
  const value = overrides.value ?? preset.setpoint + jitter(preset.noise * 4);
  const history: number[] = [];
  // Pre-fill a calm history so sparklines are populated on first paint.
  let v = value;
  for (let i = 0; i < 60; i++) {
    v = v + (preset.setpoint - v) * 0.1 + jitter(preset.noise * 1.5);
    history.push(v);
  }
  history.push(value);
  return { key, ...preset, value, bias: 0, history };
}

/** Saturation vapour pressure (kPa) at temperature °C — Tetens. */
export const svp = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
/** Air VPD from temperature and relative humidity. */
export const vpdOf = (t: number, rh: number) => svp(t) * (1 - rh / 100);

export const inBand = (m: Metric) => m.value >= m.low && m.value <= m.high;

/** How far outside the band a metric is, normalised by band width (0 when inside). */
export function deviation(m: Metric) {
  const width = Math.max(1e-6, m.high - m.low);
  if (m.value > m.high) return (m.value - m.high) / width;
  if (m.value < m.low) return (m.low - m.value) / width;
  return 0;
}

export function formatMetric(m: Pick<Metric, "value" | "precision" | "unit">, withUnit = true) {
  const v = m.value.toLocaleString("en-US", { minimumFractionDigits: m.precision, maximumFractionDigits: m.precision });
  return withUnit && m.unit ? `${v} ${m.unit}` : v;
}
