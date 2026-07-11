/** A tiny serialisable PRNG. The returned state is stored directly in GameState. */
export function nextRandom(state: { rngState: number }): number {
  let value = state.rngState | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0 || 0x6d2b79f5;
  return state.rngState / 0x1_0000_0000;
}

export function randomBetween(state: { rngState: number }, min: number, max: number): number {
  return min + (max - min) * nextRandom(state);
}

export function randomInt(state: { rngState: number }, min: number, maxInclusive: number): number {
  return Math.floor(randomBetween(state, min, maxInclusive + 1));
}

export function hashSeed(input: string | number): number {
  const text = String(input);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x6d2b79f5;
}
