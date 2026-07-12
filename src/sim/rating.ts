import { configuredStats, getModel } from "../game/catalog";
import type { GameState, OverallMetrics } from "../game/types";
import { projectedMonthlyCosts } from "./economy";

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

/**
 * Early scorecards should reward the capability the commander has actually
 * fielded, without pretending that no incidents means a perfect history. Once
 * ten genuine incidents have occurred, every operational measure is wholly
 * evidence-led.
 */
const OBSERVATION_WINDOW = 10;

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
  const devices = state.devices.filter((device) => device.status === "operational" && ["camera", "lidar", "drone", "robot", "access-control"].includes(getModel(device.modelId).kind));
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

type Evidence = {
  realIncidents: number;
  detectedRealIncidents: number;
  falseAlarmEvents: number;
  detectionSamples: number;
  totalDetectionMinutes: number;
  responseSamples: number;
  totalResponseMinutes: number;
  successfulClosures: number;
  missedIntrusions: number;
  threatsPrevented: number;
};

type CapabilityForecast = {
  incidentDetectionRate: number;
  falseAlarmRate: number;
  detectionSpeed: number;
  responseSpeed: number;
  meanTimeToDetect: number;
  meanTimeToRespond: number;
  successfulIncidentClosures: number;
  preventionRate: number;
  missedIntrusionScore: number;
};

function observationWeight(realIncidents: number): number {
  return clamp(realIncidents / OBSERVATION_WINDOW, 0, 1);
}

function blendForecast(forecast: number, observed: number, realIncidents: number): number {
  const observedWeight = observationWeight(realIncidents);
  return clamp(forecast * (1 - observedWeight) + observed * observedWeight);
}

function blendValue(forecast: number, observed: number, realIncidents: number): number {
  const observedWeight = observationWeight(realIncidents);
  return Math.max(0, forecast * (1 - observedWeight) + observed * observedWeight);
}

/**
 * A short operational record is too noisy to be the whole programme score.
 * This forecast is intentionally grounded in the installed estate, current
 * shift capacity and affordability rather than a generic neutral default.
 */
function capabilityForecast(
  state: GameState,
  coverage: number,
  detectionFusion: number,
  uptime: number,
  responseReadiness: number,
  cognitiveLoad: number,
  cashRunway: number,
): CapabilityForecast {
  const hour = Math.floor(state.totalMinutes / 60) % 24;
  const shift = hour < 8 ? 0 : hour < 16 ? 1 : 2;
  const activeOperators = state.staff.filter((member) => member.role === "operator" && member.shift === shift).length;
  const activeTroopers = state.staff.filter((member) => member.role === "trooper" && member.shift === shift).length;
  const engineers = state.staff.filter((member) => member.role === "engineer").length;
  const staffing = clamp(
    Math.min(1, activeOperators / 2) * 45
      + Math.min(1, activeTroopers / 2) * 45
      + Math.min(1, engineers / 2) * 10,
  );
  const workloadHeadroom = 100 - cognitiveLoad;
  const detectionDevices = state.devices.filter((device) => {
    return device.status === "operational" && getModel(device.modelId).kind !== "lighting";
  });
  const cameras = detectionDevices.filter((device) => getModel(device.modelId).kind === "camera");
  const manualFeeds = cameras.filter((device) => {
    return getModel(device.modelId).id !== "camera-edge" && !device.upgradeIds.some((id) => id.startsWith("va-"));
  }).length;
  const expectedFalseAlarmRate = detectionDevices.length === 0
    ? 100
    : clamp(
      (detectionDevices.reduce((sum, device) => sum + configuredStats(device.modelId, device.upgradeIds).falseAlarmRate, 0) / detectionDevices.length) * 100
        + (manualFeeds / Math.max(1, cameras.length)) * 9
        + cognitiveLoad * 0.04,
    );

  // Detection favours proven perimeter coverage and complementary evidence.
  // The smaller staffing/workload terms make an unstaffed C2 room visibly less
  // credible even where hardware happens to overlap.
  const incidentDetectionRate = clamp(
    coverage * 0.36
      + detectionFusion * 0.4
      + uptime * 0.14
      + staffing * 0.04
      + workloadHeadroom * 0.06,
  );
  const detectionSpeed = clamp(
    incidentDetectionRate * 0.72
      + uptime * 0.12
      + staffing * 0.08
      + workloadHeadroom * 0.08,
  );
  const responseSpeed = clamp(
    responseReadiness * 0.7
      + staffing * 0.16
      + workloadHeadroom * 0.08
      + cashRunway * 0.06,
  );
  const successfulIncidentClosures = clamp(
    incidentDetectionRate * 0.48
      + responseSpeed * 0.38
      + staffing * 0.07
      + uptime * 0.07,
  );
  const preventionRate = clamp(
    incidentDetectionRate * 0.58
      + responseSpeed * 0.27
      + coverage * 0.1
      + cashRunway * 0.05,
  );
  return {
    incidentDetectionRate,
    falseAlarmRate: expectedFalseAlarmRate,
    detectionSpeed,
    responseSpeed,
    meanTimeToDetect: (100 - detectionSpeed) * 0.6,
    meanTimeToRespond: (100 - responseSpeed) * 0.9,
    successfulIncidentClosures,
    preventionRate,
    missedIntrusionScore: clamp(successfulIncidentClosures * 0.65 + incidentDetectionRate * 0.35),
  };
}

/**
 * Metrics are maintained by the simulation. The incident/rating fallbacks make
 * handcrafted test states and a just-upgraded game behave sensibly too.
 */
function evidenceFor(state: GameState): Evidence {
  const genuine = state.incidents.filter((incident) => incident.genuine);
  const detectedFromIncidents = genuine.filter((incident) => incident.detectedAt !== undefined || incident.sourceDeviceIds.length > 0).length;
  const falseFromIncidents = state.incidents.filter((incident) => !incident.genuine).length;
  const detectedSamples = state.incidents.filter((incident) => incident.detectedAt !== undefined).map((incident) => (incident.detectedAt ?? incident.createdAt) - incident.createdAt);
  const responseSamples = state.incidents.filter((incident) => incident.respondedAt !== undefined).map((incident) => (incident.respondedAt ?? incident.createdAt) - incident.createdAt);
  const preventedFromIncidents = genuine.filter((incident) => incident.prevented).length;
  return {
    realIncidents: Math.max(state.metrics.realIncidents, genuine.length),
    detectedRealIncidents: Math.max(state.metrics.detectedRealIncidents, detectedFromIncidents),
    falseAlarmEvents: Math.max(state.metrics.falseAlarmEvents, falseFromIncidents, state.rating.falseAlarms),
    detectionSamples: Math.max(state.metrics.detectionSamples, detectedSamples.length),
    totalDetectionMinutes: Math.max(state.metrics.totalDetectionMinutes, detectedSamples.reduce((sum, value) => sum + Math.max(0, value), 0)),
    responseSamples: Math.max(state.metrics.responseSamples, responseSamples.length),
    totalResponseMinutes: Math.max(state.metrics.totalResponseMinutes, responseSamples.reduce((sum, value) => sum + Math.max(0, value), 0)),
    successfulClosures: Math.max(state.metrics.successfulClosures, state.rating.caught),
    missedIntrusions: Math.max(state.metrics.missedIntrusions, state.rating.escaped),
    threatsPrevented: Math.max(state.metrics.threatsPrevented, preventedFromIncidents),
  };
}

function scheduleAdherence(state: GameState): number {
  const milestones = [
    ...state.devices
      .filter((device) => device.plannedOperationalAt !== undefined)
      .map((device) => ({ plannedAt: device.plannedOperationalAt ?? state.totalMinutes, actualAt: device.commissionedAt })),
    ...state.orders
      .filter((order) => order.plannedOperationalAt !== undefined)
      .map((order) => ({ plannedAt: order.plannedOperationalAt ?? state.totalMinutes, actualAt: null })),
  ];
  // No active programme is on plan. A neutral 65 unfairly capped mature
  // camps that had completed their last change order successfully.
  if (milestones.length === 0) return 100;
  const score = milestones.reduce((sum, milestone) => {
    const observedAt = milestone.actualAt ?? state.totalMinutes;
    const delayMinutes = Math.max(0, observedAt - milestone.plannedAt);
    // A one-week delay consumes the full punctuality score for that milestone.
    return sum + clamp(100 - (delayMinutes / (7 * 24 * 60)) * 100);
  }, 0) / milestones.length;
  return clamp(score);
}

function overallMetricsFor(
  state: GameState,
  securityHealth: number,
  costEffectiveness: number,
  schedule: number,
  forecast: CapabilityForecast,
  cashRunway: number,
): OverallMetrics {
  const evidence = evidenceFor(state);
  const real = evidence.realIncidents;
  const alarms = evidence.detectedRealIncidents + evidence.falseAlarmEvents;
  const observedDetectionRate = real === 0 ? forecast.incidentDetectionRate : clamp((evidence.detectedRealIncidents / real) * 100);
  const observedFalseAlarmRate = alarms === 0 ? forecast.falseAlarmRate : clamp((evidence.falseAlarmEvents / alarms) * 100);
  const observedMeanTimeToDetect = evidence.detectionSamples === 0 ? forecast.meanTimeToDetect : evidence.totalDetectionMinutes / evidence.detectionSamples;
  const observedMeanTimeToRespond = evidence.responseSamples === 0 ? forecast.meanTimeToRespond : evidence.totalResponseMinutes / evidence.responseSamples;
  const meanTimeToDetect = blendValue(forecast.meanTimeToDetect, observedMeanTimeToDetect, real);
  const meanTimeToRespond = blendValue(forecast.meanTimeToRespond, observedMeanTimeToRespond, real);
  const observedDetectionSpeed = evidence.detectionSamples === 0 ? forecast.detectionSpeed : clamp(100 - (observedMeanTimeToDetect / 60) * 100);
  const observedResponseSpeed = evidence.responseSamples === 0 ? forecast.responseSpeed : clamp(100 - (observedMeanTimeToRespond / 90) * 100);
  const closureDenominator = evidence.successfulClosures + evidence.missedIntrusions;
  const observedClosures = closureDenominator === 0 ? forecast.successfulIncidentClosures : clamp((evidence.successfulClosures / closureDenominator) * 100);
  const observedPreventionRate = real === 0 ? forecast.preventionRate : clamp((evidence.threatsPrevented / real) * 100);
  const incidentDetectionRate = blendForecast(forecast.incidentDetectionRate, observedDetectionRate, real);
  const falseAlarmRate = blendForecast(forecast.falseAlarmRate, observedFalseAlarmRate, real);
  const detectionSpeed = blendForecast(forecast.detectionSpeed, observedDetectionSpeed, real);
  const responseSpeed = blendForecast(forecast.responseSpeed, observedResponseSpeed, real);
  const successfulIncidentClosures = blendForecast(forecast.successfulIncidentClosures, observedClosures, real);
  const preventionRate = blendForecast(forecast.preventionRate, observedPreventionRate, real);
  const performance = clamp(
    incidentDetectionRate * 0.26
      + (100 - falseAlarmRate) * 0.14
      + detectionSpeed * 0.14
      + responseSpeed * 0.14
      + successfulIncidentClosures * 0.2
      + preventionRate * 0.12,
  );
  const observedMissedIntrusionScore = real === 0 ? forecast.missedIntrusionScore : clamp(100 - (evidence.missedIntrusions / real) * 100);
  const missedIntrusionScore = blendForecast(forecast.missedIntrusionScore, observedMissedIntrusionScore, real);
  const risk = clamp(securityHealth * 0.68 + missedIntrusionScore * 0.32);
  const cost = clamp(costEffectiveness * 0.6 + cashRunway * 0.4);
  return {
    performance: Math.round(performance),
    risk: Math.round(risk),
    cost: Math.round(cost),
    schedule: Math.round(schedule),
    incidentDetectionRate: Math.round(incidentDetectionRate),
    falseAlarmRate: Math.round(falseAlarmRate),
    meanTimeToDetect: Math.round(meanTimeToDetect),
    meanTimeToRespond: Math.round(meanTimeToRespond),
    successfulIncidentClosures: Math.round(successfulIncidentClosures),
    missedIntrusions: evidence.missedIntrusions,
    perimeterSecurityScore: Math.round(securityHealth),
    threatsPrevented: evidence.threatsPrevented,
    cashRunway: Math.round(cashRunway),
    scheduleAdherence: Math.round(schedule),
  };
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

  const troopers = state.staff.filter((member) => member.role === "trooper");
  const operators = state.staff.filter((member) => member.role === "operator");
  const trooperHappiness = troopers.length === 0 ? 0 : troopers.reduce((sum, member) => sum + member.happiness, 0) / troopers.length;
  const operatorHappiness = operators.length === 0 ? 0 : operators.reduce((sum, member) => sum + member.happiness, 0) / operators.length;
  const people = trooperHappiness * 0.55 + operatorHappiness * 0.45;

  const staffReadiness = Math.min(1, troopers.length / 3) * 0.5 + Math.min(1, operators.length / 3) * 0.35 + Math.min(1, state.staff.filter((member) => member.role === "engineer").length) * 0.15;
  const assetReadiness = allAssets === 0 ? 0 : operational.length / allAssets;
  const readiness = clamp((assetReadiness * 0.65 + staffReadiness * 0.35) * 100);
  const cognitiveLoad = calculateCognitiveLoad(state);
  const responseReadiness = calculateResponseReadiness(state, cognitiveLoad);
  const monthlyCost = projectedMonthlyCosts(state).total;
  const cashRunway = monthlyCost <= 0 ? 100 : clamp((state.economy.cash / (monthlyCost * 12)) * 100);
  const forecast = capabilityForecast(
    state,
    coverage,
    detectionFusion,
    uptime,
    responseReadiness,
    cognitiveLoad,
    cashRunway,
  );
  const operationalEvidence = evidenceFor(state);
  const outcomeTotal = state.rating.caught + state.rating.escaped;
  const observedInterdiction = outcomeTotal === 0 ? forecast.successfulIncidentClosures : (state.rating.caught / outcomeTotal) * 100;
  const interdiction = blendForecast(forecast.successfulIncidentClosures, observedInterdiction, operationalEvidence.realIncidents);
  const resolvedTotal = state.rating.alarmsResolved + state.rating.falseAlarms;
  const observedAlarmQuality = resolvedTotal === 0 ? 100 - forecast.falseAlarmRate : clamp(100 - (state.rating.falseAlarms / resolvedTotal) * 60);
  const alarmQuality = blendForecast(100 - forecast.falseAlarmRate, observedAlarmQuality, operationalEvidence.realIncidents);
  const security = clamp(detectionFusion * 0.42 + interdiction * 0.26 + uptime * 0.2 + alarmQuality * 0.12);
  const lossDrag = state.economy.stolenLosses / 9_000;
  const savingsLift = state.economy.realisedSavings / 18_000;
  const costEffectiveness = clamp(52 + savingsLift - lossDrag, 0, Math.min(100, security + 15));

  let securityHealth = security * 0.3 + responseReadiness * 0.23 + people * 0.14 + costEffectiveness * 0.13
    + uptime * 0.1 + detectionFusion * 0.1 - cognitiveLoad * 0.08;
  securityHealth = Math.min(securityHealth, security + 24);
  if (troopers.length === 0 || operators.length === 0) securityHealth = Math.min(securityHealth, 39);
  if (detectionFusion < 20) securityHealth = Math.min(securityHealth, 49);
  securityHealth = clamp(securityHealth);
  const schedule = scheduleAdherence(state);
  const overallMetrics = overallMetricsFor(state, securityHealth, costEffectiveness, schedule, forecast, cashRunway);
  const overallScore = clamp(
    overallMetrics.performance * 0.35
      + overallMetrics.risk * 0.25
      + overallMetrics.cost * 0.25
      + overallMetrics.schedule * 0.15,
  );

  state.rating.coverage = Math.round(coverage);
  state.rating.uptime = Math.round(uptime);
  state.rating.securityEffectiveness = Math.round(security);
  state.rating.peopleWellbeing = Math.round(people);
  state.rating.costEffectiveness = Math.round(costEffectiveness);
  state.rating.readiness = Math.round(readiness);
  state.rating.scheduleConfidence = Math.round(schedule);
  state.rating.trooperHappiness = Math.round(trooperHappiness);
  state.rating.operatorHappiness = Math.round(operatorHappiness);
  state.rating.cognitiveLoad = Math.round(cognitiveLoad);
  state.rating.detectionFusion = Math.round(detectionFusion);
  state.rating.responseReadiness = Math.round(responseReadiness);
  state.rating.securityHealth = Math.round(securityHealth);
  state.rating.overallMetrics = overallMetrics;
  state.rating.overallScore = Math.round(overallScore);
  // Scenario plumbing still asks for `rating`, now intentionally mapped to Overall Score.
  state.rating.campRating = state.rating.overallScore;
  if (awardDailyPoints) state.rating.capabilityPoints += Math.round((securityHealth * securityHealth) / 100);
  state.rating.capabilityLevel = capabilityLevel(state.rating.capabilityPoints, state.rating.overallScore);
}

function capabilityLevel(points: number, overallScore: number): string {
  if (points >= 15_000 && overallScore >= 90) return "Exemplary";
  if (points >= 8_000 && overallScore >= 80) return "Resilient";
  if (points >= 3_500 && overallScore >= 65) return "Assured";
  if (points >= 1_200 && overallScore >= 45) return "Integrated";
  if (overallScore >= 25) return "Basic";
  return "Fragile";
}
