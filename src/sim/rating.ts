import { configuredStats, getModel } from "../game/catalog";
import type { GameState } from "../game/types";

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export const HARDENED_PERIMETER_THRESHOLDS = {
  securityHealth: 85,
  capabilityPoints: 8_000,
  coverage: 70,
  detectionFusion: 85,
  responseReadiness: 85,
  uptime: 90,
} as const;

export function isHardenedPerimeter(state: GameState): boolean {
  const threshold = HARDENED_PERIMETER_THRESHOLDS;
  return state.rating.securityHealth >= threshold.securityHealth
    && state.rating.capabilityPoints >= threshold.capabilityPoints
    && state.rating.coverage >= threshold.coverage
    && state.rating.detectionFusion >= threshold.detectionFusion
    && state.rating.responseReadiness >= threshold.responseReadiness
    && state.rating.uptime >= threshold.uptime
    && state.devices.some((device) => device.status === "operational" && getModel(device.modelId).kind !== "lighting");
}

function calculateCoverage(state: GameState): number {
  const devices = state.devices.filter((device) => device.status === "operational" && ["camera", "lidar", "drone", "robot"].includes(getModel(device.modelId).kind));
  if (devices.length === 0) return 0;
  let covered = 0;
  let sampled = 0;
  // Sample the perimeter and sensitive inner corridors; this is threat-weighted, not raw area.
  for (let position = 18; position <= 81; position += 2) {
    const points = [
      { x: position, y: 18 }, { x: position, y: 81 }, { x: 18, y: position }, { x: 81, y: position },
      { x: position, y: 50 }, { x: 50, y: position },
    ];
    for (const point of points) {
      sampled += 1;
      const strength = devices.reduce((best, device) => {
        const stats = configuredStats(device.modelId, device.upgradeIds);
        const distance = Math.hypot(device.x - point.x, device.y - point.y);
        const model = getModel(device.modelId);
        const inFov = model.kind !== "camera" || device.upgradeIds.includes("panoramic") || device.facing === undefined
          || angleDifference(device.facing, Math.atan2(point.y - device.y, point.x - device.x)) <= Math.PI / 4;
        return Math.max(best, distance <= stats.range && inFov ? stats.accuracy * (1 - distance / (stats.range * 1.8)) : 0);
      }, 0);
      if (strength >= 0.25) covered += Math.min(1, strength / 0.68);
    }
  }
  return sampled === 0 ? 0 : clamp((covered / sampled) * 100);
}

function angleDifference(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function calculateDetectionFusion(state: GameState): number {
  const sensors = state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind !== "lighting");
  if (sensors.length === 0) return 0;
  const threatPoints = [
    { x: 32, y: 18 }, { x: 67, y: 18 }, { x: 32, y: 81 }, { x: 67, y: 81 },
    { x: 18, y: 32 }, { x: 18, y: 67 }, { x: 81, y: 32 }, { x: 81, y: 67 },
  ];
  const lights = state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind === "lighting");
  const total = threatPoints.reduce((sum, point) => {
    let combinedMiss = 1;
    let automaticEvidence = false;
    const kinds = new Set<string>();
    let sourceCount = 0;
    for (const device of sensors) {
      const model = getModel(device.modelId);
      const stats = configuredStats(device.modelId, device.upgradeIds);
      const distance = Math.hypot(device.x - point.x, device.y - point.y);
      const inFov = model.kind !== "camera" || device.upgradeIds.includes("panoramic") || device.facing === undefined
        || angleDifference(device.facing, Math.atan2(point.y - device.y, point.x - device.x)) <= Math.PI / 4;
      if (distance > stats.range || !inFov) continue;
      const rangeFactor = clamp(1 - distance / (stats.range * 1.8), 0.15, 1);
      const evidence = clamp(stats.accuracy * stats.availability * device.health * rangeFactor, 0, 0.96);
      combinedMiss *= 1 - evidence;
      kinds.add(model.kind);
      sourceCount += 1;
      if (model.kind !== "camera" || model.id === "camera-edge" || device.upgradeIds.some((id) => id.startsWith("va-"))) automaticEvidence = true;
    }
    const lit = lights.some((device) => {
      const stats = configuredStats(device.modelId, device.upgradeIds);
      return Math.hypot(device.x - point.x, device.y - point.y) <= stats.range;
    });
    const correlatedEvidence = (1 - combinedMiss) * 72;
    const overlap = Math.min(12, Math.max(0, sourceCount - 1) * 5);
    const complementarySensors = Math.min(10, Math.max(0, kinds.size - 1) * 10);
    return sum + clamp(correlatedEvidence + overlap + complementarySensors + (automaticEvidence ? 4 : 0) + (lit ? 6 : 0));
  }, 0);
  return clamp(total / threatPoints.length);
}

function calculateCognitiveLoad(state: GameState): number {
  const hour = Math.floor(state.totalMinutes / 60) % 24;
  const shift = hour < 8 ? 0 : hour < 16 ? 1 : 2;
  const operators = state.staff.filter((member) => member.role === "operator" && member.shift === shift).length;
  const active = state.incidents.filter((incident) => !["resolved", "dismissed", "missed"].includes(incident.status));
  const workload = active.reduce((sum, incident) => sum + (incident.status === "verified" ? 1.2 : incident.status === "responding" ? 0.35 : 0.8), 0) / Math.max(1, operators);
  const cameras = state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind === "camera");
  const manualFeeds = cameras.filter((device) => getModel(device.modelId).id !== "camera-edge" && !device.upgradeIds.some((id) => id.startsWith("va-"))).length;
  const analytics = cameras.length - manualFeeds;
  const noisyDevices = state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind !== "lighting");
  const averageFalseAlarmRate = noisyDevices.length === 0
    ? 0
    : noisyDevices.reduce((sum, device) => sum + configuredStats(device.modelId, device.upgradeIds).falseAlarmRate, 0) / noisyDevices.length;
  return clamp(
    8 + workload * 17 + (manualFeeds * 7) / Math.max(1, operators) + averageFalseAlarmRate * 260
      - Math.min(8, analytics * 0.8) + (operators === 0 ? 45 : 0),
  );
}

function calculateResponseReadiness(state: GameState, cognitiveLoad: number): number {
  const hour = Math.floor(state.totalMinutes / 60) % 24;
  const shift = hour < 8 ? 0 : hour < 16 ? 1 : 2;
  const operators = state.staff.filter((member) => member.role === "operator" && member.shift === shift);
  const troopers = state.staff.filter((member) => member.role === "trooper" && member.shift === shift);
  const availableTroopers = troopers.filter((member) => member.assignedIncidentId === null).length;
  const mobileResponders = state.devices.filter((device) => device.status === "operational" && ["robot", "drone"].includes(getModel(device.modelId).kind) && !device.assignedIncidentId).length;
  const onDuty = [...operators, ...troopers];
  const happiness = onDuty.length === 0 ? 0 : onDuty.reduce((sum, member) => sum + member.happiness, 0) / onDuty.length;
  const fatigue = onDuty.length === 0 ? 100 : onDuty.reduce((sum, member) => sum + member.fatigue, 0) / onDuty.length;
  let readiness = Math.min(1, operators.length) * 20 + Math.min(1, availableTroopers + mobileResponders) * 25
    + happiness * 0.2 + (100 - fatigue) * 0.15 + (100 - cognitiveLoad) * 0.2;
  if (operators.length === 0) readiness = Math.min(readiness, 39);
  if (availableTroopers + mobileResponders === 0) readiness = Math.min(readiness, 49);
  return clamp(readiness);
}

export function recalculateRating(state: GameState, awardDailyPoints = false): void {
  const operational = state.devices.filter((device) => device.status === "operational");
  const commissioned = state.devices.filter((device) => device.commissionedAt !== null);
  const allAssets = state.devices.length + state.orders.length;
  const coverage = calculateCoverage(state);
  const detectionFusion = calculateDetectionFusion(state);
  const uptime = commissioned.length === 0
    ? 0
    : commissioned.reduce((sum, device) => sum + (device.status === "operational" ? device.health * configuredStats(device.modelId, device.upgradeIds).availability * 100 : 0), 0) / commissioned.length;
  const outcomeTotal = state.rating.caught + state.rating.escaped;
  const interdiction = outcomeTotal === 0 ? 48 : (state.rating.caught / outcomeTotal) * 100;
  const resolvedTotal = state.rating.alarmsResolved + state.rating.falseAlarms;
  const alarmQuality = resolvedTotal === 0 ? 52 : clamp(100 - (state.rating.falseAlarms / resolvedTotal) * 60);
  const security = clamp(detectionFusion * 0.42 + interdiction * 0.26 + uptime * 0.2 + alarmQuality * 0.12);

  const troopers = state.staff.filter((member) => member.role === "trooper");
  const operators = state.staff.filter((member) => member.role === "operator");
  const trooperHappiness = troopers.length === 0 ? 0 : troopers.reduce((sum, member) => sum + member.happiness, 0) / troopers.length;
  const operatorHappiness = operators.length === 0 ? 0 : operators.reduce((sum, member) => sum + member.happiness, 0) / operators.length;
  const people = trooperHappiness * 0.55 + operatorHappiness * 0.45;

  const lossDrag = state.economy.stolenLosses / 9_000;
  const savingsLift = state.economy.realisedSavings / 18_000;
  const costEffectiveness = clamp(52 + savingsLift - lossDrag, 0, Math.min(100, security + 15));
  const staffReadiness = Math.min(1, troopers.length / 3) * 0.5 + Math.min(1, operators.length / 3) * 0.35 + Math.min(1, state.staff.filter((member) => member.role === "engineer").length) * 0.15;
  const assetReadiness = allAssets === 0 ? 0 : operational.length / allAssets;
  const readiness = clamp((assetReadiness * 0.65 + staffReadiness * 0.35) * 100);
  const scheduleConfidence = state.scenarioStatus === "active" ? clamp(55 + readiness * 0.3 - state.orders.length * 1.5) : 100;
  const cognitiveLoad = calculateCognitiveLoad(state);
  const responseReadiness = calculateResponseReadiness(state, cognitiveLoad);

  let securityHealth = security * 0.3 + responseReadiness * 0.23 + people * 0.14 + costEffectiveness * 0.13
    + uptime * 0.1 + detectionFusion * 0.1 - cognitiveLoad * 0.08;
  securityHealth = Math.min(securityHealth, security + 24);
  if (troopers.length === 0 || operators.length === 0) securityHealth = Math.min(securityHealth, 39);
  if (detectionFusion < 20) securityHealth = Math.min(securityHealth, 49);

  state.rating.coverage = Math.round(coverage);
  state.rating.uptime = Math.round(uptime);
  state.rating.securityEffectiveness = Math.round(security);
  state.rating.peopleWellbeing = Math.round(people);
  state.rating.costEffectiveness = Math.round(costEffectiveness);
  state.rating.readiness = Math.round(readiness);
  state.rating.scheduleConfidence = Math.round(scheduleConfidence);
  state.rating.trooperHappiness = Math.round(trooperHappiness);
  state.rating.operatorHappiness = Math.round(operatorHappiness);
  state.rating.cognitiveLoad = Math.round(cognitiveLoad);
  state.rating.detectionFusion = Math.round(detectionFusion);
  state.rating.responseReadiness = Math.round(responseReadiness);
  state.rating.securityHealth = Math.round(clamp(securityHealth));
  state.rating.campRating = state.rating.securityHealth;
  if (awardDailyPoints) state.rating.capabilityPoints += Math.round((securityHealth * securityHealth) / 100);
  state.rating.capabilityLevel = capabilityLevel(state.rating.capabilityPoints, state.rating.campRating);
}

function capabilityLevel(points: number, rating: number): string {
  if (points >= 15_000 && rating >= 90) return "Exemplary";
  if (points >= 8_000 && rating >= 80) return "Resilient";
  if (points >= 3_500 && rating >= 65) return "Assured";
  if (points >= 1_200 && rating >= 45) return "Integrated";
  if (rating >= 25) return "Basic";
  return "Fragile";
}
