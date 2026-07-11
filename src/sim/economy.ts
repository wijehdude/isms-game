import { configuredStats } from "../game/catalog";
import type { GameState, LedgerEntry } from "../game/types";

export const MINUTES_PER_WEEK = 7 * 24 * 60;

export function postLedger(
  state: GameState,
  category: LedgerEntry["category"],
  description: string,
  amount: number,
): void {
  if (!Number.isFinite(amount)) throw new Error(`Invalid ledger amount for ${description}`);
  const rounded = Math.round(amount);
  state.idCounter += 1;
  state.economy.ledger.push({
    id: `ledger-${state.idCounter}`,
    minute: state.totalMinutes,
    category,
    description,
    amount: rounded,
  });
  state.economy.cash += rounded;
  if (category === "funding" && rounded > 0) state.economy.lifetimeFunding += rounded;
  if (rounded < 0) state.economy.lifetimeSpend += -rounded;
}

export function canAfford(state: GameState, amount: number): boolean {
  return state.economy.cash >= Math.round(amount);
}

export function spend(
  state: GameState,
  category: LedgerEntry["category"],
  description: string,
  amount: number,
): boolean {
  const positive = Math.max(0, Math.round(amount));
  if (!canAfford(state, positive)) return false;
  postLedger(state, category, description, -positive);
  return true;
}

export function projectedMonthlyCosts(state: GameState): { payroll: number; operations: number; total: number } {
  const payroll = state.staff.reduce((sum, member) => sum + member.salary, 0);
  const operations = state.devices.reduce((sum, device) => {
    const base = device.status === "fault" ? 0.4 : 1;
    return sum + configuredStats(device.modelId, device.upgradeIds).monthlyOps * base;
  }, 0);
  return { payroll: Math.round(payroll), operations: Math.round(operations), total: Math.round(payroll + operations) };
}

export function weeklyFundingAmount(state: GameState): number {
  const rawFunding = 2_000_000 + 20_000 * state.rating.securityHealth + 500 * state.rating.capabilityPoints;
  return Math.max(2_000_000, Math.round(rawFunding / 100) * 100);
}

export function closeWeek(state: GameState): number {
  const funding = weeklyFundingAmount(state);
  postLedger(state, "funding", `Weekly command funding · security health ${state.rating.securityHealth}`, funding);
  return funding;
}

export function closeMonth(state: GameState): void {
  const costs = projectedMonthlyCosts(state);
  const baselineConventionalCost = 275_000;
  const savings = Math.max(0, baselineConventionalCost - costs.total);
  state.economy.realisedSavings += savings;

  if (costs.payroll > 0) postLedger(state, "payroll", "Monthly workforce payroll", -costs.payroll);
  if (costs.operations > 0) postLedger(state, "operations", "Device licences, energy and preventive maintenance", -costs.operations);

  if (state.economy.cash < 0) {
    const emergency = Math.abs(state.economy.cash) + 50_000;
    postLedger(state, "funding", "Emergency continuity appropriation", emergency);
    state.rating.capabilityPoints = Math.max(0, state.rating.capabilityPoints - 250);
  }
}

export function assertLedgerIdentity(state: GameState): boolean {
  const ledgerBalance = state.economy.ledger.reduce((sum, entry) => sum + entry.amount, 0);
  return ledgerBalance === state.economy.cash;
}
