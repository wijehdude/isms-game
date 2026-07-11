import { describe, expect, it } from "vitest";

import { hashSeed, nextRandom, randomBetween, randomInt } from "../src/core/rng";

describe("serialisable RNG", () => {
  it("produces identical streams for identical seeds", () => {
    const first = { rngState: hashSeed("camp-overwatch") };
    const second = { rngState: hashSeed("camp-overwatch") };

    const firstStream = Array.from({ length: 128 }, () => nextRandom(first));
    const secondStream = Array.from({ length: 128 }, () => nextRandom(second));

    expect(firstStream).toEqual(secondStream);
    expect(new Set(firstStream).size).toBeGreaterThan(120);
    expect(firstStream.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("continues exactly from a persisted RNG state", () => {
    const original = { rngState: hashSeed(73_221) };
    Array.from({ length: 19 }, () => nextRandom(original));

    const restored = JSON.parse(JSON.stringify(original)) as { rngState: number };
    const expected = Array.from({ length: 64 }, () => nextRandom(original));
    const actual = Array.from({ length: 64 }, () => nextRandom(restored));

    expect(actual).toEqual(expected);
    expect(restored.rngState).toBe(original.rngState);
  });

  it("keeps ranged values inside their documented inclusive/exclusive bounds", () => {
    const state = { rngState: hashSeed("bounds") };
    const reals = Array.from({ length: 2_000 }, () => randomBetween(state, -2.5, 7.25));
    const integers = Array.from({ length: 2_000 }, () => randomInt(state, 3, 7));

    expect(Math.min(...reals)).toBeGreaterThanOrEqual(-2.5);
    expect(Math.max(...reals)).toBeLessThan(7.25);
    expect(new Set(integers)).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it("hashes equal inputs equally and distinct campaign seeds differently", () => {
    expect(hashSeed("19881")).toBe(hashSeed(19_881));
    expect(hashSeed(19_881)).not.toBe(hashSeed(92_247));
    expect(hashSeed(0)).not.toBe(0);
  });
});
