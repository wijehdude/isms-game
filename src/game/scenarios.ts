import type { ScenarioDefinition } from "./types";

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "first-watch",
    name: "First Watch",
    subtitle: "Build confidence from a legacy fence line",
    difficulty: "Training",
    description: "A newly appointed commander has funded a measured security uplift. Prove the lifecycle, reduce blind sectors and keep the people operating it on side.",
    objectiveText: "Reach Overall Score 60, coverage 42% and both workforce happiness scores of 58 by Day 30.",
    objectives: [
      { metric: "rating", target: 60, label: "Overall Score" },
      { metric: "coverage", target: 42, label: "Sensor coverage" },
      { metric: "operatorHappiness", target: 58, label: "Operator happiness" },
      { metric: "trooperHappiness", target: 58, label: "Trooper happiness" },
    ],
    startCash: 10_000_000,
    deadlineDays: 30,
    threatMultiplier: 0.72,
    falseAlarmMultiplier: 0.8,
    weatherBias: ["clear", "clear", "overcast", "rain", "fog"],
    seed: 19_881,
  },
  {
    id: "monsoon-line",
    name: "Monsoon Line",
    subtitle: "Layer sensors through hostile weather",
    difficulty: "Standard",
    description: "Heavy rain and fog are exposing a single-sensor design. Create complementary visual, LiDAR and mobile coverage without consuming the reserve.",
    objectiveText: "Reach Overall Score 68 and catch 6 infiltrators with at least $250k remaining by Day 45.",
    objectives: [
      { metric: "rating", target: 68, label: "Overall Score" },
      { metric: "caught", target: 6, label: "Intruders caught" },
      { metric: "cash", target: 250_000, label: "Cash reserve" },
    ],
    startCash: 10_000_000,
    deadlineDays: 45,
    threatMultiplier: 1,
    falseAlarmMultiplier: 1.15,
    weatherBias: ["rain", "rain", "storm", "fog", "overcast"],
    seed: 92_247,
  },
  {
    id: "alarm-fatigue",
    name: "Noise Floor",
    subtitle: "Recover an exhausted control room",
    difficulty: "Hard",
    description: "Nuisance alarms have damaged operator trust. Tune analytics, add correlation-quality sensors and prevent a determined theft campaign.",
    objectiveText: "Reach Overall Score 72, operator happiness 68 and catch 10 infiltrators by Day 60.",
    objectives: [
      { metric: "rating", target: 72, label: "Overall Score" },
      { metric: "operatorHappiness", target: 68, label: "Operator happiness" },
      { metric: "caught", target: 10, label: "Intruders caught" },
    ],
    startCash: 10_000_000,
    deadlineDays: 60,
    threatMultiplier: 1.35,
    falseAlarmMultiplier: 1.8,
    weatherBias: ["clear", "overcast", "rain", "fog", "clear"],
    seed: 410_731,
  },
  {
    id: "sandbox",
    name: "Open Command",
    subtitle: "Endless capability sandbox",
    difficulty: "Sandbox",
    description: "No deadline and no final score ceiling. Build, integrate and operate the security architecture you want, then watch it face increasingly capable probes.",
    objectiveText: "Play endlessly. Weekly command funding scales with overall security health and workforce confidence.",
    objectives: [],
    startCash: 10_000_000,
    deadlineDays: null,
    threatMultiplier: 0.9,
    falseAlarmMultiplier: 1,
    weatherBias: ["clear", "clear", "overcast", "rain", "storm", "fog"],
    seed: 73_221,
  },
];

export function getScenario(id: string): ScenarioDefinition {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}
