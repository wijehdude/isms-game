export type TerrainSurface = "grass" | "sand" | "dirt" | "rock" | "water";
export type Ownership = "owned" | "purchasable" | "off-limits";
export type WeatherKind = "clear" | "overcast" | "rain" | "storm" | "fog";
export type DeviceKind = "camera" | "lidar" | "robot" | "drone" | "lighting";
export type StaffRole = "trooper" | "operator" | "engineer";
export type OrderStage = "procurement" | "integration-review" | "integrating" | "factory-test" | "testing" | "ready";
export type DeviceStatus = "awaiting-sat" | "commissioning" | "operational" | "fault";
export type IncidentStatus = "new" | "verifying" | "verified" | "responding" | "resolved" | "dismissed" | "missed";
export type IncidentType = "intrusion" | "loitering" | "suspicious-object" | "tamper" | "system-fault" | "false-alarm";
export type IntruderPhase = "infiltrating" | "exfiltrating" | "caught" | "escaped";
export type ScenarioStatus = "active" | "won" | "lost";
export type StructureType = "building" | "fence" | "road" | "walkway" | "parade" | "track" | "gate" | "drone-pad";

export type Point = { x: number; y: number };

export type WorldState = {
  width: number;
  height: number;
  /** Packed height/surface/ownership values; see world/map.ts. */
  tiles: number[];
  paths: number[];
  structures: Structure[];
};

export type Structure = {
  id: string;
  type: StructureType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  palette?: "stone" | "command" | "barracks" | "utility" | "sports";
};

export type DeviceModel = {
  id: string;
  kind: DeviceKind;
  name: string;
  shortName: string;
  description: string;
  cost: number;
  leadHours: number;
  integrationCost: number;
  testCost: number;
  commissionCost: number;
  range: number;
  accuracy: number;
  falseAlarmRate: number;
  availability: number;
  monthlyOps: number;
  responsePower: number;
  allowedTerrain: "flat" | "all";
};

export type Upgrade = {
  id: string;
  name: string;
  description: string;
  kinds: DeviceKind[];
  cost: number;
  range?: number;
  accuracy?: number;
  falseAlarmMultiplier?: number;
  availability?: number;
  nightFactor?: number;
  rainFactor?: number;
  fogFactor?: number;
  responsePower?: number;
  integrationComplexity?: number;
};

export type ConfiguredStats = {
  purchaseCost: number;
  totalProgrammeCost: number;
  range: number;
  accuracy: number;
  falseAlarmRate: number;
  availability: number;
  monthlyOps: number;
  responsePower: number;
  nightFactor: number;
  rainFactor: number;
  fogFactor: number;
  integrationHours: number;
  testHours: number;
};

export type ProcurementOrder = {
  id: string;
  modelId: string;
  upgradeIds: string[];
  stage: OrderStage;
  orderedAt: number;
  readyAt: number;
  quotedCost: number;
};

export type Device = {
  id: string;
  modelId: string;
  upgradeIds: string[];
  name: string;
  x: number;
  y: number;
  status: DeviceStatus;
  readyAt: number;
  health: number;
  commissionedAt: number | null;
  detections: number;
  falseAlarms: number;
  /** Radians in world space; cameras use a fixed 90-degree field of view unless panoramic. */
  facing?: number;
  homeX?: number;
  homeY?: number;
  assignedIncidentId?: string | null;
  path?: Point[];
};

export type StaffMember = {
  id: string;
  role: StaffRole;
  name: string;
  shift: 0 | 1 | 2;
  salary: number;
  happiness: number;
  fatigue: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  status: "patrolling" | "monitoring" | "engineering" | "responding" | "resting";
  assignedIncidentId: string | null;
  path?: Point[];
};

export type Intruder = {
  id: string;
  type: "scout" | "thief" | "saboteur";
  x: number;
  y: number;
  entryX: number;
  entryY: number;
  targetX: number;
  targetY: number;
  phase: IntruderPhase;
  stealth: number;
  detected: boolean;
  spawnedAt: number;
  lossValue: number;
  path?: Point[];
};

export type Incident = {
  id: string;
  type: IncidentType;
  genuine: boolean;
  x: number;
  y: number;
  status: IncidentStatus;
  confidence: number;
  sourceDeviceIds: string[];
  intruderId: string | null;
  createdAt: number;
  deadlineAt: number;
  readyAt: number;
  assignedResponderId: string | null;
  resolution: string | null;
};

export type LedgerEntry = {
  id: string;
  minute: number;
  category: "funding" | "procurement" | "integration" | "testing" | "commissioning" | "payroll" | "operations" | "loss" | "savings" | "refund" | "recruitment";
  description: string;
  amount: number;
};

export type EconomyState = {
  cash: number;
  lifetimeFunding: number;
  lifetimeSpend: number;
  avoidedLosses: number;
  stolenLosses: number;
  realisedSavings: number;
  ledger: LedgerEntry[];
};

export type RatingState = {
  campRating: number;
  securityEffectiveness: number;
  peopleWellbeing: number;
  costEffectiveness: number;
  readiness: number;
  scheduleConfidence: number;
  coverage: number;
  uptime: number;
  trooperHappiness: number;
  operatorHappiness: number;
  capabilityPoints: number;
  capabilityLevel: string;
  caught: number;
  escaped: number;
  alarmsResolved: number;
  falseAlarms: number;
};

export type WeatherState = {
  kind: WeatherKind;
  intensity: number;
  temperature: number;
  nextChangeAt: number;
};

export type ObjectiveMetric = "rating" | "coverage" | "caught" | "cash" | "operatorHappiness" | "trooperHappiness";

export type ScenarioObjective = {
  metric: ObjectiveMetric;
  target: number;
  label: string;
};

export type ScenarioDefinition = {
  id: string;
  name: string;
  subtitle: string;
  difficulty: "Training" | "Standard" | "Hard" | "Sandbox";
  description: string;
  objectiveText: string;
  objectives: ScenarioObjective[];
  startCash: number;
  deadlineDays: number | null;
  threatMultiplier: number;
  falseAlarmMultiplier: number;
  weatherBias: WeatherKind[];
  seed: number;
};

export type TutorialState = {
  procured: boolean;
  integrated: boolean;
  tested: boolean;
  deployed: boolean;
  commissioned: boolean;
  hired: boolean;
  resolvedAlarm: boolean;
  dismissed: boolean;
};

export type GameMessage = {
  id: string;
  minute: number;
  title: string;
  text: string;
  tone: "info" | "good" | "warning" | "danger";
};

export type GameState = {
  version: 1;
  idCounter: number;
  seed: number;
  rngState: number;
  scenarioId: string;
  scenarioStatus: ScenarioStatus;
  campName: string;
  totalMinutes: number;
  speed: 0 | 1 | 2 | 4;
  previousSpeed: 1 | 2 | 4;
  weather: WeatherState;
  nextThreatAt: number;
  nextFalseAlarmAt: number;
  lastDailyUpdate: number;
  lastMonthlyUpdate: number;
  lastAutosaveMonth: number;
  world: WorldState;
  orders: ProcurementOrder[];
  devices: Device[];
  staff: StaffMember[];
  intruders: Intruder[];
  incidents: Incident[];
  economy: EconomyState;
  rating: RatingState;
  tutorial: TutorialState;
  messages: GameMessage[];
};

export type ActionResult = { ok: true; message: string } | { ok: false; reason: string };
