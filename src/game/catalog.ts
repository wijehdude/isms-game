import type {
  ConfiguredStats,
  DesirabilityAttributes,
  DeviceKind,
  DeviceModel,
  QuoteBreakdown,
  Upgrade,
  UpgradeComparison,
  VendorComparison,
  GameState,
} from "./types";
import { getScenario } from "./scenarios";

/** Creates the common 1–10, higher-is-better display scale used in catalogue cards. */
const bars = (
  cost: number,
  capability: number,
  availability: number,
  scalability: number,
  interoperability: number,
  leadTime: number,
): DesirabilityAttributes => ({ cost, capability, availability, scalability, interoperability, leadTime });

/**
 * `cost` is deliberately the base equipment price. The live quote is calculated
 * below from the factors required by the procurement model.
 */
export const DEVICE_MODELS: DeviceModel[] = [
  {
    id: "camera-fixed", kind: "camera", name: "Sentry Fixed Camera", shortName: "Fixed camera",
    description: "Affordable daylight coverage for a fence sector or internal compound.",
    cost: 42_000, leadHours: 20, integrationCost: 8_000, testCost: 5_000, commissionCost: 3_000,
    range: 9, accuracy: 0.69, falseAlarmRate: 0.022, availability: 0.965, monthlyOps: 850, responsePower: 0, allowedTerrain: "flat",
    vendor: "SentryWorks", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(9, 5, 8, 7, 7, 9),
  },
  {
    id: "camera-edge", kind: "camera", name: "Kestrel Edge-AI Camera", shortName: "Edge-AI camera",
    description: "On-device analytics detect and classify activity without constant operator attention.",
    cost: 73_000, leadHours: 30, integrationCost: 13_000, testCost: 8_000, commissionCost: 4_000,
    range: 11, accuracy: 0.8, falseAlarmRate: 0.016, availability: 0.972, monthlyOps: 1_450, responsePower: 0, allowedTerrain: "flat",
    vendor: "Kestrel Vision", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(6, 8, 8, 8, 9, 7),
  },
  {
    id: "lidar-sentinel", kind: "lidar", name: "Aegis Perimeter LiDAR", shortName: "LiDAR",
    description: "Reliable silhouette detection by day or night; rain and fog reduce confidence.",
    cost: 118_000, leadHours: 42, integrationCost: 19_000, testCost: 11_000, commissionCost: 6_000,
    range: 13, accuracy: 0.84, falseAlarmRate: 0.012, availability: 0.958, monthlyOps: 2_300, responsePower: 0, allowedTerrain: "flat",
    vendor: "Aegis Spatial", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(5, 8, 7, 7, 8, 6),
  },
  {
    id: "lidar-orion", kind: "lidar", name: "Orion 4D LiDAR", shortName: "4D LiDAR",
    description: "A lower-noise, weather-tolerant point-cloud sensor with a slower supplier lead.",
    cost: 146_000, leadHours: 58, integrationCost: 23_000, testCost: 13_000, commissionCost: 7_000,
    range: 16, accuracy: 0.89, falseAlarmRate: 0.008, availability: 0.975, monthlyOps: 2_850, responsePower: 0, allowedTerrain: "flat",
    vendor: "Orion Dynamics", vendorMarkup: 1.035, capabilityFactor: 1.04, availabilityFactor: 1.015, scalabilityFactor: 1.02, interoperabilityFactor: 1.01,
    attributes: bars(3, 10, 9, 8, 8, 4),
  },
  {
    id: "robot-dog", kind: "robot", name: "Ranger Quadruped", shortName: "Robot dog",
    description: "An autonomous patrol platform that takes repetitive and unsafe routes off troopers.",
    cost: 176_000, leadHours: 58, integrationCost: 28_000, testCost: 16_000, commissionCost: 9_000,
    range: 5, accuracy: 0.73, falseAlarmRate: 0.014, availability: 0.9, monthlyOps: 5_600, responsePower: 0.54, allowedTerrain: "all",
    vendor: "Ranger Robotics", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(5, 7, 6, 7, 7, 5),
  },
  {
    id: "robot-humanoid", kind: "robot", name: "Atlas Response Humanoid", shortName: "Humanoid robot",
    description: "Fast, terrain-capable autonomous escort and response support for high-risk areas.",
    cost: 335_000, leadHours: 78, integrationCost: 43_000, testCost: 25_000, commissionCost: 14_000,
    range: 6, accuracy: 0.8, falseAlarmRate: 0.011, availability: 0.93, monthlyOps: 9_800, responsePower: 0.72, allowedTerrain: "all",
    vendor: "Atlas Autonomy", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(2, 9, 7, 6, 8, 3),
  },
  {
    id: "drone-overwatch", kind: "drone", name: "Hawkeye Patrol Drone", shortName: "Patrol drone",
    description: "Rapid wide-area reconnaissance launched from the central drone pad.",
    cost: 224_000, leadHours: 64, integrationCost: 36_000, testCost: 21_000, commissionCost: 11_000,
    range: 18, accuracy: 0.77, falseAlarmRate: 0.015, availability: 0.87, monthlyOps: 7_900, responsePower: 0.68, allowedTerrain: "flat",
    vendor: "Hawkeye Air", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(4, 8, 6, 7, 8, 5),
  },
  {
    id: "drone-vector", kind: "drone", name: "Vector Long-Endurance Drone", shortName: "Endurance drone",
    description: "A high-availability patrol aircraft that trades procurement time for wider, longer scans.",
    cost: 298_000, leadHours: 86, integrationCost: 47_000, testCost: 26_000, commissionCost: 13_000,
    range: 24, accuracy: 0.85, falseAlarmRate: 0.01, availability: 0.94, monthlyOps: 10_600, responsePower: 0.75, allowedTerrain: "flat",
    vendor: "Vector Flight Systems", vendorMarkup: 1.03, capabilityFactor: 1.05, availabilityFactor: 1.03, scalabilityFactor: 1.01, interoperabilityFactor: 1.02,
    attributes: bars(2, 10, 9, 8, 9, 3),
  },
  {
    id: "floodlight", kind: "lighting", name: "Lumen Security Floodlight", shortName: "Floodlight",
    description: "Restores nearby camera performance at night and makes patrol routes feel safer.",
    cost: 18_000, leadHours: 10, integrationCost: 2_000, testCost: 1_500, commissionCost: 1_000,
    range: 8, accuracy: 0, falseAlarmRate: 0, availability: 0.985, monthlyOps: 620, responsePower: 0, allowedTerrain: "flat",
    vendor: "Lumen Grid", vendorMarkup: 1, capabilityFactor: 1, availabilityFactor: 1, scalabilityFactor: 1, interoperabilityFactor: 1,
    attributes: bars(10, 4, 9, 9, 8, 10),
  },
  {
    id: "floodlight-solar", kind: "lighting", name: "Helio Smart Floodlight", shortName: "Smart floodlight",
    description: "Networked solar-backed illumination with faster fault reporting and redundant power.",
    cost: 31_000, leadHours: 22, integrationCost: 4_000, testCost: 2_500, commissionCost: 1_500,
    range: 10, accuracy: 0, falseAlarmRate: 0, availability: 0.993, monthlyOps: 760, responsePower: 0, allowedTerrain: "flat",
    vendor: "Helio Secure", vendorMarkup: 1.02, capabilityFactor: 1.01, availabilityFactor: 1.04, scalabilityFactor: 1.02, interoperabilityFactor: 1.03,
    attributes: bars(7, 6, 10, 9, 9, 8),
  },
  {
    id: "access-gate", kind: "access-control", name: "Gatekeeper Smart Access", shortName: "Smart access gate",
    description: "Badge and vehicle access monitoring for gates, stores and protected compounds.",
    cost: 58_000, leadHours: 26, integrationCost: 11_000, testCost: 6_000, commissionCost: 3_000,
    range: 7, accuracy: 0.78, falseAlarmRate: 0.01, availability: 0.972, monthlyOps: 1_050, responsePower: 0, allowedTerrain: "flat",
    vendor: "Gatekeeper Systems", vendorMarkup: 1.01, capabilityFactor: 1.01, availabilityFactor: 1.01, scalabilityFactor: 1.02, interoperabilityFactor: 1.01,
    attributes: bars(7, 7, 8, 8, 8, 8),
  },
  {
    id: "access-biometric", kind: "access-control", name: "Sentinel Biometric Portal", shortName: "Biometric portal",
    description: "High-assurance identity and anti-tailgating control for sensitive buildings and gates.",
    cost: 112_000, leadHours: 48, integrationCost: 18_000, testCost: 10_000, commissionCost: 5_000,
    range: 8, accuracy: 0.9, falseAlarmRate: 0.006, availability: 0.982, monthlyOps: 1_900, responsePower: 0, allowedTerrain: "flat",
    vendor: "Sentinel Identity", vendorMarkup: 1.035, capabilityFactor: 1.05, availabilityFactor: 1.025, scalabilityFactor: 1.02, interoperabilityFactor: 1.04,
    attributes: bars(3, 10, 9, 7, 10, 5),
  },
];

export const UPGRADES: Upgrade[] = [
  { id: "va-intrusion", name: "Intrusion VA", description: "Automatically raises fence-crossing alarms.", kinds: ["camera"], cost: 15_000, accuracy: 0.06, falseAlarmMultiplier: 1.08, integrationComplexity: 3, leadHours: 4, vendor: "Kestrel Analytics", attributes: bars(8, 8, 8, 9, 9, 9) },
  { id: "va-loitering", name: "Loitering VA", description: "Recognises dwell patterns around sensitive areas.", kinds: ["camera"], cost: 12_000, accuracy: 0.03, falseAlarmMultiplier: 1.1, integrationComplexity: 2, leadHours: 3, vendor: "Kestrel Analytics", attributes: bars(9, 6, 8, 9, 9, 10) },
  { id: "va-tamper", name: "Tamper VA", description: "Flags obscured, moved or damaged camera views.", kinds: ["camera"], cost: 8_000, accuracy: 0.02, integrationComplexity: 1, leadHours: 2, vendor: "Kestrel Analytics", attributes: bars(10, 5, 8, 10, 9, 10) },
  { id: "va-object", name: "Object VA", description: "Detects abandoned and suspicious objects.", kinds: ["camera"], cost: 14_000, accuracy: 0.03, falseAlarmMultiplier: 1.12, integrationComplexity: 2, leadHours: 4, vendor: "Kestrel Analytics", attributes: bars(8, 7, 8, 9, 9, 9) },
  { id: "infrared", name: "Infrared illuminator", description: "Improves visual confidence in darkness.", kinds: ["camera"], cost: 19_000, nightFactor: 0.72, range: 1, integrationComplexity: 1, leadHours: 5, vendor: "SentryWorks", attributes: bars(7, 7, 9, 8, 8, 9) },
  { id: "night-vision", name: "Low-light sensor", description: "High-sensitivity night imaging with modest noise.", kinds: ["camera", "drone"], cost: 24_000, nightFactor: 0.86, accuracy: 0.02, integrationComplexity: 2, leadHours: 6, vendor: "Orion Optics", attributes: bars(6, 8, 8, 8, 8, 8) },
  { id: "panoramic", name: "360 degree panoramic head", description: "Removes the fixed camera's rear blind sector.", kinds: ["camera"], cost: 28_000, range: 2, accuracy: 0.05, integrationComplexity: 3, leadHours: 8, vendor: "SentryWorks", attributes: bars(5, 9, 8, 8, 8, 7) },
  { id: "lidar-long", name: "Long-range optics", description: "Extends point-cloud reach along long fence sectors.", kinds: ["lidar"], cost: 48_000, range: 8, accuracy: 0.03, integrationComplexity: 3, leadHours: 10, vendor: "Aegis Spatial", attributes: bars(4, 9, 8, 7, 8, 7) },
  { id: "lidar-video", name: "Video point cloud", description: "Continuous motion evidence instead of still frames.", kinds: ["lidar"], cost: 39_000, accuracy: 0.07, falseAlarmMultiplier: 0.85, integrationComplexity: 4, leadHours: 9, vendor: "Aegis Spatial", attributes: bars(5, 9, 8, 8, 9, 7) },
  { id: "lidar-classifier", name: "Silhouette classifier", description: "Correlates point-cloud shape with camera evidence.", kinds: ["lidar"], cost: 31_000, accuracy: 0.06, falseAlarmMultiplier: 0.72, integrationComplexity: 4, leadHours: 8, vendor: "Aegis Spatial", attributes: bars(6, 8, 8, 8, 10, 8) },
  { id: "robot-camera", name: "Stabilised camera", description: "Adds mobile visual confirmation for operators.", kinds: ["robot"], cost: 25_000, accuracy: 0.07, range: 2, integrationComplexity: 2, leadHours: 5, vendor: "Ranger Robotics", attributes: bars(7, 7, 8, 8, 8, 9) },
  { id: "robot-va", name: "Onboard analytics", description: "Classifies activity while away from connectivity.", kinds: ["robot"], cost: 34_000, accuracy: 0.08, falseAlarmMultiplier: 0.78, integrationComplexity: 4, leadHours: 8, vendor: "Atlas Autonomy", attributes: bars(6, 9, 8, 8, 9, 7) },
  { id: "terrain-kit", name: "All-terrain limbs", description: "Improves movement and availability on rough ground.", kinds: ["robot"], cost: 32_000, availability: 0.035, responsePower: 0.06, integrationComplexity: 2, leadHours: 7, vendor: "Ranger Robotics", attributes: bars(6, 7, 9, 7, 7, 8) },
  { id: "sprint-kit", name: "Sprint drive", description: "Cuts response time for remote sectors.", kinds: ["robot", "drone"], cost: 37_000, responsePower: 0.11, availability: -0.01, integrationComplexity: 2, leadHours: 6, vendor: "Vector Flight Systems", attributes: bars(5, 8, 7, 8, 7, 8) },
  { id: "extended-battery", name: "Extended battery", description: "Longer patrols and fewer unavailable charging windows.", kinds: ["robot", "drone"], cost: 29_000, availability: 0.055, integrationComplexity: 2, leadHours: 5, vendor: "Vector Flight Systems", attributes: bars(6, 8, 10, 8, 8, 9) },
  { id: "wide-scan", name: "Wide-area scan", description: "Covers more perimeter per flight.", kinds: ["drone"], cost: 42_000, range: 8, accuracy: 0.04, integrationComplexity: 3, leadHours: 8, vendor: "Hawkeye Air", attributes: bars(5, 9, 8, 8, 8, 7) },
  { id: "thermal", name: "Thermal payload", description: "Strong night detection with useful fog resilience.", kinds: ["drone"], cost: 51_000, accuracy: 0.07, nightFactor: 0.92, fogFactor: 0.74, integrationComplexity: 4, leadHours: 11, vendor: "Orion Optics", attributes: bars(4, 10, 8, 7, 9, 6) },
  { id: "backup-power", name: "Backup power", description: "Keeps illumination available through local faults.", kinds: ["lighting"], cost: 6_000, availability: 0.012, integrationComplexity: 1, leadHours: 2, vendor: "Lumen Grid", attributes: bars(10, 5, 10, 9, 8, 10) },
  { id: "access-mobile", name: "Mobile credentials", description: "Links badge identity to the C2 audit trail.", kinds: ["access-control"], cost: 17_000, accuracy: 0.04, falseAlarmMultiplier: 0.9, integrationComplexity: 2, leadHours: 4, vendor: "Gatekeeper Systems", attributes: bars(8, 7, 8, 10, 9, 9) },
  { id: "access-tailgate", name: "Anti-tailgating analytics", description: "Flags unauthorised passage through a controlled entry.", kinds: ["access-control"], cost: 27_000, accuracy: 0.08, falseAlarmMultiplier: 0.82, integrationComplexity: 3, leadHours: 6, vendor: "Sentinel Identity", attributes: bars(6, 9, 8, 8, 10, 8) },
];

export function getModel(id: string): DeviceModel {
  const model = DEVICE_MODELS.find((candidate) => candidate.id === id);
  if (!model) throw new Error(`Unknown device model: ${id}`);
  return model;
}

export function getUpgrade(id: string): Upgrade {
  const upgrade = UPGRADES.find((candidate) => candidate.id === id);
  if (!upgrade) throw new Error(`Unknown device upgrade: ${id}`);
  return upgrade;
}

export function upgradesFor(kind: DeviceKind): Upgrade[] {
  return UPGRADES.filter((upgrade) => upgrade.kinds.includes(kind));
}

/** 1.00 in Sandbox; linearly rises to 1.25 when a timed scenario reaches its deadline. */
export function deadlineUrgencyFactor(deadlineDays: number | null, totalMinutes: number, outstandingObjectiveRatio = 0): number {
  if (deadlineDays === null || deadlineDays <= 0) return 1;
  const elapsedDays = Math.max(0, totalMinutes) / (24 * 60);
  const timePressure = Math.min(1, elapsedDays / deadlineDays);
  const outstandingPressure = Math.max(0, Math.min(1, outstandingObjectiveRatio));
  return roundFactor(1 + (timePressure * 0.7 + outstandingPressure * 0.3) * 0.25);
}

/** Scenario-aware urgency: remaining time and unmet objectives lift quotes up to 25%. */
export function scenarioUrgencyFactor(state: GameState): number {
  const scenario = getScenario(state.scenarioId);
  if (scenario.deadlineDays === null) return 1;
  const outstanding = scenario.objectives.length === 0
    ? 0
    : scenario.objectives.reduce((sum, objective) => sum + Math.max(0, 1 - objectiveValue(state, objective.metric) / objective.target), 0) / scenario.objectives.length;
  return deadlineUrgencyFactor(scenario.deadlineDays, state.totalMinutes, outstanding);
}

function objectiveValue(state: GameState, metric: "rating" | "coverage" | "caught" | "cash" | "operatorHappiness" | "trooperHappiness"): number {
  if (metric === "rating") return state.rating.overallScore;
  if (metric === "coverage") return state.rating.coverage;
  if (metric === "caught") return state.rating.caught;
  if (metric === "cash") return state.economy.cash;
  if (metric === "operatorHappiness") return state.rating.operatorHappiness;
  return state.rating.trooperHappiness;
}

function normaliseUrgency(urgencyFactor: number): number {
  return Number.isFinite(urgencyFactor) ? Math.max(1, Math.min(1.25, urgencyFactor)) : 1;
}

function roundFactor(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function compatibleUpgrades(model: DeviceModel, upgradeIds: string[]): Upgrade[] {
  return [...new Set(upgradeIds)].map(getUpgrade).filter((upgrade) => upgrade.kinds.includes(model.kind));
}

/**
 * Applies the published equipment quote formula:
 * base equipment cost x capability x availability x scalability x
 * interoperability x urgency x vendor markup, plus chosen upgrade modules.
 */
export function quoteConfiguredStats(modelId: string, upgradeIds: string[], context?: GameState | number): ConfiguredStats {
  const model = getModel(modelId);
  const upgrades = compatibleUpgrades(model, upgradeIds);
  const urgency = typeof context === "number"
    ? normaliseUrgency(context)
    : context
      ? scenarioUrgencyFactor(context)
      : 1;
  const equipmentCost = Math.round(
    model.cost
      * model.capabilityFactor
      * model.availabilityFactor
      * model.scalabilityFactor
      * model.interoperabilityFactor
      * urgency
      * model.vendorMarkup,
  );
  const upgradeCost = Math.round(upgrades.reduce(
    (sum, upgrade) => sum + upgrade.cost * urgency * (upgrade.vendorMarkup ?? 1),
    0,
  ));
  const quote: QuoteBreakdown = {
    baseEquipmentCost: model.cost,
    upgradeCost,
    capabilityFactor: model.capabilityFactor,
    availabilityFactor: model.availabilityFactor,
    scalabilityFactor: model.scalabilityFactor,
    interoperabilityFactor: model.interoperabilityFactor,
    urgencyFactor: urgency,
    vendorMarkup: model.vendorMarkup,
    equipmentCost,
    totalPurchaseCost: equipmentCost + upgradeCost,
  };
  const purchaseCost = quote.totalPurchaseCost;
  const complexity = upgrades.reduce((sum, upgrade) => sum + (upgrade.integrationComplexity ?? 0), 0);
  return {
    purchaseCost,
    totalProgrammeCost: purchaseCost + model.integrationCost + model.testCost + model.commissionCost,
    quote,
    range: Math.max(1, model.range + upgrades.reduce((sum, upgrade) => sum + (upgrade.range ?? 0), 0)),
    accuracy: Math.min(0.98, Math.max(0, model.accuracy + upgrades.reduce((sum, upgrade) => sum + (upgrade.accuracy ?? 0), 0))),
    falseAlarmRate: Math.max(0, model.falseAlarmRate * upgrades.reduce((factor, upgrade) => factor * (upgrade.falseAlarmMultiplier ?? 1), 1)),
    availability: Math.min(0.995, Math.max(0.6, model.availability + upgrades.reduce((sum, upgrade) => sum + (upgrade.availability ?? 0), 0))),
    monthlyOps: model.monthlyOps + purchaseCost * 0.0015,
    responsePower: Math.min(0.95, model.responsePower + upgrades.reduce((sum, upgrade) => sum + (upgrade.responsePower ?? 0), 0)),
    nightFactor: Math.max(0.22, ...upgrades.map((upgrade) => upgrade.nightFactor ?? 0)),
    rainFactor: Math.max(model.kind === "lidar" ? 0.42 : 0.75, ...upgrades.map((upgrade) => upgrade.rainFactor ?? 0)),
    fogFactor: Math.max(model.kind === "lidar" ? 0.33 : 0.62, ...upgrades.map((upgrade) => upgrade.fogFactor ?? 0)),
    integrationHours: 8 + complexity * 2,
    testHours: 6 + complexity,
  };
}

/** Legacy/base-price call sites use neutral urgency. New procurement should call quoteConfiguredStats. */
export function configuredStats(modelId: string, upgradeIds: string[]): ConfiguredStats {
  return quoteConfiguredStats(modelId, upgradeIds, 1);
}

export function vendorComparison(modelOrId: DeviceModel | string, upgradeIds: string[] = [], urgencyFactor = 1): VendorComparison {
  const model = typeof modelOrId === "string" ? getModel(modelOrId) : modelOrId;
  const stats = quoteConfiguredStats(model.id, upgradeIds, urgencyFactor);
  const upgrades = compatibleUpgrades(model, upgradeIds);
  return {
    model,
    vendor: model.vendor,
    attributes: model.attributes,
    cost: stats.purchaseCost,
    leadHours: model.leadHours + Math.max(0, ...upgrades.map((upgrade) => upgrade.leadHours ?? 0)),
    quote: stats.quote,
  };
}

export function upgradeComparison(upgradeOrId: Upgrade | string, urgencyFactor = 1): UpgradeComparison {
  const upgrade = typeof upgradeOrId === "string" ? getUpgrade(upgradeOrId) : upgradeOrId;
  const urgency = normaliseUrgency(urgencyFactor);
  return {
    upgrade,
    vendor: upgrade.vendor ?? "C2 Integration Partner",
    attributes: upgrade.attributes,
    cost: Math.round(upgrade.cost * urgency * (upgrade.vendorMarkup ?? 1)),
    leadHours: upgrade.leadHours ?? 0,
    urgencyFactor: urgency,
  };
}

export function hasAutomaticAnalytics(modelId: string, upgradeIds: string[]): boolean {
  const model = getModel(modelId);
  if (model.kind !== "camera") return true;
  return model.id === "camera-edge" || upgradeIds.some((id) => id.startsWith("va-"));
}
