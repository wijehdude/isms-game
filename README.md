# Sentinel Base

Sentinel Base is a single-player, isometric security-capability management game for the browser. Compare vendor products, configure cameras, LiDAR, robots, drones, lighting, and access control; then watch the autonomous C2 team deal with intrusions, weather, and false alarms.

This repository contains a playable vertical slice built from scratch with strict TypeScript, Canvas 2D, HTML/CSS, and Vite. It uses no game engine and has no runtime package dependencies. Gameplay sprites and world art are generated in code at runtime.

## Quick start

Requirements: a current desktop browser, Node.js 20 or newer, and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

For a production build:

```bash
npm run build
npm run preview
```

The static bundle is written to `dist/`. `vite.config.ts` uses a relative asset base so the bundle can be hosted below a path as well as at a domain root. Use a file server rather than opening `dist/index.html` directly from `file://`.

## Play

Choose one of three objective scenarios from **New Operation**, or start the endless **Open Command** Sandbox. Every mode starts with a $10,000,000 command appropriation, eight operational intrusion-analytics cameras, twelve perimeter floodlights, and a basic three-shift workforce.

The first-capability loop is:

1. Open **Capability**, compare vendor products, select configuration cards, and choose a quantity from 1 to 99.
2. Review the six desirability bars and the live, urgency-aware per-unit and whole-batch programme cost before placing the purchase order.
3. Delivery Autopilot handles ICD/C2 integration, factory acceptance, and site acceptance when they become ready and funded. **Approve all ready** is available as an immediate catch-up control.
4. Deploy tested fixed assets on a valid owned tile. Drones automatically base at the central pad; configure each one for a fenceline side and Day, Night, or Both patrols.
5. Upgrade an operational asset or reposition it through a paid, temporary change outage instead of decommissioning it.
6. Filter map coverage by capability type and use the map legend to find sensor gaps.
7. Watch autonomous C2 outcomes and the Overall Score: performance, risk, cost, and schedule all count.
8. Receive at least $2,000,000 in fresh command funding every in-game week; stronger security health and capability points increase the injection without a ceiling.

The command checklist at the left of the game screen walks through this sequence and the first alarm response.

## Controls

| Input | Action |
| --- | --- |
| Left-drag | Pan the map |
| WASD or arrow keys | Pan the map |
| Move to a screen edge | Pan when no management window is open |
| Mouse wheel, `+`, `-` | Zoom |
| Space | Pause or resume the previous speed |
| `1`, `2`, `4` | Set simulation speed |
| `F` | Toggle operational coverage |
| `Home` or **Fit perimeter** | Fit the owned fenceline into the map view |
| `Q`, `E` | Rotate a fixed camera's 90-degree placement preview |
| Tab | Focus the oldest active alarm and open C2 |
| Esc | Cancel the active tool, otherwise close the top window |
| Right-click | Cancel placement or decommission mode |
| Ctrl+Z | Reserved for builder undo; currently reports when no action can be undone |

Click an operational device on the map to inspect its condition, certified configuration, detections, and false alarms. The Remove tool returns a condition-adjusted residual value and asks you to commit by clicking the device.

## What is implemented

- Deterministic 100x100 isometric camp with terrain, ownership, perimeter, roads, facilities, and a drone pad.
- Twelve vendor products across cameras, LiDAR, robots, drones, floodlights, and access control, with standardized 1-10 Cost, Capability, Availability, Scalability, Interoperability, and Lead Time comparison bars.
- Batch procurement (1-99 assets), supplier lead time, automated ICD integration, factory acceptance, map deployment, automated site acceptance, upgrades, paid relocation, operation, faults, repair, and decommissioning.
- Scouts, thieves, and saboteurs with probabilistic layered detection, day/night effects, rain, fog, storms, and security losses.
- Autonomous operator validation, trooper/mobile dispatch, response outcomes, incident history, and C2 notifications.
- Troopers, operators, and engineers on three shifts with fatigue, happiness, payroll, and hiring.
- A traceable ledger, recurring O&S, weekly command allocations, cost savings, emergency continuity funding, and refunds.
- Explainable Overall Score across performance, risk, cost, and schedule; incident detection, false alarms, MTTD, MTTR, closures, missed intrusions, perimeter score, prevention, capability points, and progression from Fragile to Exemplary.
- Three scenarios, endless Sandbox, an optional five-step walkthrough, manual save, monthly autosave, and JSON import/export.
- Code-generated sprite atlas, main-map capability legend, filtered coverage overlays, 0.20x-2.25x pointer-centred zoom, perimeter fitting, and cull/cached Canvas rendering with HTML/CSS management UI.

The detailed product boundary, formulas, roadmap, milestones, and corrected acceptance criteria are in [GAME_DESIGN.md](./GAME_DESIGN.md). Exact current tuning and implementation notes are in [BALANCE.md](./BALANCE.md).

## Saves

The complete, versioned Sentinel Base v3 game state is serialized as JSON. Earlier v1 and v2 saves are intentionally retired so every operation starts with the new patrol, vendor, and operational-metrics model.

- **Autosave:** one browser slot, updated at each monthly close and scenario ending.
- **Manual save:** one browser slot, updated from Save & Settings.
- **Export/Import:** portable JSON through Save & Settings.

Browser slots use `localStorage`, so clearing site storage removes them. Export a JSON copy before clearing browser data or moving to another browser profile.

## Development scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite with LAN-accessible host binding |
| `npm run build` | Type-check and create the production bundle |
| `npm run preview` | Serve the production bundle locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run strict TypeScript checking |

Run the full verification set before handing off a change:

```bash
npm test
npm run build
```

The tests cover seeded RNG, projection, deterministic A*, economy and lifecycle gates, environment-sensitive detection, save round-trips, and a scripted three-year headless simulation that checks finite state and ledger conservation.

## Architecture

```text
src/
  core/       time, serializable seeded RNG, event bus, save/load
  game/       state types, catalogue, scenarios, creation, player actions
  world/      packed tiles, camp generation, deterministic A*
  sim/        simulation, incidents, workforce, weather, economy, rating
  render/     isometric projection, generated sprite atlas, Canvas renderer
  ui/         framework-free application shell, HUD, tools, windows
  main.ts
tests/        unit, integration, detection, save, and endurance tests
```

The simulation advances on a fixed 10 Hz accumulator. At 1x, each tick advances 3.2 game minutes, so one game day takes 45 real seconds. Rendering uses `requestAnimationFrame` and continues while paused. Authoritative state is plain data and all simulation randomness comes from the saved RNG stream.

The Canvas draws terrain, structures, weather, coverage, and entities. HTML/CSS draws every interactive widget so text remains crisp, selectable, keyboard-friendly, and independent of camera zoom.

## Current scope

Sentinel Base is the game. Theme-park guests, rides, coasters, and coaster physics are not part of this repository.

The current vertical slice abstracts several systems that the design roadmap expands: editable ICD/test evidence, detailed programme risk, power and communications, individual training/opinions, construction, land purchase, and scenario-defined larger maps. Multiplayer, 3D, injuries/fatalities, real-money systems, mobile-first UI, mods, localization, and audio are explicit non-goals for this release.

## Troubleshooting

- **Blank page after building:** serve `dist/` with `npm run preview` or another static server; do not rely on `file://` module loading.
- **Continue is disabled:** no browser save exists yet. Start a game and use Save & Settings, or reach the first monthly close.
- **A device will not deploy:** read the placement ribbon/toast. The tile must be owned and unblocked; flat devices reject raised ground. Drones base themselves at the central pad after factory acceptance.
- **A camera never raises an alarm:** a Fixed Camera without a VA option needs an on-duty operator for manual detection. Edge-AI or a `VA` module enables automatic analytics.
- **An incident cannot be dispatched:** validate it first and ensure an unassigned on-duty trooper or an operational robot/drone is available.
