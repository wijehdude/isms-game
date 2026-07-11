import { describe, expect, it } from "vitest";

import {
  HEIGHT_STEP,
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_H,
  TILE_W,
  clampZoom,
  diamondPoints,
  fitCameraToBounds,
  projectIso,
  rawProject,
  unprojectIso,
  visibleTileBounds,
  zoomCameraAt,
} from "../src/render/projection";

describe("2:1 isometric projection", () => {
  it("uses the documented tile and elevation vectors", () => {
    expect(rawProject(1, 0, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(rawProject(0, 1, 0)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    expect(rawProject(0, 0, 1)).toEqual({ x: 0, y: -HEIGHT_STEP });
  });

  it.each([MIN_ZOOM, 0.5, 1, 1.5, 2, MAX_ZOOM])("round-trips ground coordinates at %sx zoom", (zoom) => {
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

  it("clamps zoom to the supported strategic and detail limits", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1.4)).toBe(1.4);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });

  it("keeps the world position beneath a pointer fixed while zooming", () => {
    const camera = { focusX: 50, focusY: 50, offsetX: 91, offsetY: -37, zoom: 0.72 };
    const viewport = { width: 1_440, height: 900 };
    const pointer = { x: 1_173, y: 284 };
    const before = unprojectIso(pointer.x, pointer.y, camera, viewport);
    const zoomed = zoomCameraAt(camera, viewport, 1.8, pointer.x, pointer.y);
    const after = unprojectIso(pointer.x, pointer.y, zoomed, viewport);

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    expect(zoomed.zoom).toBe(1.8);
  });

  it("fits a complete default world into a desktop viewport", () => {
    const viewport = { width: 1_440, height: 900 };
    const padding = 48;
    const camera = fitCameraToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100, maxZ: 2 }, viewport, padding);
    const corners = [
      projectIso(0, 0, 2, camera, viewport),
      projectIso(100, 0, 2, camera, viewport),
      projectIso(100, 100, 0, camera, viewport),
      projectIso(0, 100, 0, camera, viewport),
    ];

    expect(camera.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    for (const point of corners) {
      expect(point.x).toBeGreaterThanOrEqual(padding - 0.001);
      expect(point.x).toBeLessThanOrEqual(viewport.width - padding + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(padding - 0.001);
      expect(point.y).toBeLessThanOrEqual(viewport.height - padding + 0.001);
    }
  });

  it("returns conservative, clamped visible tile bounds", () => {
    const viewport = { width: 900, height: 600 };
    const camera = { focusX: 50, focusY: 50, offsetX: 0, offsetY: 0, zoom: 1.2 };
    const bounds = visibleTileBounds(camera, viewport, 100, 100, 64, 3);
    const center = unprojectIso(viewport.width / 2, viewport.height / 2, camera, viewport);

    expect(bounds.minX).toBeGreaterThanOrEqual(0);
    expect(bounds.minY).toBeGreaterThanOrEqual(0);
    expect(bounds.maxX).toBeLessThan(100);
    expect(bounds.maxY).toBeLessThan(100);
    expect(center.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(center.x).toBeLessThanOrEqual(bounds.maxX);
    expect(center.y).toBeGreaterThanOrEqual(bounds.minY);
    expect(center.y).toBeLessThanOrEqual(bounds.maxY);
    expect(bounds.maxX - bounds.minX).toBeLessThan(100);
    expect(bounds.maxY - bounds.minY).toBeLessThan(100);
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
