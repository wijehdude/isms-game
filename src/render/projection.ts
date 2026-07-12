export const TILE_W = 64;
export const TILE_H = 32;
export const HEIGHT_STEP = 16;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.25;
export const VIEWPORT_ANCHOR_Y = 0.47;

export type CameraState = {
  focusX: number;
  focusY: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type Viewport = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };
export type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minZ?: number;
  maxZ?: number;
};
export type TileBounds = { minX: number; minY: number; maxX: number; maxY: number };

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function rawProject(x: number, y: number, z = 0): ScreenPoint {
  return {
    x: (x - y) * (TILE_W / 2),
    y: (x + y) * (TILE_H / 2) - z * HEIGHT_STEP,
  };
}

export function projectIso(x: number, y: number, z: number, camera: CameraState, viewport: Viewport): ScreenPoint {
  const point = rawProject(x, y, z);
  const focus = rawProject(camera.focusX, camera.focusY, 0);
  return {
    x: viewport.width * 0.5 + camera.offsetX + (point.x - focus.x) * camera.zoom,
    y: viewport.height * VIEWPORT_ANCHOR_Y + camera.offsetY + (point.y - focus.y) * camera.zoom,
  };
}

export function unprojectIso(screenX: number, screenY: number, camera: CameraState, viewport: Viewport): ScreenPoint {
  const focus = rawProject(camera.focusX, camera.focusY, 0);
  const rawX = (screenX - viewport.width * 0.5 - camera.offsetX) / camera.zoom + focus.x;
  const rawY = (screenY - viewport.height * VIEWPORT_ANCHOR_Y - camera.offsetY) / camera.zoom + focus.y;
  return {
    x: (rawY / (TILE_H / 2) + rawX / (TILE_W / 2)) / 2,
    y: (rawY / (TILE_H / 2) - rawX / (TILE_W / 2)) / 2,
  };
}

/** Returns a camera whose ground point below the pointer stays fixed while zooming. */
export function zoomCameraAt(
  camera: CameraState,
  viewport: Viewport,
  nextZoom: number,
  screenX: number,
  screenY: number,
): CameraState {
  const zoom = clampZoom(nextZoom);
  if (zoom === camera.zoom) return { ...camera, zoom };
  const world = unprojectIso(screenX, screenY, camera, viewport);
  const point = rawProject(world.x, world.y, 0);
  const focus = rawProject(camera.focusX, camera.focusY, 0);
  return {
    ...camera,
    zoom,
    offsetX: screenX - viewport.width * 0.5 - (point.x - focus.x) * zoom,
    offsetY: screenY - viewport.height * VIEWPORT_ANCHOR_Y - (point.y - focus.y) * zoom,
  };
}

/**
 * Keeps the ground point beneath the camera's visual anchor inside a world-space box.
 *
 * Camera panning is expressed as a screen-space offset, so clamping `focusX` and
 * `focusY` alone would still allow the view to drift indefinitely.  Instead we
 * clamp the world coordinate currently under the anchor and translate the offset
 * by the corresponding isometric delta.  This preserves the public camera shape
 * (including pointer-centred zoom) while making it safe to call after any camera
 * mutation.
 */
export function clampCameraToBounds(camera: CameraState, viewport: Viewport, bounds: WorldBounds): CameraState {
  const zoom = clampZoom(camera.zoom);
  const normalized: CameraState = {
    focusX: Number.isFinite(camera.focusX) ? camera.focusX : 0,
    focusY: Number.isFinite(camera.focusY) ? camera.focusY : 0,
    offsetX: Number.isFinite(camera.offsetX) ? camera.offsetX : 0,
    offsetY: Number.isFinite(camera.offsetY) ? camera.offsetY : 0,
    zoom,
  };
  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) return normalized;

  const anchorX = viewport.width * 0.5;
  const anchorY = viewport.height * VIEWPORT_ANCHOR_Y;
  const current = unprojectIso(anchorX, anchorY, normalized, viewport);
  const target = {
    x: Math.max(minX, Math.min(maxX, current.x)),
    y: Math.max(minY, Math.min(maxY, current.y)),
  };
  if (target.x === current.x && target.y === current.y) return normalized;

  const currentRaw = rawProject(current.x, current.y);
  const targetRaw = rawProject(target.x, target.y);
  return {
    ...normalized,
    offsetX: normalized.offsetX - (targetRaw.x - currentRaw.x) * zoom,
    offsetY: normalized.offsetY - (targetRaw.y - currentRaw.y) * zoom,
  };
}

/** Fits an isometric world-space box into the viewport without changing rotation. */
export function fitCameraToBounds(bounds: WorldBounds, viewport: Viewport, padding = 48): CameraState {
  const minX = Math.min(bounds.minX, bounds.maxX);
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  const minZ = Math.min(bounds.minZ ?? 0, bounds.maxZ ?? 0);
  const maxZ = Math.max(bounds.minZ ?? 0, bounds.maxZ ?? 0);
  const projected = [minX, maxX].flatMap((x) => [minY, maxY].flatMap((y) => [minZ, maxZ].map((z) => rawProject(x, y, z))));
  const rawMinX = Math.min(...projected.map((point) => point.x));
  const rawMaxX = Math.max(...projected.map((point) => point.x));
  const rawMinY = Math.min(...projected.map((point) => point.y));
  const rawMaxY = Math.max(...projected.map((point) => point.y));
  const safePadding = Math.max(0, Math.min(padding, Math.min(viewport.width, viewport.height) * 0.45));
  const availableWidth = Math.max(1, viewport.width - safePadding * 2);
  const availableHeight = Math.max(1, viewport.height - safePadding * 2);
  const projectedWidth = Math.max(1, rawMaxX - rawMinX);
  const projectedHeight = Math.max(1, rawMaxY - rawMinY);
  const zoom = clampZoom(Math.min(availableWidth / projectedWidth, availableHeight / projectedHeight));
  const focusX = (minX + maxX) * 0.5;
  const focusY = (minY + maxY) * 0.5;
  const focus = rawProject(focusX, focusY, 0);
  const rawCenterX = (rawMinX + rawMaxX) * 0.5;
  const rawCenterY = (rawMinY + rawMaxY) * 0.5;
  return {
    focusX,
    focusY,
    zoom,
    offsetX: -(rawCenterX - focus.x) * zoom,
    offsetY: viewport.height * (0.5 - VIEWPORT_ANCHOR_Y) - (rawCenterY - focus.y) * zoom,
  };
}

/** Conservative ground-plane tile bounds for the current screen, including raised terrain. */
export function visibleTileBounds(
  camera: CameraState,
  viewport: Viewport,
  worldWidth: number,
  worldHeight: number,
  marginPixels = 96,
  maxTerrainHeight = 0,
): TileBounds {
  const margin = Math.max(0, marginPixels);
  const elevationDrop = Math.max(0, maxTerrainHeight) * HEIGHT_STEP * camera.zoom;
  const corners = [
    unprojectIso(-margin, -margin, camera, viewport),
    unprojectIso(viewport.width + margin, -margin, camera, viewport),
    unprojectIso(-margin, viewport.height + margin + elevationDrop, camera, viewport),
    unprojectIso(viewport.width + margin, viewport.height + margin + elevationDrop, camera, viewport),
  ];
  const lastX = Math.max(0, Math.floor(worldWidth) - 1);
  const lastY = Math.max(0, Math.floor(worldHeight) - 1);
  return {
    minX: Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))) - 2),
    minY: Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))) - 2),
    maxX: Math.min(lastX, Math.ceil(Math.max(...corners.map((point) => point.x))) + 2),
    maxY: Math.min(lastY, Math.ceil(Math.max(...corners.map((point) => point.y))) + 2),
  };
}

export function diamondPoints(x: number, y: number, z: number, camera: CameraState, viewport: Viewport): ScreenPoint[] {
  return [
    projectIso(x, y, z, camera, viewport),
    projectIso(x + 1, y, z, camera, viewport),
    projectIso(x + 1, y + 1, z, camera, viewport),
    projectIso(x, y + 1, z, camera, viewport),
  ];
}
