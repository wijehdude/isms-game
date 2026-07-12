import { describe, expect, it } from "vitest";

import { deserializeState, listSaves, serializeState } from "../src/core/save";
import { procureDevice } from "../src/game/actions";
import { createGame } from "../src/game/createGame";
import { advanceSimulation } from "../src/sim/simulation";

describe("versioned save state", () => {
  it("round-trips and reserializes to byte-identical JSON", () => {
    const state = createGame("monsoon-line", 987_654);
    expect(procureDevice(state, "lidar-sentinel", ["lidar-long", "lidar-video"]).ok).toBe(true);
    advanceSimulation(state, 137);
    state.speed = 4;
    state.campName = "Camp Round Trip";

    const first = serializeState(state);
    const restored = deserializeState(first);
    const second = serializeState(restored);

    expect(second).toBe(first);
    expect(restored).toEqual(state);
    expect(restored).not.toBe(state);
    expect(restored.world.tiles).not.toBe(state.world.tiles);
  });

  it("rejects malformed JSON and unsupported state shapes", () => {
    expect(() => deserializeState("not-json")).toThrow();
    expect(() => deserializeState(JSON.stringify({ version: 4, campName: "Future Camp" }))).toThrow(
      "This file is not a supported Sentinel Base v3 save. Sentinel Base v1 and v2 saves start fresh.",
    );
    expect(() => deserializeState(JSON.stringify({
      version: 3,
      campName: "Partial Camp",
      scenarioId: "sandbox",
      totalMinutes: 0,
      speed: 1,
      economy: {},
      rating: {},
      world: {},
      devices: [],
      staff: [],
    }))).toThrow("This file is not a supported Sentinel Base v3 save. Sentinel Base v1 and v2 saves start fresh.");
  });

  it("starts fresh by explicitly rejecting legacy v1 and v2 state", () => {
    const legacy = JSON.parse(serializeState(createGame("sandbox", 222))) as Record<string, unknown>;
    legacy.version = 1;

    expect(() => deserializeState(JSON.stringify(legacy))).toThrow("This file is not a supported Sentinel Base v3 save. Sentinel Base v1 and v2 saves start fresh.");
    legacy.version = 2;
    expect(() => deserializeState(JSON.stringify(legacy))).toThrow("This file is not a supported Sentinel Base v3 save. Sentinel Base v1 and v2 saves start fresh.");
  });

  it("has a safe empty result when browser storage is unavailable", () => {
    expect(listSaves()).toEqual([]);
  });
});
