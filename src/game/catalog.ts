import type { ConfiguredStats, DeviceKind, DeviceModel, Upgrade } from "./types";

export const DEVICE_MODELS: DeviceModel[] = [
  {
    id: "camera-fixed",
    kind: "camera",
    name: "Sentry Fixed Camera",
    shortName: "Fixed camera",
    description: "Affordable daylight coverage for a fence sector or internal compound.",
    cost: 42_000,
    leadHours: 20,
    integrationCost: 8_000,
    testCost: 5_000,
    commissionCost: 3_000,
    range: 9,
    accuracy: 0.69,
    falseAlarmRate: 0.022,
    availability: 0.965,
    monthlyOps: 850,
    responsePower: 0,
    allowedTerrain: "flat",
  },
  {
    id: "camera-edge",
    kind: "camera",
    name: "Kestrel Edge-AI Camera",
    shortName: "Edge-AI camera",
    description: "On-device analytics detect and classify activity without constant operator attention.",
    cost: 73_000,
    leadHours: 30,
    integrationCost: 13_000,
    testCost: 8_000,
    commissionCost: 4_000,
    range: 11,
    accuracy: 0.8,
    falseAlarmRate: 0.016,
    availability: 0.972,
    monthlyOps: 1_450,
    responsePower: 0,
    allowedTerrain: "flat",
  },
  {
    id: "lidar-sentinel",
    kind: "lidar",
    name: "Aegis Perimeter LiDAR",
    shortName: "LiDAR",
    description: "Reliable silhouette detection by day or night; rain and fog reduce confidence.",
    cost: 118_000,
    leadHours: 42,
    integrationCost: 19_000,
    testCost: 11_000,
    commissionCost: 6_000,
    range: 13,
    accuracy: 0.84,
    falseAlarmRate: 0.012,
    availability: 0.958,
    monthlyOps: 2_300,
    responsePower: 0,
    allowedTerrain: "flat",
  },
  {
    id: "robot-dog",
    kind: "robot",
    name: "Ranger Quadruped",
    shortName: "Robot dog",
    description: "An autonomous patrol platform that takes repetitive and unsafe routes off troopers.",
    cost: 176_000,
    leadHours: 58,
    integrationCost: 28_000,
    testCost: 16_000,
    commissionCost: 9_000,
    range: 5,
    accuracy: 0.73,
    falseAlarmRate: 0.014,
    availability: 0.9,
    monthlyOps: 5_600,
    responsePower: 0.54,
    allowedTerrain: "all",
  },
  {
    id: "robot-humanoid",
    kind: "robot",
    name: "Atlas Response Humanoid",
    shortName: "Humanoid robot",
    description: "Fast, terrain-capable autonomous escort and response support for high-risk areas.",
    cost: 335_000,
    leadHours: 78,
    integrationCost: 43_000,
    testCost: 25_000,
    commissionCost: 14_000,
    range: 6,
    accuracy: 0.8,
    falseAlarmRate: 0.011,
    availability: 0.93,
    monthlyOps: 9_800,
    responsePower: 0.72,
    allowedTerrain: "all",
  },
  {
    id: "drone-overwatch",
    kind: "drone",
    name: "Hawkeye Patrol Drone",
    shortName: "Patrol drone",
    description: "Rapid wide-area reconnaissance launched from the central drone pad.",
    cost: 224_000,
    leadHours: 64,
    integrationCost: 36_000,
    testCost: 21_000,
    commissionCost: 11_000,
    range: 18,
    accuracy: 0.77,
    falseAlarmRate: 0.015,
    availability: 0.87,
    monthlyOps: 7_900,
    responsePower: 0.68,
    allowedTerrain: "flat",
  },
  {
    id: "floodlight",
    kind: "lighting",
    name: "Lumen Security Floodlight",
    shortName: "Floodlight",
    description: "Restores nearby camera performance at night and makes patrol routes feel safer.",
    cost: 18_000,
    leadHours: 10,
    integrationCost: 2_000,
    testCost: 1_500,
    commissionCost: 1_000,
    range: 8,
    accuracy: 0,
    falseAlarmRate: 0,
    availability: 0.985,
    monthlyOps: 620,
    responsePower: 0,
    allowedTerrain: "flat",
  },
];

export const UPGRADES: Upgrade[] = [
  { id: "va-intrusion", name: "Intrusion VA", description: "Automatically raises fence-crossing alarms.", kinds: ["camera"], cost: 15_000, accuracy: 0.06, falseAlarmMultiplier: 1.08, integrationComplexity: 3 },
  { id: "va-loitering", name: "Loitering VA", description: "Recognises dwell patterns around sensitive areas.", kinds: ["camera"], cost: 12_000, accuracy: 0.03, falseAlarmMultiplier: 1.1, integrationComplexity: 2 },
  { id: "va-tamper", name: "Tamper VA", description: "Flags obscured, moved or damaged camera views.", kinds: ["camera"], cost: 8_000, accuracy: 0.02, integrationComplexity: 1 },
  { id: "va-object", name: "Object VA", description: "Detects abandoned and suspicious objects.", kinds: ["camera"], cost: 14_000, accuracy: 0.03, falseAlarmMultiplier: 1.12, integrationComplexity: 2 },
  { id: "infrared", name: "Infrared illuminator", description: "Improves visual confidence in darkness.", kinds: ["camera"], cost: 19_000, nightFactor: 0.72, range: 1, integrationComplexity: 1 },
  { id: "night-vision", name: "Low-light sensor", description: "High-sensitivity night imaging with modest noise.", kinds: ["camera", "drone"], cost: 24_000, nightFactor: 0.86, accuracy: 0.02, integrationComplexity: 2 },
  { id: "panoramic", name: "360° panoramic head", description: "Removes the fixed camera's rear blind sector.", kinds: ["camera"], cost: 28_000, range: 2, accuracy: 0.05, integrationComplexity: 3 },
  { id: "lidar-long", name: "Long-range optics", description: "Extends point-cloud reach along long fence sectors.", kinds: ["lidar"], cost: 48_000, range: 8, accuracy: 0.03, integrationComplexity: 3 },
  { id: "lidar-video", name: "Video point cloud", description: "Continuous motion evidence instead of still frames.", kinds: ["lidar"], cost: 39_000, accuracy: 0.07, falseAlarmMultiplier: 0.85, integrationComplexity: 4 },
  { id: "lidar-classifier", name: "Silhouette classifier", description: "Correlates point-cloud shape with camera evidence.", kinds: ["lidar"], cost: 31_000, accuracy: 0.06, falseAlarmMultiplier: 0.72, integrationComplexity: 4 },
  { id: "robot-camera", name: "Stabilised camera", description: "Adds mobile visual confirmation for operators.", kinds: ["robot"], cost: 25_000, accuracy: 0.07, range: 2, integrationComplexity: 2 },
  { id: "robot-va", name: "Onboard analytics", description: "Classifies activity while away from connectivity.", kinds: ["robot"], cost: 34_000, accuracy: 0.08, falseAlarmMultiplier: 0.78, integrationComplexity: 4 },
  { id: "terrain-kit", name: "All-terrain limbs", description: "Improves movement and availability on rough ground.", kinds: ["robot"], cost: 32_000, availability: 0.035, responsePower: 0.06, integrationComplexity: 2 },
  { id: "sprint-kit", name: "Sprint drive", description: "Cuts response time for remote sectors.", kinds: ["robot", "drone"], cost: 37_000, responsePower: 0.11, availability: -0.01, integrationComplexity: 2 },
  { id: "extended-battery", name: "Extended battery", description: "Longer patrols and fewer unavailable charging windows.", kinds: ["robot", "drone"], cost: 29_000, availability: 0.055, integrationComplexity: 2 },
  { id: "wide-scan", name: "Wide-area scan", description: "Covers more perimeter per flight.", kinds: ["drone"], cost: 42_000, range: 8, accuracy: 0.04, integrationComplexity: 3 },
  { id: "thermal", name: "Thermal payload", description: "Strong night detection with useful fog resilience.", kinds: ["drone"], cost: 51_000, accuracy: 0.07, nightFactor: 0.92, fogFactor: 0.74, integrationComplexity: 4 },
  { id: "backup-power", name: "Backup power", description: "Keeps illumination available through local faults.", kinds: ["lighting"], cost: 6_000, availability: 0.012, integrationComplexity: 1 },
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

export function configuredStats(modelId: string, upgradeIds: string[]): ConfiguredStats {
  const model = getModel(modelId);
  const upgrades = upgradeIds.map(getUpgrade).filter((upgrade) => upgrade.kinds.includes(model.kind));
  const purchaseCost = model.cost + upgrades.reduce((sum, upgrade) => sum + upgrade.cost, 0);
  const complexity = upgrades.reduce((sum, upgrade) => sum + (upgrade.integrationComplexity ?? 0), 0);
  return {
    purchaseCost,
    totalProgrammeCost: purchaseCost + model.integrationCost + model.testCost + model.commissionCost,
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

export function hasAutomaticAnalytics(modelId: string, upgradeIds: string[]): boolean {
  const model = getModel(modelId);
  if (model.kind !== "camera") return true;
  return model.id === "camera-edge" || upgradeIds.some((id) => id.startsWith("va-"));
}
