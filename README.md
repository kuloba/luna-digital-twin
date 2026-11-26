# LUNA Twin

A live, clickable 3D model of a controlled-environment farm, with the operating dashboard built around it. One site holds propagation, two vertical grow rooms, a three-compartment tomato and cucumber glasshouse, robotic harvest, a QA lab, pack-out, cold rooms, a dock and a fertigation yard. Everything ticks at 1 Hz.

> **Independent concept.** This is a design and engineering demo, not a shipping product, and it is not affiliated with or endorsed by iUNU. The facility, people, orders and telemetry are simulated.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Press **Guided demo** in the top bar for the 13-step story, or explore on your own with **⌘K**.

## What to look at

| Story | Where | What it shows |
| --- | --- | --- |
| **Detect → explain → act → verify** | Grow Room V2 | VPD drifts after an HVAC stage trips. The heat map shows where, Luna explains why and what is at risk, one tap applies the fix, and the twin verifies the recovery and logs it. |
| **Crop vision without the photos** | Glasshouse G1–G3, any row | Camera rails image every plant several times a day. Inference runs on site, so the twin draws each truss from its ripeness score. Click a plant for its measured record. |
| **Why it works on a farm's internet** | `EDGE-01` | Images stay on the edge node; only plant state syncs. By late morning the demo has taken ~55,000 images (~224 GB) and synced ~11 MB of state. |
| **From pixels to a pick plan** | Ask Luna, "Pick plan" | This morning's scans become tomorrow's pick list: rows ranked by fruit at light-red or red, crew-hours to clear them, and pest rows held back. |
| **Pest pressure on a map** | Pests lens (`V`) | Whitefly in G2 rows 3–5, early botrytis on row 8, with a recommended biological release. |
| **Tanks and fertigation** | Fertigation yard, `TANK-B` | Live level, EC and pH for eight tanks; the mix tank cycles; Luna turns days-to-empty into a reorder. |
| **Trace a batch to the truck** | `LET-1124` → `TRK-2` | Seeding, towers, harvest, QA and cold storage as labelled stage pins on one route. |
| **One twin, every role** | Role switch | Head Grower and Facility Manager get different KPIs, briefs and priorities from the same model. |

## Keyboard

| Key | Action |
| --- | --- |
| `⌘K` / `/` | Search batches, assets, plants, zones, or ask Luna |
| `0`, `1`–`9` | Whole site, or fly to a zone |
| `A` | Ask Luna |
| `H` | Cycle heat map: VPD, temperature, RH, CO₂, PPFD |
| `V` | Cycle crop-vision lens: ripeness, yield, pests, growth |
| `T` | Toggle batch trace |
| `F` | Toggle robot flow paths |
| `L` | Toggle spatial tags |
| `Esc` | Close, then deselect |
| `←` `→` | Step through the guided demo |

## How it is built

- **Vite, React 19, TypeScript, Tailwind 4** for the HUD; **three.js** through **@react-three/fiber** and **drei** for the scene; **zustand** for state; **motion** for transitions.
- `src/sim` is a deterministic, seeded simulation. `step()` is pure: it takes the previous state and returns the next one each second. Incidents drift metrics, raise alerts, and recover when a recommendation is approved. This is the only layer a real backend would replace.
- `src/scene` renders the facility, equipment, plants, robots, overlays and tags from that state.
- `src/hud` is the operating surface: top bar, KPI strip, inspector, Ask Luna, batch tracker, zone tables, search, toasts and the guided demo.
- Luna's answers are composed from live state (`src/sim/luna.ts`), so every number in a reply matches the twin at that second. IDs in answers are chips that fly the camera.

### The crop-vision contract

The twin never needs an image. Each plant carries what the cameras measured on the last pass:

```ts
interface PlantCv {
  trusses: { h: number; ripeness: number; fruits: number }[]; // canopy position, 0–5 ripeness, fruit count
  flowers: number;   // open flowers at the head
  height: number;    // head height, m
  stem: number;      // stem diameter 15 cm below head, mm
  pest?: "Whitefly" | "Botrytis" | "Aphids" | "Powdery mildew";
  pestLevel: number; // 0–1
}
```

A plant record is a few hundred bytes (the inspector shows the exact payload for any plant; the bandwidth figures budget 1.15 KB with metadata). The 3D crop, the row strips, yield forecasts, ripeness bands and pest maps are all drawn from it. In the simulation each plant also has a `live` state that the cameras catch up with as the gantry sweeps, which is why rows refresh in a visible wave.

## Project layout

```
docs/PRODUCT.md          product brief: users, jobs, principles, capabilities
scripts/incident-check.ts  checks that a triggered incident raises an alert
src/sim/                 simulation, incidents, crop vision, Luna's composer
src/scene/               3D facility, glasshouse, equipment, overlays, tags
src/hud/                 dashboard panels, inspector, search, guided demo
```

## Scripts

```bash
npm run build      # type-check and production build to dist/
npm run preview    # serve the production build
npx tsx --tsconfig tsconfig.json scripts/incident-check.ts < /dev/null
```

## Deploy

Any static host works. On Vercel, import the repository with the Vite preset (build `npm run build`, output `dist`).
