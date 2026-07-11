import type { Point } from "../game/types";

type Node = Point & { g: number; f: number; key: string };

/** Deterministic four-way A* used by patrols, responders, and crafted-map tests. */
export function findPath(
  width: number,
  height: number,
  start: Point,
  goal: Point,
  isBlocked: (x: number, y: number) => boolean,
): Point[] {
  const keyOf = (point: Point) => `${point.x},${point.y}`;
  const heuristic = (point: Point) => Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y);
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return [];
  if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height) return [];
  if (isBlocked(goal.x, goal.y) || isBlocked(start.x, start.y)) return [];

  const startNode: Node = { ...start, g: 0, f: heuristic(start), key: keyOf(start) };
  const open: Node[] = [startNode];
  const best = new Map<string, number>([[startNode.key, 0]]);
  const cameFrom = new Map<string, string>();
  const points = new Map<string, Point>([[startNode.key, start]]);
  const directions: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

  while (open.length > 0) {
    const current = heapPop(open);
    if (!current) break;
    if (current.g !== best.get(current.key)) continue;
    if (current.x === goal.x && current.y === goal.y) {
      const path: Point[] = [{ x: current.x, y: current.y }];
      let cursor = current.key;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor) ?? "";
        const point = points.get(cursor);
        if (point) path.push(point);
      }
      return path.reverse();
    }

    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height || isBlocked(next.x, next.y)) continue;
      const key = keyOf(next);
      const tentative = current.g + 1;
      if (tentative >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(key, tentative);
      cameFrom.set(key, current.key);
      points.set(key, next);
      heapPush(open, { ...next, key, g: tentative, f: tentative + heuristic(next) });
    }
  }
  return [];
}

function compareNodes(a: Node, b: Node): number {
  // Prefer progress toward the goal when f is tied; this avoids exploring the
  // entire shortest-path rectangle on large open camp sectors.
  return a.f - b.f || b.g - a.g || a.y - b.y || a.x - b.x;
}

function heapPush(heap: Node[], node: Node): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentNode = heap[parent];
    if (!parentNode || compareNodes(parentNode, node) <= 0) break;
    heap[index] = parentNode;
    index = parent;
  }
  heap[index] = node;
}

function heapPop(heap: Node[]): Node | undefined {
  const root = heap[0];
  const last = heap.pop();
  if (!root || !last || heap.length === 0) return root;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    let child = left;
    const leftNode = heap[left];
    const rightNode = heap[right];
    if (rightNode && leftNode && compareNodes(rightNode, leftNode) < 0) child = right;
    const childNode = heap[child];
    if (!childNode || compareNodes(last, childNode) <= 0) break;
    heap[index] = childNode;
    index = child;
  }
  heap[index] = last;
  return root;
}
