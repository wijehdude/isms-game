import { describe, expect, it } from "vitest";

import { HEIGHT_STEP, TILE_H, TILE_W, diamondPoints, projectIso, rawProject, unprojectIso } from "../src/render/projection";

describe("2:1 isometric projection", () => {
  it("uses the documented tile and elevation vectors", () => {
    expect(rawProject(1, 0, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(rawProject(0, 1, 0)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    expect(rawProject(0, 0, 1)).toEqual({ x: 0, y: -HEIGHT_STEP });
  });

  it.each([0.5, 1, 1.5, 2])("round-trips ground coordinates at %sx zoom", (zoom) => {
    const camera = { focusX: 49.5, focusY: 50.25, offsetX: -137, offsetY: 83, zoom };
    const viewport = { width: 1_537, height: 911 };
    const points = [
      { x: 0, y: 0 },
      { x: 18, y: 81 },
      { x: 49.25, y: 50.75 },
      { x: 99, y: 99 },
    ];

    for (const point of points) {
      const screen = projectIso(point.x, point.y, 0, camera, viewport);
      const world = unprojectIso(screen.x, screen.y, camera, viewport);
      expect(world.x).toBeCloseTo(point.x, 10);
      expect(world.y).toBeCloseTo(point.y, 10);
    }
  });

  it("moves elevation vertically without changing projected x", () => {
    const camera = { focusX: 50, focusY: 50, offsetX: 0, offsetY: 0, zoom: 1.5 };
    const viewport = { width: 1_200, height: 800 };
    const ground = projectIso(30, 44, 0, camera, viewport);
    const elevated = projectIso(30, 44, 3, camera, viewport);

    expect(elevated.x).toBe(ground.x);
    expect(elevated.y).toBeCloseTo(ground.y - 3 * HEIGHT_STEP * camera.zoom, 10);
  });

  it("returns the four projected corners of a tile in painter order", () => {
    const camera = { focusX: 0, focusY: 0, offsetX: 0, offsetY: 0, zoom: 1 };
    const viewport = { width: 800, height: 600 };
    const corners = diamondPoints(4, 7, 2, camera, viewport);

    expect(corners).toEqual([
      projectIso(4, 7, 2, camera, viewport),
      projectIso(5, 7, 2, camera, viewport),
      projectIso(5, 8, 2, camera, viewport),
      projectIso(4, 8, 2, camera, viewport),
    ]);
  });
});
