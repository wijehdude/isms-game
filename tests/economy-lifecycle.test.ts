import { describe, expect, it } from "vitest";

import { advanceSimulation } from "../src/sim/simulation";
import { configuredStats, getModel } from "../src/game/catalog";
import {
  commissionDevice,
  placeOrder,
  procureDevice,
  startFactoryTest,
  startIntegration,
  validatePlacement,
} from "../src/game/actions";
import { createGame } from "../src/game/createGame";
import { assertLedgerIdentity, closeMonth, closeWeek, projectedMonthlyCosts, weeklyFundingAmount } from "../src/sim/economy";

const NEVER = Number.MAX_SAFE_INTEGER;

function advanceUntil(state: ReturnType<typeof createGame>, readyAt: number): void {
  const delta = readyAt - state.totalMinutes;
  expect(delta).toBeGreaterThanOrEqual(0);
  if (delta > 0) advanceSimulation(state, delta);
}

describe("capability procurement lifecycle", () => {
  it("charges each quoted programme stage and commissions a tested device", () => {
    const state = createGame("sandbox", 12_345);
    state.nextThreatAt = NEVER;
    state.nextFalseAlarmAt = NEVER;
    state.weather.nextChangeAt = NEVER;
    state.automation.lifecycleAutopilot = false;
    const initialCash = state.economy.cash;
    const upgrades = ["va-intrusion", "infrared"];
    const stats = configuredStats("camera-fixed", upgrades);
    const model = getModel("camera-fixed");

    expect(procureDevice(state, "camera-fixed", ["va-intrusion", "infrared", "va-intrusion"])).toEqual({
      ok: true,
      message: "Fixed camera ordered.",
    });
    const order = state.orders[0];
    expect(order).toBeDefined();
    if (!order) return;
    expect(order.upgradeIds).toEqual(upgrades);
    expect(order.quotedCost).toBe(stats.totalProgrammeCost);
    expect(state.economy.cash).toBe(initialCash - stats.purchaseCost);

    const prematureIntegration = startIntegration(state, order.id);
    expect(prematureIntegration.ok).toBe(false);
    expect(state.economy.cash).toBe(initialCash - stats.purchaseCost);

    advanceUntil(state, order.readyAt);
    expect(order.stage).toBe("integration-review");
    expect(startIntegration(state, order.id).ok).toBe(true);
    expect(order.stage).toBe("integrating");

    advanceUntil(state, order.readyAt);
    expect(order.stage).toBe("factory-test");
    expect(startFactoryTest(state, order.id).ok).toBe(true);
    expect(order.stage).toBe("testing");

    advanceUntil(state, order.readyAt);
    expect(order.stage).toBe("ready");
    expect(validatePlacement(state, order.id, 22, 22)).toEqual({ ok: true, message: "Valid deployment tile." });
    expect(placeOrder(state, order.id, 22, 22).ok).toBe(true);

    const device = state.devices.find((candidate) => candidate.x === 22 && candidate.y === 22);
    expect(device).toBeDefined();
    if (!device) return;
    expect(device.status).toBe("awaiting-sat");
    expect(commissionDevice(state, device.id).ok).toBe(true);
    advanceUntil(state, device.readyAt);
    expect(device.status).toBe("operational");
    expect(device.commissionedAt).toBe(state.totalMinutes);

    expect(state.economy.cash).toBe(initialCash - stats.totalProgrammeCost);
    expect(state.economy.ledger.slice(1).map(({ category, amount }) => ({ category, amount }))).toEqual([
      { category: "procurement", amount: -stats.purchaseCost },
      { category: "integration", amount: -model.integrationCost },
      { category: "testing", amount: -model.testCost },
      { category: "commissioning", amount: -model.commissionCost },
    ]);
    expect(state.tutorial).toMatchObject({ procured: true, integrated: true, tested: true, deployed: true, commissioned: true });
    expect(assertLedgerIdentity(state)).toBe(true);
  });

  it("does not create an order or ledger entry when funds are insufficient", () => {
    const state = createGame("sandbox", 123);
    state.economy.cash = 0;
    state.economy.ledger[0]!.amount = 0;
    state.economy.lifetimeFunding = 0;
    const ledgerLength = state.economy.ledger.length;

    const result = procureDevice(state, "drone-overwatch", ["thermal"]);

    expect(result.ok).toBe(false);
    expect(state.orders).toEqual([]);
    expect(state.economy.ledger).toHaveLength(ledgerLength);
    expect(assertLedgerIdentity(state)).toBe(true);
  });

  it("creates individually deployable records for a batch purchase", () => {
    const state = createGame("sandbox", 456);
    const stats = configuredStats("camera-edge", ["va-intrusion"]);
    const initialCash = state.economy.cash;

    expect(procureDevice(state, "camera-edge", ["va-intrusion"], 3)).toEqual({
      ok: true,
      message: "3 Edge-AI camera units ordered.",
    });
    expect(state.orders).toHaveLength(3);
    expect(new Set(state.orders.map((order) => order.batchId)).size).toBe(1);
    expect(state.orders.every((order) => order.batchId && order.quotedCost === stats.totalProgrammeCost)).toBe(true);
    expect(state.economy.cash).toBe(initialCash - stats.purchaseCost * 3);
    expect(procureDevice(state, "camera-edge", [], 100).ok).toBe(false);
    expect(assertLedgerIdentity(state)).toBe(true);
  });
});

describe("monthly economy", () => {
  it("posts payroll and operations while weekly funding remains separate", () => {
    const state = createGame("sandbox", 7_777);
    state.rating.campRating = 75;
    state.economy.stolenLosses = 0;
    const initialCash = state.economy.cash;
    const initialFunding = state.economy.lifetimeFunding;
    const initialSpend = state.economy.lifetimeSpend;
    const costs = projectedMonthlyCosts(state);

    // Configured monthly O&S includes the catalogue base plus 0.15% of purchase price.
    expect(costs).toEqual({ payroll: 145_000, operations: 15_248, total: 160_248 });
    closeMonth(state);

    expect(state.economy.ledger.slice(-2).map(({ category, amount }) => ({ category, amount }))).toEqual([
      { category: "payroll", amount: -145_000 },
      { category: "operations", amount: -15_248 },
    ]);
    expect(state.economy.cash).toBe(initialCash - 160_248);
    expect(state.economy.realisedSavings).toBe(114_752);
    expect(state.economy.lifetimeFunding).toBe(initialFunding);
    expect(state.economy.lifetimeSpend).toBe(initialSpend + costs.total);
    expect(assertLedgerIdentity(state)).toBe(true);
  });

  it("reduces operations cost while an asset is faulted", () => {
    const state = createGame("sandbox", 8_888);
    const normal = projectedMonthlyCosts(state);
    state.devices[0]!.status = "fault";
    const withFault = projectedMonthlyCosts(state);

    expect(normal.operations).toBe(15_248);
    expect(withFault.operations).toBe(14_687);
    expect(withFault.payroll).toBe(normal.payroll);
  });

  it("releases at least $2m weekly using the security-health formula rounded to $100", () => {
    const state = createGame("sandbox", 9_999);
    state.rating.securityHealth = 73.333;
    state.rating.capabilityPoints = 1_234.2;
    const initialCash = state.economy.cash;
    const initialFunding = state.economy.lifetimeFunding;

    expect(weeklyFundingAmount(state)).toBe(4_083_800);
    expect(closeWeek(state)).toBe(4_083_800);
    expect(state.economy.cash).toBe(initialCash + 4_083_800);
    expect(state.economy.lifetimeFunding).toBe(initialFunding + 4_083_800);
    expect(assertLedgerIdentity(state)).toBe(true);
  });
});
