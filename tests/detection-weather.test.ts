import { describe, expect, it } from "vitest";

import { hashSeed } from "../src/core/rng";
import { createGame } from "../src/game/createGame";
import type { Device, GameState, Intruder, WeatherKind } from "../src/game/types";
import { advanceSimulation } from "../src/sim/simulation";

const NEVER = Number.MAX_SAFE_INTEGER;
const template = createGame("sandbox", 54_321);

type TrialOptions = {
  seed: number;
  weather: WeatherKind;
  hour?: number;
  modelId?: string;
  upgradeIds?: string[];
  floodlit?: boolean;
};

function detectionTrial({
  seed,
  weather,
  hour = 12,
  modelId = "camera-edge",
  upgradeIds = ["va-intrusion"],
  floodlit = false,
}: TrialOptions): GameState {
  const totalMinutes = hour * 60;
  const sensor: Device = {
    id: "test-sensor",
    modelId,
    upgradeIds,
    name: "Test sensor",
    x: 50,
    y: 50,
    status: "operational",
    readyAt: 0,
    health: 1,
    commissionedAt: 0,
    detections: 0,
    falseAlarms: 0,
  };
  const devices: Device[] = [sensor];
  if (floodlit) {
    devices.push({
      ...sensor,
      id: "test-light",
      modelId: "floodlight",
      upgradeIds: [],
      name: "Test floodlight",
    });
  }
  const intruder: Intruder = {
    id: "test-intruder",
    type: "thief",
    x: 50,
    y: 50,
    entryX: 20,
    entryY: 50,
    targetX: 54,
    targetY: 50,
    phase: "infiltrating",
    stealth: 0.1,
    detected: false,
    spawnedAt: totalMinutes,
    lossValue: 58_000,
  };

  const state: GameState = {
    ...template,
    idCounter: template.idCounter,
    seed,
    rngState: hashSeed(seed),
    totalMinutes,
    speed: 4,
    previousSpeed: 4,
    weather: { kind: weather, intensity: weather === "clear" ? 0.1 : 0.8, temperature: 28, nextChangeAt: NEVER },
    nextThreatAt: NEVER,
    nextFalseAlarmAt: NEVER,
    lastDailyUpdate: totalMinutes,
    lastMonthlyUpdate: totalMinutes,
    orders: [],
    devices,
    staff: [],
    intruders: [intruder],
    incidents: [],
    economy: { ...template.economy, ledger: [...template.economy.ledger] },
    rating: { ...template.rating },
    tutorial: { ...template.tutorial },
    messages: [],
  };
  advanceSimulation(state, 60);
  return state;
}

function detectedCount(options: Omit<TrialOptions, "seed">, trials = 500): number {
  let count = 0;
  for (let seed = 1; seed <= trials; seed += 1) {
    const state = detectionTrial({ ...options, seed });
    if (state.incidents.some((incident) => incident.genuine && incident.type === "intrusion")) count += 1;
  }
  return count;
}

describe("sensor detection under environment effects", () => {
  it("degrades edge-camera detections monotonically through rain, fog and storms", () => {
    const clear = detectedCount({ weather: "clear" });
    const rain = detectedCount({ weather: "rain" });
    const fog = detectedCount({ weather: "fog" });
    const storm = detectedCount({ weather: "storm" });

    expect(clear).toBeGreaterThan(rain);
    expect(rain).toBeGreaterThan(fog);
    expect(fog).toBeGreaterThan(storm);
    expect(storm).toBeGreaterThan(0);
  });

  it("makes night vision and nearby floodlighting materially better than an unassisted camera", () => {
    const unassisted = detectedCount({ weather: "clear", hour: 22, upgradeIds: ["va-intrusion"] });
    const nightVision = detectedCount({ weather: "clear", hour: 22, upgradeIds: ["va-intrusion", "night-vision"] });
    const floodlit = detectedCount({ weather: "clear", hour: 22, upgradeIds: ["va-intrusion"], floodlit: true });

    expect(nightVision).toBeGreaterThan(unassisted * 2);
    expect(floodlit).toBeGreaterThan(unassisted * 2);
  });

  it("does not automatically alarm from a manual camera with no operator on duty", () => {
    const state = detectionTrial({ seed: 1, weather: "clear", modelId: "camera-fixed", upgradeIds: [] });

    expect(state.devices[0]?.detections).toBe(0);
    expect(state.intruders[0]?.detected).toBe(false);
    expect(state.incidents).toEqual([]);
  });

  it("advances weather deterministically to a scenario-supported, finite state", () => {
    const first = detectionTrial({ seed: 404, weather: "clear" });
    const second = detectionTrial({ seed: 404, weather: "clear" });
    first.intruders = [];
    second.intruders = [];
    first.incidents = [];
    second.incidents = [];
    first.weather.nextChangeAt = first.totalMinutes;
    second.weather.nextChangeAt = second.totalMinutes;

    advanceSimulation(first, 1);
    advanceSimulation(second, 1);

    expect(first.weather).toEqual(second.weather);
    expect(["clear", "overcast", "rain", "storm", "fog"]).toContain(first.weather.kind);
    expect(first.weather.nextChangeAt).toBeGreaterThan(first.totalMinutes);
    expect(Number.isFinite(first.weather.intensity)).toBe(true);
    expect(first.weather.intensity).toBeGreaterThanOrEqual(first.weather.kind === "clear" ? 0.05 : 0.35);
    expect(first.weather.intensity).toBeLessThanOrEqual(first.weather.kind === "storm" ? 1 : 0.8);
    expect(first.weather.temperature).toBeGreaterThanOrEqual(23);
    expect(first.weather.temperature).toBeLessThanOrEqual(34);
  });
});
