import { describe, expect, it } from "vitest";

import {
  DEVICE_MODELS,
  UPGRADES,
  configuredStats,
  quoteConfiguredStats,
  scenarioUrgencyFactor,
  upgradeComparison,
  vendorComparison,
} from "../src/game/catalog";
import { createGame } from "../src/game/createGame";
import type { Device, GameState } from "../src/game/types";
import { recalculateRating } from "../src/sim/rating";

function addOperationalDevice(
  state: GameState,
  modelId: Device["modelId"],
  x: number,
  y: number,
  upgradeIds: string[] = [],
): void {
  const id = `score-fixture-${state.devices.length}`;
  state.devices.push({
    id,
    modelId,
    upgradeIds,
    name: id,
    x,
    y,
    status: "operational",
    readyAt: 0,
    health: 1,
    commissionedAt: 0,
    detections: 0,
    falseAlarms: 0,
    ...(modelId.startsWith("drone") ? {
      homeX: x,
      homeY: y,
      assignedIncidentId: null,
      dronePatrol: { side: "north" as const, schedule: "both" as const, waypointIndex: 0 },
    } : {}),
  });
}

function hardenCamp(state: GameState): void {
  const perimeterPoints = [
    [20, 18], [32, 18], [44, 18], [56, 18], [68, 18], [80, 18],
    [20, 81], [32, 81], [44, 81], [56, 81], [68, 81], [80, 81],
    [18, 30], [18, 50], [18, 70], [81, 30], [81, 50], [81, 70],
  ];
  for (const [x, y] of perimeterPoints) {
    addOperationalDevice(state, "camera-edge", x, y, ["panoramic", "night-vision"]);
    addOperationalDevice(state, "lidar-orion", x, y, ["lidar-long", "lidar-video", "lidar-classifier"]);
  }
  for (const [x, y] of [[24, 24], [76, 24], [24, 76], [76, 76]] as const) {
    addOperationalDevice(state, "drone-vector", x, y, ["wide-scan", "thermal", "extended-battery", "sprint-kit"]);
    addOperationalDevice(state, "robot-humanoid", x, y, ["robot-camera", "robot-va", "terrain-kit", "sprint-kit", "extended-battery"]);
    addOperationalDevice(state, "access-biometric", x, y, ["access-mobile", "access-tailgate"]);
  }
  for (const member of state.staff) {
    member.happiness = 94;
    member.fatigue = 2;
  }
  // Two active responders of each kind and two engineers are the fully staffed
  // programme posture assumed by the forecast.
  const operator = state.staff.find((member) => member.role === "operator" && member.shift === 0);
  const trooper = state.staff.find((member) => member.role === "trooper" && member.shift === 0);
  const engineer = state.staff.find((member) => member.role === "engineer");
  if (operator) state.staff.push({ ...operator, id: "score-operator", name: "Score Operator" });
  if (trooper) state.staff.push({ ...trooper, id: "score-trooper", name: "Score Trooper" });
  if (engineer) state.staff.push({ ...engineer, id: "score-engineer", name: "Score Engineer" });
  state.economy.realisedSavings = 1_000_000;
}

describe("vendor catalogue", () => {
  it("offers two comparable products for every capability class, including access control", () => {
    for (const kind of ["camera", "lidar", "robot", "drone", "lighting", "access-control"] as const) {
      expect(DEVICE_MODELS.filter((model) => model.kind === kind)).toHaveLength(2);
    }
    for (const product of [...DEVICE_MODELS, ...UPGRADES]) {
      for (const value of Object.values(product.attributes)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
      }
    }
  });

  it("exposes a transparent nominal quote and a state-aware urgency quote", () => {
    const nominal = configuredStats("camera-fixed", ["va-intrusion"]);
    const card = vendorComparison("camera-fixed", ["va-intrusion"]);
    expect(nominal.purchaseCost).toBe(57_000);
    expect(nominal.quote).toMatchObject({ baseEquipmentCost: 42_000, upgradeCost: 15_000, urgencyFactor: 1, totalPurchaseCost: 57_000 });
    expect(card).toMatchObject({ vendor: "SentryWorks", cost: 57_000, leadHours: 24 });
    expect(upgradeComparison("va-intrusion").attributes.capability).toBe(8);

    const timed = createGame("first-watch", 22);
    const urgent = quoteConfiguredStats("camera-fixed", ["va-intrusion"], timed);
    expect(scenarioUrgencyFactor(timed)).toBeGreaterThan(1);
    expect(scenarioUrgencyFactor(timed)).toBeLessThanOrEqual(1.25);
    expect(urgent.purchaseCost).toBeGreaterThan(nominal.purchaseCost);
    expect(scenarioUrgencyFactor(createGame("sandbox", 22))).toBe(1);
  });
});

describe("Overall Score", () => {
  it("is the weighted command score and starts with a capability forecast rather than neutral defaults", () => {
    const state = createGame("sandbox", 9_019);
    const initial = state.rating.overallMetrics;
    expect(initial.incidentDetectionRate).toBeGreaterThan(0);
    expect(initial.incidentDetectionRate).not.toBe(50);
    expect(initial.scheduleAdherence).toBe(100);
    expect(state.rating.overallScore).toBeGreaterThanOrEqual(45);
    expect(state.rating.overallScore).toBeLessThan(75);
    expect(state.rating.campRating).toBe(state.rating.overallScore);

    Object.assign(state.metrics, {
      realIncidents: 10,
      detectedRealIncidents: 10,
      falseAlarmEvents: 0,
      detectionSamples: 10,
      totalDetectionMinutes: 20,
      responseSamples: 10,
      totalResponseMinutes: 40,
      successfulClosures: 10,
      missedIntrusions: 0,
      threatsPrevented: 10,
    });
    recalculateRating(state);
    const metrics = state.rating.overallMetrics;
    expect(metrics.performance).toBeGreaterThan(90);
    const expected = Math.round(metrics.performance * 0.35 + metrics.risk * 0.25 + metrics.cost * 0.25 + metrics.schedule * 0.15);
    expect(state.rating.overallScore).toBe(expected);
    expect(state.rating.campRating).toBe(expected);
  });

  it("blends forecast with observed outcomes for the first ten genuine incidents, then uses evidence fully", () => {
    const state = createGame("sandbox", 9_021);
    const forecastDetection = state.rating.overallMetrics.incidentDetectionRate;
    Object.assign(state.metrics, {
      realIncidents: 5,
      detectedRealIncidents: 0,
      falseAlarmEvents: 5,
      detectionSamples: 0,
      totalDetectionMinutes: 0,
      responseSamples: 0,
      totalResponseMinutes: 0,
      successfulClosures: 0,
      missedIntrusions: 5,
      threatsPrevented: 0,
    });
    recalculateRating(state);
    expect(state.rating.overallMetrics.incidentDetectionRate).toBe(Math.round(forecastDetection / 2));
    expect(state.rating.overallMetrics.missedIntrusions).toBe(5);

    state.metrics.realIncidents = 10;
    state.metrics.missedIntrusions = 10;
    state.metrics.falseAlarmEvents = 10;
    recalculateRating(state);
    expect(state.rating.overallMetrics.incidentDetectionRate).toBe(0);
    expect(state.rating.overallMetrics.successfulIncidentClosures).toBe(0);
    expect(state.rating.overallMetrics.performance).toBeLessThanOrEqual(20);
  });

  it("allows a fully layered, staffed and sustainable camp to reach the Exemplary score range before ten incidents", () => {
    const state = createGame("sandbox", 9_022);
    hardenCamp(state);
    recalculateRating(state);

    expect(state.metrics.realIncidents).toBe(0);
    expect(state.rating.overallMetrics.scheduleAdherence).toBe(100);
    expect(state.rating.overallMetrics.performance).toBeGreaterThanOrEqual(90);
    expect(state.rating.overallMetrics.risk).toBeGreaterThanOrEqual(90);
    expect(state.rating.overallScore).toBeGreaterThanOrEqual(90);
  });

  it("heavily penalises missed intrusions in performance and risk", () => {
    const state = createGame("sandbox", 9_020);
    Object.assign(state.metrics, {
      realIncidents: 10,
      detectedRealIncidents: 2,
      falseAlarmEvents: 8,
      detectionSamples: 2,
      totalDetectionMinutes: 220,
      responseSamples: 2,
      totalResponseMinutes: 240,
      successfulClosures: 1,
      missedIntrusions: 9,
      threatsPrevented: 0,
    });
    recalculateRating(state);
    expect(state.rating.overallMetrics.performance).toBeLessThan(25);
    expect(state.rating.overallMetrics.risk).toBeLessThan(state.rating.securityHealth);
    expect(state.rating.overallMetrics.missedIntrusions).toBe(9);
  });
});
