import type { GameState } from "../game/types";

const SAVE_KEY = "sentinel-base.saves.v3";
const LEGACY_SAVE_KEYS = ["parkwright.camp-overwatch.saves.v1", "sentinel-base.saves.v2"] as const;
const UNSUPPORTED_SAVE_MESSAGE = "This file is not a supported Sentinel Base v3 save. Sentinel Base v1 and v2 saves start fresh.";

export type SaveSlot = {
  id: "autosave" | "manual";
  savedAt: string;
  campName: string;
  scenarioId: string;
  state: string;
};

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(serialized: string): GameState {
  const parsed: unknown = JSON.parse(serialized);
  if (!isGameState(parsed)) throw new Error(UNSUPPORTED_SAVE_MESSAGE);
  return parsed;
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const economy = asRecord(record.economy);
  const rating = asRecord(record.rating);
  const world = asRecord(record.world);
  const weather = asRecord(record.weather);
  const tutorial = asRecord(record.tutorial);
  const automation = asRecord(record.automation);
  return record.version === 3
    && typeof record.campName === "string"
    && typeof record.scenarioId === "string"
    && typeof record.totalMinutes === "number" && Number.isFinite(record.totalMinutes)
    && (record.speed === 0 || record.speed === 1 || record.speed === 2 || record.speed === 4)
    && typeof record.rngState === "number" && typeof record.idCounter === "number"
    && typeof record.lastWeeklyFundingUpdate === "number" && Number.isFinite(record.lastWeeklyFundingUpdate)
    && economy !== null && typeof economy.cash === "number" && Array.isArray(economy.ledger)
    && rating !== null && typeof rating.campRating === "number" && typeof rating.overallScore === "number"
    && asRecord(rating.overallMetrics) !== null && typeof rating.capabilityPoints === "number"
    && typeof rating.securityHealth === "number" && typeof rating.cognitiveLoad === "number"
    && typeof rating.detectionFusion === "number" && typeof rating.responseReadiness === "number"
    && automation !== null && typeof automation.lifecycleAutopilot === "boolean" && typeof automation.incidentResponse === "boolean"
    && asRecord(record.metrics) !== null && typeof asRecord(record.metrics)?.realIncidents === "number"
    && world !== null && typeof world.width === "number" && typeof world.height === "number"
    && Array.isArray(world.tiles) && Array.isArray(world.paths) && Array.isArray(world.structures)
    && weather !== null && typeof weather.kind === "string" && typeof weather.nextChangeAt === "number"
    && tutorial !== null && typeof tutorial.procured === "boolean"
    && Array.isArray(record.orders) && Array.isArray(record.devices) && Array.isArray(record.staff)
    && Array.isArray(record.intruders) && Array.isArray(record.incidents) && Array.isArray(record.messages);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function listSaves(): SaveSlot[] {
  if (typeof localStorage === "undefined") return [];
  try {
    retireLegacyBrowserSaves();
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSaveSlot) : [];
  } catch {
    return [];
  }
}

/** Selected fresh-start policy: previous Sentinel Base and Parkwright browser saves are retired. */
export function retireLegacyBrowserSaves(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of LEGACY_SAVE_KEYS) localStorage.removeItem(key);
}

export function saveToBrowser(state: GameState, id: SaveSlot["id"]): SaveSlot {
  const slot: SaveSlot = {
    id,
    savedAt: new Date().toISOString(),
    campName: state.campName,
    scenarioId: state.scenarioId,
    state: serializeState(state),
  };
  const others = listSaves().filter((candidate) => candidate.id !== id);
  localStorage.setItem(SAVE_KEY, JSON.stringify([slot, ...others]));
  return slot;
}

export function loadBrowserSave(id: SaveSlot["id"]): GameState {
  const slot = listSaves().find((candidate) => candidate.id === id);
  if (!slot) throw new Error("That save slot is empty.");
  return deserializeState(slot.state);
}

function isSaveSlot(value: unknown): value is SaveSlot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (record.id === "autosave" || record.id === "manual") && typeof record.savedAt === "string" && typeof record.state === "string"
    && typeof record.campName === "string" && typeof record.scenarioId === "string";
}
