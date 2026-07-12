import { calendarFromMinutes } from "../core/time";
import { configuredStats, getModel, getUpgrade, quoteConfiguredStats, vendorComparison } from "./catalog";
import { createStaff, nextId } from "./createGame";
import { canAfford, postLedger, spend } from "../sim/economy";
import { recalculateRating } from "../sim/rating";
import { getPackedTile, isTileBlocked, tileHeight, tileOwnership } from "../world/map";
import type { ActionResult, Device, DronePatrol, GameMessage, GameState, Incident, StaffRole, Upgrade } from "./types";

/** The central pad has eight marked berths. Ready drones are assigned to these automatically. */
export const DRONE_PAD_CAPACITY = 8;

const DRONE_PATROL_SIDES: DronePatrol["side"][] = ["north", "east", "south", "west"];
const DRONE_PATROL_SCHEDULES: DronePatrol["schedule"][] = ["day", "night", "both"];

export function pushMessage(state: GameState, title: string, text: string, tone: GameMessage["tone"] = "info"): void {
  state.messages.unshift({ id: nextId(state, "message"), minute: state.totalMinutes, title, text, tone });
  state.messages = state.messages.slice(0, 80);
}

export function procureDevice(state: GameState, modelId: string, upgradeIds: string[], quantity = 1): ActionResult {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { ok: false, reason: "Procurement quantity must be a whole number from 1 to 99." };
  }
  const model = getModel(modelId);
  const uniqueUpgrades = [...new Set(upgradeIds)];
  const invalid = uniqueUpgrades.find((id) => !getUpgrade(id).kinds.includes(model.kind));
  if (invalid) return { ok: false, reason: `${getUpgrade(invalid).name} is not compatible with ${model.shortName}.` };
  const stats = quoteConfiguredStats(modelId, uniqueUpgrades, state);
  const leadHours = vendorComparison(modelId, uniqueUpgrades, stats.quote.urgencyFactor).leadHours;
  const purchaseCost = stats.purchaseCost * quantity;
  if (!canAfford(state, purchaseCost)) return { ok: false, reason: `Requires ${formatMoney(purchaseCost)}; only ${formatMoney(state.economy.cash)} is available.` };
  spend(state, "procurement", `Purchase order · ${quantity}× ${model.name}`, purchaseCost);
  const batchId = quantity > 1 ? nextId(state, "batch") : undefined;
  // The plan assumes delivery, one integration pass, factory testing and a three-hour SAT.
  // It remains a plan rather than a promise: change orders and a full drone pad can still move it.
  const plannedOperationalAt = state.totalMinutes + (leadHours + stats.integrationHours + stats.testHours + 3) * 60;
  for (let unit = 0; unit < quantity; unit += 1) {
    state.orders.push({
      id: nextId(state, "order"), modelId, upgradeIds: uniqueUpgrades, stage: "procurement", orderedAt: state.totalMinutes,
      readyAt: state.totalMinutes + leadHours * 60, quotedCost: stats.totalProgrammeCost, batchId, plannedOperationalAt,
    });
  }
  state.tutorial.procured = true;
  pushMessage(state, "Purchase order placed", `${quantity}× ${model.name} ${quantity === 1 ? "is" : "are"} due in ${leadHours} hours. ${formatMoney(stats.totalProgrammeCost * quantity)} total programme cost.`, "good");
  return { ok: true, message: quantity === 1 ? `${model.shortName} ordered.` : `${quantity} ${model.shortName} units ordered.` };
}

export function startIntegration(state: GameState, orderId: string): ActionResult {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return { ok: false, reason: "That procurement record no longer exists." };
  if (order.stage !== "integration-review") return { ok: false, reason: "Delivery and inspection must finish before the ICD review." };
  if (!state.staff.some((member) => member.role === "engineer")) return { ok: false, reason: "Hire an engineer to own the interface control document." };
  const model = getModel(order.modelId);
  const stats = configuredStats(order.modelId, order.upgradeIds);
  if (!spend(state, "integration", `ICD and C2 integration · ${model.name}`, model.integrationCost)) return { ok: false, reason: `The ICD review needs ${formatMoney(model.integrationCost)}.` };
  order.stage = "integrating";
  order.readyAt = state.totalMinutes + stats.integrationHours * 60;
  state.tutorial.integrated = true;
  pushMessage(state, "ICD review approved", `${model.shortName} identity, time, location, alarm and health mappings are being integrated.`, "good");
  return { ok: true, message: "Integration work started." };
}

export function startFactoryTest(state: GameState, orderId: string): ActionResult {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return { ok: false, reason: "That capability record no longer exists." };
  if (order.stage !== "factory-test") return { ok: false, reason: "Complete the ICD integration before factory acceptance testing." };
  const model = getModel(order.modelId);
  const stats = configuredStats(order.modelId, order.upgradeIds);
  if (!spend(state, "testing", `Factory acceptance test · ${model.name}`, model.testCost)) return { ok: false, reason: `Factory acceptance needs ${formatMoney(model.testCost)}.` };
  order.stage = "testing";
  order.readyAt = state.totalMinutes + stats.testHours * 60;
  state.tutorial.tested = true;
  pushMessage(state, "Factory test running", `Alarm mapping, health, recovery and configured analytics are under test.`, "info");
  return { ok: true, message: "Factory acceptance test started." };
}

/** Approve every currently actionable programme gate, including installed assets awaiting SAT. */
export function approveAllReady(state: GameState): ActionResult {
  let approved = 0;
  for (const order of [...state.orders]) {
    const result = order.stage === "integration-review"
      ? startIntegration(state, order.id)
      : order.stage === "factory-test"
        ? startFactoryTest(state, order.id)
        : null;
    if (result?.ok) approved += 1;
  }
  for (const device of state.devices) {
    if (device.status === "awaiting-sat" && commissionDevice(state, device.id).ok) approved += 1;
  }
  return {
    ok: true,
    message: approved === 0 ? "No programme approvals are ready." : `${approved} programme gate${approved === 1 ? "" : "s"} approved.`,
  };
}

function validateDevicePosition(state: GameState, modelId: string, x: number, y: number, ignoredDeviceId?: string): ActionResult {
  const model = getModel(modelId);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: "Devices must be positioned on whole map tiles." };
  if (x < 0 || y < 0 || x >= state.world.width || y >= state.world.height) return { ok: false, reason: "That tile is outside the camp map." };
  const tile = getPackedTile(state.world, x, y);
  if (tileOwnership(tile) !== "owned") return { ok: false, reason: "The camp does not own this tile." };
  if (isTileBlocked(state.world, x, y)) return { ok: false, reason: "A building, fence or water feature occupies this tile." };
  if (state.world.structures.some((structure) => structure.type === "drone-pad" && x >= structure.x && x < structure.x + structure.width && y >= structure.y && y < structure.y + structure.height)) {
    return { ok: false, reason: "The central drone pad is reserved for automatic patrol-drone basing." };
  }
  const occupied = state.devices.some((device) => {
    if (device.id === ignoredDeviceId || getModel(device.modelId).kind === "drone") return false;
    return (Math.round(device.x) === x && Math.round(device.y) === y)
      || (Math.round(device.homeX ?? device.x) === x && Math.round(device.homeY ?? device.y) === y);
  });
  if (occupied) return { ok: false, reason: "Another device or mobile-system home position already occupies this tile." };
  if (model.allowedTerrain === "flat" && tileHeight(tile) > 0) return { ok: false, reason: `${model.shortName} needs a level mounting tile.` };
  return { ok: true, message: "Valid deployment tile." };
}

export function validatePlacement(state: GameState, orderId: string, x: number, y: number): ActionResult {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order || order.stage !== "ready") return { ok: false, reason: "Select a tested asset that is ready for site deployment." };
  const model = getModel(order.modelId);
  if (model.kind === "drone") {
    return { ok: false, reason: "Patrol drones launch automatically from the central drone pad; no map placement is required." };
  }
  return validateDevicePosition(state, order.modelId, x, y);
}

/** Validate a relocation target while allowing the selected device to keep its own current tile. */
export function validateDevicePlacement(state: GameState, deviceId: string, x: number, y: number): ActionResult {
  const device = state.devices.find((candidate) => candidate.id === deviceId);
  if (!device) return { ok: false, reason: "That device no longer exists." };
  if (getModel(device.modelId).kind === "drone") {
    return { ok: false, reason: "Patrol drones are based automatically at the central drone pad and cannot be repositioned." };
  }
  return validateDevicePosition(state, device.modelId, x, y, device.id);
}

export function placeOrder(state: GameState, orderId: string, x: number, y: number, facing?: number): ActionResult {
  const validation = validatePlacement(state, orderId, x, y);
  if (!validation.ok) return validation;
  const index = state.orders.findIndex((candidate) => candidate.id === orderId);
  const order = state.orders[index];
  if (!order) return { ok: false, reason: "That asset is no longer in the deployment queue." };
  const model = getModel(order.modelId);
  const device: Device = {
    id: nextId(state, "device"), modelId: order.modelId, upgradeIds: [...order.upgradeIds], name: `${model.shortName} ${state.devices.length + 1}`,
    x, y, status: "awaiting-sat", readyAt: 0, health: 1, commissionedAt: null, detections: 0, falseAlarms: 0,
    facing: model.kind === "camera" ? facing ?? Math.atan2(y + 0.5 - 50, x + 0.5 - 50) : undefined,
    homeX: model.kind === "robot" || model.kind === "drone" ? x : undefined,
    homeY: model.kind === "robot" || model.kind === "drone" ? y : undefined,
    assignedIncidentId: model.kind === "robot" || model.kind === "drone" ? null : undefined,
    path: model.kind === "robot" ? [] : undefined,
    plannedOperationalAt: order.plannedOperationalAt,
  };
  state.devices.push(device);
  state.orders.splice(index, 1);
  state.tutorial.deployed = true;
  pushMessage(state, "Installation complete", `${device.name} is mounted at sector ${x}.${y}. Run site acceptance to make it operational.`, "good");
  const sat = state.automation.lifecycleAutopilot ? commissionDevice(state, device.id) : null;
  recalculateRating(state);
  return { ok: true, message: sat?.ok ? `${device.name} installed; SAT started automatically.` : `${device.name} installed; SAT is required.` };
}

export function commissionDevice(state: GameState, deviceId: string): ActionResult {
  const device = state.devices.find((candidate) => candidate.id === deviceId);
  if (!device) return { ok: false, reason: "That device no longer exists." };
  if (device.status !== "awaiting-sat") return { ok: false, reason: "Only installed devices awaiting SAT can be commissioned." };
  const model = getModel(device.modelId);
  if (!spend(state, "commissioning", `Site acceptance and commissioning · ${device.name}`, model.commissionCost)) return { ok: false, reason: `Site acceptance requires ${formatMoney(model.commissionCost)}.` };
  device.status = "commissioning";
  device.readyAt = state.totalMinutes + 3 * 60;
  pushMessage(state, "Site acceptance started", `${device.name} is running an end-to-end alarm and response test.`, "info");
  return { ok: true, message: "Commissioning started." };
}

/**
 * Fits additional, compatible modules to an installed asset. The base hardware is retained;
 * the player only pays the new modules plus the fresh ICD and factory acceptance work.
 */
export function upgradeDevice(state: GameState, deviceId: string, requestedUpgradeIds: string[]): ActionResult {
  const device = state.devices.find((candidate) => candidate.id === deviceId);
  if (!device) return { ok: false, reason: "That device no longer exists." };
  if (device.status !== "operational") return { ok: false, reason: "Only an operational device can be taken offline for an upgrade." };
  if (isAssignedToActiveResponse(state, device)) return { ok: false, reason: `${device.name} is assigned to an active response and cannot be upgraded yet.` };

  const model = getModel(device.modelId);
  const requested = [...new Set(requestedUpgradeIds)];
  const additions = requested.filter((id) => !device.upgradeIds.includes(id));
  if (additions.length === 0) return { ok: false, reason: "Choose at least one compatible module that is not already installed." };

  let upgrades: Upgrade[];
  try {
    upgrades = additions.map(getUpgrade);
  } catch {
    return { ok: false, reason: "One of the selected upgrade modules is not recognised." };
  }
  const incompatible = upgrades.find((upgrade) => !upgrade.kinds.includes(model.kind));
  if (incompatible) return { ok: false, reason: `${incompatible.name} is not compatible with ${model.shortName}.` };

  const targetUpgradeIds = [...device.upgradeIds, ...additions];
  const currentStats = quoteConfiguredStats(device.modelId, device.upgradeIds, state);
  const targetStats = quoteConfiguredStats(device.modelId, targetUpgradeIds, state);
  const moduleCost = targetStats.quote.upgradeCost - currentStats.quote.upgradeCost;
  const changeCost = moduleCost + model.integrationCost + model.testCost;
  if (!spend(state, "upgrade", `Upgrade change order · ${device.name}`, changeCost)) {
    return { ok: false, reason: `This upgrade requires ${formatMoney(changeCost)}.` };
  }

  const duration = (targetStats.integrationHours + targetStats.testHours) * 60;
  device.pendingUpgradeIds = targetUpgradeIds;
  device.status = "upgrading";
  device.readyAt = state.totalMinutes + duration;
  device.path = [];
  pushMessage(state, "Asset upgrade started", `${device.name} is offline for ICD integration and factory acceptance. It returns in ${Math.ceil(duration / 60)} hours.`, "info");
  recalculateRating(state);
  return { ok: true, message: `${device.name} upgrade started.` };
}

/** Repositions an installed non-drone asset with a tracked migration cost and outage. */
export function repositionDevice(state: GameState, deviceId: string, x: number, y: number, facing?: number): ActionResult {
  const device = state.devices.find((candidate) => candidate.id === deviceId);
  if (!device) return { ok: false, reason: "That device no longer exists." };
  if (device.status !== "operational") return { ok: false, reason: "Only an operational device can be repositioned." };
  if (isAssignedToActiveResponse(state, device)) return { ok: false, reason: `${device.name} is assigned to an active response and cannot be repositioned yet.` };
  if (getModel(device.modelId).kind === "drone") {
    return { ok: false, reason: "Patrol drones are based automatically at the central drone pad and cannot be repositioned." };
  }
  const validation = validateDevicePlacement(state, deviceId, x, y);
  if (!validation.ok) return validation;
  if (Math.round(device.x) === x && Math.round(device.y) === y) return { ok: false, reason: `${device.name} is already installed on that tile.` };

  const distance = Math.hypot(device.x - x, device.y - y);
  const installedAcquisition = configuredStats(device.modelId, device.upgradeIds).purchaseCost;
  const migrationCost = Math.max(2_000, Math.round(installedAcquisition * 0.05));
  if (!spend(state, "relocation", `Relocation and recommissioning · ${device.name}`, migrationCost)) {
    return { ok: false, reason: `This repositioning change requires ${formatMoney(migrationCost)}.` };
  }

  const outageMinutes = Math.ceil(60 + distance * 6);
  const previous = { x: device.x, y: device.y };
  device.x = x;
  device.y = y;
  if (getModel(device.modelId).kind === "robot") {
    device.homeX = x;
    device.homeY = y;
  }
  if (facing !== undefined && getModel(device.modelId).kind === "camera") device.facing = facing;
  device.status = "relocating";
  device.readyAt = state.totalMinutes + outageMinutes;
  device.path = [];
  pushMessage(state, "Asset relocation started", `${device.name} is moving from sector ${Math.round(previous.x)}.${Math.round(previous.y)} to ${x}.${y}; it returns in ${outageMinutes} minutes.`, "info");
  recalculateRating(state);
  return { ok: true, message: `${device.name} relocation started.` };
}

/** Sets the side and shift used by an operational or ready patrol drone. */
export function configureDronePatrol(
  state: GameState,
  deviceId: string,
  side: DronePatrol["side"],
  schedule: DronePatrol["schedule"],
): ActionResult {
  const device = state.devices.find((candidate) => candidate.id === deviceId);
  if (!device) return { ok: false, reason: "That drone no longer exists." };
  if (getModel(device.modelId).kind !== "drone") return { ok: false, reason: "Only patrol drones have a fenceline route." };
  if (!DRONE_PATROL_SIDES.includes(side) || !DRONE_PATROL_SCHEDULES.includes(schedule)) {
    return { ok: false, reason: "Choose a valid fenceline side and a Day, Night or Both shift." };
  }
  device.dronePatrol = { side, schedule, waypointIndex: 0 };
  pushMessage(state, "Drone patrol updated", `${device.name} will patrol the ${side} fenceline during the ${schedule} shift.`, "good");
  return { ok: true, message: `${device.name} patrol route updated.` };
}

/**
 * Ready drones are the sole capability that does not use a map placement tool. They are
 * allocated a marked berth on the central pad and immediately enter automated SAT.
 */
export function autoDeployReadyDrones(state: GameState): boolean {
  let changed = false;
  for (const order of [...state.orders]) {
    if (order.stage !== "ready" || getModel(order.modelId).kind !== "drone") continue;
    const padSlot = nextDronePadSlot(state);
    if (!padSlot) {
      const heldOrders = order.batchId
        ? state.orders.filter((candidate) => candidate.stage === "ready" && candidate.batchId === order.batchId)
        : [order];
      if (!heldOrders.some((candidate) => candidate.capacityNotified)) {
        heldOrders.forEach((candidate) => { candidate.capacityNotified = true; });
        const quantity = heldOrders.length;
        pushMessage(state, "Drone pad at capacity", `${quantity > 1 ? `${quantity}× ` : ""}${getModel(order.modelId).shortName} ${quantity === 1 ? "is" : "are"} ready but held until one of the ${DRONE_PAD_CAPACITY} central pad berths is available.`, "warning");
        changed = true;
      }
      continue;
    }

    const orderIndex = state.orders.findIndex((candidate) => candidate.id === order.id);
    if (orderIndex < 0) continue;
    const model = getModel(order.modelId);
    const device: Device = {
      id: nextId(state, "device"), modelId: order.modelId, upgradeIds: [...order.upgradeIds], name: `${model.shortName} ${state.devices.length + 1}`,
      x: padSlot.x, y: padSlot.y, status: "awaiting-sat", readyAt: 0, health: 1, commissionedAt: null, detections: 0, falseAlarms: 0,
      homeX: padSlot.x, homeY: padSlot.y, assignedIncidentId: null,
      plannedOperationalAt: order.plannedOperationalAt,
      dronePatrol: { side: "north", schedule: "both", waypointIndex: 0 },
    };
    state.devices.push(device);
    state.orders.splice(orderIndex, 1);
    state.tutorial.deployed = true;
    pushMessage(state, "Drone auto-based", `${device.name} has been assigned to the central drone pad. Site acceptance starts automatically.`, "good");
    const sat = commissionDevice(state, device.id);
    if (!sat.ok) pushMessage(state, "Drone awaiting SAT", `${device.name} is based at the pad but needs ${formatMoney(model.commissionCost)} to begin site acceptance.`, "warning");
    changed = true;
  }
  if (changed) recalculateRating(state);
  return changed;
}

export function hireStaff(state: GameState, role: StaffRole): ActionResult {
  const recruitmentCost = role === "engineer" ? 12_000 : 8_000;
  if (!spend(state, "recruitment", `Recruitment and training · ${role}`, recruitmentCost)) return { ok: false, reason: `Recruitment requires ${formatMoney(recruitmentCost)}.` };
  const roleMembers = state.staff.filter((member) => member.role === role);
  const shiftCounts = [0, 1, 2].map((shift) => roleMembers.filter((member) => member.shift === shift).length);
  const smallest = Math.min(...shiftCounts);
  const shift = Math.max(0, shiftCounts.indexOf(smallest)) as 0 | 1 | 2;
  const member = createStaff(state, role, shift);
  state.staff.push(member);
  state.tutorial.hired = true;
  pushMessage(state, "New starter", `${member.name} joined the ${shiftLabel(shift)} shift.`, "good");
  recalculateRating(state);
  return { ok: true, message: `${member.name} hired.` };
}

export function verifyIncident(state: GameState, incidentId: string): ActionResult {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) return { ok: false, reason: "That alarm is no longer in the incident queue." };
  if (incident.status !== "new") return { ok: false, reason: "This alarm has already been acknowledged." };
  const operators = onDutyStaff(state, "operator");
  if (operators.length === 0) return { ok: false, reason: "No operator is on duty to validate the evidence." };
  incident.status = "verifying";
  incident.readyAt = state.totalMinutes + Math.max(12, 55 - operators.length * 8 + state.rating.cognitiveLoad * 0.35);
  return { ok: true, message: "Operator is validating the alarm." };
}

export function dispatchIncident(state: GameState, incidentId: string): ActionResult {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) return { ok: false, reason: "That incident no longer exists." };
  if (incident.status !== "verified") return { ok: false, reason: "Operator validation is required before dispatch." };
  const trooper = onDutyStaff(state, "trooper").find((member) => member.assignedIncidentId === null);
  const mobile = state.devices
    .filter((device) => device.status === "operational" && ["robot", "drone"].includes(getModel(device.modelId).kind)
      && !state.incidents.some((candidate) => candidate.status === "responding" && candidate.assignedResponderId === device.id))
    .sort((a, b) => Math.hypot(a.x - incident.x, a.y - incident.y) - Math.hypot(b.x - incident.x, b.y - incident.y))[0];
  if (!trooper && !mobile) return { ok: false, reason: "No on-duty trooper or operational mobile responder is available." };
  let responderId: string;
  let distance: number;
  let responsePower = 0.55;
  if (trooper) {
    responderId = trooper.id;
    distance = Math.hypot(trooper.x - incident.x, trooper.y - incident.y);
    trooper.assignedIncidentId = incident.id;
    trooper.status = "responding";
    trooper.targetX = incident.x;
    trooper.targetY = incident.y;
    trooper.path = [];
  } else {
    responderId = mobile?.id ?? "";
    distance = Math.hypot((mobile?.x ?? 0) - incident.x, (mobile?.y ?? 0) - incident.y);
    responsePower = mobile ? configuredStats(mobile.modelId, mobile.upgradeIds).responsePower : responsePower;
    if (mobile) {
      mobile.assignedIncidentId = incident.id;
      mobile.path = [];
    }
  }
  incident.status = "responding";
  incident.assignedResponderId = responderId;
  incident.respondedAt = state.totalMinutes;
  if (incident.genuine && incident.type === "intrusion") {
    state.metrics.responseSamples += 1;
    state.metrics.totalResponseMinutes += Math.max(0, state.totalMinutes - (incident.detectedAt ?? incident.createdAt));
  }
  const movementSpeed = trooper ? 0.24 : 0.45 + responsePower * 0.2;
  incident.readyAt = state.totalMinutes + Math.max(18, distance / movementSpeed);
  pushMessage(state, "Response dispatched", `${trooper?.name ?? mobile?.name ?? "Responder"} is moving to sector ${Math.round(incident.x)}.${Math.round(incident.y)}.`, "info");
  return { ok: true, message: "Response unit dispatched." };
}

export function decommissionAt(state: GameState, x: number, y: number): ActionResult {
  const candidate = state.devices
    .map((device, index) => ({ device, index, distance: Math.hypot(device.x - x, device.y - y) }))
    .filter((item) => item.distance < 0.5)
    .sort((a, b) => a.distance - b.distance)[0];
  const index = candidate?.index ?? -1;
  const device = candidate?.device;
  if (!device) return { ok: false, reason: "There is no removable device on this tile." };
  if (state.incidents.some((incident) => incident.status === "responding" && incident.assignedResponderId === device.id)) {
    return { ok: false, reason: `${device.name} is assigned to an active response and cannot be removed.` };
  }
  const refund = Math.round(configuredStats(device.modelId, device.upgradeIds).purchaseCost * 0.2 * device.health);
  state.incidents
    .filter((incident) => incident.type === "system-fault" && incident.sourceDeviceIds.includes(device.id) && ["new", "verifying", "verified", "responding"].includes(incident.status))
    .forEach((incident) => {
      incident.status = "resolved";
      incident.resolution = "The affected device was decommissioned and removed from the operational baseline.";
      incident.assignedResponderId = null;
    });
  state.devices.splice(index, 1);
  postLedger(state, "refund", `Decommissioning value · ${device.name}`, refund);
  pushMessage(state, "Device decommissioned", `${device.name} removed; ${formatMoney(refund)} residual value returned.`, "warning");
  recalculateRating(state);
  return { ok: true, message: `${device.name} removed.` };
}

export function onDutyStaff(state: GameState, role: StaffRole) {
  const hour = calendarFromMinutes(state.totalMinutes).hour;
  const shift = (hour < 8 ? 0 : hour < 16 ? 1 : 2) as 0 | 1 | 2;
  return state.staff.filter((member) => member.role === role && member.shift === shift);
}

export function activeIncidents(state: GameState): Incident[] {
  return state.incidents.filter((incident) => !["resolved", "dismissed", "missed"].includes(incident.status));
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}m`;
  if (absolute >= 1_000) return `${sign}$${Math.round(absolute / 1_000)}k`;
  return `${sign}$${Math.round(absolute)}`;
}

function isAssignedToActiveResponse(state: GameState, device: Device): boolean {
  return state.incidents.some((incident) => incident.status === "responding" && incident.assignedResponderId === device.id);
}

function nextDronePadSlot(state: GameState): { x: number; y: number } | undefined {
  const pad = state.world.structures.find((structure) => structure.type === "drone-pad");
  if (!pad) return undefined;
  const drones = state.devices.filter((device) => getModel(device.modelId).kind === "drone");
  if (drones.length >= DRONE_PAD_CAPACITY) return undefined;
  const offsets = [
    { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 1, y: 3 },
    { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 1, y: 5 }, { x: 3, y: 5 },
  ];
  return offsets
    .map((offset) => ({ x: pad.x + offset.x, y: pad.y + offset.y }))
    .find((slot) => !drones.some((device) => Math.abs((device.homeX ?? device.x) - slot.x) < 0.01 && Math.abs((device.homeY ?? device.y) - slot.y) < 0.01));
}

function shiftLabel(shift: 0 | 1 | 2): string {
  return shift === 0 ? "00:00–08:00" : shift === 1 ? "08:00–16:00" : "16:00–00:00";
}
