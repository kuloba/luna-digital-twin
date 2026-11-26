# LUNA Twin — Product Brief

> A spatial operating surface for controlled-environment agriculture. The facility is the interface.

LUNA already answers *"how is my crop doing?"* through briefings, batch facets and yield forecasts. LUNA Twin answers the question operators ask a hundred times a shift: **"where is it, what is it doing, and what should I do about it — right now?"** It puts a live, clickable model of the whole site (propagation, vertical grow rooms, glasshouse, harvest, QA, pack and cold chain) underneath the LUNA data model, so every number has a place and every place has its numbers.

This document is the thinking behind the demo. It is written as if this were the real product, because the demo is only convincing if the product is.

---

## 1. Who it is for

| Persona | Where they are | What they are judged on | What they fear |
| --- | --- | --- | --- |
| **Head Grower** (Maya) | Walking the floor with a tablet, or at the climate desk at 6 am | Yield per m², Grade-A share, crop health, hitting the plan | A climate drift nobody saw for six hours. A batch going vegetative. Botrytis. |
| **Facility Manager** (Dev) | Ops office, big monitor, phone in hand | Throughput, labour hours, uptime, on-time dispatch, energy cost | A bottleneck in harvest that backs up QA and misses the 14:00 truck. A robot fleet sitting idle. |
| **QA / Food-safety Lead** | QA lab, audits | Zero recalls, traceability in minutes, pass rates | A positive microbial swab with no way to trace which towers it touched. |
| **Shift Lead / Grower tech** | On the floor | Getting today's tasks done | Not knowing what's urgent vs noise. |

The demo optimises for the first two. QA and shift leads appear as the people work gets routed to.

## 2. Jobs to be done

1. **Morning sweep (Grower, 2 min):** *"Tell me what changed overnight and what needs me."* → Luna's shift brief + spatial alert pins. No hunting through tabs.
2. **Find and fix a drift (Grower, 5 min):** *"VPD in Room V2 is climbing — why, and what's the fix?"* → Click the glowing room, read the inspector, ask Luna, approve the recommended setpoint change, watch the curve recover in the twin.
3. **Follow a batch (Both, 30 s):** *"Where is batch LET-1124 and will it make Thursday's order?"* → Search the batch ID, the camera flies to it, the batch tracker lights its path from seeding to cold chain, and the ETA is on the stepper.
4. **Clear a bottleneck (Facility Manager, 3 min):** *"Why is the harvest line slowing?"* → Zone table shows AMR-08 low battery and two AMRs queued at QA; reassign or send to charge with one click.
5. **Trace a food-safety event (QA, 1 min):** *"A swab came back positive on lot 1124-C. What else did it touch?"* → Batch trace highlights every tower, AMR, line and cold-room bay that lot passed through, plus sibling lots to hold.
6. **Plan the day's dispatch (Facility Manager):** *"Will we make the 14:00 truck?"* → Cold-chain zone shows trucks, dock doors, load progress and cold-room temps; Luna flags at-risk orders.
7. **Report up (Both):** *"Give me a sentence for the 9 am stand-up."* → Ask Luna summarises the facility at the current moment.

## 3. Principles

1. **The facility is the navigation.** Zones replace menus. You don't open "Climate > Room V2 > VPD" — you click the room.
2. **Answer first, evidence behind it.** Carried over from LUNA's `CropBriefing`: plain-language headline, then the numbers, then the action. Every inspector opens with a one-line status sentence.
3. **Calm by default, loud only when it matters.** The canvas is white and slate. Colour is reserved for state: green = in band, amber = watch / machines needing attention, red = out of band. If everything is red, nothing is.
4. **Every alert ends in an action.** Anomaly → required action → owner → verification. The loop closes *inside the twin*: you see the fix take effect.
5. **One object, many altitudes.** A tower is a dot at site scale, a labelled rack at zone scale and a full telemetry panel when selected. Same object, same ID, same colours at every zoom.
6. **Make the boring parts feel good.** Smooth camera flights, live-ticking numbers, satisfying stepper motion. Operators use this for 8 hours; delight is a retention feature.
7. **Lift-ready.** Types mirror LUNA's GraphQL shapes (`Batch`, `Anomaly`, `RequiredAction`, `CropBriefing`, `MetricSeries`), the simulation sits behind one store, and swapping it for a real subscription is a data-layer change.

## 4. Capabilities (what the demo ships)

### 4.1 Spatial twin
- Isometric, stylised 3D model of a combined site: **Propagation**, **Vertical Farm** (two grow rooms of multi-tier towers), **Glasshouse** (high-wire compartments with LUNA camera rails), **Harvest** (robotic harvesters + cutting line), **QA Lab** (optical grader + checkweigher), **Pack & Cold Chain** (wash line, clamshell sealer, cold rooms, dock + reefer trucks).
- Click any asset to select; hover to preview. Orbit, pan, zoom from site to single dosing station. Zone switcher flies the camera.
- **Live motion:** AMRs drive between zones carrying trays, harvester arms cycle, the LUNA camera carriage sweeps the glasshouse rails, conveyor items flow, trucks dock and depart.
- **Spatial tags:** floating status chips anchored to active assets (`Tower B-04 · Irrigating`, `AMR-08 · Transporting`, `QA-02 · Optical scan`). Density adapts to zoom so the view never clutters.
- **Overlays:** climate heatmap on the floor (VPD / temperature / PPFD / CO₂), flow paths, alert pins only.

### 4.2 HUD
- **Top bar:** LUNA mark, site name, zone switcher, universal search (`⌘K` — batch IDs, towers, sensors, AMRs, orders), live telemetry indicator + clock, role switch, profile.
- **KPI strip (top-left):** Yield harvested today, active grow towers, Grade-A pack-out — each with a sparkline and delta vs. plan. Role changes the strip (Facility Manager sees throughput / on-time dispatch).
- **Inspector (right):** per-asset-type panels — Grow tower (root-zone EC/pH, PPFD + light recipe, VPD, CO₂, irrigation, growth cycle progress), Climate room, Dosing station, AMR (payload, battery, route, mission), Harvester, QA station (grading checklist, pass rate, last rejects), Cold room, Truck (load progress, temp, departure). Each opens with an AI status line and ends in actions.
- **Batch tracker (bottom-left):** stepper `Seeding → Cultivation → Harvest → Quality → Cold Chain` with live status, ETA and "Trace in twin".
- **Zone activity (bottom-right):** tabbed table (Towers / Climate / Robots / QA / Dispatch) with status pills and mini progress bars. Row click selects in 3D.
- **Alert feed:** stacked toasts with severity, location chip, and "Show me".

### 4.3 Luna intelligence
- **Ask Luna:** chat that reads the *live* simulation state. Answers cite assets as clickable chips that fly the camera. Presets match the jobs above.
- **Shift brief:** opening card that summarises overnight and today, written from the current state.
- **Closed-loop recommendations:** for each anomaly Luna proposes a concrete action (e.g. *"Raise V2 dehumidification stage +1 and lower lights to 85% for 40 min"*). Approve → the simulation applies it → telemetry recovers → the alert resolves with a verification note.
- **Forecasts:** batch harvest ETA and yield, today's pack-out projection vs. orders.

### 4.4 Crop vision without the photos
- **The crop you see is the crop the cameras measured.** LUNA camera rails sweep the glasshouse; each plant's trusses, fruit, flowers, head height, stem diameter and pest flags become a record of a few hundred bytes. The 3D tomato rows, the row strip and the plant card are all drawn from those records, never from images.
- **Freshness is visible.** The gantry is a moving object in the twin. Rows refresh in a wave as it passes; a plant card says "fresh scan" or "from last pass" with the time.
- **Lenses, not galleries.** Ripeness, yield (kg ready in 7 days), pests and growth recolour the same plants. A grower reads a compartment in one glance instead of scrolling thousands of photos.
- **A forecast you can sell against.** The same records project each truss to the day it reaches pick ripeness: a 14-day forecast of kg per day per compartment, its peak, and the picker-hours it implies. That is the number labour planning and buyer commitments run on.
- **From pixels to decisions.** Luna turns the last pass into tomorrow's pick list (rows ranked by fruit at light-red or red), crew-hours to clear it, and rows to hold back for pest scouting. This is where CV pays for itself: labour planned from measurement instead of a walk-through.
- **Edge-first by design.** Inference runs on `EDGE-01`. Images stay on site for audit and model training; only plant state syncs. In the demo's assumptions a morning of scanning is ~55,000 images (~224 GB) and ~11 MB of synced state, roughly 20,000× less. Remote sites need no fibre, and the UI is instant because it renders state, not pixels.

### 4.5 Tanks and fertigation
- Eight tanks in the yard (rain, stock A/B, acid, mix, drain, CO₂, heat buffer) with live level, EC and pH, plus which rooms each one feeds.
- The mix tank visibly fills and drains on its irrigation cycle; dosing stations show their recipe.
- Luna converts level and draw into days-to-empty and a reorder before it becomes a problem (stock B: ~2 days).

### 4.6 Guided demo
A thirteen-beat tour (`Guided demo`) that drives the real UI: one model of the operation → shift brief → VPD drift → ask why → approve and verify → crop vision → a single plant → a pick plan from the scans → edge bandwidth → pest pressure → tanks → trace a batch to the truck → switch roles. Built for the pitch, but it doubles as onboarding.

## 5. Interaction ideas that make it fun

- **Fly-to everything.** Any ID anywhere (chat, table, search, alert) is a link that flies the camera and selects the asset.
- **Trace mode.** Selecting a batch draws a glowing route across the facility through every place it has been and will go.
- **Heat as weather.** Climate overlays animate softly like a weather map instead of flashing.
- **Breathing alerts.** Out-of-band assets get a slow pulse ring on the floor, not a blinking icon.
- **Ticking numbers.** Values interpolate rather than jump; deltas flash briefly in green/red.
- **Keyboard-first.** `⌘K` or `/` search, `0` site, `1–9` zones, `A` Ask Luna, `H` heat map, `V` crop-vision lens, `T` trace, `F` flows, `L` labels, `Esc` deselect.
- **Role lens.** One toggle re-weights KPIs, tags and default overlay for Grower vs Facility Manager.

## 6. Data model (mock, GraphQL-shaped)

`Site → Zone → Room → Asset` with typed assets (`GrowTower`, `Rack`, `DosingStation`, `ClimateUnit`, `Amr`, `Harvester`, `Conveyor`, `QaStation`, `ColdRoom`, `Truck`, `CameraRail`). `Batch` follows the existing LUNA type (code, crop, variety, stage, health, briefing, anomalies) with a `route: StageEvent[]` for traceability. Telemetry is `MetricSeries` keyed by asset. Alerts are `Anomaly` + `RequiredAction`. The simulation (`src/sim`) owns all of it and ticks at 1 Hz; swapping in a real GraphQL subscription replaces the tick, not the components.

## 7. Why this matters for a CV-first grow platform

1. **Computer vision becomes operational, not archival.** Today CV output tends to live in image galleries and charts. In the twin it is the crop itself: a grower sees ripeness, yield and pests where they are, and acts from the same screen.
2. **Bandwidth stops being a sales blocker.** Shipping plant state instead of photos means a remote glasshouse on a cellular uplink gets the same experience as a site on fibre.
3. **Speed builds trust.** Rendering state is instant at any zoom. Operators who wait for images stop looking; operators who get answers in a glance come back every hour.
4. **The loop closes in one place.** Detect, explain, act and verify happen inside the twin with an owner and an audit trail, which is what turns insight into yield.
5. **It scales across sites.** The same plant-state contract works for one compartment or a portfolio; the twin is a view over data the platform already produces.

## 8. Out of scope for the demo

Auth, real control writes, multi-site, historical analytics beyond 24 h sparklines, mobile layout beyond tablet.

## 9. Success criteria for the pitch

1. A stranger understands what the site does within 10 seconds of the page loading.
2. The "detect → explain → act → verify" loop is demonstrable in under a minute.
3. It looks like a shipped product, not a hackathon: consistent spacing, type scale, colour discipline.
4. It is obviously built on LUNA's own concepts (batches, briefings, required actions, compartments, camera rails), so it reads as the next chapter of LUNA rather than a different product.
