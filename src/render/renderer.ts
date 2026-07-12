import { calendarFromMinutes, isNight } from "../core/time";
import { configuredStats, getModel } from "../game/catalog";
import type { DeviceKind, GameState, Structure, WeatherKind } from "../game/types";
import { getPackedTile, tileHeight, tileOwnership, tileSurface, worldIndex } from "../world/map";
import { RuntimeSpriteAtlas, type SpriteName } from "./atlas";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  VIEWPORT_ANCHOR_Y,
  clampCameraToBounds,
  diamondPoints,
  fitCameraToBounds,
  projectIso,
  unprojectIso,
  visibleTileBounds,
  zoomCameraAt,
  type CameraState,
  type ScreenPoint,
  type TileBounds,
  type Viewport,
  type WorldBounds,
} from "./projection";

export const DEVICE_PIXEL_RATIO_CAP = 1.75;
export type RendererOptions = { maxDevicePixelRatio?: number };

export type CoverageFilter = "all" | "camera" | "lidar" | "drone" | "robot" | "lighting" | "access-control";

export type RenderOverlay = {
  hoverTile: { x: number; y: number } | null;
  placement: { modelId: string; upgradeIds: string[]; valid: boolean; facing: number } | null;
  selectedDeviceId: string | null;
  /** A selected staff member is highlighted with the same map ring as a device. */
  selectedStaffId?: string | null;
  showCoverage: boolean;
  /** Limits coverage visualisation to one capability family. */
  coverageFilter?: CoverageFilter;
  bulldozing: boolean;
};

export class IsoRenderer {
  readonly camera: CameraState = { focusX: 50, focusY: 50, offsetX: 0, offsetY: -48, zoom: 0.72 };
  private readonly context: CanvasRenderingContext2D;
  private readonly atlas = new RuntimeSpriteAtlas();
  private readonly maxDevicePixelRatio: number;
  private viewport: Viewport = { width: 1, height: 1 };
  private devicePixelRatio = 1;
  private worldCache: GameState["world"] | null = null;
  /** Owned tiles expanded by a small visual slack; used to contain every camera mutation. */
  private campCameraBounds: WorldBounds | null = null;
  private pathSet = new Set<number>();
  private groundStructures: Structure[] = [];
  private groundTiles = new Map<number, Structure["type"]>();
  private elevatedStructures: Structure[] = [];
  private fenceKeys = new Set<string>();
  private maxTerrainHeight = 0;
  private visibleTiles: TileBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private terrainLayer: HTMLCanvasElement | null = null;
  private terrainLayerKey = "";

  constructor(private readonly canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D is required to run Sentinel Base.");
    this.context = context;
    this.maxDevicePixelRatio = Math.max(1, Math.min(DEVICE_PIXEL_RATIO_CAP, options.maxDevicePixelRatio ?? DEVICE_PIXEL_RATIO_CAP));
    this.resize();
  }

  resize(): void {
    this.devicePixelRatio = Math.min(this.maxDevicePixelRatio, window.devicePixelRatio || 1);
    this.viewport = { width: window.innerWidth, height: window.innerHeight };
    this.canvas.width = Math.round(this.viewport.width * this.devicePixelRatio);
    this.canvas.height = Math.round(this.viewport.height * this.devicePixelRatio);
    this.canvas.style.width = `${this.viewport.width}px`;
    this.canvas.style.height = `${this.viewport.height}px`;
    this.clampCameraToCamp();
    this.invalidateTerrainLayer();
  }

  render(state: GameState | null, overlay?: RenderOverlay): void {
    const ctx = this.context;
    ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.drawBackdrop(state?.weather.kind ?? "clear", state?.totalMinutes ?? 9 * 60);
    if (!state) return;
    this.refreshWorldCache(state);
    this.clampCameraToCamp();
    this.visibleTiles = visibleTileBounds(this.camera, this.viewport, state.world.width, state.world.height, 112, this.maxTerrainHeight);
    this.drawTerrainLayer(state);

    if (overlay?.showCoverage) {
      state.devices.filter((device) => device.status === "operational").forEach((device) => {
        const model = getModel(device.modelId);
        const kind = model.kind as string;
        if (overlay.coverageFilter && overlay.coverageFilter !== "all" && kind !== overlay.coverageFilter) return;
        const stats = configuredStats(device.modelId, device.upgradeIds);
        const color = coverageColor(kind);
        if (kind === "camera" && !device.upgradeIds.includes("panoramic") && device.facing !== undefined) this.drawFovCone(device.x + 0.5, device.y + 0.5, stats.range, device.facing, color.fill, color.stroke);
        else this.drawCoverage(device.x, device.y, stats.range, color.fill, color.stroke);
      });
    }
    if (overlay?.placement && overlay.hoverTile) {
      const stats = configuredStats(overlay.placement.modelId, overlay.placement.upgradeIds);
      const model = getModel(overlay.placement.modelId);
      if (model.kind === "camera" && !overlay.placement.upgradeIds.includes("panoramic")) this.drawFovCone(overlay.hoverTile.x + 0.5, overlay.hoverTile.y + 0.5, stats.range, overlay.placement.facing, overlay.placement.valid ? "rgba(80, 220, 166, .13)" : "rgba(238, 86, 86, .11)", overlay.placement.valid ? "rgba(80, 220, 166, .7)" : "rgba(238, 86, 86, .72)");
      else this.drawCoverage(overlay.hoverTile.x + 0.5, overlay.hoverTile.y + 0.5, stats.range, overlay.placement.valid ? "rgba(80, 220, 166, .13)" : "rgba(238, 86, 86, .11)", overlay.placement.valid ? "rgba(80, 220, 166, .7)" : "rgba(238, 86, 86, .72)");
    }

    this.drawWorldObjects(state, overlay);
    if (overlay?.hoverTile) this.drawTileHighlight(overlay.hoverTile.x, overlay.hoverTile.y, overlay.placement ? overlay.placement.valid : !overlay.bulldozing, overlay.bulldozing);
    this.drawNightAndWeather(state);
    this.drawIncidentMarkers(state);
  }

  screenToTile(x: number, y: number): { x: number; y: number } {
    const point = unprojectIso(x, y, this.camera, this.viewport);
    return { x: Math.floor(point.x), y: Math.floor(point.y) };
  }

  project(x: number, y: number, z = 0): ScreenPoint {
    return projectIso(x, y, z, this.camera, this.viewport);
  }

  pan(dx: number, dy: number): void {
    this.camera.offsetX += dx;
    this.camera.offsetY += dy;
    this.clampCameraToCamp();
  }

  /** Backward-compatible centred zoom; pass screen coordinates to anchor it under a pointer. */
  zoomBy(factor: number, screenX = this.viewport.width * 0.5, screenY = this.viewport.height * VIEWPORT_ANCHOR_Y): number {
    return this.setZoom(this.camera.zoom * factor, screenX, screenY);
  }

  /** Multiplies zoom while preserving the ground point under the supplied screen position. */
  zoomAt(screenX: number, screenY: number, factor: number): number {
    return this.zoomBy(factor, screenX, screenY);
  }

  /** Sets an absolute zoom in the supported 0.20–2.25 range around a screen position. */
  setZoom(zoom: number, screenX = this.viewport.width * 0.5, screenY = this.viewport.height * VIEWPORT_ANCHOR_Y): number {
    Object.assign(this.camera, zoomCameraAt(this.camera, this.viewport, zoom, screenX, screenY));
    this.clampCameraToCamp();
    return this.camera.zoom;
  }

  /** Fits the complete scenario world into the viewport. */
  fitWorld(world: GameState["world"], padding = 48): number {
    this.updateCampCameraBounds(world);
    return this.fitBounds(world, { minX: 0, minY: 0, maxX: world.width, maxY: world.height }, padding);
  }

  /** Fits the owned camp perimeter, excluding off-limits and merely purchasable land. */
  fitPerimeter(world: GameState["world"], padding = 64): number {
    const ownedBounds = this.updateCampCameraBounds(world);
    if (!ownedBounds) return this.fitBounds(world, { minX: 0, minY: 0, maxX: world.width, maxY: world.height }, padding);
    return this.fitBounds(world, ownedBounds, padding);
  }

  focusOn(x: number, y: number): void {
    this.camera.focusX = x;
    this.camera.focusY = y;
    this.camera.offsetX = 0;
    this.camera.offsetY = -40;
    this.clampCameraToCamp();
  }

  get zoomRange(): Readonly<{ min: number; max: number }> {
    return { min: MIN_ZOOM, max: MAX_ZOOM };
  }

  deviceAt(state: GameState, screenX: number, screenY: number) {
    return state.devices
      .map((device) => ({ device, point: this.project(device.x + 0.5, device.y + 0.5) }))
      .filter(({ point }) => Math.hypot(point.x - screenX, point.y - screenY) < 24)
      .sort((a, b) => Math.hypot(a.point.x - screenX, a.point.y - screenY) - Math.hypot(b.point.x - screenX, b.point.y - screenY))[0]?.device ?? null;
  }

  private fitBounds(world: GameState["world"], bounds: WorldBounds, padding: number): number {
    let maxZ = 0;
    const minTileX = Math.max(0, Math.floor(bounds.minX));
    const minTileY = Math.max(0, Math.floor(bounds.minY));
    const maxTileX = Math.min(world.width - 1, Math.ceil(bounds.maxX) - 1);
    const maxTileY = Math.min(world.height - 1, Math.ceil(bounds.maxY) - 1);
    for (let y = minTileY; y <= maxTileY; y += 1) {
      for (let x = minTileX; x <= maxTileX; x += 1) maxZ = Math.max(maxZ, tileHeight(getPackedTile(world, x, y)));
    }
    Object.assign(this.camera, fitCameraToBounds({ ...bounds, minZ: 0, maxZ }, this.viewport, padding));
    this.clampCameraToCamp();
    return this.camera.zoom;
  }

  /** Rebuilds the owned-perimeter clamp when a different world is supplied. */
  private updateCampCameraBounds(world: GameState["world"]): WorldBounds | null {
    const ownedBounds = ownedTileBounds(world);
    const base = ownedBounds ?? { minX: 0, minY: 0, maxX: world.width, maxY: world.height };
    const slack = 4;
    this.campCameraBounds = {
      minX: Math.max(0, base.minX - slack),
      minY: Math.max(0, base.minY - slack),
      maxX: Math.min(world.width, base.maxX + slack),
      maxY: Math.min(world.height, base.maxY + slack),
    };
    return ownedBounds;
  }

  private clampCameraToCamp(): void {
    if (!this.campCameraBounds) return;
    Object.assign(this.camera, clampCameraToBounds(this.camera, this.viewport, this.campCameraBounds));
  }

  private invalidateTerrainLayer(): void {
    this.terrainLayerKey = "";
  }

  private refreshWorldCache(state: GameState): void {
    if (this.worldCache === state.world) return;
    this.worldCache = state.world;
    this.updateCampCameraBounds(state.world);
    this.pathSet = new Set(state.world.paths);
    this.groundStructures = state.world.structures.filter((structure) => ["road", "walkway", "parade", "track", "drone-pad"].includes(structure.type));
    this.groundTiles.clear();
    for (const structure of this.groundStructures) {
      const maxY = Math.min(state.world.height, structure.y + structure.height);
      const maxX = Math.min(state.world.width, structure.x + structure.width);
      for (let y = Math.max(0, structure.y); y < maxY; y += 1) {
        for (let x = Math.max(0, structure.x); x < maxX; x += 1) {
          const index = worldIndex(state.world, x, y);
          if (!this.groundTiles.has(index)) this.groundTiles.set(index, structure.type);
        }
      }
    }
    this.elevatedStructures = state.world.structures
      .filter((structure) => !["road", "walkway", "parade", "track", "drone-pad"].includes(structure.type))
      .sort((a, b) => a.x + a.y + a.width + a.height - (b.x + b.y + b.width + b.height));
    this.fenceKeys = new Set(state.world.structures.filter((structure) => structure.type === "fence").map((structure) => `${structure.x},${structure.y}`));
    this.maxTerrainHeight = state.world.tiles.reduce((highest, tile) => Math.max(highest, tileHeight(tile)), 0);
    this.invalidateTerrainLayer();
  }

  private drawBackdrop(weather: WeatherKind, minutes: number): void {
    const ctx = this.context;
    const hour = calendarFromMinutes(minutes).hour;
    const night = hour < 6 || hour >= 19;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.viewport.height);
    gradient.addColorStop(0, night ? "#101c2b" : weather === "storm" ? "#526069" : "#8bc8cf");
    gradient.addColorStop(1, night ? "#1a2d32" : weather === "fog" ? "#b9c7bd" : "#d8e9c2");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
  }

  private drawTerrainLayer(state: GameState): void {
    if (this.camera.zoom > 0.44) {
      this.drawTerrain(state);
      return;
    }
    const width = Math.max(1, Math.round(this.viewport.width * this.devicePixelRatio));
    const height = Math.max(1, Math.round(this.viewport.height * this.devicePixelRatio));
    const key = [state.world.width, state.world.height, this.viewport.width, this.viewport.height, this.devicePixelRatio, this.camera.focusX, this.camera.focusY, this.camera.offsetX, this.camera.offsetY, this.camera.zoom].join(":");
    if (!this.terrainLayer) this.terrainLayer = document.createElement("canvas");
    if (this.terrainLayer.width !== width || this.terrainLayer.height !== height) {
      this.terrainLayer.width = width;
      this.terrainLayer.height = height;
      this.terrainLayerKey = "";
    }
    if (this.terrainLayerKey !== key) {
      const layerContext = this.terrainLayer.getContext("2d");
      if (!layerContext) {
        this.drawTerrain(state);
        return;
      }
      layerContext.setTransform(1, 0, 0, 1, 0, 0);
      layerContext.clearRect(0, 0, width, height);
      layerContext.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
      layerContext.imageSmoothingEnabled = false;
      this.drawTerrain(state, layerContext);
      this.terrainLayerKey = key;
    }
    this.context.drawImage(this.terrainLayer, 0, 0, this.viewport.width, this.viewport.height);
  }

  private drawTerrain(state: GameState, ctx: CanvasRenderingContext2D = this.context): void {
    const minDepth = this.visibleTiles.minX + this.visibleTiles.minY;
    const maxDepth = this.visibleTiles.maxX + this.visibleTiles.maxY;
    for (let depth = minDepth; depth <= maxDepth; depth += 1) {
      const minX = Math.max(this.visibleTiles.minX, depth - this.visibleTiles.maxY);
      const maxX = Math.min(this.visibleTiles.maxX, depth - this.visibleTiles.minY);
      for (let x = minX; x <= maxX; x += 1) {
        const y = depth - x;
        const packed = getPackedTile(state.world, x, y);
        const z = tileHeight(packed);
        const center = this.project(x + 0.5, y + 0.5, z);
        const radiusX = 34 * this.camera.zoom;
        const radiusY = 18 * this.camera.zoom;
        if (center.x < -radiusX || center.y < -radiusY || center.x > this.viewport.width + radiusX || center.y > this.viewport.height + radiusY) continue;
        const ground = this.groundAt(state, x, y);
        const points = diamondPoints(x, y, z, this.camera, this.viewport);
        this.pathPolygon(points, ctx);
        ctx.fillStyle = ground ? groundColor(ground) : terrainColor(tileSurface(packed), tileOwnership(packed), x, y);
        ctx.fill();
        if (this.camera.zoom >= 0.34) {
          ctx.strokeStyle = ground ? "rgba(34,48,43,.18)" : "rgba(31,62,43,.16)";
          ctx.lineWidth = Math.max(0.55, this.camera.zoom * 0.7);
          ctx.stroke();
        }
        if (z > 0 && this.camera.zoom >= 0.3) this.drawTerrainSides(points, z, ctx);
        if (this.pathSet.has(worldIndex(state.world, x, y))) {
          const inner = points.map((point) => ({ x: center.x + (point.x - center.x) * 0.58, y: center.y + (point.y - center.y) * 0.58 }));
          this.pathPolygon(inner, ctx);
          ctx.fillStyle = "#b7ad86";
          ctx.fill();
        }
      }
    }
  }

  private drawStructures(state: GameState): void {
    const structures = state.world.structures
      .filter((structure) => !["road", "walkway", "parade", "track", "drone-pad"].includes(structure.type))
      .sort((a, b) => a.x + a.y + a.width + a.height - (b.x + b.y + b.width + b.height));
    structures.forEach((structure) => {
      if (structure.type === "building") this.drawBuilding(structure);
      else if (structure.type === "fence") this.drawFence(structure);
      else if (structure.type === "gate") this.drawGate(structure);
    });
  }

  private drawWorldObjects(state: GameState, overlay?: RenderOverlay): void {
    type DrawEntity = { depth: number; x: number; y: number; sprite: SpriteName; alpha?: number; status?: string; selected?: boolean };
    type WorldObject = { depth: number; layer: number; structure?: Structure; entity?: DrawEntity };
    const objects: WorldObject[] = this.elevatedStructures
      .filter((structure) => this.structureWithinVisibleTiles(structure))
      .map((structure) => ({
        depth: structure.x + structure.y + (structure.type === "building" || structure.type === "gate" ? structure.width + structure.height : 1),
        layer: structure.type === "fence" ? 1 : 2,
        structure,
      }));
    state.devices.filter((device) => this.pointWithinVisibleTiles(device.x, device.y)).forEach((device) => {
      const kind = getModel(device.modelId).kind;
      objects.push({ depth: device.x + device.y + 0.8, layer: 3, entity: { depth: device.x + device.y, x: device.x + 0.5, y: device.y + 0.5, sprite: spriteForDevice(kind, device.modelId), alpha: device.status === "operational" ? 1 : 0.62, status: device.status, selected: device.id === overlay?.selectedDeviceId } });
    });
    const insideBuilding = (x: number, y: number) => state.world.structures.some((structure) => structure.type === "building" && x >= structure.x && x < structure.x + structure.width && y >= structure.y && y < structure.y + structure.height);
    state.staff.filter((member) => this.pointWithinVisibleTiles(member.x, member.y) && !insideBuilding(member.x, member.y)).forEach((member) => objects.push({ depth: member.x + member.y, layer: 3, entity: { depth: member.x + member.y, x: member.x, y: member.y, sprite: member.role, selected: member.id === overlay?.selectedStaffId } }));
    state.intruders.filter((intruder) => intruder.detected && this.pointWithinVisibleTiles(intruder.x, intruder.y) && !insideBuilding(intruder.x, intruder.y)).forEach((intruder) => objects.push({ depth: intruder.x + intruder.y, layer: 3, entity: { depth: intruder.x + intruder.y, x: intruder.x, y: intruder.y, sprite: "intruder" } }));

    objects.sort((a, b) => a.depth - b.depth || a.layer - b.layer);
    objects.forEach((object) => {
      if (object.structure?.type === "building") this.drawBuilding(object.structure);
      else if (object.structure?.type === "fence") this.drawFence(object.structure);
      else if (object.structure?.type === "gate") this.drawGate(object.structure);
      else if (object.entity) this.drawEntity(object.entity);
    });

    if (overlay?.placement && overlay.hoverTile) {
      const model = getModel(overlay.placement.modelId);
      const point = this.project(overlay.hoverTile.x + 0.5, overlay.hoverTile.y + 0.5);
      this.atlas.draw(this.context, spriteForDevice(model.kind, model.id), point.x, point.y, this.camera.zoom * 0.74, 0.62);
    }
  }

  private drawEntity(entity: { x: number; y: number; sprite: SpriteName; alpha?: number; status?: string; selected?: boolean }): void {
    const point = this.project(entity.x, entity.y);
    if (!this.visible(point, 50)) return;
    if (this.camera.zoom < 0.34) {
      const radius = ["camera", "lidar", "robot-dog", "robot-humanoid", "drone", "lighting", "access-control"].includes(entity.sprite) ? 3 : 1.8;
      this.context.globalAlpha = entity.alpha ?? 1;
      this.context.fillStyle = strategicSpriteColor(entity.sprite);
      this.context.beginPath(); this.context.arc(point.x, point.y - radius, radius, 0, Math.PI * 2); this.context.fill();
      this.context.globalAlpha = 1;
      if (entity.selected) {
        this.context.strokeStyle = "#f5cf68"; this.context.lineWidth = 1.5;
        this.context.beginPath(); this.context.arc(point.x, point.y - radius, radius + 4, 0, Math.PI * 2); this.context.stroke();
      }
      if (entity.status && entity.status !== "operational") {
        this.context.fillStyle = entity.status === "fault" ? "#ef6a63" : "#e8b84f";
        this.context.fillRect(point.x + radius, point.y - radius * 3, 3, 3);
      }
      return;
    }
    const scale = Math.max(0.38, this.camera.zoom * (entity.sprite === "drone" ? 0.9 : 0.72));
    this.context.fillStyle = "rgba(17,31,26,.24)";
    this.context.beginPath(); this.context.ellipse(point.x, point.y + 3, 10 * scale, 4 * scale, 0, 0, Math.PI * 2); this.context.fill();
    if (entity.selected) {
      this.context.strokeStyle = "#f5cf68"; this.context.lineWidth = 2;
      this.context.beginPath(); this.context.ellipse(point.x, point.y, 18 * scale, 9 * scale, 0, 0, Math.PI * 2); this.context.stroke();
    }
    this.atlas.draw(this.context, entity.sprite, point.x, point.y - (entity.sprite === "drone" ? 12 : 0), scale, entity.alpha);
    if (entity.status && entity.status !== "operational") {
      this.context.fillStyle = entity.status === "fault" ? "#ef6a63" : "#e8b84f";
      this.context.beginPath(); this.context.arc(point.x + 9, point.y - 24 * scale, 4, 0, Math.PI * 2); this.context.fill();
    }
  }

  private drawBuilding(structure: Structure): void {
    const ctx = this.context;
    const base = [
      this.project(structure.x, structure.y), this.project(structure.x + structure.width, structure.y),
      this.project(structure.x + structure.width, structure.y + structure.height), this.project(structure.x, structure.y + structure.height),
    ];
    if (base.every((point) => point.x < -100 || point.x > this.viewport.width + 100 || point.y < -100 || point.y > this.viewport.height + 100)) return;
    const wallHeight = (structure.palette === "command" ? 58 : 44) * this.camera.zoom;
    const top = base.map((point) => ({ x: point.x, y: point.y - wallHeight }));
    const palette = buildingPalette(structure.palette);
    this.pathPolygon([base[1] ?? base[0]!, base[2] ?? base[0]!, top[2] ?? top[0]!, top[1] ?? top[0]!]);
    ctx.fillStyle = palette.right; ctx.fill();
    this.pathPolygon([base[2] ?? base[0]!, base[3] ?? base[0]!, top[3] ?? top[0]!, top[2] ?? top[0]!]);
    ctx.fillStyle = palette.left; ctx.fill();
    this.pathPolygon(top);
    ctx.fillStyle = palette.roof; ctx.fill();
    ctx.strokeStyle = "rgba(23,35,31,.62)"; ctx.lineWidth = 1.4; ctx.stroke();
    const labelPoint = top[0];
    if (labelPoint && this.camera.zoom > 0.58) {
      ctx.font = `${Math.max(9, 10 * this.camera.zoom)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      const centerX = top.reduce((sum, point) => sum + point.x, 0) / top.length;
      const centerY = top.reduce((sum, point) => sum + point.y, 0) / top.length;
      ctx.fillStyle = "rgba(15,29,25,.78)";
      const width = ctx.measureText(structure.name).width + 10;
      ctx.fillRect(centerX - width / 2, centerY - 17, width, 15);
      ctx.fillStyle = "#f3ead3";
      ctx.fillText(structure.name, centerX, centerY - 6);
    }
  }

  private drawFence(structure: Structure): void {
    const ctx = this.context;
    const point = this.project(structure.x + 0.5, structure.y + 0.5);
    if (!this.visible(point, 30)) return;
    const height = 19 * this.camera.zoom;
    ctx.strokeStyle = "#5d665d";
    ctx.lineWidth = Math.max(1, this.camera.zoom * 2);
    ctx.beginPath(); ctx.moveTo(point.x, point.y + 2); ctx.lineTo(point.x, point.y - height); ctx.stroke();
    if (this.camera.zoom < 0.42) return;
    const neighbors = [{ x: structure.x + 1, y: structure.y }, { x: structure.x, y: structure.y + 1 }];
    neighbors.forEach((neighbor) => {
      if (!this.fenceKeys.has(`${neighbor.x},${neighbor.y}`)) return;
      const end = this.project(neighbor.x + 0.5, neighbor.y + 0.5);
      ctx.strokeStyle = "rgba(105,117,105,.85)"; ctx.lineWidth = 1;
      for (let offset = 5; offset <= 14; offset += 4) {
        ctx.beginPath(); ctx.moveTo(point.x, point.y - offset * this.camera.zoom); ctx.lineTo(end.x, end.y - offset * this.camera.zoom); ctx.stroke();
      }
    });
  }

  private drawGate(structure: Structure): void {
    const ctx = this.context;
    const left = this.project(structure.x, structure.y + 0.5);
    const right = this.project(structure.x + structure.width, structure.y + 0.5);
    const height = 34 * this.camera.zoom;
    ctx.strokeStyle = "#34453e"; ctx.lineWidth = 5 * this.camera.zoom;
    ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(left.x, left.y - height); ctx.lineTo(right.x, right.y - height); ctx.lineTo(right.x, right.y); ctx.stroke();
    ctx.fillStyle = "#e1ad48"; ctx.fillRect((left.x + right.x) / 2 - 15, (left.y + right.y) / 2 - height - 8, 30, 12);
  }

  private drawEntities(state: GameState, overlay?: RenderOverlay): void {
    type DrawEntity = { depth: number; x: number; y: number; sprite: SpriteName; alpha?: number; status?: string; selected?: boolean };
    const entities: DrawEntity[] = [];
    state.devices.forEach((device) => {
      const kind = getModel(device.modelId).kind;
      entities.push({ depth: device.x + device.y, x: device.x + 0.5, y: device.y + 0.5, sprite: spriteForDevice(kind, device.modelId), alpha: device.status === "operational" ? 1 : 0.62, status: device.status, selected: device.id === overlay?.selectedDeviceId });
    });
    const insideBuilding = (x: number, y: number) => state.world.structures.some((structure) => structure.type === "building" && x >= structure.x && x < structure.x + structure.width && y >= structure.y && y < structure.y + structure.height);
    state.staff.filter((member) => !insideBuilding(member.x, member.y)).forEach((member) => entities.push({ depth: member.x + member.y, x: member.x, y: member.y, sprite: member.role, selected: member.id === overlay?.selectedStaffId }));
    state.intruders.filter((intruder) => intruder.detected && !insideBuilding(intruder.x, intruder.y)).forEach((intruder) => entities.push({ depth: intruder.x + intruder.y, x: intruder.x, y: intruder.y, sprite: "intruder" }));
    entities.sort((a, b) => a.depth - b.depth);
    entities.forEach((entity) => {
      const point = this.project(entity.x, entity.y);
      if (!this.visible(point, 50)) return;
      const scale = Math.max(0.38, this.camera.zoom * (entity.sprite === "drone" ? 0.9 : 0.72));
      this.context.fillStyle = "rgba(17,31,26,.24)";
      this.context.beginPath(); this.context.ellipse(point.x, point.y + 3, 10 * scale, 4 * scale, 0, 0, Math.PI * 2); this.context.fill();
      if (entity.selected) {
        this.context.strokeStyle = "#f5cf68"; this.context.lineWidth = 2;
        this.context.beginPath(); this.context.ellipse(point.x, point.y, 18 * scale, 9 * scale, 0, 0, Math.PI * 2); this.context.stroke();
      }
      this.atlas.draw(this.context, entity.sprite, point.x, point.y - (entity.sprite === "drone" ? 12 : 0), scale, entity.alpha);
      if (entity.status && entity.status !== "operational") {
        this.context.fillStyle = entity.status === "fault" ? "#ef6a63" : "#e8b84f";
        this.context.beginPath(); this.context.arc(point.x + 9, point.y - 24 * scale, 4, 0, Math.PI * 2); this.context.fill();
      }
    });

    if (overlay?.placement && overlay.hoverTile) {
      const model = getModel(overlay.placement.modelId);
      const point = this.project(overlay.hoverTile.x + 0.5, overlay.hoverTile.y + 0.5);
      this.atlas.draw(this.context, spriteForDevice(model.kind, model.id), point.x, point.y, this.camera.zoom * 0.74, 0.62);
    }
  }

  private drawIncidentMarkers(state: GameState): void {
    const active = state.incidents.filter((incident) => ["new", "verifying", "verified", "responding"].includes(incident.status));
    const pulse = (Math.sin(performance.now() / 260) + 1) / 2;
    active.forEach((incident) => {
      const point = this.project(incident.x, incident.y);
      if (!this.visible(point, 60)) return;
      const confirmed = incident.status === "verified" || incident.status === "responding";
      this.context.strokeStyle = confirmed ? `rgba(239,84,76,${0.55 + pulse * 0.35})` : `rgba(242,183,72,${0.45 + pulse * 0.35})`;
      this.context.lineWidth = 2;
      this.context.beginPath(); this.context.arc(point.x, point.y - 8, 10 + pulse * 9, 0, Math.PI * 2); this.context.stroke();
      this.context.fillStyle = confirmed ? "#ef544c" : "#f2b748";
      this.context.beginPath(); this.context.moveTo(point.x, point.y - 28); this.context.lineTo(point.x - 6, point.y - 39); this.context.lineTo(point.x + 6, point.y - 39); this.context.closePath(); this.context.fill();
    });
  }

  private drawTileHighlight(x: number, y: number, valid: boolean, bulldozing: boolean): void {
    const points = diamondPoints(x, y, tileHeight(this.worldCache ? getPackedTile(this.worldCache, x, y) : 0), this.camera, this.viewport);
    this.pathPolygon(points);
    this.context.fillStyle = bulldozing ? "rgba(239,84,76,.28)" : valid ? "rgba(85,224,166,.22)" : "rgba(239,84,76,.27)";
    this.context.fill();
    this.context.strokeStyle = bulldozing ? "#ef544c" : valid ? "#64e2b1" : "#ef544c";
    this.context.lineWidth = 2; this.context.stroke();
  }

  private drawCoverage(x: number, y: number, range: number, fill: string, stroke: string): void {
    const point = this.project(x, y);
    const radiusX = range * 45.25 * this.camera.zoom;
    const radiusY = range * 22.62 * this.camera.zoom;
    if (point.x + radiusX < 0 || point.x - radiusX > this.viewport.width || point.y + radiusY < 0 || point.y - radiusY > this.viewport.height) return;
    this.context.beginPath(); this.context.ellipse(point.x, point.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.context.fillStyle = fill; this.context.fill(); this.context.strokeStyle = stroke; this.context.lineWidth = 1.5; this.context.stroke();
  }

  private drawFovCone(x: number, y: number, range: number, facing: number, fill: string, stroke: string): void {
    const points: ScreenPoint[] = [this.project(x, y)];
    for (let step = 0; step <= 10; step += 1) {
      const angle = facing - Math.PI / 4 + (Math.PI / 2) * (step / 10);
      points.push(this.project(x + Math.cos(angle) * range, y + Math.sin(angle) * range));
    }
    this.pathPolygon(points);
    this.context.fillStyle = fill;
    this.context.fill();
    this.context.strokeStyle = stroke;
    this.context.lineWidth = 1.5;
    this.context.stroke();
  }

  private drawNightAndWeather(state: GameState): void {
    const ctx = this.context;
    if (isNight(state.totalMinutes)) {
      ctx.fillStyle = "rgba(7,17,33,.48)"; ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
      ctx.save(); ctx.globalCompositeOperation = "screen";
      state.devices.filter((device) => device.status === "operational" && getModel(device.modelId).kind === "lighting").forEach((light) => {
        const point = this.project(light.x + 0.5, light.y + 0.5);
        const radius = configuredStats(light.modelId, light.upgradeIds).range * 23 * this.camera.zoom;
        if (point.x + radius < 0 || point.x - radius > this.viewport.width || point.y + radius < 0 || point.y - radius > this.viewport.height) return;
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        gradient.addColorStop(0, "rgba(255,224,126,.32)"); gradient.addColorStop(1, "rgba(255,224,126,0)");
        ctx.fillStyle = gradient; ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
      });
      ctx.restore();
    }
    if (state.weather.kind === "fog") {
      ctx.fillStyle = `rgba(220,230,219,${0.12 + state.weather.intensity * 0.16})`; ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
    }
    if (state.weather.kind === "rain" || state.weather.kind === "storm") {
      ctx.strokeStyle = state.weather.kind === "storm" ? "rgba(209,226,230,.48)" : "rgba(215,232,230,.3)";
      ctx.lineWidth = 1;
      const time = performance.now() / 9;
      for (let index = 0; index < (state.weather.kind === "storm" ? 100 : 55); index += 1) {
        const x = (index * 97 + time * 1.7) % (this.viewport.width + 30) - 15;
        const y = (index * 53 + time * 3.2) % (this.viewport.height + 40) - 20;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); ctx.stroke();
      }
    }
  }

  private groundAt(state: GameState, x: number, y: number): Structure["type"] | undefined {
    return this.groundTiles.get(worldIndex(state.world, x, y));
  }

  private drawTerrainSides(points: ScreenPoint[], z: number, ctx: CanvasRenderingContext2D = this.context): void {
    const drop = z * 16 * this.camera.zoom;
    const p1 = points[1]; const p2 = points[2]; const p3 = points[3];
    if (!p1 || !p2 || !p3) return;
    this.pathPolygon([p1, p2, { x: p2.x, y: p2.y + drop }, { x: p1.x, y: p1.y + drop }], ctx); ctx.fillStyle = "#496747"; ctx.fill();
    this.pathPolygon([p2, p3, { x: p3.x, y: p3.y + drop }, { x: p2.x, y: p2.y + drop }], ctx); ctx.fillStyle = "#3e593d"; ctx.fill();
  }

  private pathPolygon(points: ScreenPoint[], context: CanvasRenderingContext2D = this.context): void {
    const first = points[0];
    if (!first) return;
    context.beginPath(); context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index]; if (point) context.lineTo(point.x, point.y);
    }
    context.closePath();
  }

  private pointWithinVisibleTiles(x: number, y: number, margin = 3): boolean {
    return x >= this.visibleTiles.minX - margin && y >= this.visibleTiles.minY - margin
      && x <= this.visibleTiles.maxX + margin && y <= this.visibleTiles.maxY + margin;
  }

  private structureWithinVisibleTiles(structure: Structure, margin = 3): boolean {
    return structure.x + structure.width >= this.visibleTiles.minX - margin
      && structure.y + structure.height >= this.visibleTiles.minY - margin
      && structure.x <= this.visibleTiles.maxX + margin
      && structure.y <= this.visibleTiles.maxY + margin;
  }

  private visible(point: ScreenPoint, margin: number): boolean {
    return point.x >= -margin && point.y >= -margin && point.x <= this.viewport.width + margin && point.y <= this.viewport.height + margin;
  }
}

/** Returns the edge-aligned rectangle containing all currently owned camp tiles. */
function ownedTileBounds(world: GameState["world"]): WorldBounds | null {
  let minX = world.width;
  let minY = world.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      if (tileOwnership(getPackedTile(world, x, y)) !== "owned") continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  return maxX < minX || maxY < minY ? null : { minX, minY, maxX, maxY };
}

function terrainColor(surface: string, ownership: string, x: number, y: number): string {
  const variation = ((x * 17 + y * 29) % 5) - 2;
  const colors: Record<string, string[]> = {
    grass: ["#6f9a62", "#75a168", "#6b955f", "#7ba66b", "#719b63"],
    sand: ["#c6b47d"], dirt: ["#9a7654"], rock: ["#7c8478"], water: ["#4f91a1"],
  };
  const palette = colors[surface] ?? colors.grass ?? ["#6f9a62"];
  if (ownership === "off-limits") return surface === "water" ? "#477f8c" : "#567457";
  if (ownership === "purchasable") return surface === "water" ? "#4b8998" : "#63865c";
  return palette[Math.abs(variation) % palette.length] ?? "#6f9a62";
}

function groundColor(type: Structure["type"]): string {
  if (type === "road") return "#67736e";
  if (type === "parade") return "#a49b83";
  if (type === "track") return "#b36b51";
  if (type === "drone-pad") return "#7b8985";
  return "#b7ad86";
}

function buildingPalette(palette?: Structure["palette"]) {
  if (palette === "command") return { roof: "#d7c999", left: "#8a9a82", right: "#748772" };
  if (palette === "barracks") return { roof: "#879274", left: "#748167", right: "#5e715e" };
  if (palette === "sports") return { roof: "#a7b6a2", left: "#7b8e7f", right: "#657a6e" };
  if (palette === "utility") return { roof: "#81908f", left: "#687b7a", right: "#556d6c" };
  return { roof: "#c9c3ac", left: "#8f9287", right: "#777f78" };
}

function spriteForDevice(kind: DeviceKind | string, modelId: string): SpriteName {
  if (kind === "camera") return "camera";
  if (kind === "lidar") return "lidar";
  if (kind === "drone") return "drone";
  if (kind === "lighting") return "lighting";
  if (kind === "access-control") return "access-control";
  return modelId === "robot-humanoid" ? "robot-humanoid" : "robot-dog";
}

function strategicSpriteColor(sprite: SpriteName): string {
  if (sprite === "intruder") return "#ef6a63";
  if (sprite === "trooper") return "#5b7692";
  if (sprite === "operator") return "#d1a45b";
  if (sprite === "engineer") return "#66a77c";
  if (sprite === "lighting") return "#f4cf68";
  if (sprite === "access-control") return "#6bd6dd";
  if (sprite === "drone") return "#b9cbd0";
  if (sprite === "camera") return "#ff5c9f";
  if (sprite === "lidar") return "#55dcff";
  return "#9bc779";
}

function coverageColor(kind: string): { fill: string; stroke: string } {
  if (kind === "lidar") return { fill: "rgba(68, 220, 255, .10)", stroke: "rgba(86, 226, 255, .58)" };
  if (kind === "drone") return { fill: "rgba(239, 169, 74, .10)", stroke: "rgba(246, 188, 94, .5)" };
  if (kind === "robot") return { fill: "rgba(177, 125, 231, .10)", stroke: "rgba(193, 144, 245, .5)" };
  if (kind === "lighting") return { fill: "rgba(247, 206, 92, .10)", stroke: "rgba(255, 222, 120, .54)" };
  if (kind === "access-control") return { fill: "rgba(86, 211, 219, .10)", stroke: "rgba(107, 224, 231, .55)" };
  return { fill: "rgba(255, 79, 154, .10)", stroke: "rgba(255, 100, 174, .58)" };
}
