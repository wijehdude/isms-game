# Sentinel Base balance reference

This file records the tuning implemented in the current vertical slice. It is descriptive, not aspirational: values under **Current** are read from the TypeScript source. Items under **Roadmap** are proposed balance work and do not affect the build.

All money values are game dollars. Percentages shown as “+6 pp” are additive percentage points; multipliers such as “x1.08” are multiplicative.

## Sentinel Base v3 current overrides

This section supersedes older v1/v2 references below where they differ. It documents the shipped Sentinel Base posture, vendor model, and economy.

### Starting posture and feasibility

Every scenario and Sandbox starts with a $10,000,000 command appropriation, three troopers, three operators, one engineer, eight operational Sentry Fixed Cameras equipped with Intrusion VA, and twelve operational Lumen Security Floodlights. The cameras cover the eight fixed ingress sectors and the lights cover the four perimeter sides.

The baseline costs $160,248 per month to sustain: $145,000 payroll plus $15,248 operational support. A representative full perimeter enhancement remains feasible from the opening appropriation: 24 additional Fixed Cameras with Intrusion VA ($1,752,000 whole-programme), 32 Floodlights ($720,000), and four standard LiDARs ($616,000), for a $3,088,000 delivered-capability commitment before optional upgrades. This leaves more than $6.9m before recurring spend.

### Weekly command funding

Funding is released every seven in-game days, before monthly payroll and O&S. It is intentionally uncapped:

```text
weekly funding = max($2,000,000,
                     round_to_nearest_$100(
                       $2,000,000
                       + $20,000 * security health
                       + $500 * capability points))
```

There is no monthly allocation in Sentinel Base. Monthly close continues to post payroll, device O&S, savings, and autosave.

### Automation, C2, score, and vendor pricing

Delivery Autopilot progresses ready ICD integration, factory acceptance, and site acceptance gates when staff and funding permit. Existing assets accept module upgrades through an offline integration/test change order and can be relocated for `max($2,000, 5% of installed acquisition)` plus a migration outage. C2 validates alarms and dispatches available troopers, robots, or drones automatically. Ready drones auto-base at the eight-slot central pad; players select a North, East, South, or West route and Day, Night, or Both patrol window.

The displayed Overall Score weights Performance 35%, Risk 25%, Cost 25%, and Schedule 15%. Its operational metrics include Incident Detection Rate, False Alarm Rate, MTTD, MTTR, Successful Incident Closures, Missed Intrusions, Perimeter Security Score, and Threats Prevented. A capability forecast supplies early score evidence and blends linearly into observed outcomes over the first 10 genuine incidents; at 10 incidents the score is wholly evidence-led. Security Health remains the funding/hardened-perimeter measure. Capability points are awarded daily and on successful responses. At the hardened-perimeter threshold, fully operational high-quality coverage guarantees detection and successful interception; a fully layered, staffed, sustainable posture reaches 90+ Overall Score / Exemplary rather than being capped by missing history.

Each vendor product and configuration option publishes a 1-10 desirability card for Cost, Capability, Availability, Scalability, Interoperability, and Lead Time. Cost and Lead Time are reverse-scored. Quoted equipment cost is `base cost × capability factor × availability factor × scalability factor × interoperability factor × deadline urgency factor × vendor markup`; timed scenarios apply 1.00-1.25 urgency based on deadline pressure and unmet objectives, while Sandbox remains 1.00.

## 1. Clock, calendar, and simulation

| Value | Current tuning |
| --- | ---: |
| Fixed logic interval | 0.1 real seconds (10 Hz) |
| Game minutes per logic step at 1x | 3.2 |
| Real time per game day at 1x | 45 seconds |
| Available speeds | Pause, 1x, 2x, 4x |
| Day length | 1,440 game minutes |
| Month length | 30 days / 43,200 minutes |
| Year length | 12 months |
| Night window | 19:00 through 05:59 |
| Initial time | Year 1, Month 1, Day 1, 06:00 |
| Autosave | Every monthly close and scenario ending |

The UI frame delta is capped at 0.25 seconds before entering the fixed-step accumulator. Rendering continues while paused.

## 2. Scenario setup

| Scenario | Cash | Deadline | Threat multiplier | False-alarm multiplier | Seed |
| --- | ---: | ---: | ---: | ---: | ---: |
| First Watch | $10,000,000 | Day 30 | 0.72 | 0.80 | 19,881 |
| Monsoon Line | $10,000,000 | Day 45 | 1.00 | 1.15 | 92,247 |
| Noise Floor | $10,000,000 | Day 60 | 1.35 | 1.80 | 410,731 |
| Open Command (Sandbox) | $10,000,000 | None | 0.90 | 1.00 | 73,221 |

### Objectives

| Scenario | Objectives; all are required |
| --- | --- |
| First Watch | Rating 60; threat-weighted coverage 42%; operator happiness 58; trooper happiness 58 |
| Monsoon Line | Rating 68; 6 caught intruders; $250,000 cash reserve |
| Noise Floor | Rating 72; operator happiness 68; 10 caught intruders |
| Sandbox | No terminal objectives |

Objectives are evaluated every simulation advance. Reaching every threshold wins immediately. A non-Sandbox deadline loses the scenario if objectives are still incomplete.

### Weather weighting

Each item in a scenario's list has equal draw weight.

| Scenario | Weighted weather list |
| --- | --- |
| First Watch | clear, clear, overcast, rain, fog |
| Monsoon Line | rain, rain, storm, fog, overcast |
| Noise Floor | clear, overcast, rain, fog, clear |
| Sandbox | clear, clear, overcast, rain, storm, fog |

### Initial force and estate

Every mode starts with:

- one trooper and one operator on each of the three shifts;
- one engineer on Shift 1 (08:00-16:00);
- eight operational Sentry Fixed Cameras at the fixed ingress sectors, each with Intrusion VA, 100% health, and an inward-facing orientation;
- twelve operational Lumen Security Floodlights distributed around the fenceline;
- initial weather equal to the first scenario weather entry, intensity 0.20, 28 C;
- first weather change at 11:00, first threat due at 11:00, first nuisance alarm due at 09:00.

Noise Floor sets the three starting operators to 46 happiness. All other staff start at 64.

## 3. Device models

The **standard programme** total is acquisition + fixed integration + factory test + SAT/commissioning, before options. The **charged O&S** column is the amount used at monthly close for a standard, non-faulted device.

| Model | Acquisition | Integrate | FAT | SAT | Standard programme | Lead | Range | Accuracy | False alarm | Availability | Response | Charged O&S/mo | Terrain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Sentry Fixed Camera | $42,000 | $8,000 | $5,000 | $3,000 | $58,000 | 20h | 9 | 69% | 2.2% | 96.5% | 0% | $913 | Flat |
| Kestrel Edge-AI Camera | $73,000 | $13,000 | $8,000 | $4,000 | $98,000 | 30h | 11 | 80% | 1.6% | 97.2% | 0% | $1,559.50 | Flat |
| Aegis Perimeter LiDAR | $118,000 | $19,000 | $11,000 | $6,000 | $154,000 | 42h | 13 | 84% | 1.2% | 95.8% | 0% | $2,477 | Flat |
| Ranger Quadruped | $176,000 | $28,000 | $16,000 | $9,000 | $229,000 | 58h | 5 | 73% | 1.4% | 90.0% | 54% | $5,864 | All |
| Atlas Response Humanoid | $335,000 | $43,000 | $25,000 | $14,000 | $417,000 | 78h | 6 | 80% | 1.1% | 93.0% | 72% | $10,302.50 | All |
| Hawkeye Patrol Drone | $224,000 | $36,000 | $21,000 | $11,000 | $292,000 | 64h | 18 | 77% | 1.5% | 87.0% | 68% | $8,236 | Flat; drone pad only |
| Lumen Security Floodlight | $18,000 | $2,000 | $1,500 | $1,000 | $22,500 | 10h | 8 | 0% | 0% | 98.5% | 0% | $647 | Flat |

“Response” is the base success power for a mobile device and increases its actual map travel speed. It does not make cameras, LiDAR, or lights responders.

## 4. Configuration options

| Option | Compatible models | Cost | Implemented effect | Complexity |
| --- | --- | ---: | --- | ---: |
| Intrusion VA | Cameras | $15,000 | Accuracy +6 pp; false-alarm forecast x1.08; enables automatic analytics | 3 |
| Loitering VA | Cameras | $12,000 | Accuracy +3 pp; false-alarm forecast x1.10; enables automatic analytics | 2 |
| Tamper VA | Cameras | $8,000 | Accuracy +2 pp; enables automatic analytics | 1 |
| Object VA | Cameras | $14,000 | Accuracy +3 pp; false-alarm forecast x1.12; enables automatic analytics | 2 |
| Infrared illuminator | Cameras | $19,000 | Range +1; camera night factor at least 0.72 | 1 |
| Low-light sensor | Cameras, drone | $24,000 | Accuracy +2 pp; night factor at least 0.86 | 2 |
| 360-degree panoramic head | Cameras | $28,000 | Range +2; accuracy +5 pp | 3 |
| Long-range optics | LiDAR | $48,000 | Range +8; accuracy +3 pp | 3 |
| Video point cloud | LiDAR | $39,000 | Accuracy +7 pp; false-alarm forecast x0.85 | 4 |
| Silhouette classifier | LiDAR | $31,000 | Accuracy +6 pp; false-alarm forecast x0.72 | 4 |
| Stabilised camera | Robots | $25,000 | Range +2; accuracy +7 pp | 2 |
| Onboard analytics | Robots | $34,000 | Accuracy +8 pp; false-alarm forecast x0.78 | 4 |
| All-terrain limbs | Robots | $32,000 | Availability +3.5 pp; response +6 pp | 2 |
| Sprint drive | Robots, drone | $37,000 | Response +11 pp; availability -1 pp | 2 |
| Extended battery | Robots, drone | $29,000 | Availability +5.5 pp | 2 |
| Wide-area scan | Drone | $42,000 | Range +8; accuracy +4 pp | 3 |
| Thermal payload | Drone | $51,000 | Accuracy +7 pp; night factor at least 0.92; fog factor at least 0.74 | 4 |
| Backup power | Floodlight | $6,000 | Availability +1.2 pp | 1 |

### Configured-stat rules

```text
acquisition = model acquisition + sum(option costs)
programme total = acquisition + integration + FAT + SAT
range = max(1, base range + range additions)
accuracy = clamp(base accuracy + accuracy additions, 0, 0.98)
false-alarm forecast = max(0, base rate * product(option multipliers))
availability = clamp(base availability + availability additions, 0.60, 0.995)
response power = min(0.95, base response + response additions)
monthly O&S = model base O&S + acquisition * 0.0015

integration duration = 8h + 2h * total complexity
FAT duration = 6h + 1h * total complexity
SAT duration = 3h
```

Standard environment factors, before option floors:

| Kind | Night | Rain | Fog |
| --- | ---: | ---: | ---: |
| Camera | 0.22 | 0.75 | 0.62 |
| LiDAR | 0.22* | 0.42 | 0.33 |
| Robot | 0.22* | 0.75 | 0.62 |
| Drone | 0.22* | 0.75 | 0.62 |
| Floodlight | Not a detector | Not a detector | Not a detector |

`*` Night handling applies a fixed 0.96 multiplier to non-camera detectors, so their configured `nightFactor` is not read during detection. Camera night handling uses its configured factor unless the target is floodlit.

The same monthly O&S value is shown by the Capability Builder and charged by the finance system. Each option therefore adds 0.15% of its acquisition price to monthly O&S. A faulted asset is charged at 40% of its configured value. Monthly totals and ledger entries are rounded to integer dollars after summing the fleet.

Configured false-alarm rates also drive nuisance-event timing and source selection; the fleet formula is documented in Section 8.

## 5. Procurement and lifecycle timing

| Stage | Entry condition | Cash charged | Duration |
| --- | --- | ---: | ---: |
| Procurement | Valid configuration and sufficient cash | Acquisition and options | Model lead time |
| Integration review | Delivery complete, at least one engineer, sufficient cash | Model integration cost | `8 + 2 * complexity` hours |
| Factory acceptance | Integration complete and sufficient cash | Model FAT cost | `6 + complexity` hours |
| Deployment | FAT complete, valid owned tile | $0 | Immediate |
| Site acceptance | Installed/awaiting SAT and sufficient cash | Model SAT cost | 3 hours |
| Operational | SAT countdown complete | Monthly O&S thereafter | Until fault/retirement |

Decommissioning refund:

```text
round(acquisition including options * 0.20 * current health)
```

Orders cannot currently be cancelled or refunded. Ready drones auto-base into one of eight central pad berths at x 66-72, y 37-43, then receive automated SAT; the player configures their fenceline side and patrol window instead of selecting a map tile.

## 6. Staff economy and shifts

| Role | Recruitment | Salary/mo | Initial count | Current game gate |
| --- | ---: | ---: | ---: | --- |
| Trooper | $8,000 | $18,000 | 3 | On-duty response |
| Operator | $8,000 | $22,000 | 3 | On-duty alarm validation |
| Engineer | $12,000 | $25,000 | 1 | At least one anywhere on roster starts integration |

Shifts are 00:00-08:00, 08:00-16:00, and 16:00-00:00. New staff join the shift with the smallest count for that role, breaking ties toward the earliest shift.

### Fatigue

```text
on-duty change  = +0.015 per game minute  (+7.2 over an eight-hour shift)
off-duty change = -0.026 per game minute  (-24.96 over sixteen hours)
completed human response = +6
fatigue range = 0..100
```

Operators and engineers do not currently change their displayed work location. Troopers patrol at 0.055 tiles per game minute, rest toward the barracks at 0.045 tiles per minute, and move toward an assigned incident at 0.24 tiles per minute.

### Daily happiness adjustment

Every day, happiness moves 12% of the difference between its current value and a clamped role target:

```text
new happiness = clamp(old happiness + 0.12 * (clamp(target) - old happiness))

trooper target = 53
               + coverage * 0.20
               + operational mobile assets * 2.5
               - active incidents * 2.2
               - fatigue * 0.14

operator target = 61
                + automatic/integrated feeds * 1.2
                - manual cameras * 2.5
                - active incidents * 4.5
                - seven-day nuisance ratio * 21
                - fatigue * 0.12

engineer target = 64 - open orders * 1.8 - fatigue * 0.08
```

“Mobile assets” means operational robots and drones. A camera is automatic if it is the Edge-AI model or has any `va-` option. The current helper treats every non-camera operational asset, including a floodlight, as an integrated automatic feed for the operator target; narrowing that definition is an M6 cleanup item.

## 7. Weather

Weather changes after a uniformly random 3-10 game hours. Temperature is a rounded uniform draw from 23-34 C.

| Weather | Intensity draw | Detection effect |
| --- | --- | --- |
| Clear | 0.05-0.80 | 1.00 |
| Overcast | 0.35-0.80 | 1.00 |
| Rain | 0.35-0.80 | Configured rain factor |
| Fog | 0.35-0.80 | Configured fog factor |
| Storm | 0.35-1.00 | Drone 0.08; other detectors `min(rain factor, 0.46)` |

Weather intensity and temperature are currently presentation/state values; detection uses only the category. Storm also multiplies final response power by 0.80.

At night:

- a camera uses its configured night factor;
- if any operational floodlight covers the intruder, camera night factor becomes 0.86;
- LiDAR uses a 0.98 night factor;
- drones and robots use their configured night factor, so low-light and thermal payloads materially improve night detection.

The floodlight check uses the light's configured range. Light effects do not stack.

## 8. Threat generation and movement

### Spawn schedule

```text
pressure = max(0.5, scenario threat multiplier + absoluteMonth * 0.04)
next threat interval = uniform(12h, 24h) / pressure
```

At most 24 intruders are retained concurrently. Entry is selected from four sides, with the free coordinate uniformly drawn from 23-77. Approach points are x/y 42/35 (HQ), 67/64 (Supply), or 56/48 (C2). Intruders use deterministic four-way paths around water and buildings while treating the fence line as breachable.

| Intruder | Draw probability | Speed | Initial stealth | Loss on escape |
| --- | ---: | ---: | ---: | ---: |
| Scout | 48% | 0.065 tiles/min | 0.22-0.50 | $22,000 |
| Thief | 34% | 0.052 tiles/min | 0.22-0.50 | $58,000 |
| Saboteur | 18% | 0.052 tiles/min | 0.22-0.62 | $91,000 |

On reaching the target, the intruder turns toward its original entry and loses 0.08 stealth, with a floor of 0.08. Reaching the entry while exfiltrating counts as escape.

### Nuisance schedule

The fleet's configured rates determine both cadence and which device creates the alarm:

```text
total false-alarm rate = sum(configured rates of operational non-lighting assets)
fleetNoise = max(0.40, total false-alarm rate / 0.03)
next nuisance interval = uniform(7h, 16h)
                       / (scenario false-alarm multiplier * fleetNoise)
```

The source is selected with probability proportional to its configured false-alarm rate. A scheduled nuisance event is created only if an eligible source exists and fewer than 12 incidents are active. Its sensor classification is uniformly unclassified motion, loitering, suspicious object, or intrusion; this label is an observation rather than hidden ground truth. Confidence is 0.36-0.68 and position is within +/-2 tiles of the selected source. A fleet with no eligible rate still advances the schedule using the 0.40 noise floor but creates no incident.

## 9. Detection

An operational non-lighting device becomes a candidate when the intruder is inside its configured range.

For each candidate:

```text
rangeFactor = clamp(1 - distance / (range * 1.25), 0.12, 1)

manualFactor = 1                                    for automatic analytics
             = min(0.50, on-duty operators * 0.17) for a manual camera

detectionRate = accuracy
              * rangeFactor
              * environment factor
              * device health
              * manualFactor
              * (1 - intruder stealth)
              * FOV factor

per-step probability = 1 - exp(-(detectionRate * deltaMinutes) / 105)
```

Fixed cameras have a 90-degree field of view. Their FOV factor is 1.00 inside that arc and 0.04 behind it. Panoramic cameras, non-camera sensors, and legacy saves without an orientation use 1.00. New placement faces away from map centre by default; Q/E adds or subtracts 90 degrees.

Candidate misses are multiplied to produce the combined miss probability. A successful detection creates one intrusion incident and marks the intruder visible. Incident confidence is:

```text
clamp(1 - combinedMiss + sourceCount * 0.12, 0.35, 0.96)
```

The per-device detection counter increments for every source that materially participated in the successful tick.

## 10. Incident timing and response

| Incident | Confidence | Deadline |
| --- | --- | ---: |
| Genuine intrusion | Detection formula | 190 minutes |
| Scheduled nuisance | 0.36-0.68 | 210 minutes |
| Device fault | 1.00 | 8 hours |

### Validation

At least one on-duty operator is required.

```text
validation duration = max(12, 55 - 8 * on-duty operator count) minutes
```

Genuine events become Verified. Benign events are automatically Dismissed after validation, increment the observed false-alarm count, and do not permit a field dispatch in the current UI.

### Dispatch and travel

Dispatch first chooses the first unassigned on-duty trooper. Only when none exists does it choose the nearest operational robot or drone.

```text
human movement speed = 0.24 tiles/min
mobile movement speed = 0.45 + configured response power * 0.20 tiles/min
travel duration = max(18, distance / movement speed) minutes
```

Human success power is calculated separately from happiness:

```text
human power = clamp(0.62 + (happiness - 50) / 160, 0.48, 0.92)
mobile power = configured device response power
storm multiplier = 0.80
late multiplier = 0.55
success = seeded random draw < final power
```

A successful response adds 6 fatigue to a human responder. An unsuccessful response releases the trooper and leaves the intruder able to continue.

### Outcome values

| Outcome | Points | Economy/stat effect |
| --- | ---: | --- |
| Genuine incident resolved | +350 | Caught +1; avoided losses +actor value |
| Benign field resolution | +80 | Reserved branch; not normally reachable through current validation flow |
| Genuine New/Verified alarm expires | -300 | Incident missed |
| Response unsuccessful | -180 | Intruder continues |
| Intruder escapes | -500 | Cash loss and stolen losses +actor value |
| Emergency appropriation | -250 | Cash restored to $50,000 |

Points cannot fall below zero.

## 11. Device health, faults, and repair

At each daily update an operational device loses a uniform 0.0004-0.0022 health, clamped to 0.50-1.00.

```text
daily fault chance = max(
  0.0005,
  (1 - configured availability) * 0.12 + (1 - health) * 0.01
)
```

A fault creates a system-fault alarm and an automatic repair countdown of 4-12 hours. On completion the device returns to Operational and health is raised to at least 0.82. Engineer count does not yet change repair duration.

Rating uptime is the average of `health * configured availability * 100` across all operational devices, including floodlights.

## 12. Coverage

Coverage is threat-weighted rather than raw area coverage. Positions 18, 20, ... 80 are sampled. For each position, six points are tested: north, south, east, west, the horizontal central corridor, and the vertical central corridor.

For each point, the strongest operational camera/LiDAR/robot/drone contribution is:

```text
strength = accuracy * (1 - distance / (range * 1.8))  when distance <= range
contribution = 0                                      when strength < 0.25
             = min(1, strength / 0.68)                otherwise

coverage = average(contribution) * 100
```

Overlapping devices improve detection probability but do not add directly in the coverage score, which takes the strongest source at each sample.

## 13. Rating and progression

All values are clamped 0-100 before being stored; displayed values are rounded integers.

### Security effectiveness

```text
interdiction = caught / (caught + escaped) * 100
               or 48 before the first completed outcome

alarm quality = 100 - falseAlarms / (alarmsResolved + falseAlarms) * 60
                or 52 before the first resolved/dismissed alarm

security = detection fusion * 0.42
         + interdiction * 0.26
         + uptime * 0.20
         + alarm quality * 0.12
```

### People and cost

```text
people = average trooper happiness * 0.55
       + average operator happiness * 0.45

savingsLift = realised savings / 18,000
lossDrag = stolen losses / 9,000

cost effectiveness = clamp(
  52 + savingsLift - lossDrag,
  0,
  min(100, security + 15)
)
```

### Readiness and schedule confidence

```text
staff readiness = min(1, troopers / 3) * 0.50
                + min(1, operators / 3) * 0.35
                + min(1, engineers) * 0.15

asset readiness = operational assets / (deployed assets + open orders)
                  or 0 when no assets/orders exist

readiness = (asset readiness * 0.65 + staff readiness * 0.35) * 100

schedule adherence = 100 when there are no active delivery milestones
                   = average punctuality of planned commissioning milestones otherwise
```

Schedule adherence compares planned operational dates with actual commissioning and gives the Overall Score its 15% schedule component.

### Security Health

```text
Security Health = security * 0.30
                + response readiness * 0.23
                + people * 0.14
                + cost effectiveness * 0.13
                + uptime * 0.10
                + detection fusion * 0.10
                - cognitive workload * 0.08

Security Health <= security + 24
Security Health <= 39 if there are no troopers or no operators
Security Health <= 49 if detection fusion < 20
```

Daily point award:

```text
round(Security Health * Security Health / 100)
```

### Capability tiers

| Tier | Minimum points | Minimum rating |
| --- | ---: | ---: |
| Fragile | 0 | 0 |
| Basic | 0 | 25 |
| Integrated | 1,200 | 45 |
| Assured | 3,500 | 65 |
| Resilient | 8,000 | 80 |
| Exemplary | 15,000 | 90 |

The highest tier for which both gates are met is displayed.

## 14. Recurring economy and weekly command funding

### Payroll and operations

```text
payroll = sum(all monthly salaries)
operations = sum(model base O&S + configured acquisition * 0.0015)
             * 0.40 for each faulted device
monthly recurring burn = payroll + operations
```

Devices awaiting SAT or commissioning are charged full O&S. Only status Fault receives the 40% multiplier.

### Savings

```text
conventional baseline = $275,000/month
monthly verified savings = max(0, $275,000 - recurring burn)
```

Verified savings accumulate as a non-cash performance metric. They are not posted as a positive ledger transaction.

### Weekly command funding

```text
weekly funding = max(
  $2,000,000,
  round_to_nearest_$100(
    $2,000,000
    + $20,000 * security health
    + $500 * capability points
  )
)
```

Funding is uncapped and posts every seven in-game days. Payroll and O&S remain monthly close entries.

If cash is negative after those entries:

```text
emergency appropriation = abs(cash) + $50,000
capability points -= 250, floor 0
```

### Ledger invariants

- Every entry is integer-rounded.
- `cash == sum(all ledger entry amounts)` must always hold.
- Positive Funding entries increase `lifetimeFunding`.
- Every negative ledger entry, including stolen-property losses, increases `lifetimeSpend`.
- `avoidedLosses`, `stolenLosses`, and `realisedSavings` are performance totals separate from the cash identity.

## 15. Current vertical slice versus balance roadmap

### Current

- Seven base models, 18 compatible options, staged lifecycle costs and timing.
- Scenario-weighted weather, probabilistic layered detection, three intruder types.
- Three staffed roles, three shifts, fatigue and daily happiness convergence.
- Monthly ledger economy, savings, funding, rating, points, and six capability tiers.
- Three objective scenarios and endless Sandbox.

### M6 tuning work

1. Exclude non-evidence assets such as floodlights from the operator analytics bonus.
2. Make configured drone night factors affect runtime detection instead of using the shared non-camera factor.
3. Run deterministic completion scripts for all scenario seeds and adjust only documented values.
4. Verify that points and weekly funding do not create an unrecoverable early spiral or effortless late-game surplus.
5. Profile 4x and a three-year headless run before increasing entity caps.

### Roadmap, not implemented

- Vendor bid quality, uncertain lead time, warranties, contract support, and cancellation.
- Capital/O&S appropriation envelopes, inflation, spares, annual review, and explicit risk contingency.
- Configurable test cases, defects, regression, waivers, and residual-risk scoring.
- Power/network dependencies, routed mobile patrols, charging, flight scheduling, and engineer repair workload.
- Individual skills, training, retention, staff opinions, and editable rosters.
- Directional FOV, line-of-sight, occlusion, correlation rules, and scenario-defined map expansion.

Any roadmap value must be added here when it becomes executable; until then, it must not be used to describe current balance.
