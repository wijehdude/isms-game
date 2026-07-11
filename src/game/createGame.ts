import { MINUTES_PER_DAY } from "../core/time";
import { hashSeed } from "../core/rng";
import { postLedger } from "../sim/economy";
import { recalculateRating } from "../sim/rating";
import { createWorld } from "../world/map";
import { getScenario } from "./scenarios";
import type { Device, GameState, StaffMember, StaffRole } from "./types";

const STAFF_NAMES: Record<StaffRole, string[]> = {
  trooper: ["Trooper Hana", "Trooper Amir", "Trooper Jules", "Trooper Siti", "Trooper Dev", "Trooper Kai"],
  operator: ["Operator Mei", "Operator Noah", "Operator Priya", "Operator Farah", "Operator Leon", "Operator Min"],
  engineer: ["Engineer Lim", "Engineer Vega", "Engineer Tan", "Engineer Morgan"],
};

export const STAFF_SALARIES: Record<StaffRole, number> = {
  trooper: 18_000,
  operator: 22_000,
  engineer: 25_000,
};

export function nextId(state: GameState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}-${state.idCounter}`;
}

export function createStaff(state: GameState, role: StaffRole, shift: 0 | 1 | 2): StaffMember {
  const number = state.staff.filter((member) => member.role === role).length;
  const names = STAFF_NAMES[role];
  const name = names[number % names.length] ?? `${role} ${number + 1}`;
  const anchor = role === "operator" ? { x: 55, y: 51 } : role === "engineer" ? { x: 52, y: 56 } : { x: 53, y: 78 };
  return {
    id: nextId(state, role), role, name, shift, salary: STAFF_SALARIES[role], happiness: 64, fatigue: 12,
    x: anchor.x + (number % 3), y: anchor.y + (number % 2), targetX: anchor.x, targetY: anchor.y,
    status: role === "operator" ? "monitoring" : role === "engineer" ? "engineering" : "patrolling", assignedIncidentId: null, path: [],
  };
}

function createLegacyDevice(state: GameState, x: number, y: number, number: number): Device {
  return {
    id: nextId(state, "device"), modelId: "camera-fixed", upgradeIds: ["va-intrusion"], name: `Legacy fence camera ${String(number).padStart(2, "0")}`,
    x, y, status: "operational", readyAt: 0, health: 0.82, commissionedAt: -MINUTES_PER_DAY * 120, detections: 0, falseAlarms: 0,
    facing: -Math.PI / 2,
  };
}

export function createGame(scenarioId: string, seedOverride?: number): GameState {
  const scenario = getScenario(scenarioId);
  const seed = seedOverride ?? scenario.seed;
  const state: GameState = {
    version: 1,
    idCounter: 0,
    seed,
    rngState: hashSeed(seed),
    scenarioId,
    scenarioStatus: "active",
    campName: scenarioId === "sandbox" ? "Camp Overwatch" : scenario.name,
    totalMinutes: 6 * 60,
    speed: 1,
    previousSpeed: 1,
    weather: { kind: scenario.weatherBias[0] ?? "clear", intensity: 0.2, temperature: 28, nextChangeAt: 6 * 60 + 5 * 60 },
    nextThreatAt: 11 * 60,
    nextFalseAlarmAt: 9 * 60,
    lastDailyUpdate: 0,
    lastMonthlyUpdate: 0,
    lastAutosaveMonth: -1,
    world: createWorld(seed),
    orders: [],
    devices: [],
    staff: [],
    intruders: [],
    incidents: [],
    economy: { cash: 0, lifetimeFunding: 0, lifetimeSpend: 0, avoidedLosses: 0, stolenLosses: 0, realisedSavings: 0, ledger: [] },
    rating: {
      campRating: 0, securityEffectiveness: 0, peopleWellbeing: 0, costEffectiveness: 0, readiness: 0,
      scheduleConfidence: 0, coverage: 0, uptime: 0, trooperHappiness: 0, operatorHappiness: 0,
      capabilityPoints: 0, capabilityLevel: "Fragile", caught: 0, escaped: 0, alarmsResolved: 0, falseAlarms: 0,
    },
    tutorial: { procured: false, integrated: false, tested: false, deployed: false, commissioned: false, hired: false, resolvedAlarm: false, dismissed: false },
    messages: [],
  };

  postLedger(state, "funding", "Initial command appropriation", scenario.startCash);
  for (let shift = 0; shift < 3; shift += 1) {
    state.staff.push(createStaff(state, "trooper", shift as 0 | 1 | 2));
    state.staff.push(createStaff(state, "operator", shift as 0 | 1 | 2));
  }
  state.staff.push(createStaff(state, "engineer", 1));
  if (scenarioId === "alarm-fatigue") state.staff.filter((member) => member.role === "operator").forEach((member) => { member.happiness = 46; });
  state.devices.push(createLegacyDevice(state, 27, 19, 1), createLegacyDevice(state, 73, 19, 2));
  state.messages.push({ id: nextId(state, "message"), minute: state.totalMinutes, title: "Command handover", text: "Legacy cameras are online. Review the weak sectors and deliver your first assured capability.", tone: "info" });
  recalculateRating(state);
  return state;
}
