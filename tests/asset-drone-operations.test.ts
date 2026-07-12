import { describe, expect, it } from "vitest";

import {
  DRONE_PAD_CAPACITY,
  autoDeployReadyDrones,
  configureDronePatrol,
  dispatchIncident,
  procureDevice,
  repositionDevice,
  upgradeDevice,
} from "../src/game/actions";
import { configuredStats, getModel, quoteConfiguredStats } from "../src/game/catalog";
import { createGame } from "../src/game/createGame";
import type { Device, GameState } from "../src/game/types";
import { advanceSimulation } from "../src/sim/simulation";

const NEVER = Number.MAX_SAFE_INTEGER;

function quiet(state: GameState): void {
  state.nextThreatAt = NEVER;
  state.nextFalseAlarmAt = NEVER;
  state.weather.nextChangeAt = NEVER;
  state.weather.kind = "clear";
}

function droneFixture(id: string, x: number, y: number): Device {
  return {
    id,
    modelId: "drone-overwatch",
    upgradeIds: [],
    name: `Drone ${id}`,
    x,
    y,
    status: "operational",
    readyAt: 0,
    health: 1,
    commissionedAt: 0,
    detections: 0,
    falseAlarms: 0,
    homeX: x,
    homeY: y,
    assignedIncidentId: null,
    dronePatrol: { side: "north", schedule: "both", waypointIndex: 0 },
  };
}

describe("installed asset change orders", () => {
  it("fits only new compatible modules, charges the change order, and restores service after acceptance", () => {
    const state = createGame("sandbox", 71);
    quiet(state);
    const camera = state.devices.find((device) => device.modelId === "camera-fixed");
    expect(camera).toBeDefined();
    if (!camera) return;

    const current = quoteConfiguredStats(camera.modelId, camera.upgradeIds, state);
    const target = quoteConfiguredStats(camera.modelId, [...camera.upgradeIds, "infrared"], state);
    const model = getModel(camera.modelId);
    const expectedCost = target.quote.upgradeCost - current.quote.upgradeCost + model.integrationCost + model.testCost;
    const initialCash = state.economy.cash;

    expect(upgradeDevice(state, camera.id, ["infrared", "va-intrusion"])).toEqual({ ok: true, message: `${camera.name} upgrade started.` });
    expect(camera.status).toBe("upgrading");
    expect(camera.pendingUpgradeIds).toEqual(["va-intrusion", "infrared"]);
    expect(state.economy.cash).toBe(initialCash - expectedCost);
    expect(upgradeDevice(state, camera.id, ["thermal"]).ok).toBe(false);

    advanceSimulation(state, camera.readyAt - state.totalMinutes);
    expect(camera.status).toBe("operational");
    expect(camera.pendingUpgradeIds).toBeUndefined();
    expect(camera.upgradeIds).toEqual(["va-intrusion", "infrared"]);
    expect(state.economy.ledger.at(-1)).toMatchObject({ category: "upgrade", amount: -expectedCost });
  });

  it("relocates a device with a distance-based outage and blocks responders from change work", () => {
    const state = createGame("sandbox", 72);
    quiet(state);
    const light = state.devices.find((device) => device.modelId === "floodlight");
    expect(light).toBeDefined();
    if (!light) return;
    const target = { x: 26, y: 20 };
    const distance = Math.hypot(light.x - target.x, light.y - target.y);
    const expectedOutage = Math.ceil(60 + distance * 6);
    const expectedCost = Math.max(2_000, Math.round(configuredStats(light.modelId, light.upgradeIds).purchaseCost * 0.05));

    expect(repositionDevice(state, light.id, target.x, target.y)).toEqual({ ok: true, message: `${light.name} relocation started.` });
    expect(light.status).toBe("relocating");
    expect(light.readyAt).toBe(state.totalMinutes + expectedOutage);
    expect(state.economy.ledger.at(-1)).toMatchObject({ category: "relocation", amount: -expectedCost });

    advanceSimulation(state, expectedOutage);
    expect(light.status).toBe("operational");
    expect(light.x).toBe(target.x);
    expect(light.y).toBe(target.y);

    state.incidents.push({
      id: "active-response", type: "intrusion", genuine: true, x: 30, y: 30, status: "responding", confidence: 1,
      sourceDeviceIds: [], intruderId: null, createdAt: state.totalMinutes, deadlineAt: state.totalMinutes + 60,
      readyAt: state.totalMinutes + 60, assignedResponderId: light.id, resolution: null,
    });
    expect(repositionDevice(state, light.id, 27, 20).ok).toBe(false);
    expect(upgradeDevice(state, light.id, ["backup-power"]).ok).toBe(false);
  });
});

describe("central drone pad and patrol routes", () => {
  it("auto-bases ready drones, runs SAT, and follows the configured fenceline shift", () => {
    const state = createGame("sandbox", 73);
    quiet(state);
    expect(procureDevice(state, "drone-overwatch", ["thermal"])).toEqual({ ok: true, message: "Patrol drone ordered." });
    const order = state.orders[0];
    expect(order).toBeDefined();
    if (!order) return;
    order.stage = "ready";
    order.readyAt = 0;

    advanceSimulation(state, 1);
    const drone = state.devices.find((device) => device.modelId === "drone-overwatch");
    expect(drone).toBeDefined();
    if (!drone) return;
    expect(state.orders).toHaveLength(0);
    expect(drone.status).toBe("commissioning");
    expect(drone.homeX).toBeGreaterThanOrEqual(66);
    expect(drone.homeX).toBeLessThanOrEqual(72);
    expect(drone.homeY).toBeGreaterThanOrEqual(37);
    expect(drone.homeY).toBeLessThanOrEqual(43);

    advanceSimulation(state, drone.readyAt - state.totalMinutes);
    expect(drone.status).toBe("operational");
    expect(configureDronePatrol(state, drone.id, "east", "day").ok).toBe(true);

    state.totalMinutes = 12 * 60;
    const before = { x: drone.x, y: drone.y };
    advanceSimulation(state, 5);
    expect(drone.dronePatrol).toMatchObject({ side: "east", schedule: "day" });
    expect(Math.hypot(drone.x - before.x, drone.y - before.y)).toBeGreaterThan(0.5);

    state.totalMinutes = 22 * 60;
    const distanceFromHome = Math.hypot(drone.x - (drone.homeX ?? 0), drone.y - (drone.homeY ?? 0));
    advanceSimulation(state, 5);
    expect(Math.hypot(drone.x - (drone.homeX ?? 0), drone.y - (drone.homeY ?? 0))).toBeLessThan(distanceFromHome);
  });

  it("holds ready drones when all eight central pad berths are occupied", () => {
    const state = createGame("sandbox", 74);
    quiet(state);
    for (let index = 0; index < DRONE_PAD_CAPACITY; index += 1) {
      state.devices.push(droneFixture(`pad-${index}`, 67 + (index % 3) * 2, 38 + Math.floor(index / 3) * 2));
    }
    expect(procureDevice(state, "drone-overwatch", [])).toEqual({ ok: true, message: "Patrol drone ordered." });
    const order = state.orders[0];
    expect(order).toBeDefined();
    if (!order) return;
    order.stage = "ready";

    expect(autoDeployReadyDrones(state)).toBe(true);
    expect(state.orders).toHaveLength(1);
    expect(order.capacityNotified).toBe(true);
    expect(state.messages.some((message) => message.title === "Drone pad at capacity")).toBe(true);
  });
});

describe("operational-score evidence", () => {
  it("records response timing, closure, and early prevention without player alarm actions", () => {
    const state = createGame("sandbox", 75);
    quiet(state);
    state.totalMinutes = 6 * 60;
    state.intruders.push({
      id: "tracked-intruder", type: "thief", x: 30, y: 30, entryX: 20, entryY: 20, targetX: 60, targetY: 60,
      phase: "infiltrating", stealth: 0.2, detected: true, spawnedAt: 5 * 60, lossValue: 58_000, path: [],
    });
    state.incidents.push({
      id: "tracked-incident", type: "intrusion", genuine: true, x: 30, y: 30, status: "verified", confidence: 0.9,
      sourceDeviceIds: [], intruderId: "tracked-intruder", createdAt: 5 * 60, detectedAt: 5 * 60,
      deadlineAt: 9 * 60, readyAt: 0, assignedResponderId: null, resolution: null, assuredResponse: true,
    });

    expect(dispatchIncident(state, "tracked-incident").ok).toBe(true);
    const incident = state.incidents[0];
    expect(incident?.respondedAt).toBe(6 * 60);
    expect(state.metrics).toMatchObject({ responseSamples: 1, totalResponseMinutes: 60 });
    if (!incident) return;
    incident.readyAt = state.totalMinutes;

    advanceSimulation(state, 1);
    expect(incident.status).toBe("resolved");
    expect(incident.resolvedAt).toBe(6 * 60 + 1);
    expect(incident.prevented).toBe(true);
    expect(state.metrics).toMatchObject({ successfulClosures: 1, threatsPrevented: 1 });
  });
});
