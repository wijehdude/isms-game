import { describe, expect, it } from "vitest";

import { MINUTES_PER_DAY, MINUTES_PER_MONTH } from "../src/core/time";
import {
  commissionDevice,
  dispatchIncident,
  placeOrder,
  procureDevice,
  startFactoryTest,
  startIntegration,
  verifyIncident,
} from "../src/game/actions";
import { createGame } from "../src/game/createGame";
import type { GameState } from "../src/game/types";
import { assertLedgerIdentity } from "../src/sim/economy";
import { advanceSimulation } from "../src/sim/simulation";

const NEVER = Number.MAX_SAFE_INTEGER;

type ScriptedAsset = {
  modelId: string;
  upgradeIds: string[];
  x: number;
  y: number;
};

const SCRIPTED_CAPABILITY: ScriptedAsset[] = [
  { modelId: "camera-edge", upgradeIds: ["va-intrusion", "night-vision"], x: 30, y: 20 },
  { modelId: "camera-edge", upgradeIds: ["va-intrusion", "panoramic"], x: 70, y: 20 },
  { modelId: "lidar-sentinel", upgradeIds: ["lidar-long", "lidar-video"], x: 20, y: 42 },
  { modelId: "lidar-sentinel", upgradeIds: ["lidar-video", "lidar-classifier"], x: 79, y: 58 },
  { modelId: "robot-dog", upgradeIds: ["robot-camera", "extended-battery"], x: 38, y: 72 },
  { modelId: "drone-overwatch", upgradeIds: ["wide-scan", "thermal"], x: 68, y: 39 },
  { modelId: "floodlight", upgradeIds: [], x: 32, y: 23 },
  { modelId: "floodlight", upgradeIds: [], x: 68, y: 23 },
];

function advanceToLatestReadyAt(state: GameState, readyTimes: number[]): void {
  const readyAt = Math.max(state.totalMinutes, ...readyTimes);
  advanceSimulation(state, readyAt - state.totalMinutes);
}

function buildScriptedCamp(): GameState {
  const state = createGame("sandbox", 202_607_11);
  state.speed = 4;
  state.previousSpeed = 4;
  state.nextThreatAt = NEVER;
  state.nextFalseAlarmAt = NEVER;
  state.weather.nextChangeAt = NEVER;
  state.automation.lifecycleAutopilot = false;

  for (const asset of SCRIPTED_CAPABILITY) expect(procureDevice(state, asset.modelId, asset.upgradeIds).ok).toBe(true);
  expect(state.orders).toHaveLength(SCRIPTED_CAPABILITY.length);

  advanceToLatestReadyAt(state, state.orders.map((order) => order.readyAt));
  expect(state.orders.every((order) => order.stage === "integration-review")).toBe(true);
  for (const order of state.orders) expect(startIntegration(state, order.id).ok).toBe(true);

  advanceToLatestReadyAt(state, state.orders.map((order) => order.readyAt));
  expect(state.orders.every((order) => order.stage === "factory-test")).toBe(true);
  for (const order of state.orders) expect(startFactoryTest(state, order.id).ok).toBe(true);

  advanceToLatestReadyAt(state, state.orders.map((order) => order.readyAt));
  expect(state.orders.every((order) => order.stage === "ready")).toBe(true);

  const deviceIds: string[] = [];
  for (const asset of SCRIPTED_CAPABILITY) {
    expect(asset).toBeDefined();
    if (asset.modelId === "drone-overwatch") {
      const drone = state.devices.find((device) => device.modelId === asset.modelId && device.upgradeIds.every((upgrade) => asset.upgradeIds.includes(upgrade)));
      expect(drone).toBeDefined();
      if (drone) deviceIds.push(drone.id);
      continue;
    }
    const order = state.orders.find((candidate) => candidate.modelId === asset.modelId && candidate.upgradeIds.length === asset.upgradeIds.length
      && candidate.upgradeIds.every((upgrade) => asset.upgradeIds.includes(upgrade)));
    expect(order).toBeDefined();
    if (!order) continue;
    const previousLength = state.devices.length;
    expect(placeOrder(state, order.id, asset.x, asset.y).ok).toBe(true);
    const device = state.devices[previousLength];
    expect(device).toBeDefined();
    if (device) deviceIds.push(device.id);
  }
  expect(state.orders).toEqual([]);
  for (const deviceId of deviceIds) {
    const device = state.devices.find((candidate) => candidate.id === deviceId);
    if (device?.status === "awaiting-sat") expect(commissionDevice(state, deviceId).ok).toBe(true);
  }
  advanceToLatestReadyAt(
    state,
    state.devices.filter((device) => deviceIds.includes(device.id)).map((device) => device.readyAt),
  );

  expect(state.tutorial).toMatchObject({ procured: true, integrated: true, tested: true, deployed: true, commissioned: true });
  expect(state.devices.filter((device) => deviceIds.includes(device.id))).toHaveLength(SCRIPTED_CAPABILITY.length);
  expect(assertLedgerIdentity(state)).toBe(true);
  return state;
}

function nonFiniteNumberPaths(root: unknown): string[] {
  const bad: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) bad.push(path);
      return;
    }
    if (value === null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, item] of Object.entries(value)) visit(item, path ? `${path}.${key}` : key);
  };
  visit(root, "state");
  return bad;
}

describe("headless long-run simulation", () => {
  it("runs a scripted operational camp for three in-game years without NaNs or untraced cash", { timeout: 60_000 }, () => {
    const state = buildScriptedCamp();
    state.nextThreatAt = state.totalMinutes + 60;
    state.nextFalseAlarmAt = state.totalMinutes + 180;
    state.weather.nextChangeAt = state.totalMinutes + 240;

    const startedAt = state.totalMinutes;
    const target = startedAt + 3 * 12 * MINUTES_PER_MONTH;
    let tracedCash = state.economy.cash;
    let tracedEntries = state.economy.ledger.length;
    let previousMonth = Math.floor(state.totalMinutes / MINUTES_PER_MONTH);

    while (state.totalMinutes < target) {
      // Daily headless steps exercise all calendar closes over three full years
      // without paying the browser loop's fine-grained rendering cadence in CI.
      const delta = Math.min(MINUTES_PER_DAY, target - state.totalMinutes);
      const update = advanceSimulation(state, delta);
      expect(update.scenarioEnded).toBeNull();

      for (let index = tracedEntries; index < state.economy.ledger.length; index += 1) {
        tracedCash += state.economy.ledger[index]?.amount ?? 0;
      }
      tracedEntries = state.economy.ledger.length;
      if (state.economy.cash !== tracedCash) {
        throw new Error(`Untraced cash delta at minute ${state.totalMinutes}: expected ${tracedCash}, saw ${state.economy.cash}`);
      }

      for (const incident of state.incidents) {
        if (incident.status === "new") verifyIncident(state, incident.id);
        if (incident.status === "verified") dispatchIncident(state, incident.id);
      }

      const month = Math.floor(state.totalMinutes / MINUTES_PER_MONTH);
      if (month !== previousMonth) {
        expect(assertLedgerIdentity(state)).toBe(true);
        expect(nonFiniteNumberPaths(state)).toEqual([]);
        previousMonth = month;
      }
    }

    const ledgerBalance = state.economy.ledger.reduce((sum, entry) => sum + entry.amount, 0);
    const lifetimeFunding = state.economy.ledger
      .filter((entry) => entry.category === "funding" && entry.amount > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const lifetimeSpend = state.economy.ledger
      .filter((entry) => entry.amount < 0)
      .reduce((sum, entry) => sum - entry.amount, 0);

    expect(state.totalMinutes - startedAt).toBe(3 * 12 * MINUTES_PER_MONTH);
    expect(state.scenarioStatus).toBe("active");
    expect(state.economy.cash).toBe(ledgerBalance);
    expect(state.economy.lifetimeFunding).toBe(lifetimeFunding);
    expect(state.economy.lifetimeSpend).toBe(lifetimeSpend);
    expect(state.incidents.length).toBeLessThanOrEqual(80);
    expect(state.intruders.length).toBeLessThanOrEqual(24);
    expect(nonFiniteNumberPaths(state)).toEqual([]);
  });
});
