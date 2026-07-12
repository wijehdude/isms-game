import { describe, expect, it } from "vitest";

import { createGame } from "../src/game/createGame";
import { SCENARIOS } from "../src/game/scenarios";
import type { Intruder } from "../src/game/types";
import { weeklyFundingAmount } from "../src/sim/economy";
import { HARDENED_PERIMETER_THRESHOLDS, isHardenedPerimeter } from "../src/sim/rating";
import { advanceSimulation } from "../src/sim/simulation";

const NEVER = Number.MAX_SAFE_INTEGER;

describe("Sentinel Base starting baseline", () => {
  it("starts every mode with $10m and the operational 8-camera/12-light perimeter", () => {
    for (const scenario of SCENARIOS) {
      const state = createGame(scenario.id, scenario.seed);
      const cameras = state.devices.filter((device) => device.modelId === "camera-fixed");
      const lights = state.devices.filter((device) => device.modelId === "floodlight");

      expect(state.version).toBe(3);
      expect(state.economy.cash).toBe(10_000_000);
      expect(cameras).toHaveLength(8);
      expect(lights).toHaveLength(12);
      expect(cameras.every((device) => device.status === "operational" && device.upgradeIds.includes("va-intrusion"))).toBe(true);
      expect(lights.every((device) => device.status === "operational")).toBe(true);
      expect(weeklyFundingAmount(state)).toBeGreaterThanOrEqual(2_000_000);
    }
  });

  it("uses the Sentinel Base sandbox name", () => {
    expect(createGame("sandbox", 1).campName).toBe("Sentinel Base");
  });
});

describe("hardened perimeter assurance", () => {
  it("guarantees detection and a successful autonomous response at the published thresholds", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const state = createGame("sandbox", seed);
      state.speed = 4;
      state.previousSpeed = 4;
      state.nextThreatAt = NEVER;
      state.nextFalseAlarmAt = NEVER;
      state.weather.nextChangeAt = NEVER;
      Object.assign(state.rating, {
        campRating: HARDENED_PERIMETER_THRESHOLDS.securityHealth,
        securityHealth: HARDENED_PERIMETER_THRESHOLDS.securityHealth,
        capabilityPoints: HARDENED_PERIMETER_THRESHOLDS.capabilityPoints,
        coverage: HARDENED_PERIMETER_THRESHOLDS.coverage,
        detectionFusion: HARDENED_PERIMETER_THRESHOLDS.detectionFusion,
        responseReadiness: HARDENED_PERIMETER_THRESHOLDS.responseReadiness,
        uptime: HARDENED_PERIMETER_THRESHOLDS.uptime,
        cognitiveLoad: 0,
      });
      const trooper = state.staff.find((member) => member.role === "trooper" && member.shift === 0);
      if (trooper) Object.assign(trooper, { x: 32, y: 16, targetX: 32, targetY: 16 });
      const intruder: Intruder = {
        id: `assurance-intruder-${seed}`,
        type: "saboteur",
        x: 32,
        y: 15,
        entryX: 32,
        entryY: 15,
        targetX: 42,
        targetY: 35,
        phase: "infiltrating",
        stealth: 0.99,
        detected: false,
        spawnedAt: state.totalMinutes,
        lossValue: 91_000,
        path: [],
      };
      state.intruders.push(intruder);

      expect(isHardenedPerimeter(state)).toBe(true);
      advanceSimulation(state, 1);
      const incident = state.incidents.find((candidate) => candidate.intruderId === intruder.id);
      expect(intruder.detected).toBe(true);
      expect(incident?.assuredResponse).toBe(true);
      expect(incident?.status).toBe("verifying");
      if (!incident) continue;

      for (let transition = 0; transition < 4 && !["resolved", "missed"].includes(incident.status); transition += 1) {
        const untilReady = Math.max(1, Math.ceil(incident.readyAt - state.totalMinutes) + 1);
        advanceSimulation(state, Math.min(240, untilReady));
      }
      expect(incident.status).toBe("resolved");
      expect(intruder.phase).toBe("caught");
    }
  });
});
