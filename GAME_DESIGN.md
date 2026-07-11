# Sentinel Base

## Game design and delivery brief

**Product title:** Sentinel Base

**Project codename:** Sentinel Base

**Genre:** Single-player camp-security capability management simulation

**Platform:** Desktop web browser

**Technology:** TypeScript, HTML5 Canvas 2D, HTML/CSS, Vite; no game engine
**Visual direction:** Readable 2D isometric pixel art inspired by classic management games

### Scope normalization

The original brief combines a theme-park template with a camp-security game. This document makes the product boundary explicit: Sentinel Base is about designing, delivering, and operating an integrated physical-security capability. Coasters, rides, guests, park paths, and EIN ratings are not part of this product. References to them in the source brief are superseded by the capability lifecycle, workforce, incidents, and camp-security score specified here.

The current repository is a polished, playable **vertical slice** of that design. Sections marked **Current** describe behavior present in the build. Sections marked **Roadmap** define the intended expansion and are not acceptance claims for the current build.

---

## Sentinel Base v2 operating model

The current release is named **Sentinel Base**. It starts every scenario with a credible inherited posture: $20,000,000 in command funds, eight operational fixed cameras carrying Intrusion VA, twelve perimeter floodlights, a trooper and operator on each shift, and one engineer. Players expand this baseline rather than constructing security from nothing.

The game is deliberately not an approval simulator. Capability Builder supports procurement batches of 1-99 identical assets and prices both unit and batch lifecycle cost before commitment. Delivery Autopilot advances ready ICD integration, factory acceptance, and site acceptance when personnel and funds are available; **Approve all ready** is retained as a single catch-up command. Deployment location, camera orientation, configuration, and force mix remain player decisions.

C2 is autonomous. Operators verify alarms and dispatch available troopers, robots, or drones, while the player changes outcomes indirectly by improving evidence quality, reducing false alarms, adding coverage, sustaining people, and fielding mobile capability. The C2 view is therefore an operational record, not a button-click queue.

Security Health is the visible command rating. It is driven by operational security, response readiness, troop and operator happiness, lifecycle cost effectiveness and savings, asset uptime, fused evidence, and a cognitive-workload penalty. Capability points build over time from proven performance. Every seven in-game days command injects at least $2m, with uncapped upside based on Security Health and capability points. At the hardened-perimeter thresholds (85 Health, 8,000 points, 70% coverage, 85% fusion, 85% response readiness, and 90% uptime), intruders are deterministically detected and intercepted.

First launch offers a five-step walkthrough that can be skipped, suppressed, or replayed from Save & Settings. Camera zoom ranges from 0.20x to 2.25x with pointer-centred wheel zoom and a Fit Perimeter command. The renderer culls off-screen tiles and entities, uses a low-zoom terrain cache, and caps canvas resolution scaling to preserve smooth play.

---

## 1. Product vision

### 1.1 Player fantasy

> I designed the camp's security architecture, brought every interface through assurance, staffed the operating model, and proved that it works when a real threat arrives.

The player is both capability manager and camp-security lead. Buying an impressive device is not enough: it must be integrated into C2, tested, placed sensibly, commissioned, sustained, and used by a workforce that trusts it.

### 1.2 Design pillars

1. **Capability, not shopping.** Every asset passes through procurement, integration, test, deployment, and acceptance before it contributes.
2. **People complete the system.** Troopers, operators, and engineers are workload-constrained participants, not passive bonuses.
3. **Layered security beats a single perfect sensor.** Cameras, LiDAR, mobile systems, and lighting have different environmental and operating trade-offs.
4. **Every dollar and decision is legible.** Costs are previewed, cash movements are ledgered, and score components explain themselves.
5. **Incidents tell the story.** The value of a design becomes visible through detection, validation, response, interception, and after-action outcomes.

### 1.3 Core loop

1. Inspect blind sectors, weather, workforce load, current projects, and command objectives.
2. Configure a sensor or mobile asset and review its whole-programme price.
3. Procure it as a single asset or batch; Delivery Autopilot handles ICD/C2 integration and factory acceptance.
4. Deploy the tested asset on a valid tile; Delivery Autopilot completes site acceptance.
5. Monitor autonomous C2 outcomes while operators validate evidence and dispatch a trooper or mobile responder.
6. Sustain the workforce and equipment while balancing payroll and O&S.
7. Improve security effectiveness, happiness, cost-effectiveness, savings, rating, and lifetime capability points.
8. Earn uncapped weekly command funding, close remaining risks, and repeat under greater pressure.

### 1.4 Session shape

- Real-time deterministic simulation with pause, 1x, 2x, and 4x speeds.
- One game day lasts about 45 real seconds at 1x.
- Three eight-hour shifts cover the day.
- A week releases a minimum $2m command injection; a month closes payroll, O&S, savings, and an autosave.
- Scenarios last 30-60 in-game days; Sandbox has no deadline or score ceiling.

---

## 2. Game modes

### 2.1 Scenarios — Current

Scenarios provide fixed seeds, budgets, weather distributions, threat pressure, nuisance-alarm pressure, objectives, and deadlines. Objectives are continuously evaluated and the scenario ends immediately when all are satisfied.

| Scenario | Difficulty | Start cash | Deadline | Command objective |
| --- | --- | ---: | ---: | --- |
| First Watch | Training | $20,000,000 | Day 30 | Rating 60, coverage 42%, trooper happiness 58, operator happiness 58 |
| Monsoon Line | Standard | $20,000,000 | Day 45 | Rating 68, catch 6 intruders, retain $250,000 |
| Noise Floor | Hard | $20,000,000 | Day 60 | Rating 72, operator happiness 68, catch 10 intruders |

All scenarios begin at 06:00 with a basic three-shift team, one engineer, eight operational Intrusion VA cameras, and twelve operational floodlights. Noise Floor begins with reduced operator happiness.

### 2.2 Sandbox — Current

Open Command starts with $20,000,000, has no deadline, and never declares a final victory. Threat pressure rises gradually by month. Weekly command funding reacts to delivered capability, while lifetime points and capability tiers provide the long-term score chase.

### 2.3 Scenario framework — Roadmap

Future scenarios should be data-driven extensions of the same rule set, not one-off code paths. Useful scenario modifiers include:

- restricted sensor families or vendors;
- schedule milestones such as “first sector operational by Day 10”;
- maximum whole-life cost or O&S limits;
- minimum night, rain, or fog performance;
- required alarm false-positive rate or response time;
- phased land access, damaged inherited equipment, or staff shortages;
- red-team campaigns focused on theft, sabotage, deception, or surveillance.

Each scenario needs a deterministic seed, an automated completion run, and a documented intended strategy before release.

---

## 3. World model and presentation

### 3.1 Camp map — Current

The playable map is a deterministic 100x100 isometric tile grid. Each packed tile stores:

- terrain height from 0-15;
- surface: grass, sand, dirt, rock, or water;
- ownership: owned, purchasable, or off-limits.

The initial owned camp spans tiles 18-81 on both axes. It contains a perimeter fence and main gate, Headquarters, C2 Operations Centre, barracks, supply store, gym, guardhouse, parade square, roads, walkways, a 400 metre track, and a central drone pad. These structures create placement constraints and visual context; they are not individually managed in the vertical slice.

Assets can be placed only on owned, unblocked tiles. Flat-mounted devices reject elevated tiles, and drones must be installed on the drone pad. Placement uses a green or red ghost, a coverage preview, and a human-readable failure reason.

### 3.2 Projection and draw order — Current

The renderer uses a fixed 2:1 projection:

```text
screenX = (x - y) * 32
screenY = (x + y) * 16 - z * 16
```

`TILE_W` is 64, `TILE_H` is 32, and `HEIGHT_STEP` is 16 before zoom. Projection is isolated from game state so camera rotation can remain a future option without rewriting the simulation.

Terrain is rendered in increasing `x + y` depth. Structures and entities use stable depth ordering. The camera supports drag, keyboard and edge panning, plus continuous zoom clamped to approximately 0.48x-1.65x.

Patrols and human responders use deterministic four-way A* routes around buildings, fences, and water. Intruders also route around buildings and water but treat the perimeter fence as breachable ground, so their approach is not forced through the main gate.

### 3.3 Art direction — Current

All gameplay art is generated in code. An offscreen Canvas sprite atlas produces cameras, LiDAR, floodlights, robot dogs, humanoid robots, drones, troopers, operators, engineers, and intruders at boot. Buildings and terrain are drawn procedurally. The result should favor silhouette, state readability, and a cohesive restricted palette over detail.

The runtime has no downloaded sprite-sheet or binary-image dependency.

### 3.4 World expansion — Roadmap

- Scenario-defined maps up to 160x160.
- Land purchase and explicit ownership expansion.
- Player-built fences, gates, roads, walkways, towers, power, and communications.
- Height editing and terrain-dependent mobility.
- Terrain-aware line-of-sight, physical occlusion, and richer overlapping-sensor correlation.

---

## 4. Capability catalogue

### 4.1 Cameras

Cameras provide visual identification and strong daytime detection. Fixed cameras cover a 90-degree field of view; placement automatically faces away from the camp centre and Q/E rotates the preview in quarter turns. Targets behind the camera receive only a 4% residual detection factor. Fixed cameras without analytics depend on available operators manually watching their feeds. Edge-AI cameras, or cameras fitted with a VA module, can automatically create C2 detections.

Available modules cover intrusion, loitering, tamper, and suspicious-object analytics, infrared illumination, low-light sensing, and a panoramic head. The panoramic head removes the directional FOV gate and uses full circular coverage. More modules improve capability but increase acquisition cost, integration time, factory-test time, O&S, and sometimes nuisance alarms.

Night reduces visual performance unless the camera has low-light/IR capability or the target is within an operational floodlight's range.

### 4.2 LiDAR

LiDAR provides day/night silhouette detection and complements visual evidence. Long-range optics extend reach; video point clouds improve motion evidence; and a silhouette classifier reduces ambiguous alarms. LiDAR's principal weakness is rain and fog, making fused coverage more resilient than a LiDAR-only perimeter.

### 4.3 Robots

The Ranger Quadruped and Atlas Response Humanoid provide mobile-response power and reduce the workload pressure felt by troopers. Camera, onboard analytics, all-terrain, sprint, and extended-battery modules trade cost and integration complexity for detection, response, or availability.

Robots are deployed assets that can respond when no trooper is available. They follow deterministic routes around blocked camp tiles to an assigned incident and return to their deployment point afterward. Scheduled patrol design, charging, terrain-specific animation, and escort behaviors remain roadmap features.

### 4.4 Drones

The Hawkeye Patrol Drone is a rapid, wide-area mobile responder. It must be based on the central drone pad. Night vision, sprint, battery, wide-scan, and thermal payloads tailor its coverage. Storms nearly ground drone detection, so it must not be the camp's only layer.

An idle drone performs a deterministic four-tile patrol orbit around its pad. On dispatch it flies directly to the incident at a speed derived from configured response power, then resumes its home patrol. Battery cycles, player-authored flight paths, richer live retasking, and weather-driven return-to-base behavior remain roadmap features.

### 4.5 Floodlights

Floodlights do not detect or respond. They restore nearby camera effectiveness at night, improve layer resilience, and contribute to availability/readiness once commissioned. Backup power improves availability.

Exact model prices and modifiers are maintained in [BALANCE.md](./BALANCE.md).

---

## 5. Capability lifecycle

The lifecycle is the game's signature builder. A device contributes no operational coverage merely because it has been purchased.

### 5.1 Configure and quote — Current

The Capability Builder lets the player choose a model and compatible modules. Before commitment it displays:

- hardware and option cost;
- ICD/integration, factory-test, and site-acceptance cost;
- total programme cost;
- supplier lead time and forecast O&S;
- range, detection accuracy, availability, and false-alarm forecast.

The purchase button charges only acquisition. Later gates charge their own quoted amounts, preserving cash-flow decisions.

### 5.2 Procurement and delivery — Current

A purchase order enters a supplier lead-time countdown. Delivery moves it to an integration-review gate. Orders cannot be accelerated or cancelled in the current slice.

**Roadmap:** competitive vendor bids, framework contracts, lead-time uncertainty, deposits and cancellation clauses, spares, obsolescence, supplier quality, and transparent schedule-risk ranges. The cheapest tender should not always provide the best whole-life value.

### 5.3 ICD and C2 integration — Current

At least one engineer is required to approve integration. The paid integration phase maps the minimum operational contract:

- device identity and configuration;
- timestamp and synchronization source;
- location and sensor geometry;
- alarm type, severity, and confidence;
- imagery or point-cloud evidence reference;
- health, availability, and fault state;
- acknowledgement and recovery behavior.

Integration duration increases with module complexity. Successful completion moves the order to factory acceptance.

**Roadmap:** an editable ICD with interface decisions, competing protocols, cybersecurity controls, bandwidth/load limits, vendor review actions, configuration baselines, and integration defects that must be closed. Engineers should be assigned rather than merely present.

### 5.4 Factory acceptance — Current

Factory acceptance is a paid, timed gate that represents configured alarm, health, recovery, and analytics tests. A completed FAT makes the asset eligible for site deployment.

**Roadmap:** player-authored test packs, visible pass/fail evidence, defect severity, regression tests, waived requirements with residual risk, supplier rework, schedule slips, and test coverage as a readiness input.

### 5.5 Deployment — Current

The player selects a ready order, sees its code-generated ghost and coverage footprint, then chooses a valid owned tile. Invalid placement explains whether the problem is ownership, obstruction, terrain, another device, map bounds, or the drone-pad rule. Installation converts the order into an asset awaiting SAT.

### 5.6 Site acceptance and commissioning — Current

Site acceptance charges the commissioning price and runs for three game hours. When complete, the asset becomes operational and starts contributing to detection, coverage, uptime, rating, faults, O&S, and incident response.

**Roadmap:** installation teams, power/network dependencies, line-of-sight survey, calibration, paired end-to-end test incidents, operator training, documentation handover, and formal operational release authority.

### 5.7 Operate, sustain, and retire — Current

Operational health degrades slowly. Availability and health drive a daily fault chance. Faulted assets create C2 work orders and return after an abstracted engineer repair and regression check. Monthly O&S is charged for every deployed device, at a reduced rate while faulted.

Decommissioning returns 20% of acquisition value multiplied by current health. The refund is previewed in the tool and recorded in the ledger.

**Roadmap:** preventive-maintenance windows, spares, mean time to repair, engineer workload, software/version baselines, recertification after configuration changes, service contracts, mid-life upgrades, and disposal lead time.

---

## 6. Threat, detection, and incident operations

### 6.1 Threat actors — Current

Scouts, thieves, and saboteurs enter from a random map edge, move toward Headquarters, Supply, or C2 targets, then attempt to exfiltrate along their entry route. They differ in frequency, stealth, speed, and loss value. Sandbox threat pressure rises by 0.04 per elapsed month.

Detection is probabilistic and deterministic for a saved seed. Each nearby operational device contributes based on configured accuracy, distance/range, weather, night, health, automatic/manual monitoring, and intruder stealth. Independent misses are combined, so overlapping layers are materially stronger.

Nuisance-alarm cadence scales with the sum of the operational fleet's configured false-alarm rates and the scenario pressure. Devices with higher configured rates are proportionally more likely to be the source, so classifier options and disciplined fleet design reduce real C2 workload rather than changing only a display statistic.

### 6.2 C2 alarm flow — Current

1. A device raises a potential intrusion or a scheduled nuisance event.
2. The alarm appears as **New**, with source, sector, confidence, and time remaining.
3. An on-duty operator validates it. Genuine evidence becomes **Verified**; benign evidence is dismissed without a field dispatch.
4. A verified incident can be dispatched to an available on-duty trooper. If none is available, an operational robot or drone may respond.
5. Travel and response power determine timing and success.
6. The incident becomes **Resolved**, **Dismissed**, or **Missed**, with an after-action narrative.

The player never sees the `genuine` ground-truth flag before validation. This preserves uncertainty while keeping every required action explicit.

### 6.3 Consequences — Current

- A successful genuine response catches the intruder, records avoided loss, and awards points.
- A lost response leaves the intruder active and able to escape.
- Escape posts the actor's loss value to cash, increases stolen losses, and removes points.
- Unacknowledged or undispatched alarms expire and remove points.
- False alarms affect operator happiness and alarm quality even when handled correctly.

### 6.4 Operational depth — Roadmap

- Multiple simultaneous tracks, evidence correlation, and duplicate-alarm grouping.
- Intruder concealment, tampering, decoys, fence breach, insider access, and object placement.
- Rules of engagement and graduated responses; no injury or fatality simulation.
- Patrol planning, sectors, handovers, guardhouse dispatch, escort and investigation tasks.
- Alarm priorities, operator console capacity, escalation timers, and supervisor roles.
- After-action recommendations that link failures back to coverage, ICD, testing, training, or sustainment.

---

## 7. Time and weather

### 7.1 Calendar — Current

- Fixed logic rate: 10 ticks per real second.
- At 1x each tick advances 3.2 game minutes, yielding a 45-second day.
- Speeds 2x and 4x multiply simulated minutes per tick; pause leaves rendering active.
- 30 days form a month; 12 months form a year.
- Night is 19:00-06:00.
- Autosave occurs after each monthly close.

### 7.2 Weather — Current

Weather changes every 3-10 game hours. Each scenario supplies a weighted list of clear, overcast, rain, storm, and fog states. Temperature is 23-34 degrees C and intensity drives presentation; sensor effects currently use the weather category rather than continuous intensity.

- Clear and overcast impose no sensor penalty.
- Rain reduces LiDAR more than other sensors.
- Fog reduces both vision and LiDAR; thermal improves drone resilience.
- Storms severely reduce drone detection, reduce other outdoor sensing, and lower response success.
- Night penalizes cameras unless aided by an installed module or nearby floodlight.

### 7.3 Weather expansion — Roadmap

Forecasts, lightning/power events, visibility range, continuous intensity, wet-ground movement, drone launch rules, heat and battery impacts, and seasonal distributions should create advance planning without turning weather into arbitrary punishment.

---

## 8. Workforce and happiness

### 8.1 Roles — Current

| Role | Operational purpose | Shift behavior |
| --- | --- | --- |
| Trooper | Patrols and responds to verified incidents | One or more per eight-hour shift; moves between perimeter waypoints |
| Operator | Monitors C2 and validates alarms | Required on duty to start validation |
| Engineer | Owns integration and repairs | At least one is required to start ICD integration; repairs are abstracted |

New hires are assigned to the least-populated shift. Staff start at 64 happiness and 12 fatigue. On-duty fatigue rises while off-duty fatigue recovers. Troopers on response receive an additional fatigue load.

### 8.2 Happiness model — Current

Happiness moves 12% of the way toward a role-specific target at each daily update rather than changing abruptly.

Troopers value broad coverage and operational robot/drone support; unresolved incidents and fatigue reduce their target. Operators value automatic analytics; manual cameras, unresolved alarms, nuisance-alarm ratio, and fatigue reduce theirs. Engineers are affected by project backlog and fatigue.

Trooper happiness affects human response success. Trooper and operator averages combine into workforce wellbeing, which contributes 20% of the camp rating. This gives good design a human payoff: useful automation and layered coverage make work safer and more manageable, while indiscriminate alarm generation erodes trust.

### 8.3 Workforce expansion — Roadmap

- Individual traits, training, experience, opinions, and retention.
- Editable shifts, leave, handover quality, overtime, and relief staffing.
- Certifications for C2, drone operations, robotics, engineering, and test roles.
- Explicit patrol routes, task queues, workload, and span of control.
- Safety perceptions, equipment trust, response-time opinions, and commander feedback.
- Recruitment lead time and training cost rather than immediate availability.

The game should model professional strain and pride without simulating injury, fatality, or punitive personnel micromanagement.

---

## 9. Economy and programme control

### 9.1 Cash and ledger — Current

Cash changes only through typed ledger entries: funding, procurement, integration, testing, commissioning, recruitment, payroll, operations, security loss, savings, refund, and emergency appropriation. The finance window shows current funds, next-month recurring cost, lifetime inflow/outflow, savings, avoided losses, and recent entries.

Acquisition, integration, FAT, and SAT are separate commitments. A player cannot start a discretionary stage without enough cash. Monthly payroll and O&S can overdraw the account; if they do, command supplies an emergency continuity appropriation that restores a $50,000 reserve and deducts 250 capability points.

### 9.2 Recurring costs — Current

Every staff member receives a monthly salary. Every deployed device incurs licence, energy, and preventive-maintenance O&S; a faulted device is charged at 40% of its normal rate. Options add recurring cost. Exact amounts are in [BALANCE.md](./BALANCE.md).

### 9.3 Cost savings — Current

The conventional baseline is $275,000 per month. At close, positive `baseline - payroll - O&S` is accumulated as verified savings. This is a performance measure rather than a direct cash rebate. Savings lift cost-effectiveness and the rating, which indirectly improves command confidence. Stolen losses reduce cash and drag cost-effectiveness.

### 9.4 Command funding — Current

Each month command provides a rating-sensitive allocation centered on $150,000. The factor is bounded from 0.65 to 1.45, rewards progress toward rating 75, and is reduced by cumulative stolen losses. The resulting monthly range is $97,500-$217,500 before emergency funding.

### 9.5 Economy expansion — Roadmap

- Separate capital and operating appropriations with transfer rules.
- Annual planning, quarterly reviews, committed versus actual spend, and cash-flow forecast.
- Vendor tenders, support contracts, warranties, spares, inflation, and obsolescence.
- Programme risk register with probability, cost, and schedule exposure.
- Milestone confidence, contingency drawdown, change requests, and commander trade-off decisions.
- Explicit benefit cases: avoided posts, patrol hours saved, response-time reduction, and prevented losses.

Roadmap systems must preserve the current rule that prices and schedule consequences are shown before commitment.

---

## 10. Security rating, capability level, and points

### 10.1 Threat-weighted coverage — Current

Coverage samples the perimeter and two sensitive central corridors. At each point only the strongest operational camera, LiDAR, robot, or drone contribution is scored; floodlights do not count as detectors. A sample requires meaningful strength before it contributes. This creates a readable strategic metric without scanning all 10,000 tiles every tick.

### 10.2 Component formulas — Current

All component scores are clamped to 0-100.

```text
interdiction = caught / (caught + escaped), or 48 before any outcome
alarmQuality = 100 - falseAlarms / (resolvedAlarms + falseAlarms) * 60,
               or 52 before any outcome

securityEffectiveness =
    detectionFusion * 0.42
  + interdiction * 0.26
  + uptime * 0.20
  + alarmQuality * 0.12

peopleWellbeing = trooperHappiness * 0.55 + operatorHappiness * 0.45

savingsLift = realisedSavings / 18,000
lossDrag = stolenLosses / 9,000
costEffectiveness = clamp(52 + savingsLift - lossDrag,
                          0,
                          min(100, securityEffectiveness + 15))
```

Readiness combines 65% accepted-asset readiness and 35% staff readiness. Within staff readiness, three troopers supply 50%, three operators 35%, and one engineer 15%. Schedule confidence starts at 55, gains 30% of readiness, and loses 1.5 points per open order. Cognitive workload rises with active incidents, manual feeds, and false-alarm rate; analytics and adequate operators reduce it. Response readiness combines operator presence, available troopers or mobile systems, happiness, fatigue, and cognitive workload.

### 10.3 Camp rating — Current

```text
securityHealth = securityEffectiveness * 0.30
               + responseReadiness      * 0.23
               + peopleWellbeing        * 0.14
               + costEffectiveness      * 0.13
               + uptime                 * 0.10
               + detectionFusion        * 0.10
               - cognitiveLoad          * 0.08

campRating = min(securityHealth, securityEffectiveness + 24)
```

Two hard safeguards prevent economic optimization from masquerading as security:

- no troopers or no operators caps rating at 39;
- detection fusion below 20 caps rating at 49.

### 10.4 Lifetime points and levels — Current

Each daily close awards `round(securityHealth^2 / 100)`, so sustained excellence grows the score much faster than a minimally viable camp. Incident outcomes add or remove points:

- genuine incident resolved: +350;
- benign field resolution: +80;
- genuine alarm expires: -300;
- unsuccessful response: -180;
- intruder escapes: -500;
- emergency appropriation: -250.

| Capability level | Requirement |
| --- | --- |
| Fragile | Rating below 25 |
| Basic | Rating 25+ |
| Integrated | 1,200 points and rating 45+ |
| Assured | 3,500 points and rating 65+ |
| Resilient | 8,000 points and rating 80+ |
| Exemplary | 15,000 points and rating 90+ |

The lower eligible level is used if either its points or rating gate is not met.

---

## 11. Interface and controls

### 11.1 Screens — Current

1. Title screen: New Operation, Continue, and Open Command Sandbox.
2. Scenario picker: brief cards with difficulty, description, and objective.
3. Saves list: monthly autosave and manual-save slots.
4. Main game: isometric canvas with crisp HTML/CSS HUD and management windows.
5. Save/settings panel and scenario outcome overlay.

### 11.2 Main HUD — Current

- **Top bar:** camp name, date/time, weather/temperature, cash, active alarm count, camp rating, simulation speed, settings.
- **Left command dock:** scenario objectives and the first-capability tutorial checklist.
- **Message ticker:** most recent operational, financial, weather, or project notification.
- **Bottom toolbar:** Capability, Delivery, C2 Alarms, People, Finance, Rating, coverage overlay, and decommission.
- **Windows:** accessible HTML panels for configuration, lifecycle gates, incidents, roster, ledger, scoring, objectives, settings, and device inspection.
- **Placement feedback:** ghost, footprint, valid/invalid color, contextual ribbon, and toast reason.

### 11.3 Keyboard and mouse — Current

| Input | Action |
| --- | --- |
| Drag, WASD, arrows, screen edge | Pan camera |
| Mouse wheel, `+`, `-` | Zoom |
| Space | Pause/resume previous speed |
| `1`, `2`, `4` | Set simulation speed |
| `F` | Toggle coverage overlay |
| Tab | Focus the oldest active incident and open C2 |
| Esc or right-click | Cancel placement/removal; otherwise close the active window |
| Ctrl+Z | Reserved for builder undo; currently reports that there is no pending action |

All failures must remain human-readable, and every charged amount must be visible before the player commits.

---

## 12. Technical architecture

### 12.1 Current project shape

```text
src/
  core/       clock, seeded RNG, event bus, save/load
  game/       serializable types, catalogue, scenarios, creation, player actions
  world/      packed map generation and deterministic A*
  sim/        time advancement, incidents, workforce, economy, rating, weather
  render/     projection, procedural atlas, isometric renderer
  ui/         framework-free HTML/CSS application shell and panels
  main.ts
tests/        unit, integration, and headless simulation tests
```

The game has zero runtime package dependencies. State is plain serializable data; behavior lives in pure or state-transforming modules. A single seeded RNG state makes equivalent runs reproducible. Canvas handles the world, while HTML/CSS handles text and controls.

### 12.2 Simulation loop — Current

- `requestAnimationFrame` renders continuously.
- An accumulator advances fixed 0.1-second logic steps.
- Each 1x step advances 3.2 game minutes.
- Frame delta is clamped to avoid a background-tab spiral.
- Rendering interpolates presentation only implicitly; authoritative state changes on fixed ticks.
- Lists are bounded: up to 24 concurrent intruders, 12 active scheduled nuisance alarms, 80 retained incidents, and 80 messages.

### 12.3 Save model — Current

The complete `GameState` is versioned and JSON-serializable. The browser stores one manual and one autosave slot in `localStorage`; players can also export/import JSON. Loading validates the version and minimum state shape. Monthly closes and scenario endings update the autosave.

### 12.4 Performance budget

Current and future changes should preserve:

- 60 FPS rendering on a current desktop browser at the default 100x100 map;
- a fixed 10 Hz simulation without dropped logical steps during normal play;
- no unbounded entity, notification, or history growth;
- no full-map allocation in per-tick hot paths;
- device-pixel-ratio rendering capped at 2;
- a three-year 4x headless run without crashes, NaNs, or ledger imbalance;
- practical support for a future 160x160 scenario after profiling and culling work.

### 12.5 Testing requirements

Non-negotiable automated coverage includes:

- seeded RNG repeatability;
- calendar and speed math;
- A* correctness on crafted reachable, blocked, and deterministic maps;
- lifecycle stage gates, affordability, and invalid placement reasons;
- monthly payroll, O&S, funding, savings, and emergency appropriation math;
- rating and capability-level boundaries;
- scenario win/loss evaluation;
- save-load-resave structural identity;
- a scripted three-year headless simulation with finite values and `sum(ledger) == cash`.

Browser smoke testing should also cover title/scenario navigation, every management window, placement ghosts, keyboard shortcuts, save import/export, and responsive behavior at the supported desktop sizes.

---

## 13. Implementation and build order

Milestones are ordered by dependency. A later milestone cannot compensate for an unverified earlier one.

### M0 — Product normalization and skeleton — Current

- Resolve the theme-park/camp contradiction.
- Establish strict TypeScript, Vite, Canvas/HTML split, serializable state, and seeded RNG.
- Define glossary, scope, scripts, and no-engine constraint.

**Exit:** development and production builds start from a minimal deterministic state.

### M1 — World, camera, and code-generated art — Current

- Packed tiles, deterministic 100x100 camp, structures and ownership.
- Isometric projection, depth order, pan/zoom, terrain/structure rendering.
- Runtime atlas and readable people/device silhouettes.

**Exit:** the camp is navigable at stable frame rate without binary runtime art.

### M2 — Capability builder and delivery lifecycle — Current

- Device/option catalogue and whole-programme preview.
- Procurement, delivery, ICD integration, FAT, placement, SAT, operational state.
- Validation reasons, coverage preview, registry, faults, and retirement.

**Exit:** every catalogue model can travel from configuration to operational service.

### M3 — Threats, C2, and workforce — Current

- Intruder generation/movement/detection and environmental modifiers.
- Alarm validation, dispatch, resolution, loss, and after-action history.
- Three staff roles, shifts, fatigue, happiness, patrols, and mobile response.

**Exit:** a full detection-to-response loop can succeed or fail for explainable reasons.

### M4 — Economy and progression — Current

- Traceable ledger, lifecycle spend, payroll/O&S, funding, savings, losses.
- Coverage, security, people, cost, readiness, rating, points, and tiers.
- Finance and score-explanation panels.

**Exit:** all cash deltas reconcile and all rating components are visible.

### M5 — Scenarios, Sandbox, saves, and tutorial — Current

- Three escalating scenarios plus endless Sandbox.
- Objectives, deadline/outcome flow, first-capability checklist.
- Manual/autosave slots and JSON import/export.
- Title, picker, Continue, settings, HUD, notifications, and controls.

**Exit:** a new player can complete the lifecycle unaided and return to a saved camp.

### M6 — Verification and release hardening — In progress

- Complete automated suite and three-year headless test.
- Balance every scenario with deterministic completion runs.
- Profile rendering/simulation, repair accessibility issues, and remove console errors.
- Audit remaining tuning edge cases and document final values from a single source of truth.

**Exit:** CI-equivalent install/test/build passes and all vertical-slice acceptance criteria below are demonstrated.

### M7 — Full capability-management expansion — Roadmap

- Editable ICD, detailed procurement/vendors, test evidence and defects.
- Route-based patrols, mobile sorties, terrain, power/comms, maintenance workload.
- Capital/O&S planning, schedule/risk management, training and staff opinions.
- Scenario-defined maps and additional campaign briefs.

**Exit:** systems produce meaningful cross-domain trade-offs rather than isolated bonuses.

### M8 — Balance and content release — Roadmap

- Tune prices, rates, weather, workload, and objective deadlines from telemetry.
- Add scenario variants and late-game threats without invalidating old saves.
- Freeze values in [BALANCE.md](./BALANCE.md), run endurance/accessibility passes, and prepare static release.

---

## 14. Corrected acceptance criteria

These criteria replace the coaster/guest clauses inherited from the theme-park template.

1. `npm install && npm run dev` starts the game, `npm test` passes, and `npm run build` produces a static bundle that runs from a file server.
2. A new player can start Sandbox and commission a useful configured capability within ten minutes, guided by the in-game checklist and human-readable validation.
3. First Watch, Monsoon Line, and Noise Floor are completable under their published objectives and deterministic seeds; Sandbox runs without a deadline.
4. Every camera, LiDAR, robot, drone, and floodlight model can be configured, procured, integrated, factory-tested, deployed, site-accepted, inspected, faulted/recovered, and decommissioned.
5. Sensors detect threats with visible day/night/weather trade-offs; operators can validate alarms; troopers or eligible mobile assets can respond; intruders can be caught or escape with ledgered consequences.
6. Workforce happiness responds to workload and design choices and materially affects people wellbeing, response success, rating, points, and command progression.
7. All lifecycle charges, salaries, O&S, funding, losses, savings, emergency support, and refunds are previewed where actionable and traceable in the ledger.
8. Save/load round-trips the full state, monthly autosave survives refresh, and JSON export/import restores a compatible operation.
9. A deterministic three-year headless run completes without crashes or non-finite state, and every final cash balance equals the sum of its ledger entries.
10. The default 100x100 camp remains responsive on a current desktop browser, with no console errors during a sustained 4x session.
11. All gameplay art is generated in code. No binary image is required by the shipped runtime.
12. Text stays in HTML/CSS, controls are keyboard-operable, failure states explain themselves, and charged amounts are shown before commitment.

---

## 15. Explicit non-goals

- Multiplayer or online accounts.
- 3D rendering or free camera rotation.
- Injuries, fatalities, or lethal-force simulation.
- Real-money purchases, ads, or monetized currencies.
- Roller coasters, rides, park guests, or theme-park economy systems.
- Mobile/touch-first layout.
- Mod support or public scripting API.
- Localization in the first release; English strings should still remain centralized when the UI is refactored.
- Audio until simulation, testing, accessibility, and balance are complete.
