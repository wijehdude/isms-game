import { MINUTES_PER_DAY, MINUTES_PER_MONTH, calendarFromMinutes, isNight } from "../core/time";
import { nextRandom, randomBetween, randomInt } from "../core/rng";
import { configuredStats, getModel, hasAutomaticAnalytics } from "../game/catalog";
import { nextId } from "../game/createGame";
import { getScenario } from "../game/scenarios";
import type { Device, GameState, Incident, Intruder, Point, WeatherKind } from "../game/types";
import { activeIncidents, approveAllReady, autoDeployReadyDrones, dispatchIncident, onDutyStaff, pushMessage, verifyIncident } from "../game/actions";
import { closeMonth, closeWeek, MINUTES_PER_WEEK, postLedger } from "./economy";
import { clamp, isHardenedPerimeter, recalculateRating } from "./rating";
import { findPath } from "../world/pathfinding";
import { getPackedTile, isTileBlocked, tileSurface } from "../world/map";

export type SimulationUpdate = {
  majorChange: boolean;
  autosaveDue: boolean;
  scenarioEnded: "won" | "lost" | null;
};

export function advanceSimulation(state: GameState, deltaMinutes: number): SimulationUpdate {
  const update: SimulationUpdate = { majorChange: false, autosaveDue: false, scenarioEnded: null };
  if (!Number.isFinite(deltaMinutes) || deltaMinutes <= 0 || state.speed === 0) return update;
  const previousMinutes = state.totalMinutes;
  state.totalMinutes += deltaMinutes;

  if (advanceProjects(state)) update.majorChange = true;
  if (advanceWeather(state)) update.majorChange = true;
  if (spawnScheduledEvents(state)) update.majorChange = true;

  moveStaff(state, deltaMinutes);
  moveMobileDevices(state, deltaMinutes);
  moveAndDetectIntruders(state, deltaMinutes);
  if (runAutonomousC2(state)) update.majorChange = true;
  if (advanceIncidents(state)) update.majorChange = true;
  if (runAutonomousC2(state)) update.majorChange = true;

  while (state.lastDailyUpdate + MINUTES_PER_DAY <= state.totalMinutes) {
    state.lastDailyUpdate += MINUTES_PER_DAY;
    runDailyUpdate(state);
    update.majorChange = true;
  }

  while (state.lastWeeklyFundingUpdate + MINUTES_PER_WEEK <= state.totalMinutes) {
    state.lastWeeklyFundingUpdate += MINUTES_PER_WEEK;
    const funding = closeWeek(state);
    pushMessage(state, "Weekly funding released", `${formatFunding(funding)} received from command for security health ${state.rating.securityHealth}.`, "good");
    update.majorChange = true;
  }

  while (state.lastMonthlyUpdate + MINUTES_PER_MONTH <= state.totalMinutes) {
    state.lastMonthlyUpdate += MINUTES_PER_MONTH;
    closeMonth(state);
    state.lastAutosaveMonth = calendarFromMinutes(state.totalMinutes).absoluteMonth;
    pushMessage(state, "Month closed", "Payroll and sustainment posted. Weekly command funding continues to reflect delivered capability.", "info");
    update.autosaveDue = true;
    update.majorChange = true;
  }

  const scenarioResult = evaluateScenario(state);
  if (scenarioResult) {
    update.scenarioEnded = scenarioResult;
    update.majorChange = true;
  }

  state.intruders = state.intruders.filter((intruder) => intruder.phase === "infiltrating" || intruder.phase === "exfiltrating");
  if (state.incidents.length > 80) state.incidents = state.incidents.slice(-80);
  if (Math.floor(previousMinutes / 60) !== Math.floor(state.totalMinutes / 60)) recalculateRating(state);
  return update;
}

function advanceProjects(state: GameState): boolean {
  let changed = false;
  for (const order of state.orders) {
    if (order.readyAt > state.totalMinutes) continue;
    const model = getModel(order.modelId);
    if (order.stage === "procurement") {
      order.stage = "integration-review";
      order.readyAt = 0;
      pushMessage(state, "Delivery inspected", `${model.name} arrived. Approve its ICD and C2 integration review.`, "good");
      changed = true;
    } else if (order.stage === "integrating") {
      order.stage = "factory-test";
      order.readyAt = 0;
      pushMessage(state, "Integration build complete", `${model.shortName} is mapped into C2 and ready for factory acceptance.`, "good");
      changed = true;
    } else if (order.stage === "testing") {
      order.stage = "ready";
      order.readyAt = 0;
      pushMessage(state, "Factory acceptance passed", `${model.name} passed its configured alarm, health and recovery tests. Deploy it on the map.`, "good");
      changed = true;
    }
  }

  // Drones are based, rather than map-placed, as soon as their factory acceptance closes.
  if (autoDeployReadyDrones(state)) changed = true;

  for (const device of state.devices) {
    if (device.readyAt <= 0 || device.readyAt > state.totalMinutes) continue;
    if (device.status === "commissioning") {
      device.status = "operational";
      device.readyAt = 0;
      device.commissionedAt = state.totalMinutes;
      state.tutorial.commissioned = true;
      pushMessage(state, "Capability operational", `${device.name} passed site acceptance and now contributes full coverage.`, "good");
      changed = true;
    } else if (device.status === "upgrading") {
      device.upgradeIds = [...(device.pendingUpgradeIds ?? device.upgradeIds)];
      delete device.pendingUpgradeIds;
      device.status = "operational";
      device.readyAt = 0;
      pushMessage(state, "Asset upgrade complete", `${device.name} passed its updated ICD mapping and factory acceptance; it is back in service.`, "good");
      changed = true;
    } else if (device.status === "relocating") {
      device.status = "operational";
      device.readyAt = 0;
      pushMessage(state, "Asset relocation complete", `${device.name} has completed migration and recommissioning at its new sector.`, "good");
      changed = true;
    } else if (device.status === "fault") {
      device.status = "operational";
      device.readyAt = 0;
      device.health = Math.max(0.82, device.health);
      const faultIncident = state.incidents.find((incident) => incident.type === "system-fault" && incident.sourceDeviceIds.includes(device.id) && !["resolved", "dismissed", "missed"].includes(incident.status));
      if (faultIncident) {
        faultIncident.status = "resolved";
        faultIncident.resolution = "Engineer repair and regression check restored device health reporting.";
        state.rating.alarmsResolved += 1;
      }
      pushMessage(state, "Fault cleared", `${device.name} returned to service after engineer repair and regression check.`, "good");
      changed = true;
    }
  }
  if (state.automation.lifecycleAutopilot) {
    const before = `${state.economy.cash}|${state.orders.map((order) => `${order.id}:${order.stage}`).join(",")}|${state.devices.map((device) => `${device.id}:${device.status}`).join(",")}`;
    approveAllReady(state);
    const after = `${state.economy.cash}|${state.orders.map((order) => `${order.id}:${order.stage}`).join(",")}|${state.devices.map((device) => `${device.id}:${device.status}`).join(",")}`;
    if (before !== after) changed = true;
  }
  return changed;
}

function advanceWeather(state: GameState): boolean {
  if (state.weather.nextChangeAt > state.totalMinutes) return false;
  const scenario = getScenario(state.scenarioId);
  while (state.weather.nextChangeAt <= state.totalMinutes) {
    const index = randomInt(state, 0, Math.max(0, scenario.weatherBias.length - 1));
    const nextKind = scenario.weatherBias[index] ?? "clear";
    state.weather = {
      kind: nextKind,
      intensity: randomBetween(state, nextKind === "clear" ? 0.05 : 0.35, nextKind === "storm" ? 1 : 0.8),
      temperature: Math.round(randomBetween(state, 23, 34)),
      nextChangeAt: state.weather.nextChangeAt + randomBetween(state, 3, 10) * 60,
    };
  }
  const weatherWarning = state.weather.kind === "storm" || state.weather.kind === "fog";
  pushMessage(state, "Weather changed", weatherDescription(state.weather.kind), weatherWarning ? "warning" : "info");
  return true;
}

function spawnScheduledEvents(state: GameState): boolean {
  const scenario = getScenario(state.scenarioId);
  let changed = false;
  while (state.nextThreatAt <= state.totalMinutes && state.intruders.length < 24) {
    spawnIntruder(state);
    const pressure = Math.max(0.5, scenario.threatMultiplier + calendarFromMinutes(state.totalMinutes).absoluteMonth * 0.04);
    state.nextThreatAt += randomBetween(state, 12, 24) * 60 / pressure;
    changed = true;
  }
  while (state.nextFalseAlarmAt <= state.totalMinutes) {
    const available = state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind !== "lighting");
    const totalFalseAlarmRate = available.reduce((sum, device) => sum + configuredStats(device.modelId, device.upgradeIds).falseAlarmRate, 0);
    const device = weightedFalseAlarmDevice(state, available, totalFalseAlarmRate);
    if (device && activeIncidents(state).length < 12) createFalseAlarm(state, device);
    const fleetNoise = Math.max(0.4, totalFalseAlarmRate / 0.03);
    state.nextFalseAlarmAt += randomBetween(state, 7, 16) * 60 / (scenario.falseAlarmMultiplier * fleetNoise);
    changed = true;
  }
  return changed;
}

function spawnIntruder(state: GameState): void {
  // Fixed ingress sectors keep perimeter design testable while the seeded RNG selects the attack lane.
  const ingressSectors: Point[] = [
    { x: 32, y: 15 }, { x: 67, y: 15 }, { x: 84, y: 32 }, { x: 84, y: 67 },
    { x: 32, y: 84 }, { x: 67, y: 84 }, { x: 15, y: 32 }, { x: 15, y: 67 },
  ];
  const entry = ingressSectors[randomInt(state, 0, ingressSectors.length - 1)] ?? ingressSectors[0] ?? { x: 32, y: 15 };
  const targets: Point[] = [{ x: 42, y: 35 }, { x: 67, y: 64 }, { x: 56, y: 48 }];
  const target = targets[randomInt(state, 0, targets.length - 1)] ?? targets[0] ?? { x: 50, y: 50 };
  const typeRoll = nextRandom(state);
  const type: Intruder["type"] = typeRoll > 0.82 ? "saboteur" : typeRoll > 0.48 ? "thief" : "scout";
  state.intruders.push({
    id: nextId(state, "intruder"), type, x: entry.x, y: entry.y, entryX: entry.x, entryY: entry.y,
    targetX: target.x, targetY: target.y, phase: "infiltrating", stealth: randomBetween(state, 0.22, type === "saboteur" ? 0.62 : 0.5),
    detected: false, spawnedAt: state.totalMinutes, lossValue: type === "scout" ? 22_000 : type === "thief" ? 58_000 : 91_000,
    path: [],
  });
  state.metrics.realIncidents += 1;
}

function createFalseAlarm(state: GameState, device: Device): void {
  const types: Incident["type"][] = ["false-alarm", "loitering", "suspicious-object", "intrusion"];
  const type = types[randomInt(state, 0, types.length - 1)] ?? "false-alarm";
  const incident: Incident = {
    id: nextId(state, "incident"), type, genuine: false, x: device.x + randomBetween(state, -2, 2), y: device.y + randomBetween(state, -2, 2),
    status: "new", confidence: randomBetween(state, 0.36, 0.68), sourceDeviceIds: [device.id], intruderId: null,
    createdAt: state.totalMinutes, deadlineAt: state.totalMinutes + 210, readyAt: 0, assignedResponderId: null, resolution: null,
  };
  device.falseAlarms += 1;
  state.metrics.falseAlarmEvents += 1;
  state.incidents.push(incident);
  pushMessage(state, "C2 alarm requires validation", `${incidentLabel(type)} at sector ${Math.round(incident.x)}.${Math.round(incident.y)} · ${Math.round(incident.confidence * 100)}% confidence.`, "warning");
}

function moveAndDetectIntruders(state: GameState, deltaMinutes: number): void {
  for (const intruder of state.intruders) {
    if (intruder.phase === "caught" || intruder.phase === "escaped") continue;
    const target = intruder.phase === "infiltrating" ? { x: intruder.targetX, y: intruder.targetY } : { x: intruder.entryX, y: intruder.entryY };
    moveIntruderAlongPath(state, intruder, target, deltaMinutes * (intruder.type === "scout" ? 0.065 : 0.052));
    if (!intruder.detected) detectIntruder(state, intruder, deltaMinutes);
    if (Math.hypot(intruder.x - target.x, intruder.y - target.y) <= 0.3) {
      if (intruder.phase === "infiltrating") {
        intruder.phase = "exfiltrating";
        intruder.stealth = Math.max(0.08, intruder.stealth - 0.08);
        intruder.path = [];
      } else {
        intruder.phase = "escaped";
        state.rating.escaped += 1;
        state.metrics.missedIntrusions += 1;
        state.rating.capabilityPoints = Math.max(0, state.rating.capabilityPoints - 500);
        state.economy.stolenLosses += intruder.lossValue;
        postLedger(state, "loss", `${intruder.type} escaped with camp property`, -intruder.lossValue);
        const related = state.incidents.filter((incident) => incident.intruderId === intruder.id && ["new", "verifying", "verified", "responding"].includes(incident.status));
        related.forEach((incident) => {
          releaseResponder(state, incident);
          incident.status = "missed";
          incident.resolution = "The subject escaped before interception.";
        });
        pushMessage(state, "Security loss", `${intruder.type} escaped. ${formatLoss(intruder.lossValue)} of supplies or intelligence was lost.`, "danger");
      }
    }
  }
}

function detectIntruder(state: GameState, intruder: Intruder, deltaMinutes: number): void {
  const hardenedPerimeter = isHardenedPerimeter(state);
  let candidates = state.devices.filter((device) => {
    if (device.status !== "operational") return false;
    const kind = getModel(device.modelId).kind;
    if (kind === "drone" && !device.assignedIncidentId && !isDronePatrolActive(state, device)) return false;
    return kind !== "lighting" && Math.hypot(device.x - intruder.x, device.y - intruder.y) <= configuredStats(device.modelId, device.upgradeIds).range;
  });
  if (candidates.length === 0 && hardenedPerimeter) {
    candidates = state.devices
      .filter((device) => {
        if (device.status !== "operational") return false;
        const kind = getModel(device.modelId).kind;
        return kind !== "lighting" && (kind !== "drone" || Boolean(device.assignedIncidentId) || isDronePatrolActive(state, device));
      })
      .sort((a, b) => Math.hypot(a.x - intruder.x, a.y - intruder.y) - Math.hypot(b.x - intruder.x, b.y - intruder.y))
      .slice(0, 2);
  }
  if (candidates.length === 0) return;

  let combinedMiss = 1;
  const sources: Device[] = [];
  const sourceKinds = new Set<string>();
  for (const device of candidates) {
    const model = getModel(device.modelId);
    const stats = configuredStats(device.modelId, device.upgradeIds);
    const distance = Math.hypot(device.x - intruder.x, device.y - intruder.y);
    const rangeFactor = clamp(1 - distance / (stats.range * 1.25), 0.12, 1);
    let environment = weatherMultiplier(state.weather.kind, model.kind, stats.rainFactor, stats.fogFactor);
    if (isNight(state.totalMinutes)) {
      const floodlit = state.devices.some((light) => light.status === "operational" && getModel(light.modelId).kind === "lighting" && Math.hypot(light.x - intruder.x, light.y - intruder.y) <= configuredStats(light.modelId, light.upgradeIds).range);
      environment *= model.kind === "camera" ? (floodlit ? 0.86 : stats.nightFactor) : model.kind === "lidar" ? 0.98 : stats.nightFactor;
    }
    const manualFactor = hasAutomaticAnalytics(device.modelId, device.upgradeIds)
      ? 1
      : Math.min(0.5, onDutyStaff(state, "operator").length * 0.17) * clamp(1 - state.rating.cognitiveLoad / 130, 0.25, 1);
    const inFov = model.kind !== "camera" || device.upgradeIds.includes("panoramic") || device.facing === undefined
      || angleDifference(device.facing, Math.atan2(intruder.y - device.y, intruder.x - device.x)) <= Math.PI / 4;
    const detectionRate = stats.accuracy * rangeFactor * environment * device.health * manualFactor * (1 - intruder.stealth) * (inFov ? 1 : 0.04);
    const probability = 1 - Math.exp(-(detectionRate * deltaMinutes) / 105);
    combinedMiss *= 1 - probability;
    if (probability > 0.002) {
      sources.push(device);
      sourceKinds.add(model.kind);
    }
  }
  // Complementary modalities make independent evidence more decisive than repeated same-sensor hits.
  combinedMiss *= Math.pow(0.86, Math.max(0, sourceKinds.size - 1));
  if (hardenedPerimeter) {
    for (const device of candidates) {
      if (!sources.includes(device)) sources.push(device);
      sourceKinds.add(getModel(device.modelId).kind);
    }
    combinedMiss = 0.001;
  } else if (nextRandom(state) >= 1 - combinedMiss) return;

  intruder.detected = true;
  sources.forEach((device) => { device.detections += 1; });
  const firstDetection = !state.incidents.some((incident) => incident.genuine && incident.type === "intrusion" && incident.intruderId === intruder.id);
  if (firstDetection) {
    state.metrics.detectedRealIncidents += 1;
    state.metrics.detectionSamples += 1;
    state.metrics.totalDetectionMinutes += Math.max(0, state.totalMinutes - intruder.spawnedAt);
  }
  const confidence = hardenedPerimeter
    ? 0.99
    : clamp(1 - combinedMiss + sources.length * 0.1 + Math.max(0, sourceKinds.size - 1) * 0.08, 0.35, 0.96);
  state.incidents.push({
    id: nextId(state, "incident"), type: "intrusion", genuine: true, x: intruder.x, y: intruder.y, status: "new", confidence,
    sourceDeviceIds: sources.map((device) => device.id), intruderId: intruder.id, createdAt: state.totalMinutes,
    deadlineAt: state.totalMinutes + 190, readyAt: 0, assignedResponderId: null, resolution: null,
    assuredResponse: hardenedPerimeter,
    detectedAt: state.totalMinutes,
  });
  pushMessage(state, "Potential intrusion", `${sources.length} sensor${sources.length === 1 ? "" : "s"} reported movement at sector ${Math.round(intruder.x)}.${Math.round(intruder.y)} · ${Math.round(confidence * 100)}% confidence.`, "danger");
}

function runAutonomousC2(state: GameState): boolean {
  if (!state.automation.incidentResponse) return false;
  let changed = false;
  const operators = onDutyStaff(state, "operator");
  const verifying = state.incidents.filter((incident) => incident.status === "verifying").length;
  let validationSlots = Math.max(0, operators.length * 3 - verifying);
  const awaitingValidation = state.incidents
    .filter((incident) => incident.status === "new")
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const incident of awaitingValidation) {
    if (validationSlots <= 0) break;
    if (verifyIncident(state, incident.id).ok) {
      validationSlots -= 1;
      changed = true;
    }
  }
  const awaitingDispatch = state.incidents
    .filter((incident) => incident.status === "verified")
    .sort((a, b) => a.deadlineAt - b.deadlineAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const incident of awaitingDispatch) {
    if (dispatchIncident(state, incident.id).ok) changed = true;
  }
  return changed;
}

function advanceIncidents(state: GameState): boolean {
  let changed = false;
  for (const incident of state.incidents) {
    if (incident.status === "verifying" && incident.readyAt <= state.totalMinutes) {
      if (incident.type === "system-fault") {
        const device = state.devices.find((candidate) => incident.sourceDeviceIds.includes(candidate.id));
        incident.status = "responding";
        incident.readyAt = Math.max(state.totalMinutes + 1, device?.readyAt ?? state.totalMinutes + 60);
        incident.resolution = "Device fault confirmed; engineer repair work order is active.";
        pushMessage(state, "Fault acknowledged", incident.resolution, "warning");
      } else if (incident.genuine) {
        incident.status = "verified";
        incident.verifiedAt = state.totalMinutes;
        incident.resolution = "Evidence supports a genuine security event. Dispatch is required.";
        pushMessage(state, "Alarm verified", `Operator confirmed ${incidentLabel(incident.type)} at sector ${Math.round(incident.x)}.${Math.round(incident.y)}.`, "danger");
      } else {
        incident.status = "dismissed";
        incident.resolution = incident.type === "loitering" ? "Authorized person moved on after a remote check." : "Evidence was benign; no field dispatch required.";
        state.rating.falseAlarms += 1;
        state.tutorial.dismissed = true;
        pushMessage(state, "Alarm closed", incident.resolution, "good");
      }
      changed = true;
    }
    if (incident.status === "responding" && incident.readyAt <= state.totalMinutes) {
      if (incident.type === "system-fault") {
        const device = state.devices.find((candidate) => incident.sourceDeviceIds.includes(candidate.id));
        if (device?.status === "operational") {
          incident.status = "resolved";
          incident.resolution = "Engineer repair and regression check restored device health reporting.";
          state.rating.alarmsResolved += 1;
        } else {
          incident.readyAt = Math.max(state.totalMinutes + 15, device?.readyAt ?? state.totalMinutes + 60);
        }
      } else {
        resolveResponse(state, incident);
      }
      changed = true;
    }
    if (["new", "verified"].includes(incident.status) && incident.deadlineAt <= state.totalMinutes) {
      incident.status = "missed";
      incident.resolution = incident.genuine ? "Response window expired before interception." : "Alarm expired without operator classification.";
      if (incident.genuine) {
        state.rating.capabilityPoints = Math.max(0, state.rating.capabilityPoints - 300);
        const intruder = state.intruders.find((candidate) => candidate.id === incident.intruderId);
        if (intruder) intruder.detected = false;
      } else {
        state.rating.falseAlarms += 1;
      }
      pushMessage(state, "Alarm response missed", incident.resolution, "danger");
      changed = true;
    }
  }
  return changed;
}

function resolveResponse(state: GameState, incident: Incident): void {
  const staff = state.staff.find((member) => member.id === incident.assignedResponderId);
  const device = state.devices.find((candidate) => candidate.id === incident.assignedResponderId);
  let power = staff ? clamp(0.62 + (staff.happiness - 50) / 160, 0.48, 0.92) : device ? configuredStats(device.modelId, device.upgradeIds).responsePower : 0.5;
  if (state.weather.kind === "storm") power *= 0.8;
  power *= clamp(0.65 + state.rating.responseReadiness / 200, 0.65, 1.15);
  const onTime = state.totalMinutes <= incident.deadlineAt;
  if (!onTime) power *= 0.55;
  const success = incident.assuredResponse === true || nextRandom(state) < power;
  if (success) {
    incident.status = "resolved";
    incident.resolvedAt = state.totalMinutes;
    incident.resolution = incident.genuine ? "Subject intercepted and escorted for investigation." : "Benign cause confirmed in the field.";
    state.rating.alarmsResolved += 1;
    state.rating.capabilityPoints += incident.genuine ? 350 : 80;
    state.tutorial.resolvedAlarm = true;
    const intruder = state.intruders.find((candidate) => candidate.id === incident.intruderId);
    if (intruder) {
      const prevented = intruder.phase === "infiltrating";
      intruder.phase = "caught";
      state.rating.caught += 1;
      state.economy.avoidedLosses += intruder.lossValue;
      if (incident.genuine && incident.type === "intrusion") {
        state.metrics.successfulClosures += 1;
        if (prevented) {
          incident.prevented = true;
          state.metrics.threatsPrevented += 1;
        }
      }
    }
    pushMessage(state, "Incident resolved", incident.resolution, "good");
  } else {
    incident.status = "missed";
    incident.resolvedAt = state.totalMinutes;
    incident.resolution = "The response searched the sector but lost contact with the subject.";
    state.rating.capabilityPoints = Math.max(0, state.rating.capabilityPoints - 180);
    const intruder = state.intruders.find((candidate) => candidate.id === incident.intruderId);
    if (intruder) intruder.detected = false;
    pushMessage(state, "Contact lost", incident.resolution, "warning");
  }
  releaseResponder(state, incident, staff);
}

function moveStaff(state: GameState, deltaMinutes: number): void {
  const hour = calendarFromMinutes(state.totalMinutes).hour;
  const currentShift = hour < 8 ? 0 : hour < 16 ? 1 : 2;
  for (const member of state.staff) {
    const working = member.shift === currentShift;
    member.fatigue = clamp(member.fatigue + (working ? 0.015 : -0.026) * deltaMinutes);
    if (member.role === "operator" || member.role === "engineer") continue;
    if (!working && member.assignedIncidentId === null) {
      member.status = "resting";
      moveStaffAlongPath(state, member, { x: 37, y: 51 }, deltaMinutes * 0.045);
      continue;
    }
    if (member.assignedIncidentId === null) {
      member.status = "patrolling";
      if (Math.hypot(member.x - member.targetX, member.y - member.targetY) < 0.4) {
        const patrols: Point[] = [{ x: 24, y: 22 }, { x: 76, y: 23 }, { x: 78, y: 75 }, { x: 22, y: 74 }, { x: 48, y: 77 }];
        const target = patrols[randomInt(state, 0, patrols.length - 1)] ?? { x: 48, y: 77 };
        member.targetX = target.x;
        member.targetY = target.y;
        member.path = [];
      }
    }
    moveStaffAlongPath(state, member, { x: member.targetX, y: member.targetY }, deltaMinutes * (member.assignedIncidentId ? 0.24 : 0.055));
  }
}

function moveMobileDevices(state: GameState, deltaMinutes: number): void {
  for (const device of state.devices) {
    if (device.status !== "operational") continue;
    const model = getModel(device.modelId);
    if (model.kind !== "robot" && model.kind !== "drone") continue;
    const home = { x: device.homeX ?? device.x, y: device.homeY ?? device.y };
    const incident = state.incidents.find((candidate) => candidate.id === device.assignedIncidentId && candidate.status === "responding");
    const power = configuredStats(device.modelId, device.upgradeIds).responsePower;
    if (incident) {
      const target = { x: incident.x, y: incident.y };
      const speed = 0.45 + power * 0.2;
      if (model.kind === "drone") moveToward(device, target, deltaMinutes * speed);
      else moveAlongPath(state, device, target, deltaMinutes * speed, (x, y) => isTileBlocked(state.world, x, y));
    } else if (model.kind === "drone") {
      const patrol = ensureDronePatrol(device);
      if (isDronePatrolActive(state, device)) {
        const route = dronePatrolRoute(patrol.side);
        let target = route[patrol.waypointIndex % route.length] ?? route[0] ?? home;
        if (Math.hypot(device.x - target.x, device.y - target.y) < 0.35) {
          patrol.waypointIndex = (patrol.waypointIndex + 1) % route.length;
          target = route[patrol.waypointIndex] ?? route[0] ?? home;
        }
        // Flight speed is intentionally below dispatch sprint speed so players can see the route.
        moveToward(device, target, deltaMinutes * (0.28 + power * 0.18));
      } else {
        moveToward(device, home, deltaMinutes * (0.3 + power * 0.16));
      }
    } else {
      moveAlongPath(state, device, home, deltaMinutes * 0.12, (x, y) => isTileBlocked(state.world, x, y));
    }
  }
}

function ensureDronePatrol(device: Device): NonNullable<Device["dronePatrol"]> {
  if (!device.dronePatrol) device.dronePatrol = { side: "north", schedule: "both", waypointIndex: 0 };
  return device.dronePatrol;
}

function isDronePatrolActive(state: GameState, device: Device): boolean {
  if (state.weather.kind === "storm") return false;
  const patrol = ensureDronePatrol(device);
  if (patrol.schedule === "both") return true;
  const hour = calendarFromMinutes(state.totalMinutes).hour;
  const day = hour >= 6 && hour < 18;
  return patrol.schedule === "day" ? day : !day;
}

function dronePatrolRoute(side: NonNullable<Device["dronePatrol"]>["side"]): Point[] {
  if (side === "north") return [{ x: 24, y: 21 }, { x: 76, y: 21 }];
  if (side === "east") return [{ x: 78, y: 24 }, { x: 78, y: 76 }];
  if (side === "south") return [{ x: 76, y: 78 }, { x: 24, y: 78 }];
  return [{ x: 21, y: 76 }, { x: 21, y: 24 }];
}

function runDailyUpdate(state: GameState): void {
  const unresolved = activeIncidents(state).length;
  const mobileSupport = state.devices.filter((device) => device.status === "operational" && ["robot", "drone"].includes(getModel(device.modelId).kind)).length;
  const analytics = state.devices.filter((device) => device.status === "operational" && hasAutomaticAnalytics(device.modelId, device.upgradeIds)).length;
  const manualCameras = state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind === "camera" && !hasAutomaticAnalytics(device.modelId, device.upgradeIds)).length;
  const recentIncidents = state.incidents.filter((incident) => incident.createdAt >= state.totalMinutes - MINUTES_PER_DAY * 7);
  const recentFalse = recentIncidents.filter((incident) => !incident.genuine).length;
  const nuisanceRatio = recentIncidents.length === 0 ? 0 : recentFalse / recentIncidents.length;

  for (const member of state.staff) {
    let target = 62;
    if (member.role === "trooper") target = 53 + state.rating.coverage * 0.2 + mobileSupport * 2.5 - unresolved * 2.2 - member.fatigue * 0.14;
    if (member.role === "operator") target = 61 + analytics * 1.2 - manualCameras * 2.5 - unresolved * 4.5 - nuisanceRatio * 21 - member.fatigue * 0.12;
    if (member.role === "engineer") target = 64 - state.orders.length * 1.8 - member.fatigue * 0.08;
    member.happiness = clamp(member.happiness + 0.12 * (clamp(target) - member.happiness));
  }

  for (const device of state.devices) {
    if (device.status !== "operational") continue;
    const stats = configuredStats(device.modelId, device.upgradeIds);
    device.health = clamp(device.health - randomBetween(state, 0.0004, 0.0022), 0.5, 1);
    const dailyFaultChance = Math.max(0.0005, (1 - stats.availability) * 0.12 + (1 - device.health) * 0.01);
    if (nextRandom(state) < dailyFaultChance) {
      device.status = "fault";
      device.readyAt = state.totalMinutes + randomBetween(state, 4, 12) * 60;
      createFaultIncident(state, device);
    }
  }
  recalculateRating(state, true);
}

function createFaultIncident(state: GameState, device: Device): void {
  state.incidents.push({
    id: nextId(state, "incident"), type: "system-fault", genuine: true, x: device.x, y: device.y, status: "new", confidence: 1,
    sourceDeviceIds: [device.id], intruderId: null, createdAt: state.totalMinutes, deadlineAt: state.totalMinutes + 8 * 60,
    readyAt: 0, assignedResponderId: null, resolution: null,
  });
  pushMessage(state, "Device fault", `${device.name} stopped reporting. An engineer has an automatic repair work order.`, "warning");
}

function releaseResponder(state: GameState, incident: Incident, knownStaff = state.staff.find((member) => member.id === incident.assignedResponderId)): void {
  if (knownStaff) {
    knownStaff.assignedIncidentId = null;
    knownStaff.status = "patrolling";
    knownStaff.fatigue = clamp(knownStaff.fatigue + 6);
  }
  const mobile = state.devices.find((device) => device.id === incident.assignedResponderId);
  if (mobile) {
    mobile.assignedIncidentId = null;
    mobile.path = [];
  }
  incident.assignedResponderId = null;
}

function evaluateScenario(state: GameState): "won" | "lost" | null {
  if (state.scenarioStatus !== "active" || state.scenarioId === "sandbox") return null;
  const scenario = getScenario(state.scenarioId);
  const allMet = scenario.objectives.every((objective) => objectiveValue(state, objective.metric) >= objective.target);
  if (allMet) {
    state.scenarioStatus = "won";
    state.speed = 0;
    pushMessage(state, "Commander objective achieved", `${scenario.name} completed with ${state.rating.campRating} security capability.`, "good");
    return "won";
  }
  if (scenario.deadlineDays !== null && state.totalMinutes >= scenario.deadlineDays * MINUTES_PER_DAY) {
    state.scenarioStatus = "lost";
    state.speed = 0;
    pushMessage(state, "Scenario deadline reached", "Command objectives were not all met. Continue the camp or retry from a save.", "danger");
    return "lost";
  }
  return null;
}

export function objectiveValue(state: GameState, metric: string): number {
  if (metric === "cash") return state.economy.cash;
  if (metric === "rating") return state.rating.campRating;
  if (metric === "coverage") return state.rating.coverage;
  if (metric === "caught") return state.rating.caught;
  if (metric === "operatorHappiness") return state.rating.operatorHappiness;
  if (metric === "trooperHappiness") return state.rating.trooperHappiness;
  return 0;
}

function moveToward(entity: { x: number; y: number }, target: Point, distance: number): void {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || length <= distance) {
    entity.x = target.x;
    entity.y = target.y;
    return;
  }
  entity.x += (dx / length) * distance;
  entity.y += (dy / length) * distance;
}

function moveStaffAlongPath(state: GameState, member: GameState["staff"][number], target: Point, distance: number): void {
  moveAlongPath(state, member, target, distance, (x, y) => isTileBlocked(state.world, x, y));
}

function moveIntruderAlongPath(state: GameState, intruder: Intruder, target: Point, distance: number): void {
  moveAlongPath(state, intruder, target, distance, (x, y) => {
    if (tileSurface(getPackedTile(state.world, x, y)) === "water") return true;
    return state.world.structures.some((structure) => structure.type === "building" && x >= structure.x && x < structure.x + structure.width && y >= structure.y && y < structure.y + structure.height);
  });
}

function moveAlongPath(
  state: GameState,
  entity: { x: number; y: number; path?: Point[] },
  target: Point,
  distance: number,
  blocked: (x: number, y: number) => boolean,
): void {
  const goal = { x: Math.round(target.x), y: Math.round(target.y) };
  const last = entity.path?.[entity.path.length - 1];
  if (!entity.path?.length || !last || last.x !== goal.x || last.y !== goal.y) {
    const start = {
      x: Math.max(0, Math.min(state.world.width - 1, Math.round(entity.x))),
      y: Math.max(0, Math.min(state.world.height - 1, Math.round(entity.y))),
    };
    const route = findPath(state.world.width, state.world.height, start, goal, blocked);
    entity.path = route.length > 0 ? route : [goal];
  }
  let remaining = distance;
  while (remaining > 0 && entity.path.length > 0) {
    const waypoint = entity.path[0] ?? target;
    const segment = Math.hypot(entity.x - waypoint.x, entity.y - waypoint.y);
    if (segment < 0.001) {
      if (entity.path.length > 1) entity.path.shift();
      else break;
      continue;
    }
    if (segment <= remaining) {
      entity.x = waypoint.x;
      entity.y = waypoint.y;
      remaining -= segment;
      if (entity.path.length > 1) entity.path.shift();
      else break;
    } else {
      moveToward(entity, waypoint, remaining);
      remaining = 0;
    }
  }
}

function weatherMultiplier(kind: WeatherKind, deviceKind: string, rainFactor: number, fogFactor: number): number {
  if (kind === "clear" || kind === "overcast") return 1;
  if (kind === "rain") return rainFactor;
  if (kind === "fog") return fogFactor;
  if (kind === "storm") return deviceKind === "drone" ? 0.08 : Math.min(rainFactor, 0.46);
  return 1;
}

function angleDifference(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function weightedFalseAlarmDevice(state: GameState, devices: Device[], totalRate: number): Device | undefined {
  if (devices.length === 0 || totalRate <= 0) return undefined;
  let roll = nextRandom(state) * totalRate;
  for (const device of devices) {
    roll -= configuredStats(device.modelId, device.upgradeIds).falseAlarmRate;
    if (roll <= 0) return device;
  }
  return devices[devices.length - 1];
}

function weatherDescription(kind: WeatherKind): string {
  if (kind === "clear") return "Clear conditions restore normal visual and flight performance.";
  if (kind === "overcast") return "Overcast but stable; all devices remain within normal limits.";
  if (kind === "rain") return "Rain is reducing LiDAR confidence and mobile availability.";
  if (kind === "fog") return "Fog is degrading visual and point-cloud range. Fuse complementary sensors.";
  return "Storm conditions severely restrict drone operations and outdoor response.";
}

function incidentLabel(type: Incident["type"]): string {
  return type.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function formatLoss(value: number): string {
  return value >= 1_000 ? `$${Math.round(value / 1_000)}k` : `$${value}`;
}

function formatFunding(value: number): string {
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(2)}m` : `$${Math.round(value / 1_000)}k`;
}
