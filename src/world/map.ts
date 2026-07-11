import { hashSeed } from "../core/rng";
import type { Ownership, Point, Structure, TerrainSurface, WorldState } from "../game/types";

const SURFACE_CODES: Record<TerrainSurface, number> = { grass: 0, sand: 1, dirt: 2, rock: 3, water: 4 };
const CODE_SURFACES: TerrainSurface[] = ["grass", "sand", "dirt", "rock", "water"];
const OWNERSHIP_CODES: Record<Ownership, number> = { owned: 0, purchasable: 1, "off-limits": 2 };
const CODE_OWNERSHIP: Ownership[] = ["owned", "purchasable", "off-limits"];

export function packTile(height: number, surface: TerrainSurface, ownership: Ownership): number {
  return (height & 15) | (SURFACE_CODES[surface] << 4) | (OWNERSHIP_CODES[ownership] << 7);
}

export function tileHeight(value: number): number {
  return value & 15;
}

export function tileSurface(value: number): TerrainSurface {
  return CODE_SURFACES[(value >> 4) & 7] ?? "grass";
}

export function tileOwnership(value: number): Ownership {
  return CODE_OWNERSHIP[(value >> 7) & 3] ?? "off-limits";
}

export function worldIndex(world: WorldState, x: number, y: number): number {
  return y * world.width + x;
}

export function getPackedTile(world: WorldState, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return packTile(0, "rock", "off-limits");
  return world.tiles[worldIndex(world, x, y)] ?? packTile(0, "grass", "off-limits");
}

function noise(seed: number, x: number, y: number): number {
  const value = hashSeed(`${seed}:${x >> 2}:${y >> 2}`);
  return value / 0xffff_ffff;
}

export function createWorld(seed: number, width = 100, height = 100): WorldState {
  const tiles: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= 18 && x <= 81 && y >= 18 && y <= 81;
      const purchasable = x >= 9 && x <= 90 && y >= 9 && y <= 90;
      const ownership: Ownership = inside ? "owned" : purchasable ? "purchasable" : "off-limits";
      const value = noise(seed, x, y);
      const edgeWater = !inside && ((x < 13 && y > 64) || (x > 87 && y < 27));
      const surface: TerrainSurface = edgeWater && value > 0.36 ? "water" : value > 0.91 ? "rock" : value < 0.08 ? "dirt" : "grass";
      const tileZ = inside ? 0 : surface === "water" ? 0 : value > 0.84 ? 1 : 0;
      tiles.push(packTile(tileZ, surface, ownership));
    }
  }

  const structures: Structure[] = [];
  const add = (structure: Omit<Structure, "id">) => structures.push({ ...structure, id: `structure-${structures.length + 1}` });

  // Roads, paths and exercise facilities form the pre-existing camp.
  add({ type: "road", name: "Main access road", x: 47, y: 55, width: 6, height: 43, z: 0 });
  add({ type: "road", name: "Inner service road", x: 29, y: 53, width: 43, height: 4, z: 0 });
  add({ type: "parade", name: "Parade square", x: 38, y: 58, width: 18, height: 12, z: 0, palette: "stone" });
  add({ type: "track", name: "400 metre track", x: 23, y: 27, width: 21, height: 15, z: 0, palette: "sports" });
  add({ type: "drone-pad", name: "Drone pad", x: 66, y: 37, width: 7, height: 7, z: 0, palette: "utility" });
  add({ type: "building", name: "Headquarters", x: 43, y: 31, width: 12, height: 9, z: 0, palette: "command" });
  add({ type: "building", name: "C2 Operations Centre", x: 57, y: 45, width: 10, height: 8, z: 0, palette: "command" });
  add({ type: "building", name: "Barracks Alpha", x: 27, y: 47, width: 9, height: 7, z: 0, palette: "barracks" });
  add({ type: "building", name: "Supply Store", x: 68, y: 61, width: 8, height: 7, z: 0, palette: "utility" });
  add({ type: "building", name: "Camp Gym", x: 26, y: 61, width: 8, height: 7, z: 0, palette: "sports" });
  add({ type: "building", name: "Guardhouse", x: 45, y: 76, width: 5, height: 4, z: 0, palette: "stone" });

  for (let x = 18; x <= 81; x += 1) {
    if (x < 45 || x > 52) add({ type: "fence", name: "Perimeter fence", x, y: 81, width: 1, height: 1, z: 0 });
    add({ type: "fence", name: "Perimeter fence", x, y: 18, width: 1, height: 1, z: 0 });
  }
  for (let y = 19; y < 81; y += 1) {
    add({ type: "fence", name: "Perimeter fence", x: 18, y, width: 1, height: 1, z: 0 });
    add({ type: "fence", name: "Perimeter fence", x: 81, y, width: 1, height: 1, z: 0 });
  }
  add({ type: "gate", name: "Main gate", x: 45, y: 80, width: 8, height: 1, z: 0 });

  const pathSet = new Set<number>();
  const pathLine = (from: Point, to: Point, thickness = 1) => {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        for (let offset = 0; offset < thickness; offset += 1) pathSet.add(worldIndex({ width, height } as WorldState, Math.min(width - 1, x + offset), y));
      }
    }
  };
  pathLine({ x: 50, y: 27 }, { x: 50, y: 78 }, 2);
  pathLine({ x: 29, y: 54 }, { x: 71, y: 54 }, 2);
  pathLine({ x: 31, y: 34 }, { x: 70, y: 34 });
  pathLine({ x: 31, y: 68 }, { x: 70, y: 68 });

  return { width, height, tiles, paths: [...pathSet], structures };
}

export function isTileBlocked(world: WorldState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true;
  if (tileSurface(getPackedTile(world, x, y)) === "water") return true;
  return world.structures.some((structure) => {
    if (structure.type === "road" || structure.type === "walkway" || structure.type === "parade" || structure.type === "track" || structure.type === "drone-pad" || structure.type === "gate") return false;
    return x >= structure.x && x < structure.x + structure.width && y >= structure.y && y < structure.y + structure.height;
  });
}
