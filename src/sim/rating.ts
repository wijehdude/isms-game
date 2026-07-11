import { configuredStats, getModel } from "../game/catalog";
import type { GameState } from "../game/types";

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function calculateCoverage(state: GameState): number {
  const devices = state.devices.filter((device) => device.status === "operational" && ["camera", "lidar", "drone", "robot"].includes(getModel(device.modelId).kind));
  if (devices.length === 0) return 0;
  let covered = 0;
  let sampled = 0;
  // Sample the perimeter and sensitive inner corridors; this is threat-weighted, not raw area.
  for (let position = 18; position <= 81; position += 2) {
    const points = [
      { x: position, y: 18 }, { x: position, y: 81 }, { x: 18, y: position }, { x: 81, y: position },
      { x: position, y: 50 }, { x: 50, y: position },
    ];
    for (const point of points) {
      sampled += 1;
      const strength = devices.reduce((best, device) => {
        const stats = configuredStats(device.modelId, device.upgradeIds);
        const distance = Math.hypot(device.x - point.x, device.y - point.y);
        const model = getModel(device.modelId);
        const inFov = model.kind !== "camera" || device.upgradeIds.includes("panoramic") || device.facing === undefined
          || angleDifference(device.facing, Math.atan2(point.y - device.y, point.x - device.x)) <= Math.PI / 4;
        return Math.max(best, distance <= stats.range && inFov ? stats.accuracy * (1 - distance / (stats.range * 1.8)) : 0);
      }, 0);
      if (strength >= 0.25) covered += Math.min(1, strength / 0.68);
    }
  }
  return sampled === 0 ? 0 : clamp((covered / sampled) * 100);
}

function angleDifference(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function recalculateRating(state: GameState, awardDailyPoints = false): void {
  const operational = state.devices.filter((device) => device.status === "operational");
  const commissioned = state.devices.filter((device) => device.commissionedAt !== null);
  const allAssets = state.devices.length + state.orders.length;
  const coverage = calculateCoverage(state);
  const uptime = commissioned.length === 0
    ? 0
    : commissioned.reduce((sum, device) => sum + (device.status === "operational" ? device.health * configuredStats(device.modelId, device.upgradeIds).availability * 100 : 0), 0) / commissioned.length;
  const outcomeTotal = state.rating.caught + state.rating.escaped;
  const interdiction = outcomeTotal === 0 ? 48 : (state.rating.caught / outcomeTotal) * 100;
  const resolvedTotal = state.rating.alarmsResolved + state.rating.falseAlarms;
  const alarmQuality = resolvedTotal === 0 ? 52 : clamp(100 - (state.rating.falseAlarms / resolvedTotal) * 60);
  const security = clamp(coverage * 0.32 + interdiction * 0.26 + uptime * 0.22 + alarmQuality * 0.2);

  const troopers = state.staff.filter((member) => member.role === "trooper");
  const operators = state.staff.filter((member) => member.role === "operator");
  const trooperHappiness = troopers.length === 0 ? 0 : troopers.reduce((sum, member) => sum + member.happiness, 0) / troopers.length;
  const operatorHappiness = operators.length === 0 ? 0 : operators.reduce((sum, member) => sum + member.happiness, 0) / operators.length;
  const people = trooperHappiness * 0.55 + operatorHappiness * 0.45;

  const lossDrag = state.economy.stolenLosses / 9_000;
  const savingsLift = state.economy.realisedSavings / 18_000;
  const costEffectiveness = clamp(52 + savingsLift - lossDrag, 0, Math.min(100, security + 15));
  const staffReadiness = Math.min(1, troopers.length / 3) * 0.5 + Math.min(1, operators.length / 3) * 0.35 + Math.min(1, state.staff.filter((member) => member.role === "engineer").length) * 0.15;
  const assetReadiness = allAssets === 0 ? 0 : operational.length / allAssets;
  const readiness = clamp((assetReadiness * 0.65 + staffReadiness * 0.35) * 100);
  const scheduleConfidence = state.scenarioStatus === "active" ? clamp(55 + readiness * 0.3 - state.orders.length * 1.5) : 100;

  let campRating = security * 0.5 + people * 0.2 + costEffectiveness * 0.2 + clamp(50 + savingsLift * 2) * 0.1;
  campRating = Math.min(campRating, security + 20);
  if (troopers.length === 0 || operators.length === 0) campRating = Math.min(campRating, 39);
  if (coverage < 20) campRating = Math.min(campRating, 49);

  state.rating.coverage = Math.round(coverage);
  state.rating.uptime = Math.round(uptime);
  state.rating.securityEffectiveness = Math.round(security);
  state.rating.peopleWellbeing = Math.round(people);
  state.rating.costEffectiveness = Math.round(costEffectiveness);
  state.rating.readiness = Math.round(readiness);
  state.rating.scheduleConfidence = Math.round(scheduleConfidence);
  state.rating.trooperHappiness = Math.round(trooperHappiness);
  state.rating.operatorHappiness = Math.round(operatorHappiness);
  state.rating.campRating = Math.round(clamp(campRating));
  if (awardDailyPoints) state.rating.capabilityPoints += Math.round((campRating * campRating) / 100);
  state.rating.capabilityLevel = capabilityLevel(state.rating.capabilityPoints, state.rating.campRating);
}

function capabilityLevel(points: number, rating: number): string {
  if (points >= 15_000 && rating >= 90) return "Exemplary";
  if (points >= 8_000 && rating >= 80) return "Resilient";
  if (points >= 3_500 && rating >= 65) return "Assured";
  if (points >= 1_200 && rating >= 45) return "Integrated";
  if (rating >= 25) return "Basic";
  return "Fragile";
}
