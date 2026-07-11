export const TILE_W = 64;
export const TILE_H = 32;
export const HEIGHT_STEP = 16;

export type CameraState = {
  focusX: number;
  focusY: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type Viewport = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };

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
    y: viewport.height * 0.47 + camera.offsetY + (point.y - focus.y) * camera.zoom,
  };
}

export function unprojectIso(screenX: number, screenY: number, camera: CameraState, viewport: Viewport): ScreenPoint {
  const focus = rawProject(camera.focusX, camera.focusY, 0);
  const rawX = (screenX - viewport.width * 0.5 - camera.offsetX) / camera.zoom + focus.x;
  const rawY = (screenY - viewport.height * 0.47 - camera.offsetY) / camera.zoom + focus.y;
  return {
    x: (rawY / (TILE_H / 2) + rawX / (TILE_W / 2)) / 2,
    y: (rawY / (TILE_H / 2) - rawX / (TILE_W / 2)) / 2,
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
