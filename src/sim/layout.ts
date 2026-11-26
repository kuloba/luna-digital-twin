import type { Zone, ZoneId } from "./types";

/**
 * Site plan for the Kent CEA facility. World units are metres; +x runs east
 * (left → right in the default isometric view) and +z runs south.
 *
 * The site reads as one production flow:
 *
 *   north row:  Propagation → Grow V1 → Grow V2 → [AMR hub] → Harvest → QA → Pack
 *   spine:      AMR corridor (z = -4 … 4)
 *   south row:  Glasshouse G1–G3                 → Cold room 1 → Cold room 2 → Dispatch
 */
export const ZONES: Zone[] = [
  { id: "PROP", name: "Seeding & Propagation", short: "Propagation", stage: "SEEDING", bounds: [-58, -30, -40, -4], hotkey: "1", wallHeight: 3.2, climate: true },
  { id: "V1", name: "Vertical Farm · Grow Room V1", short: "Grow Room V1", stage: "CULTIVATION", bounds: [-38, -30, -21, -4], hotkey: "2", wallHeight: 5.4, climate: true },
  { id: "V2", name: "Vertical Farm · Grow Room V2", short: "Grow Room V2", stage: "CULTIVATION", bounds: [-19, -30, -2, -4], hotkey: "3", wallHeight: 5.4, climate: true },
  { id: "GH", name: "Glasshouse · Compartments G1–G3", short: "Glasshouse", stage: "CULTIVATION", bounds: [-58, 4, -2, 32], hotkey: "4", wallHeight: 4.2, climate: true },
  { id: "HARV", name: "Automated Harvesting", short: "Harvest", stage: "HARVEST", bounds: [2, -30, 20, -4], hotkey: "5", wallHeight: 3.6, climate: false },
  { id: "QA", name: "Quality & Food Safety", short: "Quality Lab", stage: "QUALITY", bounds: [22, -30, 37, -4], hotkey: "6", wallHeight: 3.6, climate: false },
  { id: "PACK", name: "Packaging", short: "Pack Hall", stage: "COLD_CHAIN", bounds: [39, -30, 58, -4], hotkey: "7", wallHeight: 3.6, climate: false },
  { id: "COLD", name: "Cold Chain & Dispatch", short: "Cold Chain", stage: "COLD_CHAIN", bounds: [2, 4, 58, 32], hotkey: "8", wallHeight: 4.6, climate: true },
  { id: "UTIL", name: "Fertigation & Utilities Yard", short: "Utilities Yard", stage: "CULTIVATION", bounds: [-58, -47, -18, -33], hotkey: "9", wallHeight: 0.8, climate: false },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, Zone>;

export const SITE_BOUNDS: [number, number, number, number] = [-60, -48, 60, 46];

export const zoneCenter = (id: ZoneId): [number, number] => {
  const [x0, z0, x1, z1] = ZONE_BY_ID[id].bounds;
  return [(x0 + x1) / 2, (z0 + z1) / 2];
};

/** Glasshouse compartments (rooms inside GH). */
export const COMPARTMENTS = [
  { id: "G1", name: "Compartment G1", bounds: [-58, 4, -40, 32] as [number, number, number, number] },
  { id: "G2", name: "Compartment G2", bounds: [-39, 4, -21, 32] as [number, number, number, number] },
  { id: "G3", name: "Compartment G3", bounds: [-20, 4, -2, 32] as [number, number, number, number] },
];

/** Cold rooms inside the COLD zone. */
export const COLD_ROOMS = [
  { id: "CR-1", name: "Cold Room 1", bounds: [3, 8, 19, 28] as [number, number, number, number], setpoint: 2 },
  { id: "CR-2", name: "Cold Room 2", bounds: [21, 8, 37, 28] as [number, number, number, number], setpoint: 2 },
];

/* ------------------------------------------------------------------ */
/* Vertical farm towers                                               */
/* ------------------------------------------------------------------ */

export const TOWER_TIERS = 6;
export const TOWER_TIER_HEIGHT = 0.72;
export const TOWER_SIZE: [number, number, number] = [1.3, TOWER_TIERS * TOWER_TIER_HEIGHT + 0.3, 2.1];

/** Rows of towers: letter, room, x position. Eight towers per row along z. */
export const TOWER_ROWS = [
  { row: "A", room: "V1" as const, x: -33.5 },
  { row: "B", room: "V1" as const, x: -26 },
  { row: "C", room: "V2" as const, x: -14.5 },
  { row: "D", room: "V2" as const, x: -7 },
];

export const towerZ = (i: number) => -26.4 + i * 2.55;

/* ------------------------------------------------------------------ */
/* AMR network                                                        */
/* ------------------------------------------------------------------ */

/** Pick-up / drop-off stations. The y component is ignored (floor). */
export const STATIONS: Record<string, { name: string; at: [number, number]; door: [number, number] }> = {
  PROP: { name: "Propagation out-feed", at: [-49, -8], door: [-49, -4] },
  V1: { name: "Grow Room V1 bay", at: [-29.5, -7.5], door: [-29.5, -4] },
  V2: { name: "Grow Room V2 bay", at: [-10.5, -7.5], door: [-10.5, -4] },
  G1: { name: "Compartment G1 gate", at: [-49, 7], door: [-49, 4] },
  G2: { name: "Compartment G2 gate", at: [-30, 7], door: [-30, 4] },
  G3: { name: "Compartment G3 gate", at: [-11, 7], door: [-11, 4] },
  HARV: { name: "Harvest in-feed", at: [5, -8], door: [5, -4] },
  PACK: { name: "Pack hall out-feed", at: [54, -8], door: [54, -4] },
  "CR-1": { name: "Cold Room 1 door", at: [11, 7], door: [11, 4] },
  "CR-2": { name: "Cold Room 2 door", at: [29, 7], door: [29, 4] },
  DOCK: { name: "Dispatch staging", at: [47, 9], door: [47, 4] },
};

/** Charging pads in the AMR hub between Grow Room V2 and Harvest. */
export const CHARGE_PADS: [number, number][] = [
  [0, -8],
  [0, -11],
  [0, -14],
  [0, -17],
  [0, -20],
  [0, -23],
];

const LANE_EAST = -1.3;
const LANE_WEST = 1.3;

/** Build a corridor path between two floor points, using the lane for the direction of travel. */
export function corridorPath(from: [number, number], fromDoor: [number, number], to: [number, number], toDoor: [number, number]): [number, number][] {
  const lane = to[0] >= from[0] ? LANE_EAST : LANE_WEST;
  return [from, [fromDoor[0], fromDoor[1]], [fromDoor[0], lane], [toDoor[0], lane], [toDoor[0], toDoor[1]], to];
}

export function pathLength(path: [number, number][]) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return len;
}

/** Point and heading at a distance along a path. */
export function pointAlong(path: [number, number][], distance: number): { x: number; z: number; heading: number } {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg === 0) continue;
    if (remaining <= seg || i === path.length - 1) {
      const t = Math.min(1, remaining / seg);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
    }
    remaining -= seg;
  }
  const last = path[path.length - 1];
  return { x: last[0], z: last[1], heading: 0 };
}

/** Station id for a pad/door path between a pad and a station. */
export function padPath(pad: [number, number], station: string, toStation: boolean): [number, number][] {
  const s = STATIONS[station];
  const hubDoor: [number, number] = [pad[0], -4];
  return toStation ? corridorPath(pad, hubDoor, s.at, s.door) : corridorPath(s.at, s.door, pad, hubDoor);
}

/** Tanks in the utilities yard: [id, name, x, z, radius, height, level %, kind]. */
export const TANKS = [
  { id: "RAIN-01", name: "Rainwater Basin", x: -51.5, z: -40, r: 4.6, h: 2.2, level: 64, role: "water" as const },
  { id: "TANK-A", name: "Stock Tank A · Ca/K/N", x: -43.5, z: -37, r: 1.25, h: 3.4, level: 72, role: "stockA" as const },
  { id: "TANK-B", name: "Stock Tank B · P/S/Mg", x: -40, z: -37, r: 1.25, h: 3.4, level: 31, role: "stockB" as const },
  { id: "TANK-ACID", name: "Acid Tank · HNO₃", x: -36.8, z: -37, r: 0.85, h: 2.6, level: 54, role: "acid" as const },
  { id: "MIX-01", name: "Mix Tank", x: -43.5, z: -42.6, r: 1.7, h: 2.8, level: 81, role: "mix" as const },
  { id: "DRAIN-01", name: "Drain Recirculation · UV", x: -38.4, z: -42.6, r: 1.7, h: 2.8, level: 47, role: "drain" as const },
  { id: "CO2-01", name: "Liquid CO₂ Tank", x: -30.5, z: -40, r: 1.15, h: 6.2, level: 58, role: "co2" as const },
  { id: "BUF-01", name: "Heat Buffer · 900 m³", x: -23.5, z: -40, r: 2.6, h: 7.4, level: 88, role: "heat" as const },
];
