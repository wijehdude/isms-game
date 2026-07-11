import { describe, expect, it } from "vitest";

import type { Point } from "../src/game/types";
import { findPath } from "../src/world/pathfinding";

function assertValidPath(path: Point[], start: Point, goal: Point, blocked: Set<string>): void {
  expect(path[0]).toEqual(start);
  expect(path.at(-1)).toEqual(goal);
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    expect(point).toBeDefined();
    if (!point) continue;
    expect(blocked.has(`${point.x},${point.y}`)).toBe(false);
    if (index === 0) continue;
    const previous = path[index - 1];
    expect(previous).toBeDefined();
    if (previous) expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(1);
  }
}

describe("four-way A*", () => {
  it("returns the shortest route across an open grid", () => {
    const path = findPath(8, 6, { x: 1, y: 1 }, { x: 6, y: 4 }, () => false);

    assertValidPath(path, { x: 1, y: 1 }, { x: 6, y: 4 }, new Set());
    expect(path).toHaveLength(9); // Manhattan distance 8, including both endpoints.
  });

  it("finds the only gap in a crafted wall and remains optimal", () => {
    const blocked = new Set(["3,1", "3,2", "3,3", "3,4"]);
    const path = findPath(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }, (x, y) => blocked.has(`${x},${y}`));

    assertValidPath(path, { x: 0, y: 2 }, { x: 6, y: 2 }, blocked);
    expect(path).toContainEqual({ x: 3, y: 0 });
    expect(path).toHaveLength(11); // Ten moves via the y=0 gap.
  });

  it("returns no route when a wall divides the map", () => {
    const path = findPath(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }, (x) => x === 3);
    expect(path).toEqual([]);
  });

  it("rejects blocked endpoints and handles the trivial route", () => {
    expect(findPath(4, 4, { x: 1, y: 1 }, { x: 1, y: 1 }, () => false)).toEqual([{ x: 1, y: 1 }]);
    expect(findPath(4, 4, { x: 0, y: 0 }, { x: 3, y: 3 }, (x, y) => x === 0 && y === 0)).toEqual([]);
    expect(findPath(4, 4, { x: 0, y: 0 }, { x: 3, y: 3 }, (x, y) => x === 3 && y === 3)).toEqual([]);
    expect(findPath(4, 4, { x: -1, y: 0 }, { x: 3, y: 3 }, () => false)).toEqual([]);
    expect(findPath(4, 4, { x: 0, y: 0 }, { x: 4, y: 3 }, () => false)).toEqual([]);
  });
});
