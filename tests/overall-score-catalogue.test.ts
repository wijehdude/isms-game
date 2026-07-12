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
import { recalculateRating } from "../src/sim/rating";

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
  it("is the weighted command score and keeps neutral defaults until operational evidence exists", () => {
    const state = createGame("sandbox", 9_019);
    const initial = state.rating.overallMetrics;
    expect(initial.incidentDetectionRate).toBe(50);
    expect(initial.falseAlarmRate).toBe(50);
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
