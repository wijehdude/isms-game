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

function createBaselineDevice(
  state: GameState,
  modelId: "camera-fixed" | "floodlight",
  x: number,
  y: number,
  number: number,
  facing?: number,
): Device {
  const camera = modelId === "camera-fixed";
  return {
    id: nextId(state, "device"), modelId, upgradeIds: camera ? ["va-intrusion"] : [],
    name: camera ? `Baseline intrusion camera ${String(number).padStart(2, "0")}` : `Baseline floodlight ${String(number).padStart(2, "0")}`,
    x, y, status: "operational", readyAt: 0, health: 1, commissionedAt: -MINUTES_PER_DAY * 120, detections: 0, falseAlarms: 0,
    facing: camera ? facing : undefined,
  };
}

function installBaselineSecurity(state: GameState): void {
  const cameras = [
    { x: 32, y: 19, facing: -Math.PI / 2 }, { x: 67, y: 19, facing: -Math.PI / 2 },
    { x: 32, y: 80, facing: Math.PI / 2 }, { x: 67, y: 80, facing: Math.PI / 2 },
    { x: 19, y: 32, facing: Math.PI }, { x: 19, y: 67, facing: Math.PI },
    { x: 80, y: 32, facing: 0 }, { x: 80, y: 67, facing: 0 },
  ];
  const floodlights = [
    { x: 25, y: 19 }, { x: 50, y: 19 }, { x: 75, y: 19 },
    { x: 25, y: 80 }, { x: 50, y: 80 }, { x: 75, y: 80 },
    { x: 19, y: 25 }, { x: 19, y: 50 }, { x: 19, y: 75 },
    { x: 80, y: 25 }, { x: 80, y: 50 }, { x: 80, y: 75 },
  ];
  state.devices.push(...cameras.map((position, index) => createBaselineDevice(
    state, "camera-fixed", position.x, position.y, index + 1, position.facing,
  )));
  state.devices.push(...floodlights.map((position, index) => createBaselineDevice(
    state, "floodlight", position.x, position.y, index + 1,
  )));
}

export function createGame(scenarioId: string, seedOverride?: number): GameState {
  const scenario = getScenario(scenarioId);
  const seed = seedOverride ?? scenario.seed;
  const state: GameState = {
    version: 3,
    idCounter: 0,
    seed,
    rngState: hashSeed(seed),
    scenarioId,
    scenarioStatus: "active",
    campName: scenarioId === "sandbox" ? "Sentinel Base" : scenario.name,
    totalMinutes: 6 * 60,
    speed: 1,
    previousSpeed: 1,
    weather: { kind: scenario.weatherBias[0] ?? "clear", intensity: 0.2, temperature: 28, nextChangeAt: 6 * 60 + 5 * 60 },
    nextThreatAt: 11 * 60,
    nextFalseAlarmAt: 9 * 60,
    lastDailyUpdate: 0,
    lastWeeklyFundingUpdate: 0,
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
      overallScore: 0,
      overallMetrics: {
        performance: 50, risk: 50, cost: 50, schedule: 65,
        incidentDetectionRate: 50, falseAlarmRate: 0, meanTimeToDetect: 0, meanTimeToRespond: 0,
        successfulIncidentClosures: 50, missedIntrusions: 0, perimeterSecurityScore: 0,
        threatsPrevented: 0, cashRunway: 50, scheduleAdherence: 65,
      },
      campRating: 0, securityEffectiveness: 0, peopleWellbeing: 0, costEffectiveness: 0, readiness: 0,
      scheduleConfidence: 0, coverage: 0, uptime: 0, trooperHappiness: 0, operatorHappiness: 0,
      capabilityPoints: 0, capabilityLevel: "Fragile", caught: 0, escaped: 0, alarmsResolved: 0, falseAlarms: 0,
      securityHealth: 0, cognitiveLoad: 0, detectionFusion: 0, responseReadiness: 0,
    },
    metrics: {
      realIncidents: 0, detectedRealIncidents: 0, falseAlarmEvents: 0,
      detectionSamples: 0, totalDetectionMinutes: 0,
      responseSamples: 0, totalResponseMinutes: 0,
      successfulClosures: 0, missedIntrusions: 0, threatsPrevented: 0,
    },
    automation: { lifecycleAutopilot: true, incidentResponse: true },
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
  installBaselineSecurity(state);
  state.messages.push({ id: nextId(state, "message"), minute: state.totalMinutes, title: "Command handover", text: "Eight intrusion-analytics cameras and twelve floodlights are operational. Expand the baseline into a resilient, fused capability.", tone: "info" });
  recalculateRating(state);
  return state;
}
